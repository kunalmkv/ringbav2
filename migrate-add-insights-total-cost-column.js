#!/usr/bin/env node

/**
 * Migration script to add insights_total_cost column to ringba_campaign_summary table
 * Stores total cost fetched from Ringba Insights API
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

const addInsightsTotalCostColumn = async () => {
  const client = await pool.connect();
  try {
    console.log('[Migration] Adding insights_total_cost column to ringba_campaign_summary table...');
    
    // Check if column already exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ringba_campaign_summary' 
      AND column_name = 'insights_total_cost';
    `;
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('[Migration] Column insights_total_cost already exists. Skipping...');
      return;
    }
    
    // Add insights_total_cost column
    await client.query(`
      ALTER TABLE ringba_campaign_summary
      ADD COLUMN insights_total_cost DECIMAL(10, 2) DEFAULT 0;
    `);
    
    console.log('[Migration] ✅ insights_total_cost column added successfully!');
    
    // Show current table structure
    const tableInfo = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'ringba_campaign_summary'
      AND column_name = 'insights_total_cost';
    `);
    
    console.log('[Migration] Added column:');
    tableInfo.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'NULL'})`);
    });
    
  } catch (error) {
    console.error('[Migration] ❌ Error adding insights_total_cost column:', error);
    throw error;
  } finally {
    client.release();
  }
};

const runMigration = async () => {
  try {
    await addInsightsTotalCostColumn();
    console.log('[Migration] ✅ Migration completed successfully!');
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

runMigration();

