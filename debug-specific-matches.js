#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';
import { getCategoryFromTargetId } from './src/http/ringba-target-calls.js';

// Copy helper functions from ringba-original-sync.js
const toE164 = (raw) => {
  if (!raw) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return raw;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.length > 0 ? `+${digits}` : null;
};

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    const ringbaFormat = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
    if (ringbaFormat) {
      const month = parseInt(ringbaFormat[1], 10) - 1;
      const day = parseInt(ringbaFormat[2], 10);
      const year = parseInt(ringbaFormat[3], 10);
      let hours = parseInt(ringbaFormat[4], 10);
      const minutes = parseInt(ringbaFormat[5], 10);
      const seconds = parseInt(ringbaFormat[6], 10);
      const ampm = ringbaFormat[7].toUpperCase();
      
      if (ampm === 'PM' && hours !== 12) {
        hours += 12;
      } else if (ampm === 'AM' && hours === 12) {
        hours = 0;
      }
      
      return new Date(year, month, day, hours, minutes, seconds);
    }
    
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      const hours = parseInt(isoMatch[4], 10);
      const minutes = parseInt(isoMatch[5], 10);
      const seconds = parseInt(isoMatch[6], 10);
      return new Date(year, month, day, hours, minutes, seconds);
    }
    
    const yyyymmdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      const year = parseInt(yyyymmdd[1], 10);
      const month = parseInt(yyyymmdd[2], 10) - 1;
      const day = parseInt(yyyymmdd[3], 10);
      return new Date(year, month, day);
    }
    
    const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) {
      const month = parseInt(mmddyyyy[1], 10) - 1;
      const day = parseInt(mmddyyyy[2], 10);
      const year = parseInt(mmddyyyy[3], 10);
      return new Date(year, month, day);
    }
  } catch (error) {
    // Ignore parsing errors
  }
  return null;
};

const timeDiffMinutes = (date1, date2) => {
  if (!date1 || !date2) return Infinity;
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
};

dotenv.config();

const { Pool } = pg;

// Replicate the matchCall function exactly as in the service
const matchCall = (ringbaCall, elocalCall, windowMinutes = 120, payoutTolerance = 0.01) => {
  const elocalDate = parseDate(elocalCall.date_of_call);
  const ringbaDate = parseDate(ringbaCall.callDt);
  
  console.log(`\n  [matchCall] Parsing dates:`);
  console.log(`    eLocal date string: "${elocalCall.date_of_call}"`);
  console.log(`    Parsed eLocal date: ${elocalDate ? elocalDate.toISOString() : 'NULL'}`);
  console.log(`    Ringba date string: "${ringbaCall.callDt}"`);
  console.log(`    Parsed Ringba date: ${ringbaDate ? ringbaDate.toISOString() : 'NULL'}`);
  
  if (!elocalDate || !ringbaDate) {
    if (!elocalDate) {
      console.log(`  [matchCall] ❌ Failed to parse eLocal date: ${elocalCall.date_of_call}`);
    }
    if (!ringbaDate) {
      console.log(`  [matchCall] ❌ Failed to parse Ringba date: ${ringbaCall.callDt}`);
    }
    return null;
  }
  
  // Check if dates are on the same day or adjacent days
  const elocalDateStr = elocalDate.toISOString().split('T')[0];
  const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
  const elocalDateOnly = new Date(elocalDateStr);
  const ringbaDateOnly = new Date(ringbaDateStr);
  const daysDiff = Math.abs((elocalDateOnly.getTime() - ringbaDateOnly.getTime()) / (1000 * 60 * 60 * 24));
  
  console.log(`  [matchCall] Date proximity check:`);
  console.log(`    eLocal date part: ${elocalDateStr}`);
  console.log(`    Ringba date part: ${ringbaDateStr}`);
  console.log(`    Days difference: ${daysDiff.toFixed(2)}`);
  
  if (daysDiff > 1) {
    console.log(`  [matchCall] ❌ Dates are more than 1 day apart (${daysDiff.toFixed(2)} days)`);
    return null;
  }
  
  // Calculate time difference in minutes, but only using hour and minutes (ignore seconds)
  const elocalTimeOnly = new Date(elocalDate);
  elocalTimeOnly.setSeconds(0, 0);
  const ringbaTimeOnly = new Date(ringbaDate);
  ringbaTimeOnly.setSeconds(0, 0);
  
  const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
  const effectiveWindow = daysDiff === 0 ? windowMinutes : (24 * 60);
  
  console.log(`  [matchCall] Time difference check:`);
  console.log(`    eLocal time (seconds=0): ${elocalTimeOnly.toISOString()}`);
  console.log(`    Ringba time (seconds=0): ${ringbaTimeOnly.toISOString()}`);
  console.log(`    Time difference: ${timeDiff.toFixed(1)} minutes`);
  console.log(`    Effective window: ${effectiveWindow} minutes (same day: ${daysDiff === 0 ? 'YES' : 'NO'})`);
  
  if (timeDiff > effectiveWindow) {
    console.log(`  [matchCall] ❌ Time difference (${timeDiff.toFixed(1)} min) exceeds window (${effectiveWindow} min)`);
    return null;
  }
  
  // Match payout
  const elocalPayout = Number(elocalCall.payout || 0);
  const ringbaPayout = Number(ringbaCall.payout || 0);
  const payoutDiff = Math.abs(elocalPayout - ringbaPayout);
  
  console.log(`  [matchCall] Payout check:`);
  console.log(`    eLocal payout: $${elocalPayout.toFixed(2)}`);
  console.log(`    Ringba payout: $${ringbaPayout.toFixed(2)}`);
  console.log(`    Payout difference: $${payoutDiff.toFixed(2)}`);
  console.log(`    Tolerance: $${payoutTolerance.toFixed(2)}`);
  
  // Calculate match score
  let matchScore = timeDiff;
  
  if (elocalPayout > 0 && ringbaPayout > 0) {
    if (payoutDiff <= payoutTolerance) {
      matchScore = timeDiff * 0.1;
      console.log(`    ✅ Exact payout match! Score: ${matchScore.toFixed(2)} (timeDiff × 0.1)`);
    } else {
      matchScore = timeDiff + (payoutDiff * 10);
      console.log(`    ⚠️  Payout mismatch. Score: ${matchScore.toFixed(2)} (timeDiff + payoutDiff × 10)`);
    }
  } else {
    console.log(`    ℹ️  One or both payouts are 0. Score: ${matchScore.toFixed(2)} (timeDiff only)`);
  }
  
  console.log(`  [matchCall] ✅ MATCH FOUND! Score: ${matchScore.toFixed(2)}`);
  
  return {
    elocalCall,
    ringbaCall,
    matchScore,
    timeDiff,
    payoutDiff,
    payoutMatch: payoutDiff <= payoutTolerance
  };
};

async function debugMatch(pool, ringbaCallId, elocalCallId) {
  const client = await pool.connect();
  try {
    console.log('\n' + '='.repeat(80));
    console.log(`DEBUGGING MATCH: Ringba ${ringbaCallId} ↔ eLocal ${elocalCallId}`);
    console.log('='.repeat(80));
    
    // Fetch Ringba call
    const ringbaQuery = `
      SELECT 
        inbound_call_id, call_date_time, caller_id, caller_id_e164,
        payout_amount, revenue_amount, target_id
      FROM ringba_calls
      WHERE inbound_call_id = $1
    `;
    const ringbaResult = await client.query(ringbaQuery, [ringbaCallId]);
    
    if (ringbaResult.rows.length === 0) {
      console.log(`❌ Ringba call not found: ${ringbaCallId}`);
      return;
    }
    
    const ringbaCall = ringbaResult.rows[0];
    console.log(`\n📞 Ringba Call Details:`);
    console.log(`   ID: ${ringbaCall.inbound_call_id}`);
    console.log(`   Date/Time: ${ringbaCall.call_date_time}`);
    console.log(`   Caller ID: ${ringbaCall.caller_id}`);
    console.log(`   Caller ID E.164: ${ringbaCall.caller_id_e164}`);
    console.log(`   Payout: $${ringbaCall.payout_amount}`);
    console.log(`   Revenue: $${ringbaCall.revenue_amount}`);
    console.log(`   Target ID: ${ringbaCall.target_id}`);
    
    const ringbaCategory = getCategoryFromTargetId(ringbaCall.target_id);
    console.log(`   Category: ${ringbaCategory}`);
    
    // Fetch eLocal call
    const elocalQuery = `
      SELECT 
        id, caller_id, date_of_call, payout, category,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE id = $1
    `;
    const elocalResult = await client.query(elocalQuery, [elocalCallId]);
    
    if (elocalResult.rows.length === 0) {
      console.log(`❌ eLocal call not found: ${elocalCallId}`);
      return;
    }
    
    const elocalCall = elocalResult.rows[0];
    console.log(`\n📞 eLocal Call Details:`);
    console.log(`   ID: ${elocalCall.id}`);
    console.log(`   Date/Time: ${elocalCall.date_of_call}`);
    console.log(`   Caller ID: ${elocalCall.caller_id}`);
    console.log(`   Payout: $${elocalCall.payout}`);
    console.log(`   Category: ${elocalCall.category}`);
    console.log(`   Original Payout: ${elocalCall.original_payout || 'NULL'}`);
    console.log(`   Original Revenue: ${elocalCall.original_revenue || 'NULL'}`);
    console.log(`   Ringba Inbound Call ID: ${elocalCall.ringba_inbound_call_id || 'NULL'}`);
    
    // Step 1: Check category match
    console.log(`\n🔍 Step 1: Category Match Check`);
    console.log(`   Ringba Category: ${ringbaCategory}`);
    console.log(`   eLocal Category: ${elocalCall.category}`);
    if (ringbaCategory !== elocalCall.category) {
      console.log(`   ❌ Categories don't match!`);
      return;
    }
    console.log(`   ✅ Categories match!`);
    
    // Step 2: Check caller ID match
    console.log(`\n🔍 Step 2: Caller ID Match Check`);
    const ringbaCallerE164 = ringbaCall.caller_id_e164 || toE164(ringbaCall.caller_id);
    const elocalCallerE164 = toE164(elocalCall.caller_id);
    console.log(`   Ringba Caller E.164: ${ringbaCallerE164}`);
    console.log(`   eLocal Caller E.164: ${elocalCallerE164}`);
    if (ringbaCallerE164 !== elocalCallerE164) {
      console.log(`   ❌ Caller IDs don't match!`);
      return;
    }
    console.log(`   ✅ Caller IDs match!`);
    
    // Step 3: Check if already matched
    console.log(`\n🔍 Step 3: Already Matched Check`);
    if (elocalCall.ringba_inbound_call_id && elocalCall.ringba_inbound_call_id !== ringbaCallId) {
      console.log(`   ⚠️  eLocal call is already matched to: ${elocalCall.ringba_inbound_call_id}`);
      console.log(`   This would prevent matching in the service (matchedElocalIds check)`);
    } else if (elocalCall.ringba_inbound_call_id === ringbaCallId) {
      console.log(`   ✅ Already matched to this Ringba call!`);
    } else {
      console.log(`   ✅ Not yet matched (available for matching)`);
    }
    
    // Step 4: Check if original_payout/revenue already filled
    console.log(`\n🔍 Step 4: Original Payout/Revenue Check`);
    const existingOriginalPayout = Number(elocalCall.original_payout || 0);
    const existingOriginalRevenue = Number(elocalCall.original_revenue || 0);
    console.log(`   Existing Original Payout: $${existingOriginalPayout.toFixed(2)}`);
    console.log(`   Existing Original Revenue: $${existingOriginalRevenue.toFixed(2)}`);
    if (existingOriginalPayout !== 0 || existingOriginalRevenue !== 0) {
      console.log(`   ⚠️  Original payout/revenue already filled - update would be SKIPPED in service`);
      console.log(`   This preserves existing data (preservation logic)`);
    } else {
      console.log(`   ✅ Original payout/revenue is NULL or 0 - update would be ALLOWED`);
    }
    
    // Step 5: Run matchCall function
    console.log(`\n🔍 Step 5: Time & Payout Match Check (matchCall function)`);
    const ringbaCallObj = {
      inboundCallId: ringbaCall.inbound_call_id,
      callDt: ringbaCall.call_date_time,
      callerId: ringbaCall.caller_id,
      callerIdE164: ringbaCall.caller_id_e164,
      payout: ringbaCall.payout_amount,
      revenue: ringbaCall.revenue_amount,
      targetId: ringbaCall.target_id
    };
    
    const match = matchCall(ringbaCallObj, elocalCall);
    
    if (match) {
      console.log(`\n✅ FINAL RESULT: MATCH WOULD BE FOUND!`);
      console.log(`   Match Score: ${match.matchScore.toFixed(2)}`);
      console.log(`   Time Diff: ${match.timeDiff.toFixed(1)} minutes`);
      console.log(`   Payout Match: ${match.payoutMatch ? 'YES' : 'NO'}`);
    } else {
      console.log(`\n❌ FINAL RESULT: NO MATCH (matchCall returned null)`);
    }
    
    // Summary
    console.log(`\n` + '='.repeat(80));
    console.log(`SUMMARY OF MATCHING ISSUES:`);
    console.log('='.repeat(80));
    
    const issues = [];
    if (ringbaCategory !== elocalCall.category) {
      issues.push('❌ Category mismatch');
    }
    if (ringbaCallerE164 !== elocalCallerE164) {
      issues.push('❌ Caller ID mismatch');
    }
    if (elocalCall.ringba_inbound_call_id && elocalCall.ringba_inbound_call_id !== ringbaCallId) {
      issues.push('⚠️  Already matched to different Ringba call');
    }
    if (existingOriginalPayout !== 0 || existingOriginalRevenue !== 0) {
      issues.push('⚠️  Original payout/revenue already filled (would be skipped)');
    }
    if (!match) {
      issues.push('❌ matchCall() returned null (time/payout mismatch)');
    }
    
    if (issues.length === 0) {
      console.log(`✅ No issues found - match should work!`);
    } else {
      issues.forEach(issue => console.log(`   ${issue}`));
    }
    
  } finally {
    client.release();
  }
}

// Run debug for both cases
(async () => {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
    database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
    user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
  
  try {
    console.log('\n' + '='.repeat(80));
    console.log('CASE 1: Ringba RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01 ↔ eLocal 799');
    console.log('='.repeat(80));
    await debugMatch(pool, 'RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01', 799);
    
    console.log('\n\n' + '='.repeat(80));
    console.log('CASE 2: Ringba RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01 ↔ eLocal 828');
    console.log('='.repeat(80));
    await debugMatch(pool, 'RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01', 828);
  } finally {
    await pool.end();
  }
})();

