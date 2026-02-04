#!/usr/bin/env node

/**
 * Check if Ringba call RGBF2D8CD32DC42DDBCE329E5D255C9F55A7A25E368V3T1U01
 * is already matched to another eLocal call
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

async function checkDuplicateMatch() {
    try {
        const ringbaCallId = 'RGBF2D8CD32DC42DDBCE329E5D255C9F55A7A25E368V3T1U01';

        console.log('\n' + '='.repeat(80));
        console.log('Checking for Duplicate Match');
        console.log('='.repeat(80));
        console.log(`Ringba Call ID: ${ringbaCallId}`);
        console.log('');

        // Check which eLocal call has this ringba_inbound_call_id
        const query = `
      SELECT id, caller_id, date_of_call, payout, category, total_duration,
             ringba_inbound_call_id
      FROM elocal_call_data
      WHERE ringba_inbound_call_id = $1
    `;

        const result = await pool.query(query, [ringbaCallId]);

        if (result.rows.length === 0) {
            console.log('❌ This Ringba call is NOT matched to any eLocal call yet!');
            console.log('   This suggests there may be a bug in the matching logic.');
        } else if (result.rows.length === 1) {
            const matchedCall = result.rows[0];
            console.log(`✓ This Ringba call is matched to 1 eLocal call:`);
            console.log('');
            console.log(`  eLocal Call ID:  ${matchedCall.id}`);
            console.log(`  Caller ID:       ${matchedCall.caller_id}`);
            console.log(`  Date/Time:       ${matchedCall.date_of_call}`);
            console.log(`  Payout:          $${Number(matchedCall.payout || 0).toFixed(2)}`);
            console.log(`  Category:        ${matchedCall.category}`);
            console.log(`  Duration:        ${matchedCall.total_duration || 'N/A'} seconds`);
            console.log('');

            if (matchedCall.id === 4497) {
                console.log('  ℹ️  This IS the call we\'re trying to match (4497).');
                console.log('     However, cost sync reported it as unmatched. This is strange.');
            } else {
                console.log(`  ⚠️  This is a DIFFERENT eLocal call (${matchedCall.id}, not 4497)!`);
                console.log('     This explains why call 4497 cannot match - first-match-wins.');
            }
        } else {
            console.log(`⚠️  MULTIPLE MATCHES FOUND (${result.rows.length}):`);
            result.rows.forEach((call, idx) => {
                console.log(`  ${idx + 1}. eLocal Call ID: ${call.id}, Caller: ${call.caller_id}, Date: ${call.date_of_call}`);
            });
        }

        console.log('');
        console.log('='.repeat(80));

        // Also check the caller to see all eLocal calls for this caller
        console.log('\nAll eLocal calls for caller +12152922207:');
        console.log('-'.repeat(80));

        const callerQuery = `
      SELECT id, caller_id, date_of_call, payout, category, total_duration,
             ringba_inbound_call_id
      FROM elocal_call_data
      WHERE caller_id = '+12152922207'
      ORDER BY date_of_call
    `;

        const callerResult = await pool.query(callerQuery);

        if (callerResult.rows.length === 0) {
            console.log('No calls found for this caller.');
        } else {
            callerResult.rows.forEach((call, idx) => {
                console.log(`  ${idx + 1}. ID: ${call.id}, Date: ${call.date_of_call}, Payout: $${Number(call.payout || 0).toFixed(2)}, Category: ${call.category}, Ringba ID: ${call.ringba_inbound_call_id || 'NOT MATCHED'}`);
            });
        }

        console.log('='.repeat(80));
        console.log('');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkDuplicateMatch();
