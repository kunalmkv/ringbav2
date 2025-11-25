#!/usr/bin/env node

/**
 * Migration script to add extended columns to ringba_campaign_summary table
 * Adds additional metrics and analytics fields
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

const addExtendedColumns = async () => {
  const client = await pool.connect();
  try {
    console.log('[Migration] Adding extended columns to ringba_campaign_summary table...');
    
    // List of columns to add
    const columns = [
      { name: 'connected_calls', type: 'INTEGER DEFAULT 0', description: 'Number of connected calls' },
      { name: 'connection_rate', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Connection rate percentage' },
      { name: 'total_talk_time', type: 'INTEGER DEFAULT 0', description: 'Total talk time in seconds' },
      { name: 'average_talk_time', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Average talk time in seconds' },
      { name: 'total_wait_time', type: 'INTEGER DEFAULT 0', description: 'Total wait time in seconds' },
      { name: 'average_wait_time', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Average wait time in seconds' },
      { name: 'total_hold_time', type: 'INTEGER DEFAULT 0', description: 'Total hold time in seconds' },
      { name: 'average_hold_time', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Average hold time in seconds' },
      { name: 'total_time_to_answer', type: 'INTEGER DEFAULT 0', description: 'Total time to answer in seconds' },
      { name: 'average_time_to_answer', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Average time to answer in seconds' },
      { name: 'total_post_call_duration', type: 'INTEGER DEFAULT 0', description: 'Total post-call duration in seconds' },
      { name: 'average_post_call_duration', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Average post-call duration in seconds' },
      { name: 'calls_with_recordings', type: 'INTEGER DEFAULT 0', description: 'Number of calls with recordings' },
      { name: 'total_recording_duration', type: 'INTEGER DEFAULT 0', description: 'Total recording duration in seconds' },
      { name: 'average_recording_duration', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Average recording duration in seconds' },
      { name: 'total_transfers', type: 'INTEGER DEFAULT 0', description: 'Total number of transfers' },
      { name: 'average_transfers', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Average transfers per call' },
      { name: 'total_conferences', type: 'INTEGER DEFAULT 0', description: 'Total number of conferences' },
      { name: 'average_conferences', type: 'DECIMAL(10, 2) DEFAULT 0', description: 'Average conferences per call' },
      { name: 'rerouted_calls', type: 'INTEGER DEFAULT 0', description: 'Number of rerouted calls' },
      { name: 'root_calls', type: 'INTEGER DEFAULT 0', description: 'Number of root calls' },
      { name: 'average_quality_score', type: 'DECIMAL(10, 2)', description: 'Average quality score (nullable)' },
      { name: 'top_states', type: 'TEXT', description: 'Top states JSON' },
      { name: 'top_cities', type: 'TEXT', description: 'Top cities JSON' },
      { name: 'device_type_distribution', type: 'TEXT', description: 'Device type distribution JSON' },
      { name: 'source_distribution', type: 'TEXT', description: 'Source distribution JSON' },
      { name: 'medium_distribution', type: 'TEXT', description: 'Medium distribution JSON' }
    ];
    
    // Check which columns already exist
    const checkQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ringba_campaign_summary';
    `;
    const checkResult = await client.query(checkQuery);
    const existingColumns = new Set(checkResult.rows.map(row => row.column_name));
    
    // Add columns that don't exist
    let addedCount = 0;
    for (const col of columns) {
      if (existingColumns.has(col.name)) {
        console.log(`[Migration] Column ${col.name} already exists. Skipping...`);
        continue;
      }
      
      try {
        await client.query(`
          ALTER TABLE ringba_campaign_summary
          ADD COLUMN ${col.name} ${col.type};
        `);
        console.log(`[Migration] ✅ Added column: ${col.name} (${col.description})`);
        addedCount++;
      } catch (error) {
        console.error(`[Migration] ❌ Error adding column ${col.name}:`, error.message);
        // Continue with other columns
      }
    }
    
    if (addedCount === 0) {
      console.log('[Migration] All columns already exist. No changes needed.');
    } else {
      console.log(`[Migration] ✅ Added ${addedCount} new column(s)`);
    }
    
    // Show current table structure
    const tableInfo = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'ringba_campaign_summary'
      ORDER BY ordinal_position;
    `);
    
    console.log(`[Migration] Total columns in ringba_campaign_summary: ${tableInfo.rows.length}`);
    
  } catch (error) {
    console.error('[Migration] ❌ Error adding extended columns:', error);
    throw error;
  } finally {
    client.release();
  }
};

const runMigration = async () => {
  try {
    await addExtendedColumns();
    console.log('[Migration] ✅ Migration completed successfully!');
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

runMigration();

