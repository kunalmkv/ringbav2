#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';
import { getCategoryFromTargetId } from './src/http/ringba-target-calls.js';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function getUnmatchedCalls() {
  const client = await pool.connect();
  try {
    const date = '2025-12-02';
    
    // Get all Ringba calls
    const ringbaQuery = `
      SELECT 
        inbound_call_id, call_date_time, caller_id, caller_id_e164,
        payout_amount, revenue_amount, target_id
      FROM ringba_calls
      WHERE SUBSTRING(call_date_time, 1, 10) = $1
      ORDER BY call_date_time
    `;
    const ringbaCalls = await client.query(ringbaQuery, [date]);
    
    // Get all eLocal calls with their matches
    const elocalQuery = `
      SELECT 
        id, caller_id, date_of_call, category, payout,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE SUBSTRING(date_of_call, 1, 10) = $1
      ORDER BY date_of_call
    `;
    const elocalCalls = await client.query(elocalQuery, [date]);
    
    // Get matched Ringba call IDs
    const matchedRingbaIds = new Set(
      elocalCalls.rows
        .filter(c => c.ringba_inbound_call_id)
        .map(c => c.ringba_inbound_call_id)
    );
    
    // Find unmatched Ringba calls
    const unmatchedRingba = ringbaCalls.rows.filter(rc => !matchedRingbaIds.has(rc.inbound_call_id));
    
    console.log('='.repeat(100));
    console.log('COMPLETE LIST OF UNMATCHED RINGBA CALLS');
    console.log('='.repeat(100));
    console.log(`Date: ${date}`);
    console.log(`Total Unmatched: ${unmatchedRingba.length}`);
    console.log('='.repeat(100));
    console.log('');
    
    unmatchedRingba.forEach((call, index) => {
      const category = getCategoryFromTargetId(call.target_id) || 'UNKNOWN';
      console.log(`${index + 1}. Ringba Call ID: ${call.inbound_call_id}`);
      console.log(`   Date/Time: ${call.call_date_time}`);
      console.log(`   Category: ${category}`);
      console.log(`   Caller ID: ${call.caller_id} (E.164: ${call.caller_id_e164})`);
      console.log(`   Payout: $${call.payout_amount}`);
      console.log(`   Revenue: $${call.revenue_amount}`);
      console.log(`   Target ID: ${call.target_id}`);
      console.log('');
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

getUnmatchedCalls().catch(console.error);

