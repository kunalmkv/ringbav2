#!/usr/bin/env node

/**
 * Script to clear all data from elocal_call_data table
 * 
 * Usage:
 *   node clear-database.js
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

async function clearDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('[INFO] Connecting to database...');
    console.log(`[INFO] Database: ${process.env.POSTGRES_HOST || process.env.DB_HOST}:${process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'}/${process.env.POSTGRES_DB_NAME || process.env.DB_NAME}`);
    
    // Get count before deletion
    const countResult = await client.query('SELECT COUNT(*) as count FROM elocal_call_data');
    const countBefore = parseInt(countResult.rows[0].count);
    
    console.log(`[INFO] Found ${countBefore} records in elocal_call_data table`);
    
    if (countBefore === 0) {
      console.log('[INFO] Database is already empty. Nothing to delete.');
      return;
    }
    
    console.log('[WARNING] About to delete ALL data from elocal_call_data table!');
    console.log('[WARNING] This action cannot be undone!');
    
    // Delete all records
    await client.query('BEGIN');
    await client.query('DELETE FROM elocal_call_data');
    await client.query('COMMIT');
    
    // Verify deletion
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM elocal_call_data');
    const countAfter = parseInt(verifyResult.rows[0].count);
    
    console.log('');
    console.log('[SUCCESS] Database cleared successfully!');
    console.log(`[INFO] Deleted ${countBefore} records`);
    console.log(`[INFO] Remaining records: ${countAfter}`);
    console.log('');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Failed to clear database:', error.message);
    if (error.code) {
      console.error(`[ERROR] Error code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearDatabase();

