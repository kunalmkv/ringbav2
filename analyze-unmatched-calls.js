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

async function analyzeUnmatched() {
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
    
    // Get all eLocal calls
    const elocalQuery = `
      SELECT 
        id, caller_id, date_of_call, category, payout,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE SUBSTRING(date_of_call, 1, 10) = $1
      ORDER BY date_of_call
    `;
    const elocalCalls = await client.query(elocalQuery, [date]);
    
    // Get matched eLocal calls (those with ringba_inbound_call_id)
    const matchedElocalIds = new Set(
      elocalCalls.rows
        .filter(c => c.ringba_inbound_call_id)
        .map(c => c.ringba_inbound_call_id)
    );
    
    console.log('='.repeat(80));
    console.log('COMPLETE UNMATCHED RINGBA CALLS ANALYSIS');
    console.log('='.repeat(80));
    console.log(`Date: ${date}`);
    console.log(`Total Ringba Calls: ${ringbaCalls.rows.length}`);
    console.log(`Total eLocal Calls: ${elocalCalls.rows.length}`);
    console.log(`Matched Ringba Calls: ${matchedElocalIds.size}`);
    console.log(`Unmatched Ringba Calls: ${ringbaCalls.rows.length - matchedElocalIds.size}`);
    console.log('='.repeat(80));
    console.log('');
    
    // Find unmatched Ringba calls
    const unmatchedRingba = ringbaCalls.rows.filter(rc => !matchedElocalIds.has(rc.inbound_call_id));
    
    console.log(`\nUNMATCHED RINGBA CALLS (${unmatchedRingba.length}):\n`);
    
    for (let i = 0; i < unmatchedRingba.length; i++) {
      const ringbaCall = unmatchedRingba[i];
      const ringbaCategory = getCategoryFromTargetId(ringbaCall.target_id);
      const callerE164 = ringbaCall.caller_id_e164 || toE164(ringbaCall.caller_id);
      
      console.log(`${'='.repeat(80)}`);
      console.log(`[${i + 1}] Ringba Call: ${ringbaCall.inbound_call_id}`);
      console.log(`    Date/Time: ${ringbaCall.call_date_time}`);
      console.log(`    Category: ${ringbaCategory} (Target: ${ringbaCall.target_id})`);
      console.log(`    Caller ID: ${ringbaCall.caller_id} → E.164: ${callerE164}`);
      console.log(`    Payout: $${ringbaCall.payout_amount}, Revenue: $${ringbaCall.revenue_amount}`);
      
      // Find potential eLocal matches
      const sameCallerElocal = elocalCalls.rows.filter(elocal => {
        const elocalE164 = toE164(elocal.caller_id);
        return elocalE164 === callerE164 && elocal.category === ringbaCategory;
      });
      
      if (sameCallerElocal.length > 0) {
        console.log(`    ⚠️  Found ${sameCallerElocal.length} eLocal call(s) with same caller ID and category:`);
        
        const ringbaTime = new Date(ringbaCall.call_date_time);
        ringbaTime.setSeconds(0, 0);
        
        for (const elocalCall of sameCallerElocal) {
          const elocalTime = new Date(elocalCall.date_of_call);
          elocalTime.setSeconds(0, 0);
          const timeDiff = Math.abs(elocalTime.getTime() - ringbaTime.getTime()) / (1000 * 60);
          
          const hasOriginal = elocalCall.original_payout && parseFloat(elocalCall.original_payout) > 0;
          const isMatched = elocalCall.ringba_inbound_call_id !== null;
          const matchStatus = isMatched 
            ? `MATCHED to ${elocalCall.ringba_inbound_call_id}`
            : hasOriginal 
              ? `HAS ORIGINAL ($${elocalCall.original_payout})`
              : 'AVAILABLE';
          
          console.log(`       - eLocal ID ${elocalCall.id}: ${elocalCall.date_of_call}, Time Diff: ${timeDiff.toFixed(1)} min, Status: ${matchStatus}`);
          
          if (timeDiff <= 120 && !isMatched && !hasOriginal) {
            console.log(`         ✅ SHOULD MATCH! (Time: ${timeDiff.toFixed(1)} min <= 120 min, Available)`);
          } else if (timeDiff > 120) {
            console.log(`         ❌ Time difference too large: ${timeDiff.toFixed(1)} min > 120 min`);
          } else if (isMatched) {
            console.log(`         ❌ Already matched to another Ringba call`);
          } else if (hasOriginal) {
            console.log(`         ❌ Already has original_payout (preserved from previous match)`);
          }
        }
      } else {
        console.log(`    ❌ No eLocal calls found with matching caller ID and category`);
        
        // Check if there are eLocal calls with same caller ID but different category
        const sameCallerDiffCategory = elocalCalls.rows.filter(elocal => {
          const elocalE164 = toE164(elocal.caller_id);
          return elocalE164 === callerE164 && elocal.category !== ringbaCategory;
        });
        
        if (sameCallerDiffCategory.length > 0) {
          console.log(`    ⚠️  Found ${sameCallerDiffCategory.length} eLocal call(s) with same caller ID but different category:`);
          sameCallerDiffCategory.forEach(elocal => {
            console.log(`       - eLocal ID ${elocalCall.id}: Category ${elocal.category} (expected ${ringbaCategory})`);
          });
        }
        
        // Check if there are eLocal calls with same category but different caller ID
        const sameCategoryDiffCaller = elocalCalls.rows.filter(elocal => {
          return elocal.category === ringbaCategory;
        });
        
        if (sameCategoryDiffCaller.length > 0) {
          console.log(`    ℹ️  Found ${sameCategoryDiffCaller.length} eLocal call(s) with same category but different caller IDs`);
        }
      }
      
      console.log('');
    }
    
    // Summary statistics
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY STATISTICS');
    console.log('='.repeat(80));
    
    const unmatchedByCategory = {};
    unmatchedRingba.forEach(rc => {
      const cat = getCategoryFromTargetId(rc.target_id) || 'UNKNOWN';
      unmatchedByCategory[cat] = (unmatchedByCategory[cat] || 0) + 1;
    });
    
    console.log('\nUnmatched by Category:');
    Object.entries(unmatchedByCategory).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count} calls`);
    });
    
    const unmatchedWithPotentialMatches = unmatchedRingba.filter(rc => {
      const callerE164 = rc.caller_id_e164 || toE164(rc.caller_id);
      const category = getCategoryFromTargetId(rc.target_id);
      const sameCallerElocal = elocalCalls.rows.filter(elocal => {
        const elocalE164 = toE164(elocal.caller_id);
        return elocalE164 === callerE164 && elocal.category === category;
      });
      return sameCallerElocal.length > 0;
    });
    
    console.log(`\nUnmatched with potential eLocal matches: ${unmatchedWithPotentialMatches.length}`);
    console.log(`Unmatched with no eLocal matches: ${unmatchedRingba.length - unmatchedWithPotentialMatches.length}`);
    
  } finally {
    client.release();
    await pool.end();
  }
}

analyzeUnmatched().catch(console.error);

