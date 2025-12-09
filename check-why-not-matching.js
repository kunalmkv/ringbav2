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

async function checkMatchingStatus() {
  const client = await pool.connect();
  try {
    console.log('='.repeat(80));
    console.log('CHECKING WHY CALLS ARE NOT MATCHING');
    console.log('='.repeat(80));
    
    // Check Case 1: eLocal 799
    console.log('\n📞 Case 1: eLocal Call ID 799');
    const elocal1 = await client.query(`
      SELECT id, caller_id, date_of_call, payout, category,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE id = 799
    `);
    
    if (elocal1.rows.length > 0) {
      const call = elocal1.rows[0];
      console.log(`   Caller ID: ${call.caller_id}`);
      console.log(`   Date: ${call.date_of_call}`);
      console.log(`   Payout: $${call.payout}`);
      console.log(`   Category: ${call.category}`);
      console.log(`   Original Payout: ${call.original_payout || 'NULL'}`);
      console.log(`   Original Revenue: ${call.original_revenue || 'NULL'}`);
      console.log(`   Ringba Inbound Call ID: ${call.ringba_inbound_call_id || 'NULL'}`);
      
      if (call.ringba_inbound_call_id) {
        console.log(`\n   ⚠️  This eLocal call is ALREADY MATCHED to Ringba: ${call.ringba_inbound_call_id}`);
        const ringba1 = await client.query(`
          SELECT inbound_call_id, call_date_time, caller_id, payout_amount
          FROM ringba_calls
          WHERE inbound_call_id = $1
        `, [call.ringba_inbound_call_id]);
        
        if (ringba1.rows.length > 0) {
          const r = ringba1.rows[0];
          console.log(`   Matched Ringba Call Details:`);
          console.log(`     ID: ${r.inbound_call_id}`);
          console.log(`     Date: ${r.call_date_time}`);
          console.log(`     Caller: ${r.caller_id}`);
          console.log(`     Payout: $${r.payout_amount}`);
        }
      } else {
        console.log(`\n   ✅ This eLocal call is NOT matched (available for matching)`);
      }
    }
    
    // Check Case 2: eLocal 828
    console.log('\n📞 Case 2: eLocal Call ID 828');
    const elocal2 = await client.query(`
      SELECT id, caller_id, date_of_call, payout, category,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE id = 828
    `);
    
    if (elocal2.rows.length > 0) {
      const call = elocal2.rows[0];
      console.log(`   Caller ID: ${call.caller_id}`);
      console.log(`   Date: ${call.date_of_call}`);
      console.log(`   Payout: $${call.payout}`);
      console.log(`   Category: ${call.category}`);
      console.log(`   Original Payout: ${call.original_payout || 'NULL'}`);
      console.log(`   Original Revenue: ${call.original_revenue || 'NULL'}`);
      console.log(`   Ringba Inbound Call ID: ${call.ringba_inbound_call_id || 'NULL'}`);
      
      if (call.ringba_inbound_call_id) {
        console.log(`\n   ⚠️  This eLocal call is ALREADY MATCHED to Ringba: ${call.ringba_inbound_call_id}`);
        const ringba2 = await client.query(`
          SELECT inbound_call_id, call_date_time, caller_id, payout_amount
          FROM ringba_calls
          WHERE inbound_call_id = $1
        `, [call.ringba_inbound_call_id]);
        
        if (ringba2.rows.length > 0) {
          const r = ringba2.rows[0];
          console.log(`   Matched Ringba Call Details:`);
          console.log(`     ID: ${r.inbound_call_id}`);
          console.log(`     Date: ${r.call_date_time}`);
          console.log(`     Caller: ${r.caller_id}`);
          console.log(`     Payout: $${r.payout_amount}`);
        }
      } else {
        console.log(`\n   ✅ This eLocal call is NOT matched (available for matching)`);
      }
    }
    
    // Check if the target Ringba calls exist
    console.log('\n\n📞 Target Ringba Calls:');
    
    console.log('\n   Ringba Call: RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01');
    const ringbaTarget1 = await client.query(`
      SELECT inbound_call_id, call_date_time, caller_id, payout_amount, target_id
      FROM ringba_calls
      WHERE inbound_call_id = 'RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01'
    `);
    
    if (ringbaTarget1.rows.length > 0) {
      const r = ringbaTarget1.rows[0];
      console.log(`     Date: ${r.call_date_time}`);
      console.log(`     Caller: ${r.caller_id}`);
      console.log(`     Payout: $${r.payout_amount}`);
      console.log(`     Target ID: ${r.target_id}`);
    } else {
      console.log(`     ❌ NOT FOUND in database!`);
    }
    
    console.log('\n   Ringba Call: RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01');
    const ringbaTarget2 = await client.query(`
      SELECT inbound_call_id, call_date_time, caller_id, payout_amount, target_id
      FROM ringba_calls
      WHERE inbound_call_id = 'RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01'
    `);
    
    if (ringbaTarget2.rows.length > 0) {
      const r = ringbaTarget2.rows[0];
      console.log(`     Date: ${r.call_date_time}`);
      console.log(`     Caller: ${r.caller_id}`);
      console.log(`     Payout: $${r.payout_amount}`);
      console.log(`     Target ID: ${r.target_id}`);
    } else {
      console.log(`     ❌ NOT FOUND in database!`);
    }
    
    // Check for other eLocal calls with same caller ID and category that might be matched
    console.log('\n\n🔍 Checking for other eLocal calls with same caller IDs:');
    
    console.log('\n   eLocal calls with caller +19712976732 (Case 1):');
    const sameCaller1 = await client.query(`
      SELECT id, date_of_call, ringba_inbound_call_id, original_payout
      FROM elocal_call_data
      WHERE caller_id LIKE '%9712976732%' OR caller_id LIKE '%297-6732%'
      ORDER BY date_of_call
    `);
    sameCaller1.rows.forEach(c => {
      console.log(`     ID ${c.id}: ${c.date_of_call}, Matched to: ${c.ringba_inbound_call_id || 'NULL'}, Original Payout: ${c.original_payout || 'NULL'}`);
    });
    
    console.log('\n   eLocal calls with caller +14327709767 (Case 2):');
    const sameCaller2 = await client.query(`
      SELECT id, date_of_call, ringba_inbound_call_id, original_payout
      FROM elocal_call_data
      WHERE caller_id LIKE '%4327709767%' OR caller_id LIKE '%770-9767%'
      ORDER BY date_of_call
    `);
    sameCaller2.rows.forEach(c => {
      console.log(`     ID ${c.id}: ${c.date_of_call}, Matched to: ${c.ringba_inbound_call_id || 'NULL'}, Original Payout: ${c.original_payout || 'NULL'}`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkMatchingStatus().catch(console.error);


