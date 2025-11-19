#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || process.env.POSTGRES_HOST,
  port: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
  database: process.env.DB_NAME || process.env.POSTGRES_DB_NAME,
  user: process.env.DB_USER || process.env.POSTGRES_USER_NAME,
  password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function checkCalls() {
  try {
    // Count total calls
    const totalResult = await pool.query('SELECT COUNT(*) as count FROM ringba_calls');
    const totalCount = parseInt(totalResult.rows[0].count);
    
    // Count calls in the date range (11/09/2025 to 11/18/2025)
    // Ringba format: MM/DD/YYYY HH:MM:SS AM/PM
    const dateRangeResult = await pool.query(`
      SELECT COUNT(*) as count 
      FROM ringba_calls 
      WHERE call_date_time >= '11/09/2025' 
        AND call_date_time < '11/19/2025'
    `);
    const dateRangeCount = parseInt(dateRangeResult.rows[0].count);
    
    // Get sample of recent calls
    const sampleResult = await pool.query(`
      SELECT inbound_call_id, call_date_time, caller_id, payout_amount, revenue_amount, created_at
      FROM ringba_calls
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    console.log('');
    console.log('='.repeat(70));
    console.log('Ringba Calls Database Status');
    console.log('='.repeat(70));
    console.log(`Total calls in database: ${totalCount}`);
    console.log(`Calls in date range (11/09-11/18): ${dateRangeCount}`);
    console.log(`Expected calls from sync: 4009`);
    console.log('');
    console.log('Sample of recent calls:');
    sampleResult.rows.forEach((call, i) => {
      console.log(`  ${i + 1}. ${call.inbound_call_id.substring(0, 30)}...`);
      console.log(`     Date: ${call.call_date_time}`);
      console.log(`     Caller: ${call.caller_id || 'N/A'}`);
      console.log(`     Payout: $${call.payout_amount} | Revenue: $${call.revenue_amount}`);
      console.log(`     Created: ${call.created_at}`);
      console.log('');
    });
    console.log('='.repeat(70));
    console.log('');
    
    if (dateRangeCount >= 4009) {
      console.log('✅ All calls appear to be saved successfully!');
    } else if (dateRangeCount > 0) {
      const percentage = ((dateRangeCount/4009)*100).toFixed(1);
      console.log(`⚠️  Partial save: ${dateRangeCount} out of 4009 calls saved (${percentage}%)`);
      console.log(`   Missing: ${4009 - dateRangeCount} calls`);
    } else {
      console.log('❌ No calls found in the date range');
    }
    console.log('');
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    await pool.end();
    process.exit(1);
  }
}

checkCalls();

