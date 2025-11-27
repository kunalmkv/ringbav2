#!/usr/bin/env node

/**
 * Migration script to add call_duration column to ringba_calls table
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const { Pool } = pg;

const config = {
  host: process.env.POSTGRES_HOST || process.env.DB_HOST,
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

const pool = new Pool(config);

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration: Add call_duration column to ringba_calls table...');
    
    // Check if column exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ringba_calls' AND column_name = 'call_duration'
    `;
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('Column call_duration already exists. Skipping migration.');
      return;
    }
    
    // Add the column
    const alterQuery = `
      ALTER TABLE ringba_calls 
      ADD COLUMN call_duration INTEGER DEFAULT 0
    `;
    
    await client.query(alterQuery);
    console.log('✅ Successfully added call_duration column to ringba_calls table');
    
    // Add index for better query performance
    const indexQuery = `
      CREATE INDEX IF NOT EXISTS idx_ringba_calls_call_duration ON ringba_calls(call_duration)
    `;
    await client.query(indexQuery);
    console.log('✅ Successfully created index on call_duration column');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

