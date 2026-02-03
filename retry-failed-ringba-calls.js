#!/usr/bin/env node

/**
 * Retry script for failed Ringba API calls
 * Retries the 3 calls that failed due to 504 Gateway Timeout errors
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Failed calls to retry
const failedCalls = [
    {
        callId: 'RGB31E2600066BA764F05313216BEA8229D2257F75BV35L_01',
        targetId: 'TA48aa3e3f5a0544af8549703f76a24faa',
        elocalCallId: 1995,
        currentPayout: 65.80,
        currentRevenue: 65.80,
        newPayout: 0.00,
        newRevenue: 0.00
    },
    {
        callId: 'RGBA9DE3056CF6D0890C4DACAC0C39D905AC250EF1BV3JFA01',
        targetId: 'TA48aa3e3f5a0544af8549703f76a24faa',
        elocalCallId: 2346,
        currentPayout: 28.00,
        currentRevenue: 28.00,
        newPayout: 0.00,
        newRevenue: 0.00
    },
    {
        callId: 'RGB1DC1CDF6F1926EF6DCD4EF4862C3DA9CF568A9BDV3CSS01',
        targetId: 'TA48aa3e3f5a0544af8549703f76a24faa',
        elocalCallId: 3184,
        currentPayout: 52.50,
        currentRevenue: 52.50,
        newPayout: 0.00,
        newRevenue: 0.00
    }
];

// Update a single call via Ringba API using the correct /calls/payments/override endpoint
async function updateRingbaCall(call, accountId, apiToken) {
    const url = `https://api.ringba.com/v2/${accountId}/calls/payments/override`;

    console.log(`\n[${new Date().toISOString()}] Updating call ${call.callId}...`);
    console.log(`  - eLocal Call ID: ${call.elocalCallId}`);
    console.log(`  - Target ID: ${call.targetId}`);
    console.log(`  - Current: payout=$${call.currentPayout}, revenue=$${call.currentRevenue}`);
    console.log(`  - New: payout=$${call.newPayout}, revenue=$${call.newRevenue}`);

    const startTime = Date.now();

    try {
        const body = {
            inboundCallId: call.callId,
            targetId: call.targetId,
            reason: 'Retry: Call payments synced from eLocal database (January 2026)',
            adjustConversion: true,
            newConversionAmount: call.newRevenue,
            adjustPayout: true,
            newPayoutAmount: call.newPayout
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${apiToken}`
            },
            body: JSON.stringify(body)
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        const text = await response.text();
        let json;
        try {
            json = JSON.parse(text);
        } catch {
            json = { raw: text };
        }

        if (!response.ok) {
            throw new Error(`Ringba API error ${response.status}: ${text}`);
        }

        console.log(`  ✅ Successfully updated`);
        console.log(`  - Duration: ${duration}s`);
        console.log(`  - Response:`, JSON.stringify(json, null, 2));

        return { success: true, callId: call.callId, duration };
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`  ❌ Failed: ${error.message}`);
        console.log(`  - Duration: ${duration}s`);

        return { success: false, callId: call.callId, error: error.message, duration };
    }
}

// Main function
async function main() {
    console.log('======================================================================');
    console.log('Ringba API Call Retry - Failed Calls from January 2026 Sync');
    console.log('======================================================================');
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log(`Retrying ${failedCalls.length} failed calls`);
    console.log('======================================================================\n');

    const accountId = process.env.RINGBA_ACCOUNT_ID;
    const apiToken = process.env.RINGBA_API_TOKEN;

    if (!accountId || !apiToken) {
        console.error('Error: RINGBA_ACCOUNT_ID and RINGBA_API_TOKEN must be set in .env file');
        process.exit(1);
    }

    const results = [];

    for (let i = 0; i < failedCalls.length; i++) {
        const call = failedCalls[i];
        console.log(`\n[${i + 1}/${failedCalls.length}] Processing call...`);

        const result = await updateRingbaCall(call, accountId, apiToken);
        results.push(result);

        // Add a small delay between calls to avoid rate limiting
        if (i < failedCalls.length - 1) {
            console.log('\n  Waiting 2 seconds before next call...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    // Summary
    console.log('\n======================================================================');
    console.log('Retry Summary');
    console.log('======================================================================');

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`Total Calls: ${results.length}`);
    console.log(`Successful: ${successful}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
        console.log('\nFailed Calls:');
        results.filter(r => !r.success).forEach(r => {
            console.log(`  - ${r.callId}: ${r.error}`);
        });
    }

    console.log('======================================================================');
    console.log(`Completed at: ${new Date().toISOString()}`);
    console.log('======================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

main();
