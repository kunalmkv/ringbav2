#!/usr/bin/env node

/**
 * Bulk update Ringba call payouts and revenue to $0.00
 * Reads Inbound Call IDs from CSV file and uses Ringba API to set both values to 0
 */

import fs from 'fs';
import dotenv from 'dotenv';
import { updateCallPayment } from './src/http/ringba-client.js';

dotenv.config();

const CSV_FILE = './data/ringba-call-log-export-ra8d14d_170a1hy.csv';
const RINGBA_ACCOUNT_ID = process.env.RINGBA_ACCOUNT_ID;
const RINGBA_API_TOKEN = process.env.RINGBA_API_TOKEN;

// Parse CSV and extract Inbound Call IDs
function parseCSVForCallIds(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    // Skip header (line 0)
    const callIds = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // CSV format: "Call Date","Inbound Call ID","Campaign",...
        // Extract Inbound Call ID (2nd column)
        const match = line.match(/^"[^"]*","([^"]+)"/);
        if (match && match[1]) {
            callIds.push(match[1]);
        }
    }

    return callIds;
}

// Update a single call's payout and revenue to $0.00
async function updateCallToZero(accountId, apiToken, inboundCallId, index, total) {
    try {
        console.log(`\n[${index}/${total}] Processing: ${inboundCallId}`);

        const payload = {
            newConversionAmount: 0.00,
            newPayoutAmount: 0.00,
            reason: 'Call payments adjusted by acct. Admin.'
        };

        const updateEither = await updateCallPayment(accountId, apiToken)(inboundCallId, payload)();

        if (updateEither._tag === 'Left') {
            const error = updateEither.left;
            console.error(`  ❌ FAILED: ${error.message || String(error)}`);
            return {
                success: false,
                inboundCallId,
                error: error.message || String(error)
            };
        }

        console.log(`  ✅ SUCCESS: Set payout and revenue to $0.00`);
        return {
            success: true,
            inboundCallId,
            result: updateEither.right
        };
    } catch (error) {
        console.error(`  ❌ ERROR: ${error.message}`);
        return {
            success: false,
            inboundCallId,
            error: error.message
        };
    }
}

// Process all calls with delay to avoid rate limiting
async function processAllCalls(callIds, delayMs = 500) {
    const results = {
        success: [],
        failed: []
    };

    console.log(`\n${'='.repeat(70)}`);
    console.log('Bulk Update Ringba Calls to $0.00');
    console.log(`${'='.repeat(70)}`);
    console.log(`Total calls to process: ${callIds.length}`);
    console.log(`Account ID: ${RINGBA_ACCOUNT_ID}`);
    console.log(`Delay between calls: ${delayMs}ms`);
    console.log(`${'='.repeat(70)}\n`);

    for (let i = 0; i < callIds.length; i++) {
        const callId = callIds[i];
        const result = await updateCallToZero(
            RINGBA_ACCOUNT_ID,
            RINGBA_API_TOKEN,
            callId,
            i + 1,
            callIds.length
        );

        if (result.success) {
            results.success.push(result);
        } else {
            results.failed.push(result);
        }

        // Add delay between requests to avoid rate limiting
        if (i < callIds.length - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    return results;
}

// Main execution
async function main() {
    try {
        // Validate environment variables
        if (!RINGBA_ACCOUNT_ID || !RINGBA_API_TOKEN) {
            throw new Error('Missing required environment variables: RINGBA_ACCOUNT_ID, RINGBA_API_TOKEN');
        }

        // Check if CSV file exists
        if (!fs.existsSync(CSV_FILE)) {
            throw new Error(`CSV file not found: ${CSV_FILE}`);
        }

        // Parse CSV
        console.log(`Reading CSV file: ${CSV_FILE}`);
        const callIds = parseCSVForCallIds(CSV_FILE);
        console.log(`Found ${callIds.length} Inbound Call IDs\n`);

        if (callIds.length === 0) {
            console.log('No calls to process. Exiting.');
            return;
        }

        // Confirm before proceeding
        console.log(`⚠️  WARNING: This will set payout and revenue to $0.00 for ${callIds.length} calls.`);
        console.log(`⚠️  Are you sure you want to proceed? Press Ctrl+C to cancel.\n`);

        // Wait 3 seconds before starting
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Process all calls
        const startTime = Date.now();
        const results = await processAllCalls(callIds);
        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        // Print summary
        console.log(`\n${'='.repeat(70)}`);
        console.log('Summary');
        console.log(`${'='.repeat(70)}`);
        console.log(`Total calls processed: ${callIds.length}`);
        console.log(`✅ Successful: ${results.success.length}`);
        console.log(`❌ Failed: ${results.failed.length}`);
        console.log(`⏱️  Duration: ${duration}s`);

        if (results.failed.length > 0) {
            console.log(`\nFailed calls:`);
            results.failed.forEach((result, idx) => {
                console.log(`  ${idx + 1}. ${result.inboundCallId}: ${result.error}`);
            });
        }

        console.log(`${'='.repeat(70)}\n`);

        // Save results to file
        const resultsFile = `./data/bulk-update-results-${Date.now()}.json`;
        fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
        console.log(`Results saved to: ${resultsFile}\n`);

    } catch (error) {
        console.error(`\n❌ Fatal error: ${error.message}`);
        process.exit(1);
    }
}

main();
