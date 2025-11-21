import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const PORT = process.env.DASHBOARD_PORT || 3000;
const DASHBOARD_BUILD_DIR = join(__dirname, 'dashboard-build');

// Initialize PostgreSQL connection pool
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || process.env.DB_PORT || 5432,
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('[ERROR] Unexpected database pool error:', err);
});

const app = express();

// Middleware
// Configure CORS to allow requests from any origin (for production deployment)
app.use(cors({
  origin: '*', // Allow all origins - adjust in production if needed
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Disable caching for all API routes
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Last-Modified': new Date().toUTCString(),
    'ETag': false
  });
  next();
});

// Serve static files from dashboard-build directory
app.use(express.static(DASHBOARD_BUILD_DIR));

// Helper to send JSON response
const sendJSON = (res, data, statusCode = 200) => {
  // Ensure no caching headers are set
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.status(statusCode).json(data);
};

const sendError = (res, message, statusCode = 500) => {
  sendJSON(res, { error: message }, statusCode);
};

// API endpoint: Get payout comparison data grouped by date
app.get('/api/payout-comparison', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build date filter
    let dateFilter = '';
    const params = [];
    
    if (startDate && endDate) {
      dateFilter = `WHERE SUBSTRING(date_of_call, 1, 10) >= $1 AND SUBSTRING(date_of_call, 1, 10) <= $2`;
      params.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = `WHERE SUBSTRING(date_of_call, 1, 10) >= $1`;
      params.push(startDate);
    } else if (endDate) {
      dateFilter = `WHERE SUBSTRING(date_of_call, 1, 10) <= $1`;
      params.push(endDate);
    }
    
    // Query to get payout comparison data grouped by date and category
    // Also get RPC from ringba_campaign_summary and total calls count
    const query = `
      SELECT 
        SUBSTRING(ecd.date_of_call, 1, 10) as date,
        ecd.category,
        COALESCE(SUM(ecd.payout), 0) as elocal_payout,
        COALESCE(SUM(ecd.original_payout), 0) as ringba_payout,
        COALESCE(SUM(ecd.original_revenue), 0) as ringba_revenue,
        COUNT(*) as call_count
      FROM elocal_call_data ecd
      ${dateFilter}
      GROUP BY SUBSTRING(ecd.date_of_call, 1, 10), ecd.category
      ORDER BY date DESC, category
    `;
    
    const result = await pool.query(query, params);
    
    // Get RPC data from ringba_campaign_summary
    // Use exact date format: summary_date = 'YYYY-MM-DD' (as confirmed by user)
    // Build date list for IN clause or use range filter
    const rpcParams = [];
    let rpcDateFilter = '';
    
    if (startDate && endDate) {
      // Generate all dates in range for IN clause
      const dates = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      const current = new Date(start);
      
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0]; // YYYY-MM-DD
        dates.push(`'${dateStr}'`);
        current.setDate(current.getDate() + 1);
      }
      
      if (dates.length > 0) {
        rpcDateFilter = ` AND summary_date IN (${dates.join(', ')})`;
      }
    } else if (startDate) {
      rpcDateFilter = ` AND summary_date >= '${startDate}'`;
    } else if (endDate) {
      rpcDateFilter = ` AND summary_date <= '${endDate}'`;
    }
    
    // Get RPC from ringba_campaign_summary - prioritize "Appliance Repair"
    // Use exact format: summary_date = 'YYYY-MM-DD'
    const rpcQuery = `
      SELECT 
        summary_date::text as date,
        rpc,
        campaign_name,
        CASE 
          WHEN campaign_name = 'Appliance Repair' THEN 1
          WHEN LOWER(campaign_name) LIKE '%appliance repair%' THEN 2
          ELSE 3
        END as priority
      FROM ringba_campaign_summary
      WHERE 1=1${rpcDateFilter}
      ORDER BY summary_date DESC, priority ASC
    `;
    
    const rpcResult = await pool.query(rpcQuery);
    const rpcByDate = {};
    
    // Debug: log RPC query results
    console.log(`[Dashboard API] RPC Query returned ${rpcResult.rows.length} records`);
    if (rpcResult.rows.length > 0) {
      rpcResult.rows.forEach(row => {
        // summary_date::text converts DATE to 'YYYY-MM-DD' string format
        const dateStr = String(row.date).trim();
        const rpcValue = parseFloat(row.rpc) || 0;
        console.log(`[Dashboard API] Date: '${dateStr}', RPC: $${rpcValue}, Campaign: '${row.campaign_name}'`);
        // Store RPC by date (use first/highest priority for each date)
        if (!rpcByDate[dateStr]) {
          rpcByDate[dateStr] = rpcValue;
        }
      });
      console.log(`[Dashboard API] RPC map:`, rpcByDate);
    } else {
      console.log(`[Dashboard API] No RPC records found for date range`);
    }
    
    // Process results to group by date
    const dataByDate = {};
    
    for (const row of result.rows) {
      const date = row.date;
      const category = row.category || 'STATIC';
      
      if (!dataByDate[date]) {
        dataByDate[date] = {
          date: date,
          ringba_static: 0,
          ringba_api: 0,
          elocal_static: 0,
          elocal_api: 0,
          ringba_total: 0,
          elocal_total: 0,
          total_calls: 0, // Total calls (API + STATIC combined)
          rpc: 0, // RPC from ringba_campaign_summary
          adjustments: 0,
          adjustment_static_pct: 0,
          adjustment_api_pct: 0,
          adjustment_pct: 0
        };
      }
      
      // Add to total calls count
      dataByDate[date].total_calls += parseInt(row.call_count) || 0;
      
      // Add data based on category
      // STATIC: Use original_payout (currently correct, so keep it)
      // API: Use original_revenue for Ringba revenue (as per user requirement - API was showing incorrect value)
      // eLocal values come from payout column for both categories
      if (category === 'STATIC') {
        dataByDate[date].ringba_static = parseFloat(row.ringba_payout) || 0;
        dataByDate[date].elocal_static = parseFloat(row.elocal_payout) || 0;
      } else if (category === 'API') {
        // Use original_revenue for API category Ringba revenue (fixes incorrect API values)
        dataByDate[date].ringba_api = parseFloat(row.ringba_revenue) || 0;
        dataByDate[date].elocal_api = parseFloat(row.elocal_payout) || 0;
      }
    }
    
    // Calculate totals and adjustments
    // Formula: adjustments = ringba_total - elocal_total
    // Formula: adjustment_static = (ringba_static - elocal_static) / 100
    // Formula: adjustment_api = (ringba_api - elocal_api) / 100
    // Formula: adjustment_pct = adjustments / ringba_total
    const processedData = Object.values(dataByDate).map(item => {
      item.ringba_total = item.ringba_static + item.ringba_api;
      item.elocal_total = item.elocal_static + item.elocal_api;
      
      // Get RPC from ringba_campaign_summary (if available)
      // Ensure date format matches exactly (YYYY-MM-DD)
      const dateKey = item.date; // Already in YYYY-MM-DD format
      item.rpc = rpcByDate[dateKey] || 0;
      
      // Debug log for RPC matching
      if (rpcByDate[dateKey]) {
        console.log(`[Dashboard API] Matched RPC for ${dateKey}: $${item.rpc}`);
      } else {
        console.log(`[Dashboard API] No RPC found for ${dateKey}. Available dates: ${Object.keys(rpcByDate).join(', ')}`);
      }
      
      // Adjustments: ringba_total - elocal_total
      item.adjustments = item.ringba_total - item.elocal_total;
      
      // Adjustment Static: (ringba_static - elocal_static) / 100
      item.adjustment_static_pct = (item.ringba_static - item.elocal_static) / 100;
      
      // Adjustment API: (ringba_api - elocal_api) / 100
      item.adjustment_api_pct = (item.ringba_api - item.elocal_api) / 100;
      
      // Adjustment %: (adjustments / ringba_total) * 100 (multiply by 100 for percentage display)
      if (item.ringba_total > 0) {
        item.adjustment_pct = (item.adjustments / item.ringba_total) * 100;
      } else {
        item.adjustment_pct = 0;
      }
      
      return item;
    });
    
    // Sort by date descending
    processedData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Log response before sending
    console.log(`[Dashboard API] Sending response: ${processedData.length} records`);
    if (processedData.length > 0) {
      console.log(`[Dashboard API] Sample record:`, processedData[0]);
    } else {
      console.log(`[Dashboard API] WARNING: No data to return. Query returned ${result.rows.length} rows from database.`);
    }
    
    const response = {
      data: processedData,
      total: processedData.length
    };
    
    console.log(`[Dashboard API] Response structure:`, {
      hasData: !!response.data,
      dataLength: response.data?.length,
      total: response.total
    });
    
    sendJSON(res, response);
  } catch (error) {
    console.error('[ERROR] Failed to fetch payout comparison:', error);
    console.error('[ERROR] Error stack:', error.stack);
    sendError(res, error.message);
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    sendJSON(res, {
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Stats endpoint (stub - returns empty stats for now)
app.get('/api/stats', async (req, res) => {
  try {
    sendJSON(res, {
      totalCalls: 0,
      totalPayout: 0,
      totalAdjustments: 0,
      ringba: { successRate: 0 },
      callsToday: 0,
      callsThisWeek: 0
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// History endpoint (stub - returns empty history)
app.get('/api/history', async (req, res) => {
  try {
    sendJSON(res, {
      sessions: []
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Activity endpoint (stub - returns empty activity)
app.get('/api/activity', async (req, res) => {
  try {
    sendJSON(res, {
      calls: [],
      adjustments: [],
      sessions: []
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Chargeback endpoint (stub - returns empty chargeback data)
app.get('/api/chargeback', async (req, res) => {
  try {
    sendJSON(res, {
      data: [],
      total: 0
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Catch-all route: serve index.html for React Router
app.get('*', (req, res) => {
  res.sendFile(join(DASHBOARD_BUILD_DIR, 'index.html'));
});

// Start server - listen on all interfaces (0.0.0.0) to allow external connections
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving static files from: ${DASHBOARD_BUILD_DIR}`);
  console.log(`Database: ${process.env.POSTGRES_DB_NAME || process.env.DB_NAME || 'not configured'}`);
  console.log(`Database Host: ${process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost'}`);
  
  // Test database connection
  pool.query('SELECT NOW() as now')
    .then(result => {
      console.log(`✓ Database connection successful. Server time: ${result.rows[0].now}`);
    })
    .catch(err => {
      console.error(`✗ Database connection failed:`, err.message);
    });
});

