#!/usr/bin/env node

/**
 * Migration script to add google_ads_spend column to ringba_campaign_summary table
 * Stores daily Google Ads spend data that can be manually entered
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

const addGoogleAdsSpendColumn = async () => {
  const client = await pool.connect();
  try {
    console.log('[Migration] Adding google_ads_spend column to ringba_campaign_summary table...');
    
    // Check if column already exists
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ringba_campaign_summary' 
      AND column_name = 'google_ads_spend';
    `;
    const checkResult = await client.query(checkQuery);
    
    if (checkResult.rows.length > 0) {
      console.log('[Migration] Column google_ads_spend already exists. Skipping...');
      return;
    }
    
    // Add google_ads_spend column
    await client.query(`
      ALTER TABLE ringba_campaign_summary
      ADD COLUMN google_ads_spend DECIMAL(10, 2) DEFAULT 0,
      ADD COLUMN google_ads_notes TEXT;
    `);
    
    console.log('[Migration] ✅ google_ads_spend and google_ads_notes columns added successfully!');
    
    // Show current table structure
    const tableInfo = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'ringba_campaign_summary'
      AND column_name IN ('google_ads_spend', 'google_ads_notes')
      ORDER BY ordinal_position;
    `);
    
    console.log('[Migration] Added columns:');
    tableInfo.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'NULL'})`);
    });
    
  } catch (error) {
    console.error('[Migration] ❌ Error adding google_ads_spend column:', error);
    throw error;
  } finally {
    client.release();
  }
};

const runMigration = async () => {
  try {
    await addGoogleAdsSpendColumn();
    console.log('[Migration] ✅ Migration completed successfully!');
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

runMigration();

