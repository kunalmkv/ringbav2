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
app.use(cors());
app.use(express.json());

// Serve static files from dashboard-build directory
app.use(express.static(DASHBOARD_BUILD_DIR));

// Helper to send JSON response
const sendJSON = (res, data, statusCode = 200) => {
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
    
    const result = await pool.query(query, params);
    
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
          adjustments: 0,
          adjustment_static_pct: 0,
          adjustment_api_pct: 0,
          adjustment_pct: 0
        };
      }
      
      // Add data based on category
      if (category === 'STATIC') {
        dataByDate[date].ringba_static = parseFloat(row.ringba_payout) || 0;
        dataByDate[date].elocal_static = parseFloat(row.elocal_payout) || 0;
      } else if (category === 'API') {
        dataByDate[date].ringba_api = parseFloat(row.ringba_payout) || 0;
        dataByDate[date].elocal_api = parseFloat(row.elocal_payout) || 0;
      }
    }
    
    // Calculate totals and adjustments
    const processedData = Object.values(dataByDate).map(item => {
      item.ringba_total = item.ringba_static + item.ringba_api;
      item.elocal_total = item.elocal_static + item.elocal_api;
      item.adjustments = item.elocal_total - item.ringba_total;
      
      // Calculate adjustment percentages
      if (item.ringba_static > 0) {
        item.adjustment_static_pct = ((item.elocal_static - item.ringba_static) / item.ringba_static) * 100;
      } else {
        item.adjustment_static_pct = item.elocal_static > 0 ? 100 : 0;
      }
      
      if (item.ringba_api > 0) {
        item.adjustment_api_pct = ((item.elocal_api - item.ringba_api) / item.ringba_api) * 100;
      } else {
        item.adjustment_api_pct = item.elocal_api > 0 ? 100 : 0;
      }
      
      if (item.ringba_total > 0) {
        item.adjustment_pct = (item.adjustments / item.ringba_total) * 100;
      } else {
        item.adjustment_pct = item.elocal_total > 0 ? 100 : 0;
      }
      
      return item;
    });
    
    // Sort by date descending
    processedData.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sendJSON(res, {
      data: processedData,
      total: processedData.length
    });
  } catch (error) {
    console.error('[ERROR] Failed to fetch payout comparison:', error);
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

// Start server
app.listen(PORT, () => {
  console.log(`Dashboard server running on http://localhost:${PORT}`);
  console.log(`Serving static files from: ${DASHBOARD_BUILD_DIR}`);
});

