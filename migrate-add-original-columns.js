#!/usr/bin/env node

/**
 * Migration script to add original_payout and original_revenue columns
 * 
 * Usage:
 *   node migrate-add-original-columns.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Get database connection details
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST,
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('[INFO] Connecting to database...');
    console.log(`[INFO] Database: ${process.env.POSTGRES_HOST || process.env.DB_HOST}:${process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'}/${process.env.POSTGRES_DB_NAME || process.env.DB_NAME}`);
    
    console.log('[INFO] Adding original_payout and original_revenue columns...');
    await client.query('BEGIN');
    
    // Check if columns already exist
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'elocal_call_data' 
      AND column_name IN ('original_payout', 'original_revenue')
    `;
    const existing = await client.query(checkQuery);
    const existingColumns = existing.rows.map(r => r.column_name);
    
    // Add original_payout if it doesn't exist
    if (!existingColumns.includes('original_payout')) {
      console.log('[INFO] Adding original_payout column...');
      await client.query(`
        ALTER TABLE elocal_call_data 
        ADD COLUMN original_payout DECIMAL(10, 2) DEFAULT NULL
      `);
      console.log('[SUCCESS] Added original_payout column');
    } else {
      console.log('[INFO] original_payout column already exists');
    }
    
    // Add original_revenue if it doesn't exist
    if (!existingColumns.includes('original_revenue')) {
      console.log('[INFO] Adding original_revenue column...');
      await client.query(`
        ALTER TABLE elocal_call_data
        ADD COLUMN original_revenue DECIMAL(10, 2) DEFAULT NULL
      `);
      console.log('[SUCCESS] Added original_revenue column');
    } else {
      console.log('[INFO] original_revenue column already exists');
    }
    
    // Add indexes if they don't exist
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_elocal_call_data_original_payout 
        ON elocal_call_data(original_payout)
      `);
      console.log('[INFO] Created index on original_payout');
    } catch (error) {
      console.warn('[WARN] Could not create index on original_payout:', error.message);
    }
    
    try {
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_elocal_call_data_original_revenue 
        ON elocal_call_data(original_revenue)
      `);
      console.log('[INFO] Created index on original_revenue');
    } catch (error) {
      console.warn('[WARN] Could not create index on original_revenue:', error.message);
    }
    
    await client.query('COMMIT');
    
    console.log('');
    console.log('[SUCCESS] Migration completed successfully!');
    console.log('[INFO] Columns added:');
    console.log('  - original_payout');
    console.log('  - original_revenue');
    console.log('');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Migration failed:', error.message);
    if (error.code) {
      console.error(`[ERROR] Error code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

