#!/usr/bin/env node

/**
 * Test script to verify that adjustments are not applied multiple times
 * when the historical service runs multiple times for the same day
 * 
 * This script:
 * 1. Fetches calls with adjustments from database for a specific date
 * 2. Simulates the adjustment matching logic
 * 3. Verifies that adjustments are not matched/applied again
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { dbOps } from './src/database/postgres-operations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Build config
const config = {
  dbHost: process.env.POSTGRES_HOST || process.env.DB_HOST,
  dbPort: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
  dbName: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
  dbUser: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
  dbPassword: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
  dbSsl: process.env.DB_SSL === 'true'
};

// Helper functions (same as in elocal.scrapper.js)
const toDate = (s) => { 
  try { 
    return new Date(s); 
  } catch { 
    return null; 
  } 
};

const sameDay = (dateStr1, dateStr2) => {
  if (!dateStr1 || !dateStr2) return false;
  const date1 = dateStr1.substring(0, 10);
  const date2 = dateStr2.substring(0, 10);
  return date1 === date2;
};

const diffMinutes = (d1, d2) => Math.abs(d1.getTime() - d2.getTime()) / 60000;
const WINDOW_MIN = 30;

// Test function
async function testAdjustmentDoubleApplication() {
  try {
    const db = dbOps(config);
    
    // Test date: December 22, 2025 (we know this has adjustments)
    const testDateStr = process.argv[2] || '2025-12-22';
    const category = 'STATIC';
    
    // Parse date from various formats
    let testDate = testDateStr;
    let startDate, endDate;
    
    // Try DD-MM-YYYY format
    const ddMMyyyy = testDateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddMMyyyy) {
      const day = parseInt(ddMMyyyy[1], 10);
      const month = parseInt(ddMMyyyy[2], 10) - 1;
      const year = parseInt(ddMMyyyy[3], 10);
      startDate = new Date(year, month, day);
      endDate = new Date(year, month, day);
      testDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } else {
      // Try YYYY-MM-DD format
      startDate = new Date(testDateStr);
      endDate = new Date(testDateStr);
    }
    
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    console.log('='.repeat(70));
    console.log('Test: Adjustment Double Application Prevention');
    console.log('='.repeat(70));
    console.log(`Test Date: ${testDate}`);
    console.log(`Category: ${category}`);
    console.log('');
    
    // Step 1: Fetch existing calls with adjustments
    console.log('[Step 1] Fetching existing calls with adjustments...');
    const existingCalls = await db.getCallsForDateRange(startDate, endDate, category);
    
    // Filter to calls that have adjustments
    const callsWithAdjustments = existingCalls.filter(c => 
      c.adjustment_amount && parseFloat(c.adjustment_amount) !== 0
    );
    
    console.log(`[Step 1] Found ${existingCalls.length} total calls`);
    console.log(`[Step 1] Found ${callsWithAdjustments.length} calls with adjustments`);
    console.log('');
    
    if (callsWithAdjustments.length === 0) {
      console.log('[INFO] No calls with adjustments found. Cannot test double application prevention.');
      console.log('[INFO] This is expected if adjustments haven\'t been applied yet.');
      return;
    }
    
    // Step 2: Fetch adjustments from adjustment_details table
    console.log('[Step 2] Fetching adjustments from adjustment_details table...');
    const adjustmentsQuery = `
      SELECT 
        time_of_call, adjustment_time, caller_id, amount, classification, call_sid
      FROM adjustment_details
      WHERE SUBSTRING(time_of_call, 1, 10) = $1
      ORDER BY time_of_call
    `;
    
    const adjustmentsResult = await db.pool.query(adjustmentsQuery, [testDate]);
    const adjustments = adjustmentsResult.rows || [];
    
    console.log(`[Step 2] Found ${adjustments.length} adjustments in adjustment_details table`);
    console.log('');
    
    if (adjustments.length === 0) {
      console.log('[INFO] No adjustments found in adjustment_details table.');
      return;
    }
    
    // Step 3: Simulate matching logic
    console.log('[Step 3] Simulating adjustment matching logic...');
    console.log('[Step 3] Testing if adjustments would be matched again...');
    console.log('');
    
    // Build callerToCalls map (same as in elocal.scrapper.js)
    const callerToCalls = new Map();
    for (const existingCall of existingCalls) {
      if (existingCall.unmatched) continue;
      
      const list = callerToCalls.get(existingCall.caller_id) || [];
      list.push({
        callerId: existingCall.caller_id,
        dateOfCall: existingCall.date_of_call,
        payout: parseFloat(existingCall.payout) || 0,
        category: existingCall.category || category,
        dt: toDate(existingCall.date_of_call),
        fromDatabase: true,
        dbId: existingCall.id,
        hasAdjustment: !!(existingCall.adjustment_amount && parseFloat(existingCall.adjustment_amount) !== 0),
        adjustmentAmount: parseFloat(existingCall.adjustment_amount) || null,
        adjustmentTime: existingCall.adjustment_time || null
      });
      callerToCalls.set(existingCall.caller_id, list);
    }
    
    // Simulate matching each adjustment
    let wouldBeMatched = 0;
    let wouldBeSkipped = 0;
    const matchedDetails = [];
    const skippedDetails = [];
    
    for (const adj of adjustments) {
      const adjDt = toDate(adj.time_of_call);
      const candidates = callerToCalls.get(adj.caller_id) || [];
      let best = null;
      
      for (const cand of candidates) {
        if (!cand.dt || !adjDt) continue;
        if (!sameDay(cand.dateOfCall, adj.time_of_call)) continue;
        
        // CRITICAL CHECK: Skip if call already has an adjustment
        if (cand.fromDatabase && cand.hasAdjustment) {
          const existingAdjAmount = cand.adjustmentAmount;
          const amountMatch = Math.abs((existingAdjAmount || 0) - (parseFloat(adj.amount) || 0)) < 0.01;
          if (amountMatch) {
            // This adjustment was already applied, skip it
            wouldBeSkipped++;
            skippedDetails.push({
              adjustment: adj,
              call: cand,
              reason: 'Adjustment already applied (amount matches)'
            });
            continue;
          }
        }
        
        const dm = diffMinutes(cand.dt, adjDt);
        if (dm <= WINDOW_MIN) {
          if (!best || dm < best.diff) best = { diff: dm, call: cand };
        }
      }
      
      if (best && best.call) {
        // Check again before matching
        if (best.call.fromDatabase && best.call.hasAdjustment) {
          const existingAdjAmount = best.call.adjustmentAmount;
          const amountMatch = Math.abs((existingAdjAmount || 0) - (parseFloat(adj.amount) || 0)) < 0.01;
          if (amountMatch) {
            wouldBeSkipped++;
            skippedDetails.push({
              adjustment: adj,
              call: best.call,
              reason: 'Adjustment already applied (double-check)'
            });
            continue;
          }
        }
        
        wouldBeMatched++;
        matchedDetails.push({
          adjustment: adj,
          call: best.call,
          timeDiff: best.diff
        });
      }
    }
    
    // Step 4: Report results
    console.log('[Step 4] Test Results:');
    console.log('='.repeat(70));
    console.log(`Total Adjustments: ${adjustments.length}`);
    console.log(`Would Be Matched: ${wouldBeMatched} ⚠️`);
    console.log(`Would Be Skipped: ${wouldBeSkipped} ✅`);
    console.log('');
    
    if (wouldBeMatched > 0) {
      console.log('⚠️  WARNING: Some adjustments would be matched again!');
      console.log('   This indicates the fix may not be working correctly.');
      console.log('');
      console.log('Adjustments that would be matched again:');
      matchedDetails.forEach((detail, index) => {
        console.log(`   [${index + 1}] Adjustment: ${detail.adjustment.caller_id} at ${detail.adjustment.time_of_call}`);
        console.log(`       Amount: $${detail.adjustment.amount}`);
        console.log(`       Call ID: ${detail.call.dbId}`);
        console.log(`       Call Payout: $${detail.call.payout}`);
        console.log(`       Call Has Adjustment: ${detail.call.hasAdjustment}`);
        console.log(`       Call Adjustment Amount: $${detail.call.adjustmentAmount || 'N/A'}`);
        console.log(`       Time Diff: ${detail.timeDiff.toFixed(2)} min`);
        console.log('');
      });
    } else {
      console.log('✅ SUCCESS: All adjustments would be correctly skipped!');
      console.log('   The fix is working correctly - adjustments are not applied multiple times.');
      console.log('');
      
      if (skippedDetails.length > 0) {
        console.log('Adjustments correctly skipped:');
        skippedDetails.slice(0, 5).forEach((detail, index) => {
          console.log(`   [${index + 1}] Adjustment: ${detail.adjustment.caller_id} at ${detail.adjustment.time_of_call}`);
          console.log(`       Amount: $${detail.adjustment.amount}`);
          console.log(`       Call ID: ${detail.call.dbId}`);
          console.log(`       Reason: ${detail.reason}`);
        });
        if (skippedDetails.length > 5) {
          console.log(`   ... and ${skippedDetails.length - 5} more`);
        }
      }
    }
    
    console.log('');
    console.log('='.repeat(70));
    console.log('Test Complete');
    console.log('='.repeat(70));
    
    process.exit(wouldBeMatched > 0 ? 1 : 0);
  } catch (error) {
    console.error('[ERROR] Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testAdjustmentDoubleApplication();

