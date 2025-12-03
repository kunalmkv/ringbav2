#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';

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

async function checkTargetCalls() {
  const client = await pool.connect();
  try {
    console.log('Checking if target Ringba calls are in database...\n');
    
    const target1 = 'RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01';
    const target2 = 'RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01';
    
    const result1 = await client.query(`
      SELECT inbound_call_id, call_date_time, caller_id, caller_id_e164, target_id, payout_amount
      FROM ringba_calls
      WHERE inbound_call_id = $1
    `, [target1]);
    
    const result2 = await client.query(`
      SELECT inbound_call_id, call_date_time, caller_id, caller_id_e164, target_id, payout_amount
      FROM ringba_calls
      WHERE inbound_call_id = $1
    `, [target2]);
    
    console.log(`Target Call 1: ${target1}`);
    if (result1.rows.length > 0) {
      const r = result1.rows[0];
      console.log(`  ✅ Found in database`);
      console.log(`     Date: ${r.call_date_time}`);
      console.log(`     Caller: ${r.caller_id} (E.164: ${r.caller_id_e164})`);
      console.log(`     Target ID: ${r.target_id}`);
      console.log(`     Payout: $${r.payout_amount}`);
      
      // Check date part
      const datePart = r.call_date_time.substring(0, 10);
      console.log(`     Date part: ${datePart}`);
      if (datePart === '2025-12-02') {
        console.log(`     ✅ Date matches 2025-12-02`);
      } else {
        console.log(`     ❌ Date does NOT match 2025-12-02`);
      }
    } else {
      console.log(`  ❌ NOT FOUND in database`);
    }
    
    console.log(`\nTarget Call 2: ${target2}`);
    if (result2.rows.length > 0) {
      const r = result2.rows[0];
      console.log(`  ✅ Found in database`);
      console.log(`     Date: ${r.call_date_time}`);
      console.log(`     Caller: ${r.caller_id} (E.164: ${r.caller_id_e164})`);
      console.log(`     Target ID: ${r.target_id}`);
      console.log(`     Payout: $${r.payout_amount}`);
      
      // Check date part
      const datePart = r.call_date_time.substring(0, 10);
      console.log(`     Date part: ${datePart}`);
      if (datePart === '2025-12-02') {
        console.log(`     ✅ Date matches 2025-12-02`);
      } else {
        console.log(`     ❌ Date does NOT match 2025-12-02`);
      }
    } else {
      console.log(`  ❌ NOT FOUND in database`);
    }
    
    // Check all Ringba calls for Dec 2
    console.log(`\n\nAll Ringba calls for 2025-12-02:`);
    const allCalls = await client.query(`
      SELECT inbound_call_id, call_date_time, caller_id, target_id
      FROM ringba_calls
      WHERE SUBSTRING(call_date_time, 1, 10) = '2025-12-02'
      ORDER BY call_date_time
    `);
    
    console.log(`Total: ${allCalls.rows.length} calls`);
    console.log(`\nFirst 10 calls:`);
    allCalls.rows.slice(0, 10).forEach((r, i) => {
      const isTarget = r.inbound_call_id === target1 || r.inbound_call_id === target2;
      console.log(`  [${i + 1}] ${r.inbound_call_id.substring(0, 20)}... ${r.call_date_time} ${isTarget ? '🎯' : ''}`);
    });
    
    const found1 = allCalls.rows.some(r => r.inbound_call_id === target1);
    const found2 = allCalls.rows.some(r => r.inbound_call_id === target2);
    
    console.log(`\n\nSummary:`);
    console.log(`  Target 1 in Dec 2 calls: ${found1 ? '✅ YES' : '❌ NO'}`);
    console.log(`  Target 2 in Dec 2 calls: ${found2 ? '✅ YES' : '❌ NO'}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkTargetCalls().catch(console.error);

