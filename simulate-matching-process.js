#!/usr/bin/env node

import pg from 'pg';
import dotenv from 'dotenv';
import { getCategoryFromTargetId } from './src/http/ringba-target-calls.js';

// Copy helper functions
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
const pool = new Pool({
  host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Copy matchCall function
const matchCall = (ringbaCall, elocalCall, windowMinutes = 120, payoutTolerance = 0.01) => {
  const elocalDate = parseDate(elocalCall.date_of_call);
  const ringbaDate = parseDate(ringbaCall.callDt);
  
  if (!elocalDate || !ringbaDate) {
    return null;
  }
  
  const elocalDateStr = elocalDate.toISOString().split('T')[0];
  const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
  const elocalDateOnly = new Date(elocalDateStr);
  const ringbaDateOnly = new Date(ringbaDateStr);
  const daysDiff = Math.abs((elocalDateOnly.getTime() - ringbaDateOnly.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff > 1) {
    return null;
  }
  
  const elocalTimeOnly = new Date(elocalDate);
  elocalTimeOnly.setSeconds(0, 0);
  const ringbaTimeOnly = new Date(ringbaDate);
  ringbaTimeOnly.setSeconds(0, 0);
  
  const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
  const effectiveWindow = daysDiff === 0 ? windowMinutes : (24 * 60);
  
  if (timeDiff > effectiveWindow) {
    return null;
  }
  
  const elocalPayout = Number(elocalCall.payout || 0);
  const ringbaPayout = Number(ringbaCall.payout || 0);
  const payoutDiff = Math.abs(elocalPayout - ringbaPayout);
  
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

async function simulateMatching() {
  const client = await pool.connect();
  try {
    console.log('='.repeat(80));
    console.log('SIMULATING MATCHING PROCESS FOR DECEMBER 2, 2025');
    console.log('='.repeat(80));
    
    // Fetch all Ringba calls for Dec 2
    const ringbaCalls = await client.query(`
      SELECT 
        inbound_call_id, call_date_time, caller_id, caller_id_e164,
        payout_amount, revenue_amount, target_id
      FROM ringba_calls
      WHERE SUBSTRING(call_date_time, 1, 10) = '2025-12-02'
      ORDER BY call_date_time
    `);
    
    console.log(`\n📞 Found ${ringbaCalls.rows.length} Ringba calls for Dec 2`);
    
    // Fetch all eLocal calls for Dec 2
    const elocalCalls = await client.query(`
      SELECT 
        id, caller_id, date_of_call, payout, category,
        original_payout, original_revenue, ringba_inbound_call_id
      FROM elocal_call_data
      WHERE SUBSTRING(date_of_call, 1, 10) = '2025-12-02'
      ORDER BY date_of_call
    `);
    
    console.log(`📞 Found ${elocalCalls.rows.length} eLocal calls for Dec 2`);
    
    // Build index (same as service)
    const elocalCallsByCategoryAndCaller = new Map();
    for (const elocalCall of elocalCalls.rows) {
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
    
    const matchedElocalIds = new Set();
    const updates = [];
    const unmatched = [];
    
    // Process each Ringba call (same order as service)
    console.log(`\n🔄 Processing ${ringbaCalls.rows.length} Ringba calls...\n`);
    
    for (let i = 0; i < ringbaCalls.rows.length; i++) {
      const ringbaCallRow = ringbaCalls.rows[i];
      const ringbaCategory = getCategoryFromTargetId(ringbaCallRow.target_id);
      
      // Check if this is one of our target calls
      const isTarget1 = ringbaCallRow.inbound_call_id === 'RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01';
      const isTarget2 = ringbaCallRow.inbound_call_id === 'RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01';
      
      if (isTarget1 || isTarget2) {
        console.log(`\n${'='.repeat(80)}`);
        console.log(`🎯 TARGET RINGBA CALL #${i + 1}: ${ringbaCallRow.inbound_call_id}`);
        console.log('='.repeat(80));
      }
      
      if (!ringbaCategory) {
        if (isTarget1 || isTarget2) {
          console.log(`   ❌ Invalid category for target ID: ${ringbaCallRow.target_id}`);
        }
        unmatched.push({ ringbaCall: ringbaCallRow, reason: `Invalid or unknown target ID` });
        continue;
      }
      
      const callerE164 = ringbaCallRow.caller_id_e164 || toE164(ringbaCallRow.caller_id);
      if (!callerE164) {
        if (isTarget1 || isTarget2) {
          console.log(`   ❌ Invalid caller ID`);
        }
        unmatched.push({ ringbaCall: ringbaCallRow, reason: 'Invalid caller ID' });
        continue;
      }
      
      const categoryCalls = elocalCallsByCategoryAndCaller.get(ringbaCategory);
      if (!categoryCalls) {
        if (isTarget1 || isTarget2) {
          console.log(`   ❌ No eLocal calls found for category: ${ringbaCategory}`);
        }
        unmatched.push({ ringbaCall: ringbaCallRow, reason: `No eLocal calls found for category` });
        continue;
      }
      
      const candidateElocalCalls = categoryCalls.get(callerE164) || [];
      
      if (isTarget1 || isTarget2) {
        console.log(`   Category: ${ringbaCategory}`);
        console.log(`   Caller E.164: ${callerE164}`);
        console.log(`   Found ${candidateElocalCalls.length} candidate eLocal calls`);
        candidateElocalCalls.forEach((c, idx) => {
          const isMatched = matchedElocalIds.has(c.id);
          console.log(`     [${idx + 1}] eLocal ID ${c.id}: ${c.date_of_call}, Already Matched: ${isMatched ? 'YES' : 'NO'}`);
        });
      }
      
      if (candidateElocalCalls.length === 0) {
        if (isTarget1 || isTarget2) {
          console.log(`   ❌ No candidate eLocal calls found`);
        }
        unmatched.push({ ringbaCall: ringbaCallRow, reason: `No matching eLocal call found` });
        continue;
      }
      
      let bestMatch = null;
      let bestScore = Infinity;
      
      for (const elocalCall of candidateElocalCalls) {
        if (matchedElocalIds.has(elocalCall.id)) {
          if (isTarget1 || isTarget2) {
            console.log(`   ⚠️  Skipping eLocal ${elocalCall.id} - already matched`);
          }
          continue;
        }
        
        const ringbaCallObj = {
          inboundCallId: ringbaCallRow.inbound_call_id,
          callDt: ringbaCallRow.call_date_time,
          callerId: ringbaCallRow.caller_id,
          callerIdE164: ringbaCallRow.caller_id_e164,
          payout: ringbaCallRow.payout_amount,
          revenue: ringbaCallRow.revenue_amount,
          targetId: ringbaCallRow.target_id
        };
        
        const match = matchCall(ringbaCallObj, elocalCall);
        if (match) {
          if (isTarget1 || isTarget2) {
            console.log(`   ✅ Match found with eLocal ${elocalCall.id}: score=${match.matchScore.toFixed(2)}, timeDiff=${match.timeDiff.toFixed(1)} min`);
          }
          if (match.matchScore < bestScore) {
            bestMatch = match;
            bestScore = match.matchScore;
          }
        } else {
          if (isTarget1 || isTarget2) {
            console.log(`   ❌ No match with eLocal ${elocalCall.id} (time/payout mismatch)`);
          }
        }
      }
      
      if (!bestMatch) {
        if (isTarget1 || isTarget2) {
          console.log(`   ❌ NO BEST MATCH FOUND`);
          const available = candidateElocalCalls.filter(c => !matchedElocalIds.has(c.id));
          if (available.length > 0) {
            console.log(`   Available candidates: ${available.length}`);
            available.forEach(c => {
              console.log(`     - eLocal ${c.id}: ${c.date_of_call}`);
            });
          } else {
            console.log(`   All candidates already matched`);
          }
        }
        unmatched.push({ ringbaCall: ringbaCallRow, reason: `No matching eLocal call found` });
        continue;
      }
      
      if (isTarget1 || isTarget2) {
        console.log(`   ✅ BEST MATCH: eLocal ${bestMatch.elocalCall.id} (score: ${bestMatch.matchScore.toFixed(2)})`);
      }
      
      matchedElocalIds.add(bestMatch.elocalCall.id);
      
      const existingOriginalPayout = Number(bestMatch.elocalCall.original_payout || 0);
      const existingOriginalRevenue = Number(bestMatch.elocalCall.original_revenue || 0);
      
      if (existingOriginalPayout !== 0 || existingOriginalRevenue !== 0) {
        if (isTarget1 || isTarget2) {
          console.log(`   ⚠️  SKIPPED: Original payout/revenue already filled`);
        }
        continue;
      }
      
      if (isTarget1 || isTarget2) {
        console.log(`   ✅ UPDATE PREPARED: Will update eLocal ${bestMatch.elocalCall.id}`);
      }
      
      updates.push({
        elocalCallId: bestMatch.elocalCall.id,
        ringbaInboundCallId: ringbaCallRow.inbound_call_id,
        originalPayout: ringbaCallRow.payout_amount,
        originalRevenue: ringbaCallRow.revenue_amount
      });
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log('FINAL RESULTS');
    console.log('='.repeat(80));
    console.log(`Total Ringba calls processed: ${ringbaCalls.rows.length}`);
    console.log(`Matches found: ${updates.length}`);
    console.log(`Unmatched: ${unmatched.length}`);
    
    const target1Match = updates.find(u => u.ringbaInboundCallId === 'RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01');
    const target2Match = updates.find(u => u.ringbaInboundCallId === 'RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01');
    
    console.log(`\n🎯 Target Call 1 (RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01):`);
    if (target1Match) {
      console.log(`   ✅ MATCHED to eLocal ${target1Match.elocalCallId}`);
    } else {
      console.log(`   ❌ NOT MATCHED`);
        const unmatched1 = unmatched.find(u => u.ringbaCall.inbound_call_id === 'RGB2B1165EE5599EAC31220E708A66B32F8ECCA728EV3URR01');
        if (unmatched1) {
          console.log(`   Reason: ${unmatched1.reason}`);
        }
    }
    
    console.log(`\n🎯 Target Call 2 (RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01):`);
    if (target2Match) {
      console.log(`   ✅ MATCHED to eLocal ${target2Match.elocalCallId}`);
    } else {
      console.log(`   ❌ NOT MATCHED`);
        const unmatched2 = unmatched.find(u => u.ringbaCall.inbound_call_id === 'RGB87A7B56218174E26CAFA11377A19DBE5A47ABBE4V3HIY01');
        if (unmatched2) {
          console.log(`   Reason: ${unmatched2.reason}`);
        }
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

simulateMatching().catch(console.error);

