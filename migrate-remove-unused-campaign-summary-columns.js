#!/usr/bin/env node

/**
 * Migration script to remove unused columns from ringba_campaign_summary table
 * 
 * Removes the following columns:
 * - medium_distribution, source_distribution, device_type_distribution
 * - top_cities, top_states, average_quality_score
 * - rerouted_calls, average_conferences, total_conferences
 * - average_transfers, total_transfers
 * - average_recording_duration, total_recording_duration, calls_with_recordings
 * - average_post_call_duration, total_post_call_duration
 * - average_time_to_answer, total_time_to_answer
 * - average_hold_time, total_hold_time
 * - average_wait_time, total_wait_time
 * - average_talk_time, total_talk_time
 * - profit, ivr_handled, blocked
 * - average_call_length_seconds
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

// Columns to remove
const columnsToRemove = [
  'medium_distribution',
  'source_distribution',
  'device_type_distribution',
  'top_cities',
  'top_states',
  'average_quality_score',
  'rerouted_calls',
  'average_conferences',
  'total_conferences',
  'average_transfers',
  'total_transfers',
  'average_recording_duration',
  'total_recording_duration',
  'calls_with_recordings',
  'average_post_call_duration',
  'total_post_call_duration',
  'average_time_to_answer',
  'total_time_to_answer',
  'average_hold_time',
  'total_hold_time',
  'average_wait_time',
  'total_wait_time',
  'average_talk_time',
  'total_talk_time',
  'profit',
  'ivr_handled',
  'blocked',
  'average_call_length_seconds'
];

async function migrate() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration: Remove unused columns from ringba_campaign_summary table...');
    console.log(`Columns to remove: ${columnsToRemove.length}`);
    console.log('');
    
    let removedCount = 0;
    let skippedCount = 0;
    
    for (const columnName of columnsToRemove) {
      try {
        // Check if column exists
        const checkQuery = `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'ringba_campaign_summary' 
          AND column_name = $1
        `;
        const checkResult = await client.query(checkQuery, [columnName]);
        
        if (checkResult.rows.length === 0) {
          console.log(`⏭️  Column '${columnName}' does not exist. Skipping.`);
          skippedCount++;
          continue;
        }
        
        // Drop the column
        const dropQuery = `ALTER TABLE ringba_campaign_summary DROP COLUMN IF EXISTS ${columnName}`;
        await client.query(dropQuery);
        console.log(`✅ Removed column: ${columnName}`);
        removedCount++;
        
      } catch (error) {
        console.error(`❌ Error removing column '${columnName}':`, error.message);
        // Continue with next column
      }
    }
    
    console.log('');
    console.log('='.repeat(70));
    console.log('Migration Summary');
    console.log('='.repeat(70));
    console.log(`Total columns to remove: ${columnsToRemove.length}`);
    console.log(`Successfully removed: ${removedCount}`);
    console.log(`Skipped (not found): ${skippedCount}`);
    console.log('='.repeat(70));
    console.log('');
    console.log('✅ Migration completed successfully');
    
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
    console.log('');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });


