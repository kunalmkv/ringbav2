#!/usr/bin/env node

/**
 * Database setup script
 * Creates all required tables for the eLocal scraper
 * 
 * Usage:
 *   node setup-database.js
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

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('[INFO] Connecting to database...');
    console.log(`[INFO] Database: ${process.env.POSTGRES_HOST || process.env.DB_HOST}:${process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'}/${process.env.POSTGRES_DB_NAME || process.env.DB_NAME}`);
    
    // Read and execute schema file
    const schemaPath = join(__dirname, 'src/database/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    console.log('[INFO] Creating tables...');
    await client.query('BEGIN');
    
    // Split by semicolons and execute each statement
    // Remove comments and empty lines
    const statements = schema
      .split(';')
      .map(s => {
        // Remove single-line comments
        const lines = s.split('\n').map(line => {
          const commentIndex = line.indexOf('--');
          if (commentIndex >= 0) {
            return line.substring(0, commentIndex).trim();
          }
          return line.trim();
        });
        return lines.filter(l => l.length > 0).join(' ');
      })
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await client.query(statement);
        } catch (error) {
          // If it's a "relation does not exist" error on an index, it might be because
          // the table wasn't created yet - this can happen if CREATE TABLE IF NOT EXISTS
          // didn't create it. Let's continue anyway.
          if (error.code === '42P01' && statement.toUpperCase().includes('INDEX')) {
            console.warn(`[WARN] Skipping index creation (table may not exist yet): ${error.message}`);
            continue;
          }
          throw error;
        }
      }
    }
    
    await client.query('COMMIT');
    
    console.log('[SUCCESS] Database setup completed successfully!');
    console.log('[INFO] Created tables:');
    console.log('  - scraping_sessions');
    console.log('  - elocal_call_data');
    console.log('  - adjustment_details');
    console.log('  - ringba_calls');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Database setup failed:', error.message);
    if (error.code) {
      console.error(`[ERROR] Error code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();

