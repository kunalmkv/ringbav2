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

// Middleware to rewrite /ringba-sync-dashboard/api/* to /api/* before routes
app.use((req, res, next) => {
  if (req.path.startsWith('/ringba-sync-dashboard/api')) {
    req.url = req.url.replace('/ringba-sync-dashboard', '');
    console.log('[Route Rewrite]', req.originalUrl, '->', req.url);
  }
  next();
});

// Disable caching for all API routes
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

// Serve static files from dashboard-build directory at /ringba-sync-dashboard path
app.use('/ringba-sync-dashboard', express.static(DASHBOARD_BUILD_DIR));

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

// Function to fetch payout comparison data from pre-calculated table
const fetchPayoutComparisonData = async (startDate = null, endDate = null) => {
  let client = null;
  try {
    console.log('[DB Query] Fetching payout comparison data from payout_comparison_daily table...', { startDate, endDate });
    
    // Get a client from the pool
    client = await pool.connect();
    console.log('[DB Query] Database client acquired');
    
    // Build date filter
    let dateFilter = '';
    const params = [];
    
    if (startDate && endDate) {
      dateFilter = `WHERE comparison_date >= $1 AND comparison_date <= $2`;
      params.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = `WHERE comparison_date >= $1`;
      params.push(startDate);
    } else if (endDate) {
      dateFilter = `WHERE comparison_date <= $1`;
      params.push(endDate);
    }
    
    // Query from pre-calculated table
    const query = `
      SELECT 
        comparison_date::text as date,
        ringba_static,
        ringba_api,
        ringba_total,
        elocal_static,
        elocal_api,
        elocal_total,
        adjustments,
        adjustment_static_pct,
        adjustment_api_pct,
        adjustment_pct,
        total_calls,
        rpc,
        google_ads_spend,
        google_ads_notes,
        telco,
        cost_per_call,
        net,
        net_profit
      FROM payout_comparison_daily
      ${dateFilter}
      ORDER BY comparison_date DESC
    `;
    
    console.log('[DB Query] Executing query:', query);
    console.log('[DB Query] With params:', params);
    
    const result = await client.query(query, params);
    console.log(`[DB Query] Query returned ${result.rows.length} rows`);
    
    // Map database columns to frontend expected format
    const processedData = result.rows.map(row => ({
      date: row.date,
      ringba_static: parseFloat(row.ringba_static) || 0,
      ringba_api: parseFloat(row.ringba_api) || 0,
      ringba_total: parseFloat(row.ringba_total) || 0,
      elocal_static: parseFloat(row.elocal_static) || 0,
      elocal_api: parseFloat(row.elocal_api) || 0,
      elocal_total: parseFloat(row.elocal_total) || 0,
      adjustments: parseFloat(row.adjustments) || 0,
      adjustment_static_pct: parseFloat(row.adjustment_static_pct) || 0,
      adjustment_api_pct: parseFloat(row.adjustment_api_pct) || 0,
      adjustment_pct: parseFloat(row.adjustment_pct) || 0,
      total_calls: parseInt(row.total_calls) || 0,
      rpc: parseFloat(row.rpc) || 0,
      google_ads_spend: parseFloat(row.google_ads_spend) || 0,
      google_ads_notes: row.google_ads_notes || null,
      telco: parseFloat(row.telco) || 0,
      cost_per_call: parseFloat(row.cost_per_call) || 0,
      net: parseFloat(row.net) || 0,
      net_profit: parseFloat(row.net_profit) || 0
    }));
    
    console.log(`[DB Query] Processed ${processedData.length} records`);
    if (processedData.length > 0) {
      console.log('[DB Query] Sample record:', JSON.stringify(processedData[0], null, 2));
    }
    
    return processedData;
  } catch (error) {
    console.error('[DB Query Error]:', error);
    console.error('[DB Query Error] Stack:', error.stack);
    throw error;
  } finally {
    // Always release the client back to the pool
    if (client) {
      client.release();
      console.log('[DB Query] Database client released');
    }
  }
};

// Legacy function kept for reference (now replaced by fetchPayoutComparisonData above)
const fetchPayoutComparisonDataLegacy = async (startDate = null, endDate = null) => {
  let client = null;
  try {
    console.log('[DB Query] Fetching payout comparison data (legacy method)...', { startDate, endDate });
    
    // Get a client from the pool
    client = await pool.connect();
    console.log('[DB Query] Database client acquired');
    
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
    
    const result = await client.query(query, params);
    console.log(`[DB Query] Query returned ${result.rows.length} rows`);
    
    // Get RPC data from ringba_campaign_summary
    let rpcQuery = `SELECT summary_date::text as date, rpc, campaign_name FROM ringba_campaign_summary`;
    const rpcParams = [];
    let rpcParamIndex = 1;
    
    if (startDate && endDate) {
      rpcQuery += ` WHERE summary_date >= $${rpcParamIndex} AND summary_date <= $${rpcParamIndex + 1}`;
      rpcParams.push(startDate, endDate);
      rpcParamIndex += 2;
    } else if (startDate) {
      rpcQuery += ` WHERE summary_date >= $${rpcParamIndex}`;
      rpcParams.push(startDate);
      rpcParamIndex += 1;
    } else if (endDate) {
      rpcQuery += ` WHERE summary_date <= $${rpcParamIndex}`;
      rpcParams.push(endDate);
      rpcParamIndex += 1;
    }
    
    rpcQuery += ` ORDER BY summary_date DESC, 
      CASE 
        WHEN campaign_name = 'Appliance Repair' THEN 1
        WHEN LOWER(campaign_name) LIKE '%appliance repair%' THEN 2
        ELSE 3
      END ASC`;
    
    console.log('[DB Query] Executing RPC query:', rpcQuery);
    const rpcResult = await client.query(rpcQuery, rpcParams);
    console.log(`[DB Query] RPC query returned ${rpcResult.rows.length} rows`);
    
    // Build RPC map by date
    const rpcByDate = {};
    rpcResult.rows.forEach(row => {
      const dateStr = String(row.date).trim();
      if (!rpcByDate[dateStr]) {
        rpcByDate[dateStr] = parseFloat(row.rpc) || 0;
      }
    });
    
    // Get Google Ads spend data from ringba_campaign_summary table
    // We'll get the spend from the "Appliance Repair" combined summary (campaign_name = 'Appliance Repair')
    let googleAdsQuery = `SELECT summary_date::text as date, google_ads_spend, google_ads_notes FROM ringba_campaign_summary WHERE campaign_name = 'Appliance Repair'`;
    const googleAdsParams = [];
    let googleAdsParamIndex = 1;
    
    if (startDate && endDate) {
      googleAdsQuery += ` AND summary_date >= $${googleAdsParamIndex} AND summary_date <= $${googleAdsParamIndex + 1}`;
      googleAdsParams.push(startDate, endDate);
      googleAdsParamIndex += 2;
    } else if (startDate) {
      googleAdsQuery += ` AND summary_date >= $${googleAdsParamIndex}`;
      googleAdsParams.push(startDate);
      googleAdsParamIndex += 1;
    } else if (endDate) {
      googleAdsQuery += ` AND summary_date <= $${googleAdsParamIndex}`;
      googleAdsParams.push(endDate);
      googleAdsParamIndex += 1;
    }
    
    googleAdsQuery += ` ORDER BY summary_date DESC`;
    
    console.log('[DB Query] Executing Google Ads spend query:', googleAdsQuery);
    const googleAdsResult = await client.query(googleAdsQuery, googleAdsParams);
    console.log(`[DB Query] Google Ads spend query returned ${googleAdsResult.rows.length} rows`);
    
    // Build Google Ads spend map by date (including notes)
    const googleAdsSpendByDate = {};
    const googleAdsNotesByDate = {};
    googleAdsResult.rows.forEach(row => {
      const dateStr = String(row.date).trim();
      googleAdsSpendByDate[dateStr] = parseFloat(row.google_ads_spend) || 0;
      googleAdsNotesByDate[dateStr] = row.google_ads_notes || null;
    });
    
    // Get Telco data from ringba_campaign_summary table
    // We'll get insights_total_cost from the "Appliance Repair" combined summary (campaign_name = 'Appliance Repair')
    let telcoQuery = `SELECT summary_date::text as date, insights_total_cost FROM ringba_campaign_summary WHERE campaign_name = 'Appliance Repair'`;
    const telcoParams = [];
    let telcoParamIndex = 1;
    
    if (startDate && endDate) {
      telcoQuery += ` AND summary_date >= $${telcoParamIndex} AND summary_date <= $${telcoParamIndex + 1}`;
      telcoParams.push(startDate, endDate);
      telcoParamIndex += 2;
    } else if (startDate) {
      telcoQuery += ` AND summary_date >= $${telcoParamIndex}`;
      telcoParams.push(startDate);
      telcoParamIndex += 1;
    } else if (endDate) {
      telcoQuery += ` AND summary_date <= $${telcoParamIndex}`;
      telcoParams.push(endDate);
      telcoParamIndex += 1;
    }
    
    telcoQuery += ` ORDER BY summary_date DESC`;
    
    console.log('[DB Query] Executing Telco query (using insights_total_cost):', telcoQuery);
    const telcoResult = await client.query(telcoQuery, telcoParams);
    console.log(`[DB Query] Telco query returned ${telcoResult.rows.length} rows`);
    
    // Build Telco map by date (using insights_total_cost)
    const telcoByDate = {};
    telcoResult.rows.forEach(row => {
      const dateStr = String(row.date).trim();
      telcoByDate[dateStr] = parseFloat(row.insights_total_cost) || 0;
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
          google_ads_spend: googleAdsSpendByDate[date] || 0,
          google_ads_notes: googleAdsNotesByDate[date] || null,
          telco: telcoByDate[date] || 0,
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
    
    // Add dates that have Google Ads spend or Telco but no call data
    const allDates = new Set([...Object.keys(googleAdsSpendByDate), ...Object.keys(telcoByDate)]);
    allDates.forEach(date => {
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
          google_ads_spend: googleAdsSpendByDate[date] || 0,
          google_ads_notes: googleAdsNotesByDate[date] || null,
          telco: telcoByDate[date] || 0,
          adjustments: 0,
          adjustment_static_pct: 0,
          adjustment_api_pct: 0,
          adjustment_pct: 0
        };
      } else {
        // Ensure telco is set even if date already exists
        if (!dataByDate[date].telco) {
          dataByDate[date].telco = telcoByDate[date] || 0;
        }
      }
    });
    
    // Calculate totals and adjustments
    const processedData = Object.values(dataByDate).map(item => {
      item.ringba_total = item.ringba_static + item.ringba_api;
      item.elocal_total = item.elocal_static + item.elocal_api;
      item.rpc = rpcByDate[item.date] || 0;
      item.google_ads_spend = googleAdsSpendByDate[item.date] || 0;
      item.google_ads_notes = googleAdsNotesByDate[item.date] || null;
      item.telco = telcoByDate[item.date] || 0;
      
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
    console.error('[DB Query Error] Stack:', error.stack);
    throw error;
  } finally {
    // Always release the client back to the pool
    if (client) {
      client.release();
      console.log('[DB Query] Database client released');
    }
  }
};

// Function to fetch Ringba Campaign Summary data
const fetchRingbaCampaignSummary = async (startDate = null, endDate = null, campaignName = null) => {
  let client = null;
  try {
    console.log('[DB Query] Fetching ringba_campaign_summary data...', { startDate, endDate, campaignName });
    
    client = await pool.connect();
    console.log('[DB Query] Database client acquired');
    
    // Check which columns exist in the table
    const columnCheckQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ringba_campaign_summary'
      ORDER BY ordinal_position
    `;
    const columnResult = await client.query(columnCheckQuery);
    const existingColumns = columnResult.rows.map(row => row.column_name);
    console.log('[DB Query] Existing columns:', existingColumns);
    
    // Base columns that should always exist
    const baseColumns = [
      'id', 'campaign_name', 'campaign_id', 'target_id', 'target_name',
      'summary_date', 'total_calls', 'revenue', 'payout', 'rpc',
      'total_call_length_seconds', 'total_cost', 'no_connections',
      'duplicates', 'margin', 'conversion_rate', 'created_at', 'updated_at'
    ];
    
    // Optional columns that may not exist
    const optionalColumns = [
      'insights_total_cost', 'telco', 'google_ads_spend', 'google_ads_notes',
      'connected_calls', 'connection_rate', 'completed_calls', 'completion_rate',
      'root_calls'
    ];
    
    // Build column list - include base columns and optional columns if they exist
    const columnsToSelect = [
      ...baseColumns.filter(col => existingColumns.includes(col)),
      ...optionalColumns.filter(col => existingColumns.includes(col))
    ];
    
    console.log('[DB Query] Columns to select:', columnsToSelect);
    
    // Build query with filters
    let query = `
      SELECT ${columnsToSelect.join(', ')}
      FROM ringba_campaign_summary
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (startDate) {
      query += ` AND summary_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND summary_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    if (campaignName) {
      query += ` AND campaign_name = $${paramIndex}`;
      params.push(campaignName);
      paramIndex++;
    }
    
    query += ` ORDER BY summary_date DESC, campaign_name ASC`;
    
    console.log('[DB Query] Executing query:', query);
    console.log('[DB Query] With params:', params);
    
    const result = await client.query(query, params);
    console.log('[DB Query] Query executed successfully, rows:', result.rows.length);
    
    return result.rows;
  } catch (error) {
    console.error('[DB Query] Error fetching ringba_campaign_summary:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
      console.log('[DB Query] Database client released');
    }
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

// API endpoint: Get Ringba Campaign Summary data
app.get('/api/ringba-campaign-summary', async (req, res) => {
  try {
    const { startDate, endDate, campaignName } = req.query;
    console.log('[API] /api/ringba-campaign-summary called', { startDate, endDate, campaignName });
    
    const data = await fetchRingbaCampaignSummary(startDate || null, endDate || null, campaignName || null);
    
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
    console.error('[API Error] Failed to fetch ringba campaign summary:', error);
    console.error('[API Error] Stack:', error.stack);
    sendError(res, `Failed to fetch data: ${error.message}`, 500);
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as now, current_database() as db_name');
    sendJSON(res, {
      status: 'healthy',
      database: 'connected',
      db_name: result.rows[0].db_name,
      timestamp: result.rows[0].now
    });
  } catch (error) {
    sendError(res, `Database connection failed: ${error.message}`, 503);
  } finally {
    if (client) client.release();
  }
});

// Test endpoint to verify data exists
app.get('/api/test-data', async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const countResult = await client.query('SELECT COUNT(*) as count FROM elocal_call_data');
    const sampleResult = await client.query('SELECT * FROM elocal_call_data LIMIT 1');
    
    sendJSON(res, {
      total_records: parseInt(countResult.rows[0].count),
      sample_record: sampleResult.rows[0] || null,
      tables_exist: true
    });
  } catch (error) {
    sendError(res, `Test failed: ${error.message}`, 500);
  } finally {
    if (client) client.release();
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

// Google Ads Spend endpoints
// GET: Fetch Google Ads spend for a date range (from ringba_campaign_summary)
app.get('/api/google-ads-spend', async (req, res) => {
  let client = null;
  try {
    const { startDate, endDate } = req.query;
    console.log('[API] /api/google-ads-spend GET called', { startDate, endDate });
    
    client = await pool.connect();
    
    // Get spend from "Appliance Repair" combined summary
    let query = `SELECT summary_date::text as date, google_ads_spend as spend_amount, google_ads_notes as notes, updated_at 
                 FROM ringba_campaign_summary 
                 WHERE campaign_name = 'Appliance Repair'`;
    const params = [];
    
    if (startDate && endDate) {
      query += ' AND summary_date >= $1 AND summary_date <= $2';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' AND summary_date >= $1';
      params.push(startDate);
    } else if (endDate) {
      query += ' AND summary_date <= $1';
      params.push(endDate);
    }
    
    query += ' ORDER BY summary_date DESC';
    
    const result = await client.query(query, params);
    
    sendJSON(res, {
      data: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('[API Error] Failed to fetch Google Ads spend:', error);
    sendError(res, `Failed to fetch data: ${error.message}`, 500);
  } finally {
    if (client) client.release();
  }
});

// POST/PUT: Add or update Google Ads spend for a specific date
// Updates both ringba_campaign_summary and payout_comparison_daily tables
app.post('/api/google-ads-spend', async (req, res) => {
  let client = null;
  try {
    const { date, spend_amount, notes } = req.body;
    console.log('[API] /api/google-ads-spend POST called', { date, spend_amount, notes });
    
    if (!date) {
      return sendError(res, 'Date is required', 400);
    }
    
    if (spend_amount === undefined || spend_amount === null) {
      return sendError(res, 'Spend amount is required', 400);
    }
    
    const spendAmount = parseFloat(spend_amount);
    if (isNaN(spendAmount) || spendAmount < 0) {
      return sendError(res, 'Spend amount must be a valid positive number', 400);
    }
    
    client = await pool.connect();
    
    // Update ringba_campaign_summary table
    // Check if "Appliance Repair" summary exists for this date
    const checkQuery = `SELECT id FROM ringba_campaign_summary WHERE campaign_name = 'Appliance Repair' AND summary_date = $1`;
    const checkResult = await client.query(checkQuery, [date]);
    
    if (checkResult.rows.length === 0) {
      // Create a new summary record if it doesn't exist
      const insertQuery = `
        INSERT INTO ringba_campaign_summary (
          campaign_name, summary_date, google_ads_spend, google_ads_notes, updated_at
        )
        VALUES ('Appliance Repair', $1, $2, $3, CURRENT_TIMESTAMP)
        RETURNING id, summary_date::text as date, google_ads_spend as spend_amount, google_ads_notes as notes, updated_at
      `;
      const insertResult = await client.query(insertQuery, [date, spendAmount, notes || null]);
      
      console.log('[API] Google Ads spend saved (new record in ringba_campaign_summary):', insertResult.rows[0]);
    } else {
      // Update existing record
      const updateQuery = `
        UPDATE ringba_campaign_summary
        SET google_ads_spend = $1,
            google_ads_notes = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE campaign_name = 'Appliance Repair' AND summary_date = $3
        RETURNING id, summary_date::text as date, google_ads_spend as spend_amount, google_ads_notes as notes, updated_at
      `;
      
      const updateResult = await client.query(updateQuery, [spendAmount, notes || null, date]);
      
      console.log('[API] Google Ads spend updated (ringba_campaign_summary):', updateResult.rows[0]);
    }
    
    // Update payout_comparison_daily table
    // Get current row data to recalculate metrics
    const getRowQuery = `
      SELECT 
        elocal_total,
        telco,
        total_calls
      FROM payout_comparison_daily
      WHERE comparison_date = $1
    `;
    
    const rowResult = await client.query(getRowQuery, [date]);
    
    if (rowResult.rows.length > 0) {
      const row = rowResult.rows[0];
      const elocalTotal = parseFloat(row.elocal_total) || 0;
      const telco = parseFloat(row.telco) || 0;
      const totalCalls = parseInt(row.total_calls) || 0;
      
      // Recalculate cost_per_call, net, and net_profit
      const costPerCall = totalCalls > 0 ? spendAmount / totalCalls : 0;
      const net = elocalTotal - spendAmount - telco;
      const netProfit = elocalTotal > 0 ? (net / elocalTotal) * 100 : 0;
      
      // Update the payout_comparison_daily row
      const updatePayoutQuery = `
        UPDATE payout_comparison_daily
        SET
          google_ads_spend = $1,
          google_ads_notes = $2,
          cost_per_call = $3,
          net = $4,
          net_profit = $5,
          updated_at = CURRENT_TIMESTAMP
        WHERE comparison_date = $6
      `;
      
      await client.query(updatePayoutQuery, [spendAmount, notes || null, costPerCall, net, netProfit, date]);
      
      console.log('[API] Google Ads spend updated (payout_comparison_daily)');
    } else {
      console.log('[API] Warning: No payout_comparison_daily record found for date', date, '- skipping update');
    }
    
    sendJSON(res, {
      success: true,
      data: {
        date,
        spend_amount: spendAmount,
        notes: notes || null
      },
      message: 'Google Ads spend saved successfully'
    });
  } catch (error) {
    console.error('[API Error] Failed to save Google Ads spend:', error);
    sendError(res, `Failed to save data: ${error.message}`, 500);
  } finally {
    if (client) client.release();
  }
});

// DELETE: Delete Google Ads spend for a specific date (sets to 0)
app.delete('/api/google-ads-spend/:date', async (req, res) => {
  let client = null;
  try {
    const { date } = req.params;
    console.log('[API] /api/google-ads-spend DELETE called', { date });
    
    if (!date) {
      return sendError(res, 'Date is required', 400);
    }
    
    client = await pool.connect();
    
    // Update the record to set spend to 0 and clear notes
    const query = `
      UPDATE ringba_campaign_summary
      SET google_ads_spend = 0,
          google_ads_notes = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE campaign_name = 'Appliance Repair' AND summary_date = $1
      RETURNING id, summary_date::text as date, google_ads_spend as spend_amount, google_ads_notes as notes
    `;
    
    const result = await client.query(query, [date]);
    
    if (result.rows.length === 0) {
      return sendError(res, 'No record found for the specified date', 404);
    }
    
    sendJSON(res, {
      success: true,
      message: 'Google Ads spend cleared successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('[API Error] Failed to delete Google Ads spend:', error);
    sendError(res, `Failed to delete data: ${error.message}`, 500);
  } finally {
    if (client) client.release();
  }
});

// Catch-all route: serve index.html for React Router
// Handle both root and /ringba-sync-dashboard paths
// API routes are handled above via middleware rewrite
app.get('/', (req, res) => {
  res.redirect('/ringba-sync-dashboard/');
});

app.get('/ringba-sync-dashboard', (req, res) => {
  res.redirect('/ringba-sync-dashboard/');
});

app.get('/ringba-sync-dashboard/*', (req, res) => {
  // Skip if this is an API request (shouldn't happen due to middleware rewrite, but safety check)
  if (req.path.startsWith('/ringba-sync-dashboard/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  // For any other path under /ringba-sync-dashboard, serve index.html (SPA routing)
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
