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

const toE164 = (raw) => {
  if (!raw) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return raw;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.length > 0 ? `+${digits}` : null;
};

const timeDiffMinutes = (date1, date2) => {
  if (!date1 || !date2) return Infinity;
  return Math.abs(new Date(date1).getTime() - new Date(date2).getTime()) / (1000 * 60);
};

async function getMatchedCalls() {
  const client = await pool.connect();
  try {
    const date = '2025-12-02';
    
    // Get all eLocal calls that have been matched (have ringba_inbound_call_id)
    const matchedQuery = `
      SELECT 
        e.id as elocal_id,
        e.caller_id as elocal_caller_id,
        e.date_of_call as elocal_date,
        e.category as elocal_category,
        e.payout as elocal_payout,
        e.original_payout,
        e.original_revenue,
        e.ringba_inbound_call_id,
        r.inbound_call_id as ringba_call_id,
        r.call_date_time as ringba_date,
        r.caller_id as ringba_caller_id,
        r.caller_id_e164 as ringba_caller_e164,
        r.payout_amount as ringba_payout,
        r.revenue_amount as ringba_revenue,
        r.target_id
      FROM elocal_call_data e
      INNER JOIN ringba_calls r ON e.ringba_inbound_call_id = r.inbound_call_id
      WHERE SUBSTRING(e.date_of_call, 1, 10) = $1
        AND e.ringba_inbound_call_id IS NOT NULL
      ORDER BY e.date_of_call
    `;
    const matchedResult = await client.query(matchedQuery, [date]);
    
    console.log('='.repeat(100));
    console.log('COMPLETE LIST OF MATCHED CALLS');
    console.log('='.repeat(100));
    console.log(`Date: ${date}`);
    console.log(`Total Matched: ${matchedResult.rows.length}`);
    console.log('='.repeat(100));
    console.log('');
    
    matchedResult.rows.forEach((match, index) => {
      const ringbaCategory = getCategoryFromTargetId(match.target_id) || 'UNKNOWN';
      const timeDiff = timeDiffMinutes(match.elocal_date, match.ringba_date);
      const payoutMatch = Math.abs(parseFloat(match.elocal_payout || 0) - parseFloat(match.ringba_payout || 0)) < 0.01;
      
      console.log(`${index + 1}. Match Pair:`);
      console.log(`   eLocal Call ID: ${match.elocal_id}`);
      console.log(`      Date/Time: ${match.elocal_date}`);
      console.log(`      Category: ${match.elocal_category}`);
      console.log(`      Caller ID: ${match.elocal_caller_id} (E.164: ${toE164(match.elocal_caller_id)})`);
      console.log(`      eLocal Payout: $${match.elocal_payout}`);
      console.log(`      Original Payout (from Ringba): $${match.original_payout || '0.00'}`);
      console.log(`      Original Revenue (from Ringba): $${match.original_revenue || '0.00'}`);
      console.log(`   Ringba Call ID: ${match.ringba_call_id}`);
      console.log(`      Date/Time: ${match.ringba_date}`);
      console.log(`      Category: ${ringbaCategory}`);
      console.log(`      Caller ID: ${match.ringba_caller_id} (E.164: ${match.ringba_caller_e164})`);
      console.log(`      Ringba Payout: $${match.ringba_payout}`);
      console.log(`      Ringba Revenue: $${match.ringba_revenue}`);
      console.log(`   Match Quality:`);
      console.log(`      Time Difference: ${timeDiff.toFixed(1)} minutes`);
      console.log(`      Payout Match: ${payoutMatch ? 'YES' : 'NO'} (eLocal: $${match.elocal_payout}, Ringba: $${match.ringba_payout})`);
      console.log('');
    });
    
    // Summary statistics
    console.log('='.repeat(100));
    console.log('MATCHING SUMMARY STATISTICS');
    console.log('='.repeat(100));
    
    const timeDiffs = matchedResult.rows.map(m => timeDiffMinutes(m.elocal_date, m.ringba_date));
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    const maxTimeDiff = Math.max(...timeDiffs);
    const minTimeDiff = Math.min(...timeDiffs);
    
    const payoutMatches = matchedResult.rows.filter(m => {
      const diff = Math.abs(parseFloat(m.elocal_payout || 0) - parseFloat(m.ringba_payout || 0));
      return diff < 0.01;
    }).length;
    
    const byCategory = {};
    matchedResult.rows.forEach(m => {
      const cat = m.elocal_category || 'UNKNOWN';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });
    
    console.log(`Total Matches: ${matchedResult.rows.length}`);
    console.log(`\nTime Difference Statistics:`);
    console.log(`  Average: ${avgTimeDiff.toFixed(1)} minutes`);
    console.log(`  Minimum: ${minTimeDiff.toFixed(1)} minutes`);
    console.log(`  Maximum: ${maxTimeDiff.toFixed(1)} minutes`);
    console.log(`\nPayout Match Statistics:`);
    console.log(`  Exact Payout Matches: ${payoutMatches} (${((payoutMatches / matchedResult.rows.length) * 100).toFixed(1)}%)`);
    console.log(`  Payout Mismatches: ${matchedResult.rows.length - payoutMatches} (${(((matchedResult.rows.length - payoutMatches) / matchedResult.rows.length) * 100).toFixed(1)}%)`);
    console.log(`\nMatches by Category:`);
    Object.entries(byCategory).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count} matches`);
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

getMatchedCalls().catch(console.error);


