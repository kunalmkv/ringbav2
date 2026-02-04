#!/usr/bin/env node

/**
 * Analyze unmatched calls from cost sync
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5434,
  database: process.env.POSTGRES_DB_NAME || 'postgres',
  user: process.env.POSTGRES_USER_NAME || 'postgres',
  password: process.env.POSTGRES_PASSWORD
});

// Unmatched eLocal call IDs (remaining after cost sync re-run)
const unmatchedIds = [4497, 4545];

// Get category from Ringba target ID
const getCategoryFromTargetId = (targetId) => {
  if (!targetId) return null;

  const apiTargetIds = [
    'PI1175ac62aa1c4748b21216666b398135',  // Main API target
    'PIbf5b23d16e334f679cb4fc13dc90ec46'   // Secondary API target
  ];

  return apiTargetIds.includes(targetId) ? 'API' : 'STATIC';
};

// Convert phone to E.164
const toE164 = (raw) => {
  if (!raw) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return raw;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return digits.length > 0 ? `+${digits}` : null;
};

// Calculate time difference in minutes
const timeDiffMinutes = (date1Str, date2Str) => {
  const date1 = new Date(date1Str);
  const date2 = new Date(date2Str);
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
};

async function analyzeUnmatchedCalls() {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('Analyzing Unmatched Calls from Ringba Cost Sync');
    console.log('='.repeat(80));
    console.log('');

    // Get unmatched eLocal calls
    const elocalQuery = `
      SELECT id, caller_id, date_of_call, payout, category, total_duration, 
             original_payout, original_revenue
      FROM elocal_call_data 
      WHERE id = ANY($1)
      ORDER BY id
    `;

    const elocalResult = await pool.query(elocalQuery, [unmatchedIds]);
    const elocalCalls = elocalResult.rows;

    console.log(`Found ${elocalCalls.length} unmatched eLocal calls\n`);

    // For each unmatched call, find potential Ringba matches
    for (const elocalCall of elocalCalls) {
      console.log('='.repeat(80));
      console.log(`\nAnalyzing eLocal Call ID: ${elocalCall.id}`);
      console.log('-'.repeat(80));
      console.log(`  Category:     ${elocalCall.category}`);
      console.log(`  Caller ID:    ${elocalCall.caller_id} (E.164: ${toE164(elocalCall.caller_id)})`);
      console.log(`  Date/Time:    ${elocalCall.date_of_call}`);
      console.log(`  Payout:       $${Number(elocalCall.payout || 0).toFixed(2)}`);
      console.log(`  Duration:     ${elocalCall.total_duration || 'N/A'} seconds`);
      console.log('');

      // Search for Ringba calls on same date with same caller
      const elocalDate = elocalCall.date_of_call.split('T')[0]; // YYYY-MM-DD
      const elocalCallerE164 = toE164(elocalCall.caller_id);

      const ringbaQuery = `
        SELECT inbound_call_id, call_date_time, caller_id, caller_id_e164,
               payout_amount, revenue_amount, target_id, call_duration
        FROM ringba_calls
        WHERE SUBSTRING(call_date_time, 1, 10) = $1
          AND (caller_id_e164 = $2 OR caller_id = $3)
        ORDER BY call_date_time
      `;

      const ringbaResult = await pool.query(ringbaQuery, [
        elocalDate,
        elocalCallerE164,
        elocalCall.caller_id
      ]);

      const ringbaCalls = ringbaResult.rows;

      if (ringbaCalls.length === 0) {
        console.log(`  ❌ NO Ringba calls found for caller ${elocalCallerE164} on ${elocalDate}`);

        // Check if there are ANY Ringba calls for this caller (any date)
        const anyDateQuery = `
          SELECT inbound_call_id, call_date_time, caller_id_e164, target_id
          FROM ringba_calls
          WHERE caller_id_e164 = $1
          ORDER BY call_date_time DESC
          LIMIT 5
        `;
        const anyDateResult = await pool.query(anyDateQuery, [elocalCallerE164]);

        if (anyDateResult.rows.length > 0) {
          console.log(`\n  📋 However, found ${anyDateResult.rows.length} Ringba calls for this caller on OTHER dates:`);
          anyDateResult.rows.forEach((call, idx) => {
            console.log(`     ${idx + 1}. ${call.call_date_time} - ${call.inbound_call_id}`);
          });
        } else {
          console.log(`\n  📋 This caller (${elocalCallerE164}) does NOT exist in Ringba database at all!`);
        }
      } else {
        console.log(`  ✓ Found ${ringbaCalls.length} Ringba call(s) for same caller on same date:`);
        console.log('');

        // Analyze each potential match
        ringbaCalls.forEach((ringbaCall, idx) => {
          const ringbaCategory = getCategoryFromTargetId(ringbaCall.target_id);
          const timeDiff = timeDiffMinutes(elocalCall.date_of_call, ringbaCall.call_date_time);
          const durationDiff = Math.abs(
            Number(elocalCall.total_duration || 0) - Number(ringbaCall.call_duration || 0)
          );

          console.log(`  Potential Match #${idx + 1}:`);
          console.log(`    Ringba Call ID:   ${ringbaCall.inbound_call_id}`);
          console.log(`    Date/Time:        ${ringbaCall.call_date_time}`);
          console.log(`    Category:         ${ringbaCategory} (Target: ${ringbaCall.target_id})`);
          console.log(`    Payout:           $${Number(ringbaCall.payout_amount || 0).toFixed(2)}`);
          console.log(`    Duration:         ${ringbaCall.call_duration || 'N/A'} seconds`);
          console.log('');

          // Check matching criteria
          console.log(`    Matching Analysis:`);

          // 1. Category match
          const categoryMatch = ringbaCategory === elocalCall.category;
          console.log(`      ✓ Category:     ${categoryMatch ? '✅ MATCH' : '❌ MISMATCH'} (eLocal: ${elocalCall.category}, Ringba: ${ringbaCategory})`);

          // 2. Caller ID match (already matches since we queried by it)
          console.log(`      ✓ Caller ID:    ✅ MATCH (${elocalCallerE164})`);

          // 3. Time difference
          const timeMatch = timeDiff <= 30;
          console.log(`      ✓ Time Diff:    ${timeMatch ? '✅ MATCH' : '❌ MISMATCH'} (${timeDiff.toFixed(2)} minutes, threshold: 30 min)`);

          // 4. Duration match
          const durationMatch = durationDiff <= 30;
          console.log(`      ✓ Duration:     ${durationMatch ? '✅ MATCH' : '❌ MISMATCH'} (diff: ${durationDiff} seconds, threshold: 30 sec)`);

          // Overall assessment
          console.log('');
          if (categoryMatch && timeMatch && durationMatch) {
            console.log(`    🎯 SHOULD MATCH! All criteria met.`);
          } else {
            console.log(`    ⚠️  FAILED TO MATCH:`);
            if (!categoryMatch) console.log(`        - Category mismatch`);
            if (!timeMatch) console.log(`        - Time difference too large (${timeDiff.toFixed(2)} min > 30 min)`);
            if (!durationMatch) console.log(`        - Duration difference too large (${durationDiff} sec > 30 sec)`);
          }

          console.log('');
        });
      }

      console.log('');
    }

    console.log('='.repeat(80));
    console.log('Analysis Complete');
    console.log('='.repeat(80));
    console.log('');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

analyzeUnmatchedCalls();
