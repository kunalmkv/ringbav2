// Dashboard API Server - Simplified Direct Database Access
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

// Initialize PostgreSQL connection pool - Get credentials from environment
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
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
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Disable caching for all API routes
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

// Serve static files from dashboard-build directory
app.use(express.static(DASHBOARD_BUILD_DIR));

// Helper to send JSON response
const sendJSON = (res, data, statusCode = 200) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Type': 'application/json'
  });
  res.status(statusCode).json(data);
};

const sendError = (res, message, statusCode = 500) => {
  console.error(`[API Error ${statusCode}]:`, message);
  sendJSON(res, { error: message }, statusCode);
};

// Simple function to fetch payout comparison data directly from database
const fetchPayoutComparisonData = async (startDate = null, endDate = null) => {
  try {
    console.log('[DB Query] Fetching payout comparison data...', { startDate, endDate });
    
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
    
    // Simple query to get all data grouped by date and category
    const query = `
      SELECT 
        SUBSTRING(date_of_call, 1, 10) as date,
        category,
        COALESCE(SUM(payout), 0) as elocal_payout,
        COALESCE(SUM(original_payout), 0) as ringba_payout,
        COALESCE(SUM(original_revenue), 0) as ringba_revenue,
        COUNT(*) as call_count
      FROM elocal_call_data
      ${dateFilter}
      GROUP BY SUBSTRING(date_of_call, 1, 10), category
      ORDER BY date DESC, category
    `;
    
    console.log('[DB Query] Executing query:', query);
    console.log('[DB Query] With params:', params);
    
    const result = await pool.query(query, params);
    console.log(`[DB Query] Query returned ${result.rows.length} rows`);
    
    // Get RPC data from ringba_campaign_summary
    let rpcQuery = `SELECT summary_date::text as date, rpc, campaign_name FROM ringba_campaign_summary`;
    const rpcParams = [];
    
    if (startDate && endDate) {
      rpcQuery += ` WHERE summary_date >= $1 AND summary_date <= $2`;
      rpcParams.push(startDate, endDate);
    } else if (startDate) {
      rpcQuery += ` WHERE summary_date >= $1`;
      rpcParams.push(startDate);
    } else if (endDate) {
      rpcQuery += ` WHERE summary_date <= $1`;
      rpcParams.push(endDate);
    }
    
    rpcQuery += ` ORDER BY summary_date DESC, 
      CASE 
        WHEN campaign_name = 'Appliance Repair' THEN 1
        WHEN LOWER(campaign_name) LIKE '%appliance repair%' THEN 2
        ELSE 3
      END ASC`;
    
    console.log('[DB Query] Executing RPC query:', rpcQuery);
    const rpcResult = await pool.query(rpcQuery, rpcParams);
    console.log(`[DB Query] RPC query returned ${rpcResult.rows.length} rows`);
    
    // Build RPC map by date
    const rpcByDate = {};
    rpcResult.rows.forEach(row => {
      const dateStr = String(row.date).trim();
      if (!rpcByDate[dateStr]) {
        rpcByDate[dateStr] = parseFloat(row.rpc) || 0;
      }
    });
    
    // Process results - group by date
    const dataByDate = {};
    
    for (const row of result.rows) {
      const date = String(row.date).trim();
      const category = String(row.category || 'STATIC').toUpperCase();
      
      if (!dataByDate[date]) {
        dataByDate[date] = {
          date: date,
          ringba_static: 0,
          ringba_api: 0,
          elocal_static: 0,
          elocal_api: 0,
          ringba_total: 0,
          elocal_total: 0,
          total_calls: 0,
          rpc: rpcByDate[date] || 0,
          adjustments: 0,
          adjustment_static_pct: 0,
          adjustment_api_pct: 0,
          adjustment_pct: 0
        };
      }
      
      // Add data based on category
      const elocalPayout = parseFloat(row.elocal_payout) || 0;
      const ringbaPayout = parseFloat(row.ringba_payout) || 0;
      const ringbaRevenue = parseFloat(row.ringba_revenue) || 0;
      const callCount = parseInt(row.call_count) || 0;
      
      if (category === 'STATIC') {
        dataByDate[date].ringba_static = ringbaPayout;
        dataByDate[date].elocal_static = elocalPayout;
      } else if (category === 'API') {
        dataByDate[date].ringba_api = ringbaRevenue;
        dataByDate[date].elocal_api = elocalPayout;
      }
      
      dataByDate[date].total_calls += callCount;
    }
    
    // Calculate totals and adjustments
    const processedData = Object.values(dataByDate).map(item => {
      item.ringba_total = item.ringba_static + item.ringba_api;
      item.elocal_total = item.elocal_static + item.elocal_api;
      item.rpc = rpcByDate[item.date] || 0;
      
      // Adjustments
      item.adjustments = item.ringba_total - item.elocal_total;
      item.adjustment_static_pct = (item.ringba_static - item.elocal_static) / 100;
      item.adjustment_api_pct = (item.ringba_api - item.elocal_api) / 100;
      item.adjustment_pct = item.ringba_total > 0 
        ? (item.adjustments / item.ringba_total) * 100 
        : 0;
      
      return item;
    });
    
    // Sort by date descending
    processedData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    console.log(`[DB Query] Processed ${processedData.length} records`);
    if (processedData.length > 0) {
      console.log('[DB Query] Sample record:', JSON.stringify(processedData[0], null, 2));
    }
    
    return processedData;
  } catch (error) {
    console.error('[DB Query Error]:', error);
    throw error;
  }
};

// API endpoint: Get payout comparison data
app.get('/api/payout-comparison', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    console.log('[API] /api/payout-comparison called', { startDate, endDate });
    
    const data = await fetchPayoutComparisonData(startDate || null, endDate || null);
    
    const response = {
      data: data,
      total: data.length
    };
    
    console.log('[API] Sending response:', {
      dataLength: response.data.length,
      total: response.total,
      firstRecord: response.data[0] || null
    });
    
    sendJSON(res, response);
  } catch (error) {
    console.error('[API Error] Failed to fetch payout comparison:', error);
    console.error('[API Error] Stack:', error.stack);
    sendError(res, `Failed to fetch data: ${error.message}`, 500);
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
    sendError(res, `Database connection failed: ${error.message}`, 503);
  }
});

// Stats endpoint
app.get('/api/stats', async (req, res) => {
  try {
    const totalCalls = await pool.query('SELECT COUNT(*) as count FROM elocal_call_data');
    const totalPayout = await pool.query('SELECT COALESCE(SUM(payout), 0) as total FROM elocal_call_data');
    
    sendJSON(res, {
      totalCalls: parseInt(totalCalls.rows[0].count) || 0,
      totalPayout: parseFloat(totalPayout.rows[0].total) || 0,
      totalAdjustments: 0,
      ringba: { successRate: 0 },
      callsToday: 0,
      callsThisWeek: 0
    });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// History endpoint
app.get('/api/history', async (req, res) => {
  try {
    sendJSON(res, { sessions: [] });
  } catch (error) {
    sendError(res, error.message, 500);
  }
});

// Activity endpoint
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

// Chargeback endpoint
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log(`Dashboard server running on http://0.0.0.0:${PORT}`);
  console.log(`Serving static files from: ${DASHBOARD_BUILD_DIR}`);
  console.log('Database Configuration:');
  console.log(`  Host: ${process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost'}`);
  console.log(`  Port: ${process.env.POSTGRES_PORT || process.env.DB_PORT || 5432}`);
  console.log(`  Database: ${process.env.POSTGRES_DB_NAME || process.env.DB_NAME || 'not configured'}`);
  console.log(`  User: ${process.env.POSTGRES_USER_NAME || process.env.DB_USER || 'not configured'}`);
  console.log('='.repeat(60));
  
  // Test database connection
  pool.query('SELECT NOW() as now, current_database() as db_name')
    .then(result => {
      console.log(`✓ Database connection successful!`);
      console.log(`  Database: ${result.rows[0].db_name}`);
      console.log(`  Server time: ${result.rows[0].now}`);
    })
    .catch(err => {
      console.error(`✗ Database connection failed!`);
      console.error(`  Error: ${err.message}`);
      console.error(`  Please check your .env file and database credentials.`);
    });
});
