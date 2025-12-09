// Migration script to create payout_comparison_daily table
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const createTable = async () => {
  let client = null;
  try {
    console.log('[Migration] Creating payout_comparison_daily table...');
    
    client = await pool.connect();
    
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS payout_comparison_daily (
        id SERIAL PRIMARY KEY,
        comparison_date DATE NOT NULL UNIQUE,
        
        -- Ringba values
        ringba_static DECIMAL(10, 2) DEFAULT 0,
        ringba_api DECIMAL(10, 2) DEFAULT 0,
        ringba_total DECIMAL(10, 2) DEFAULT 0,
        
        -- Elocal values
        elocal_static DECIMAL(10, 2) DEFAULT 0,
        elocal_api DECIMAL(10, 2) DEFAULT 0,
        elocal_total DECIMAL(10, 2) DEFAULT 0,
        
        -- Adjustments
        adjustments DECIMAL(10, 2) DEFAULT 0,
        adjustment_static_pct DECIMAL(10, 2) DEFAULT 0,
        adjustment_api_pct DECIMAL(10, 2) DEFAULT 0,
        adjustment_pct DECIMAL(10, 2) DEFAULT 0,
        
        -- Additional metrics
        total_calls INTEGER DEFAULT 0,
        rpc DECIMAL(10, 2) DEFAULT 0,
        google_ads_spend DECIMAL(10, 2) DEFAULT 0,
        google_ads_notes TEXT,
        telco DECIMAL(10, 2) DEFAULT 0,
        
        -- Calculated metrics
        cost_per_call DECIMAL(10, 2) DEFAULT 0,
        net DECIMAL(10, 2) DEFAULT 0,
        net_profit DECIMAL(10, 2) DEFAULT 0,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await client.query(createTableQuery);
    console.log('[Migration] ✓ Table created successfully');
    
    // Create index on date for faster queries
    const createIndexQuery = `
      CREATE INDEX IF NOT EXISTS idx_payout_comparison_daily_date 
      ON payout_comparison_daily(comparison_date);
    `;
    
    await client.query(createIndexQuery);
    console.log('[Migration] ✓ Index created successfully');
    
    console.log('[Migration] Migration completed successfully!');
  } catch (error) {
    console.error('[Migration] Error:', error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
};

createTable()
  .then(() => {
    console.log('[Migration] Done');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Migration] Failed:', error);
    process.exit(1);
  });


