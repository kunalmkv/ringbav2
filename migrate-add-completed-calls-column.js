#!/usr/bin/env node

/**
 * Migration script to add completed_calls and completion_rate columns to ringba_campaign_summary table
 * 
 * Adds:
 * - completed_calls: Number of calls that were completed (duration > 0)
 * - completion_rate: Percentage of completed calls
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
    console.log('Starting migration: Add completed_calls and completion_rate columns to ringba_campaign_summary table...');
    console.log('');
    
    // Check if completed_calls column exists
    const checkCompletedCallsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ringba_campaign_summary' 
      AND column_name = 'completed_calls'
    `;
    const checkCompletedCallsResult = await client.query(checkCompletedCallsQuery);
    
    if (checkCompletedCallsResult.rows.length === 0) {
      // Add completed_calls column
      const addCompletedCallsQuery = `
        ALTER TABLE ringba_campaign_summary
        ADD COLUMN completed_calls INTEGER DEFAULT 0;
      `;
      await client.query(addCompletedCallsQuery);
      console.log('✅ Added completed_calls column to ringba_campaign_summary table.');
    } else {
      console.log('ℹ️  completed_calls column already exists. Skipping.');
    }
    
    // Check if completion_rate column exists
    const checkCompletionRateQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'ringba_campaign_summary' 
      AND column_name = 'completion_rate'
    `;
    const checkCompletionRateResult = await client.query(checkCompletionRateQuery);
    
    if (checkCompletionRateResult.rows.length === 0) {
      // Add completion_rate column
      const addCompletionRateQuery = `
        ALTER TABLE ringba_campaign_summary
        ADD COLUMN completion_rate DECIMAL(10, 2) DEFAULT 0;
      `;
      await client.query(addCompletionRateQuery);
      console.log('✅ Added completion_rate column to ringba_campaign_summary table.');
    } else {
      console.log('ℹ️  completion_rate column already exists. Skipping.');
    }
    
    // Add indexes for performance (optional but recommended)
    const checkCompletedCallsIndexQuery = `
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'ringba_campaign_summary' AND indexname = 'idx_ringba_campaign_summary_completed_calls';
    `;
    const checkCompletedCallsIndexResult = await client.query(checkCompletedCallsIndexQuery);
    
    if (checkCompletedCallsIndexResult.rows.length === 0) {
      const createIndexQuery = `
        CREATE INDEX idx_ringba_campaign_summary_completed_calls ON ringba_campaign_summary(completed_calls);
      `;
      await client.query(createIndexQuery);
      console.log('✅ Created index idx_ringba_campaign_summary_completed_calls.');
    } else {
      console.log('ℹ️  Index idx_ringba_campaign_summary_completed_calls already exists. Skipping.');
    }
    
    console.log('');
    console.log('='.repeat(70));
    console.log('Migration Summary');
    console.log('='.repeat(70));
    console.log('✅ Migration completed successfully');
    console.log('   - completed_calls: INTEGER DEFAULT 0');
    console.log('   - completion_rate: DECIMAL(10, 2) DEFAULT 0');
    console.log('='.repeat(70));
    console.log('');
    
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

