#!/usr/bin/env node

/**
 * Migration script to add campaign_id column to ringba_campaign_summary table
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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
    
    console.log('[INFO] Adding campaign_id column...');
    await client.query('BEGIN');
    
    // Add campaign_id column if it doesn't exist
    await client.query(`
      ALTER TABLE ringba_campaign_summary 
      ADD COLUMN IF NOT EXISTS campaign_id VARCHAR(255)
    `);
    
    // Create index for campaign_id if it doesn't exist
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ringba_campaign_summary_campaign_id 
      ON ringba_campaign_summary(campaign_id)
    `);
    
    await client.query('COMMIT');
    
    console.log('[SUCCESS] Migration completed successfully!');
    console.log('[INFO] Added campaign_id column to ringba_campaign_summary table');
    
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

