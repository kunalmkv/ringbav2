#!/usr/bin/env node

/**
 * Detailed row-by-row analysis of Ringba vs eLocal data matching
 * This script analyzes each Ringba call and attempts to match it with eLocal calls
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getCategoryFromTargetId } from './src/http/ringba-target-calls.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const { Pool } = pg;

// Helper functions
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
  } catch (error) {
    // Ignore parsing errors
  }
  return null;
};

const timeDiffMinutes = (date1, date2) => {
  if (!date1 || !date2) return Infinity;
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
};

async function analyzeRowByRow() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
    database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
    user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });

  const client = await pool.connect();
  try {
    const date = '2025-12-02';
    
    console.log('='.repeat(120));
    console.log('ROW-BY-ROW ANALYSIS: Ringba Calls vs eLocal Calls');
    console.log('='.repeat(120));
    console.log(`Date: ${date}\n`);
    
    // Fetch all Ringba calls
    const ringbaQuery = `
      SELECT 
        inbound_call_id, call_date_time, caller_id, caller_id_e164,
        payout_amount, revenue_amount, target_id
      FROM ringba_calls
      WHERE SUBSTRING(call_date_time, 1, 10) = $1
      ORDER BY call_date_time
    `;
    const ringbaResult = await client.query(ringbaQuery, [date]);
    const ringbaCalls = ringbaResult.rows;
    
    // Fetch all eLocal calls
    const elocalQuery = `
      SELECT 
        id, caller_id, date_of_call, payout, category,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE SUBSTRING(date_of_call, 1, 10) = $1
      ORDER BY date_of_call
    `;
    const elocalResult = await client.query(elocalQuery, [date]);
    const elocalCalls = elocalResult.rows;
    
    console.log(`Total Ringba Calls: ${ringbaCalls.length}`);
    console.log(`Total eLocal Calls: ${elocalCalls.length}\n`);
    
    // Index eLocal calls by category and caller ID for faster lookup
    const elocalByCategoryAndCaller = new Map();
    for (const elocalCall of elocalCalls) {
      const category = elocalCall.category || 'STATIC';
      const callerE164 = toE164(elocalCall.caller_id);
      
      if (!callerE164) continue;
      
      if (!elocalByCategoryAndCaller.has(category)) {
        elocalByCategoryAndCaller.set(category, new Map());
      }
      
      const callsByCaller = elocalByCategoryAndCaller.get(category);
      if (!callsByCaller.has(callerE164)) {
        callsByCaller.set(callerE164, []);
      }
      callsByCaller.get(callerE164).push(elocalCall);
    }
    
    // Track matched eLocal calls
    const matchedElocalIds = new Set();
    
    // Analyze each Ringba call
    let matchCount = 0;
    let noMatchCount = 0;
    
    for (let i = 0; i < ringbaCalls.length; i++) {
      const ringbaCall = ringbaCalls[i];
      const ringbaCategory = getCategoryFromTargetId(ringbaCall.target_id);
      const ringbaCallerE164 = ringbaCall.caller_id_e164 || toE164(ringbaCall.caller_id);
      
      console.log('\n' + '='.repeat(120));
      console.log(`[${i + 1}/${ringbaCalls.length}] RINGBA CALL ANALYSIS`);
      console.log('='.repeat(120));
      console.log(`Inbound Call ID: ${ringbaCall.inbound_call_id}`);
      console.log(`Date/Time:       ${ringbaCall.call_date_time}`);
      console.log(`Caller ID:       ${ringbaCall.caller_id} → E.164: ${ringbaCallerE164}`);
      console.log(`Category:        ${ringbaCategory} (Target: ${ringbaCall.target_id})`);
      console.log(`Payout:          $${parseFloat(ringbaCall.payout_amount || 0).toFixed(2)}`);
      console.log(`Revenue:         $${parseFloat(ringbaCall.revenue_amount || 0).toFixed(2)}`);
      
      // Step 1: Check category
      if (!ringbaCategory) {
        console.log(`\n❌ NO MATCH: Invalid or unknown target ID`);
        noMatchCount++;
        continue;
      }
      
      // Step 2: Check caller ID
      if (!ringbaCallerE164) {
        console.log(`\n❌ NO MATCH: Invalid caller ID`);
        noMatchCount++;
        continue;
      }
      
      // Step 3: Find eLocal calls with same category and caller ID
      const categoryCalls = elocalByCategoryAndCaller.get(ringbaCategory);
      if (!categoryCalls) {
        console.log(`\n❌ NO MATCH: No eLocal calls found for category: ${ringbaCategory}`);
        noMatchCount++;
        continue;
      }
      
      const candidateElocalCalls = categoryCalls.get(ringbaCallerE164) || [];
      if (candidateElocalCalls.length === 0) {
        console.log(`\n❌ NO MATCH: No eLocal calls found for category ${ringbaCategory} and caller ${ringbaCallerE164}`);
        noMatchCount++;
        continue;
      }
      
      console.log(`\n✅ Found ${candidateElocalCalls.length} candidate eLocal call(s) with matching category and caller ID:`);
      
      // Step 4: Try to match by time
      const ringbaDate = parseDate(ringbaCall.call_date_time);
      if (!ringbaDate) {
        console.log(`\n❌ NO MATCH: Could not parse Ringba date: ${ringbaCall.call_date_time}`);
        noMatchCount++;
        continue;
      }
      
      // Normalize time (ignore seconds)
      const ringbaTimeOnly = new Date(ringbaDate);
      ringbaTimeOnly.setSeconds(0, 0);
      
      let bestMatch = null;
      let bestScore = Infinity;
      let bestTimeDiff = Infinity;
      
      console.log(`\n  Analyzing time matches (Ringba time: ${ringbaCall.call_date_time}):`);
      
      for (const elocalCall of candidateElocalCalls) {
        const isAlreadyMatched = matchedElocalIds.has(elocalCall.id);
        const elocalDate = parseDate(elocalCall.date_of_call);
        
        if (!elocalDate) {
          console.log(`    - eLocal ID ${elocalCall.id}: ❌ Could not parse date: ${elocalCall.date_of_call}`);
          continue;
        }
        
        // Normalize time (ignore seconds)
        const elocalTimeOnly = new Date(elocalDate);
        elocalTimeOnly.setSeconds(0, 0);
        
        // Check date proximity
        const elocalDateStr = elocalDate.toISOString().split('T')[0];
        const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
        const elocalDateOnly = new Date(elocalDateStr);
        const ringbaDateOnly = new Date(ringbaDateStr);
        const daysDiff = Math.abs((elocalDateOnly.getTime() - ringbaDateOnly.getTime()) / (1000 * 60 * 60 * 24));
        
        const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
        const effectiveWindow = daysDiff === 0 ? 120 : (24 * 60);
        
        // Check payout
        const elocalPayout = Number(elocalCall.payout || 0);
        const ringbaPayout = Number(ringbaCall.payout_amount || 0);
        const payoutDiff = Math.abs(elocalPayout - ringbaPayout);
        const payoutTolerance = 0.01;
        
        // Calculate match score
        let matchScore = timeDiff;
        if (elocalPayout > 0 && ringbaPayout > 0) {
          if (payoutDiff <= payoutTolerance) {
            matchScore = timeDiff * 0.1;
          } else {
            matchScore = timeDiff + (payoutDiff * 10);
          }
        }
        
        const status = isAlreadyMatched ? '⚠️  ALREADY MATCHED' : 
                      daysDiff > 1 ? '❌ Days diff > 1' :
                      timeDiff > effectiveWindow ? '❌ Time diff too large' :
                      '✅ MATCH';
        
        console.log(`    - eLocal ID ${elocalCall.id}:`);
        console.log(`        Date/Time:     ${elocalCall.date_of_call}`);
        console.log(`        Payout:        $${elocalPayout.toFixed(2)}`);
        console.log(`        Original:      $${Number(elocalCall.original_payout || 0).toFixed(2)} / $${Number(elocalCall.original_revenue || 0).toFixed(2)}`);
        console.log(`        Matched to:    ${elocalCall.ringba_inbound_call_id || 'NONE'}`);
        console.log(`        Days Diff:     ${daysDiff.toFixed(2)}`);
        console.log(`        Time Diff:     ${timeDiff.toFixed(1)} min (window: ${effectiveWindow} min)`);
        console.log(`        Payout Diff:   $${payoutDiff.toFixed(2)}`);
        console.log(`        Match Score:   ${matchScore.toFixed(2)}`);
        console.log(`        Status:        ${status}`);
        
        if (!isAlreadyMatched && daysDiff <= 1 && timeDiff <= effectiveWindow) {
          if (matchScore < bestScore) {
            bestMatch = elocalCall;
            bestScore = matchScore;
            bestTimeDiff = timeDiff;
          }
        }
      }
      
      if (bestMatch) {
        console.log(`\n✅ BEST MATCH FOUND: eLocal Call ID ${bestMatch.id}`);
        console.log(`   Time Difference: ${bestTimeDiff.toFixed(1)} minutes`);
        console.log(`   Match Score: ${bestScore.toFixed(2)}`);
        
        // Check if already has original_payout/revenue
        const existingOriginalPayout = Number(bestMatch.original_payout || 0);
        const existingOriginalRevenue = Number(bestMatch.original_revenue || 0);
        
        if (existingOriginalPayout !== 0 || existingOriginalRevenue !== 0) {
          console.log(`   ⚠️  SKIPPED: Already has original_payout/revenue (preserved)`);
        } else {
          console.log(`   ✅ WOULD UPDATE: original_payout/revenue`);
        }
        
        matchedElocalIds.add(bestMatch.id);
        matchCount++;
      } else {
        console.log(`\n❌ NO MATCH: No valid time match found`);
        noMatchCount++;
      }
    }
    
    // Summary
    console.log('\n\n' + '='.repeat(120));
    console.log('ANALYSIS SUMMARY');
    console.log('='.repeat(120));
    console.log(`Total Ringba Calls:     ${ringbaCalls.length}`);
    console.log(`Total eLocal Calls:     ${elocalCalls.length}`);
    console.log(`Matches Found:          ${matchCount}`);
    console.log(`No Match:               ${noMatchCount}`);
    console.log(`Match Rate:             ${((matchCount / ringbaCalls.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(120));
    
  } finally {
    client.release();
    await pool.end();
  }
}

analyzeRowByRow().catch(console.error);


