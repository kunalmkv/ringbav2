#!/usr/bin/env node

/**
 * Debug script to analyze why Ringba calls are unmatched during the matching process
 * This simulates the exact matching logic from ringba-original-sync.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getCategoryFromTargetId } from './src/http/ringba-target-calls.js';
import { convertRingbaDateToEST } from './src/utils/date-normalizer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const { Pool } = pg;

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

// Exact matchCall function from ringba-original-sync.js
const matchCall = (ringbaCall, elocalCall, windowMinutes = 120, payoutTolerance = 0.01) => {
  const elocalDate = parseDate(elocalCall.date_of_call);
  const ringbaDate = parseDate(ringbaCall.callDt);
  
  if (!elocalDate || !ringbaDate) {
    return null;
  }
  
  // Check if dates are on the same day or adjacent days
  const elocalDateStr = elocalDate.toISOString().split('T')[0];
  const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
  const elocalDateOnly = new Date(elocalDateStr);
  const ringbaDateOnly = new Date(ringbaDateStr);
  const daysDiff = Math.abs((elocalDateOnly.getTime() - ringbaDateOnly.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff > 1) {
    return null;
  }
  
  // Calculate time difference in minutes, but only using hour and minutes (ignore seconds)
  const elocalTimeOnly = new Date(elocalDate);
  elocalTimeOnly.setSeconds(0, 0);
  const ringbaTimeOnly = new Date(ringbaDate);
  ringbaTimeOnly.setSeconds(0, 0);
  
  const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
  const effectiveWindow = daysDiff === 0 ? windowMinutes : (24 * 60);
  
  if (timeDiff > effectiveWindow) {
    return null;
  }
  
  // Match payout
  const elocalPayout = Number(elocalCall.payout || 0);
  const ringbaPayout = Number(ringbaCall.payout || 0);
  const payoutDiff = Math.abs(elocalPayout - ringbaPayout);
  
  // Calculate match score
  let matchScore = timeDiff;
  
  if (elocalPayout > 0 && ringbaPayout > 0) {
    if (payoutDiff <= payoutTolerance) {
      matchScore = timeDiff * 0.1;
    } else {
      matchScore = timeDiff + (payoutDiff * 10);
    }
  }
  
  return {
    elocalCall,
    ringbaCall,
    matchScore,
    timeDiff,
    payoutDiff,
    payoutMatch: payoutDiff <= payoutTolerance
  };
};

// Simulate the exact matching logic from matchAndPrepareUpdates
async function analyzeUnmatchedMatchingLogic() {
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
    
    console.log('='.repeat(100));
    console.log('ANALYZING UNMATCHED RINGBA CALLS - SIMULATING EXACT MATCHING LOGIC');
    console.log('='.repeat(100));
    console.log(`Date: ${date}\n`);
    
    // Get all Ringba calls (as they would be fetched from API)
    const ringbaQuery = `
      SELECT 
        inbound_call_id, call_date_time, caller_id, caller_id_e164,
        payout_amount, revenue_amount, target_id
      FROM ringba_calls
      WHERE SUBSTRING(call_date_time, 1, 10) = $1
      ORDER BY call_date_time
    `;
    const ringbaResult = await client.query(ringbaQuery, [date]);
    
    // Get all eLocal calls (as they would be fetched for matching)
    const elocalQuery = `
      SELECT 
        id, caller_id, date_of_call, payout, category,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE SUBSTRING(date_of_call, 1, 10) = $1
      ORDER BY caller_id, date_of_call
    `;
    const elocalResult = await client.query(elocalQuery, [date]);
    
    // Transform Ringba calls to match the format used in the service
    const ringbaCalls = ringbaResult.rows.map(row => ({
      inboundCallId: row.inbound_call_id,
      callDt: row.call_date_time,
      callerId: row.caller_id,
      callerIdE164: row.caller_id_e164,
      payout: parseFloat(row.payout_amount || 0),
      revenue: parseFloat(row.revenue_amount || 0),
      targetId: row.target_id
    }));
    
    const elocalCalls = elocalResult.rows;
    
    console.log(`Total Ringba Calls: ${ringbaCalls.length}`);
    console.log(`Total eLocal Calls: ${elocalCalls.length}\n`);
    
    // Simulate the exact matching logic
    const updates = [];
    const unmatched = [];
    const skipped = [];
    
    // Group eLocal calls by category first, then by normalized caller ID
    const elocalCallsByCategoryAndCaller = new Map();
    for (const elocalCall of elocalCalls) {
      const category = elocalCall.category || 'STATIC';
      const callerE164 = toE164(elocalCall.caller_id);
      
      if (!callerE164) {
        continue;
      }
      
      if (!elocalCallsByCategoryAndCaller.has(category)) {
        elocalCallsByCategoryAndCaller.set(category, new Map());
      }
      
      const callsByCaller = elocalCallsByCategoryAndCaller.get(category);
      if (!callsByCaller.has(callerE164)) {
        callsByCaller.set(callerE164, []);
      }
      callsByCaller.get(callerE164).push(elocalCall);
    }
    
    // Track which eLocal calls have been matched
    const matchedElocalIds = new Set();
    
    // Match each Ringba call (exact logic from matchAndPrepareUpdates)
    for (const ringbaCall of ringbaCalls) {
      // Step 1: Match by target ID (category)
      const ringbaCategory = getCategoryFromTargetId(ringbaCall.targetId);
      if (!ringbaCategory) {
        unmatched.push({ ringbaCall, reason: `Invalid or unknown target ID: ${ringbaCall.targetId}` });
        continue;
      }
      
      // Step 2: Match by caller ID
      const callerE164 = ringbaCall.callerIdE164 || toE164(ringbaCall.callerId);
      if (!callerE164) {
        unmatched.push({ ringbaCall, reason: 'Invalid caller ID' });
        continue;
      }
      
      // Get eLocal calls for this category and caller ID
      const categoryCalls = elocalCallsByCategoryAndCaller.get(ringbaCategory);
      if (!categoryCalls) {
        unmatched.push({ ringbaCall, reason: `No eLocal calls found for category: ${ringbaCategory}` });
        continue;
      }
      
      const candidateElocalCalls = categoryCalls.get(callerE164) || [];
      
      if (candidateElocalCalls.length === 0) {
        unmatched.push({ ringbaCall, reason: `No matching eLocal call found for category ${ringbaCategory} and caller ${callerE164}` });
        continue;
      }
      
      // Step 3: Find best match by time
      let bestMatch = null;
      let bestScore = Infinity;
      
      for (const elocalCall of candidateElocalCalls) {
        if (matchedElocalIds.has(elocalCall.id)) {
          continue; // Already matched
        }
        
        const match = matchCall(ringbaCall, elocalCall);
        if (match && match.matchScore < bestScore) {
          bestMatch = match;
          bestScore = match.matchScore;
        }
      }
      
      if (!bestMatch) {
        // Detailed analysis of why no match
        const availableCandidates = candidateElocalCalls.filter(c => !matchedElocalIds.has(c.id));
        if (availableCandidates.length === 0) {
          unmatched.push({ ringbaCall, reason: 'All candidates already matched' });
        } else {
          // Check why each candidate failed
          const failedReasons = [];
          for (const candidate of availableCandidates) {
            const match = matchCall(ringbaCall, candidate);
            if (!match) {
              const elocalDate = parseDate(candidate.date_of_call);
              const ringbaDate = parseDate(ringbaCall.callDt);
              if (!elocalDate || !ringbaDate) {
                failedReasons.push(`eLocal ${candidate.id}: Date parsing failed`);
              } else {
                const elocalTimeOnly = new Date(elocalDate);
                elocalTimeOnly.setSeconds(0, 0);
                const ringbaTimeOnly = new Date(ringbaDate);
                ringbaTimeOnly.setSeconds(0, 0);
                const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
                const elocalDateStr = elocalDate.toISOString().split('T')[0];
                const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
                const daysDiff = Math.abs((new Date(elocalDateStr).getTime() - new Date(ringbaDateStr).getTime()) / (1000 * 60 * 60 * 24));
                const effectiveWindow = daysDiff === 0 ? 120 : (24 * 60);
                
                if (daysDiff > 1) {
                  failedReasons.push(`eLocal ${candidate.id}: Days diff ${daysDiff.toFixed(2)} > 1`);
                } else if (timeDiff > effectiveWindow) {
                  failedReasons.push(`eLocal ${candidate.id}: Time diff ${timeDiff.toFixed(1)} min > ${effectiveWindow} min`);
                }
              }
            }
          }
          unmatched.push({ 
            ringbaCall, 
            reason: `Time/payout mismatch. Available candidates: ${availableCandidates.length}. Details: ${failedReasons.join('; ')}` 
          });
        }
        continue;
      }
      
      matchedElocalIds.add(bestMatch.elocalCall.id);
      
      // Check if original_payout or original_revenue already exist
      const existingOriginalPayout = Number(bestMatch.elocalCall.original_payout || 0);
      const existingOriginalRevenue = Number(bestMatch.elocalCall.original_revenue || 0);
      
      if (existingOriginalPayout !== 0 || existingOriginalRevenue !== 0) {
        skipped.push({
          elocalCallId: bestMatch.elocalCall.id,
          existingOriginalPayout: existingOriginalPayout,
          existingOriginalRevenue: existingOriginalRevenue,
          newPayout: ringbaCall.payout,
          newRevenue: ringbaCall.revenue,
          reason: 'original_payout or original_revenue already filled'
        });
        continue;
      }
      
      updates.push({
        elocalCallId: bestMatch.elocalCall.id,
        ringbaInboundCallId: ringbaCall.inboundCallId,
        originalPayout: ringbaCall.payout,
        originalRevenue: ringbaCall.revenue,
        matchInfo: {
          timeDiff: bestMatch.timeDiff,
          payoutMatch: bestMatch.payoutMatch
        }
      });
    }
    
    // Print detailed analysis
    console.log('='.repeat(100));
    console.log('MATCHING RESULTS');
    console.log('='.repeat(100));
    console.log(`Matches Found: ${updates.length}`);
    console.log(`Skipped (already filled): ${skipped.length}`);
    console.log(`Unmatched: ${unmatched.length}\n`);
    
    if (unmatched.length > 0) {
      console.log('='.repeat(100));
      console.log('DETAILED UNMATCHED CALLS ANALYSIS');
      console.log('='.repeat(100));
      
      // Group by reason
      const byReason = {};
      unmatched.forEach(item => {
        const reason = item.reason.split('.')[0]; // Get main reason
        if (!byReason[reason]) {
          byReason[reason] = [];
        }
        byReason[reason].push(item);
      });
      
      console.log('\nUnmatched by Reason:');
      Object.entries(byReason).forEach(([reason, items]) => {
        console.log(`  ${reason}: ${items.length} calls`);
      });
      
      console.log('\n' + '='.repeat(100));
      console.log('DETAILED UNMATCHED CALLS:');
      console.log('='.repeat(100));
      
      unmatched.forEach((item, index) => {
        const rc = item.ringbaCall;
        console.log(`\n[${index + 1}] Ringba Call: ${rc.inboundCallId}`);
        console.log(`    Date/Time: ${rc.callDt}`);
        console.log(`    Category: ${getCategoryFromTargetId(rc.targetId)}`);
        console.log(`    Caller ID: ${rc.callerId} → E.164: ${rc.callerIdE164}`);
        console.log(`    Payout: $${rc.payout.toFixed(2)}, Revenue: $${rc.revenue.toFixed(2)}`);
        console.log(`    Reason: ${item.reason}`);
        
        // Show potential matches
        const ringbaCategory = getCategoryFromTargetId(rc.targetId);
        const callerE164 = rc.callerIdE164 || toE164(rc.callerId);
        const categoryCalls = elocalCallsByCategoryAndCaller.get(ringbaCategory);
        if (categoryCalls) {
          const candidates = categoryCalls.get(callerE164) || [];
          if (candidates.length > 0) {
            console.log(`    Potential eLocal matches (${candidates.length}):`);
            candidates.forEach(candidate => {
              const isMatched = matchedElocalIds.has(candidate.id);
              const elocalDate = parseDate(candidate.date_of_call);
              const ringbaDate = parseDate(rc.callDt);
              let timeInfo = 'N/A';
              if (elocalDate && ringbaDate) {
                const elocalTimeOnly = new Date(elocalDate);
                elocalTimeOnly.setSeconds(0, 0);
                const ringbaTimeOnly = new Date(ringbaDate);
                ringbaTimeOnly.setSeconds(0, 0);
                const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
                timeInfo = `${timeDiff.toFixed(1)} min`;
              }
              console.log(`      - eLocal ID ${candidate.id}: ${candidate.date_of_call}, Time Diff: ${timeInfo}, Matched: ${isMatched ? 'YES' : 'NO'}, Original: $${Number(candidate.original_payout || 0).toFixed(2)}`);
            });
          }
        }
      });
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

analyzeUnmatchedMatchingLogic().catch(console.error);


