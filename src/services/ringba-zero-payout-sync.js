// Automated service to fix Ringba calls with zero payout/revenue but marked as converted
// Runs daily to process calls from the last 10 days
// Uses two-step update process per Ringba support recommendation:
//   Step 1: Set payout/revenue to $2.22 (non-zero value)
//   Step 2: Set payout/revenue back to $0.00
// This automatically clears hasConverted status

import { updateCallPayment } from '../http/ringba-client.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

/**
 * Fetch converted zero-payout calls using Ringba API filters
 */
const fetchConvertedZeroCalls = async (accountId, apiToken, startDate, endDate) => {
    const allCalls = [];
    let offset = 0;
    const pageSize = 1000;
    let hasMore = true;

    console.log('Fetching converted zero-payout calls...');

    while (hasMore) {
        const requestBody = {
            reportStart: startDate,
            reportEnd: endDate,
            offset: offset,
            size: pageSize,
            valueColumns: [
                { column: 'inboundCallId' },
                { column: 'callDt' },
                { column: 'targetId' },
                { column: 'targetName' },
                { column: 'conversionAmount' },
                { column: 'payoutAmount' },
                { column: 'tag:InboundNumber:Number' },
                { column: 'campaignName' },
                { column: 'callLengthInSeconds', displayName: 'Duration' },
                { column: 'hasConverted' }
            ],
            orderByColumns: [
                { column: 'callDt', direction: 'desc' }
            ],
            formatTimespans: true,
            formatPercentages: true,
            formatDateTime: true,
            filters: [
                {
                    anyConditionToMatch: [
                        {
                            column: 'tag:Campaign:Name',
                            comparisonType: 'EQUALS',
                            value: 'Appliance Repair',
                            isNegativeMatch: false
                        }
                    ]
                },
                {
                    anyConditionToMatch: [
                        {
                            column: 'hasConverted',
                            comparisonType: 'EQUALS',
                            value: 'yes',
                            isNegativeMatch: false
                        }
                    ]
                },
                {
                    anyConditionToMatch: [
                        {
                            column: 'payoutAmount',
                            comparisonType: 'EQUALS',
                            value: '0',
                            isNegativeMatch: false
                        }
                    ]
                },
                {
                    anyConditionToMatch: [
                        {
                            column: 'conversionAmount',
                            comparisonType: 'EQUALS',
                            value: '0',
                            isNegativeMatch: false
                        }
                    ]
                }
            ],
            formatTimeZone: 'America/New_York'
        };

        const response = await fetch(`${RINGBA_BASE_URL}/${accountId}/calllogs`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error');
            throw new Error(`Ringba API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const records = data.report?.records || [];

        if (records.length === 0) {
            hasMore = false;
        } else {
            allCalls.push(...records);
            offset += pageSize;

            if (records.length < pageSize) {
                hasMore = false;
            }
        }
    }

    return allCalls;
};

/**
 * Fix a single call using two-step update process
 */
const fixCall = async (accountId, apiToken, call) => {
    const callId = call.inboundCallId;
    const targetId = call.targetId;

    try {
        // STEP 1: Update to non-zero value ($2.22)
        const step1Payload = {
            newConversionAmount: 2.22,
            newPayoutAmount: 2.22,
            reason: 'Temporary adjustment to clear conversion status',
            targetId: targetId
        };

        const step1Result = await updateCallPayment(accountId, apiToken)(callId, step1Payload)();

        if (step1Result._tag === 'Left') {
            throw new Error(`Step 1 failed: ${step1Result.left.message}`);
        }

        // Small delay between steps
        await new Promise(resolve => setTimeout(resolve, 500));

        // STEP 2: Update back to zero ($0.00)
        const step2Payload = {
            newConversionAmount: 0.00,
            newPayoutAmount: 0.00,
            reason: 'Final adjustment - clearing conversion status for zero-value call',
            targetId: targetId
        };

        const step2Result = await updateCallPayment(accountId, apiToken)(callId, step2Payload)();

        if (step2Result._tag === 'Left') {
            throw new Error(`Step 2 failed: ${step2Result.left.message}`);
        }

        return {
            success: true,
            inboundCallId: callId,
            callerId: call['tag:InboundNumber:Number'] || 'Unknown'
        };

    } catch (error) {
        return {
            success: false,
            inboundCallId: callId,
            callerId: call['tag:InboundNumber:Number'] || 'Unknown',
            error: error.message
        };
    }
};

/**
 * Main sync function
 */
export const syncZeroPayoutFix = async (config, dateRange) => {
    const accountId = config.ringbaAccountId;
    const apiToken = config.ringbaApiToken;

    if (!accountId || !apiToken) {
        throw new Error('Ringba account ID and API token are required');
    }

    const startDate = new Date(dateRange.startDate);
    const endDate = new Date(dateRange.endDate);
    endDate.setHours(23, 59, 59, 999);

    console.log('');
    console.log('='.repeat(70));
    console.log('Ringba Zero-Payout Fix - Automated Sync');
    console.log('='.repeat(70));
    console.log(`Date Range: ${dateRange.startDateFormatted} to ${dateRange.endDateFormatted}`);
    console.log(`Start: ${startDate.toISOString()}`);
    console.log(`End: ${endDate.toISOString()}`);
    console.log('='.repeat(70));
    console.log('');

    // Step 1: Fetch calls
    console.log('[Step 1] Fetching converted zero-payout calls...');
    const calls = await fetchConvertedZeroCalls(accountId, apiToken, startDate.toISOString(), endDate.toISOString());
    console.log(`[Step 1] ✅ Found ${calls.length} calls to fix`);
    console.log('');

    if (calls.length === 0) {
        console.log('[INFO] No calls found. All calls are properly configured.');
        return {
            dateRange: {
                start: dateRange.startDateFormatted,
                end: dateRange.endDateFormatted
            },
            totalCalls: 0,
            fixed: 0,
            failed: 0
        };
    }

    // Step 2: Fix calls using two-step process
    console.log('[Step 2] Fixing calls (two-step update process)...');
    console.log('         Step 1: Set to $2.22, Step 2: Set to $0.00');
    console.log('');

    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < calls.length; i++) {
        const call = calls[i];
        console.log(`[Step 2] [${i + 1}/${calls.length}] Processing ${call.inboundCallId}...`);

        const result = await fixCall(accountId, apiToken, call);

        if (result.success) {
            fixed++;
            console.log(`         ✅ Successfully fixed`);
        } else {
            failed++;
            console.error(`         ❌ Failed: ${result.error}`);
        }

        // Delay between calls to avoid rate limiting
        if (i < calls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log('');
    console.log(`[Step 2] ✅ Fixed ${fixed} calls, ${failed} failed`);
    console.log('');

    // Summary
    const summary = {
        dateRange: {
            start: dateRange.startDateFormatted,
            end: dateRange.endDateFormatted
        },
        totalCalls: calls.length,
        fixed: fixed,
        failed: failed
    };

    console.log('='.repeat(70));
    console.log('Sync Summary');
    console.log('='.repeat(70));
    console.log(`Date Range:           ${summary.dateRange.start} to ${summary.dateRange.end}`);
    console.log(`Total Calls:          ${summary.totalCalls}`);
    console.log(`Successfully Fixed:   ${summary.fixed}`);
    console.log(`Failed:               ${summary.failed}`);
    console.log('='.repeat(70));
    console.log('');

    return summary;
};

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    // Default: last 10 days
    const daysBack = args[0] ? parseInt(args[0], 10) : 10;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const config = {
        ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
        ringbaApiToken: process.env.RINGBA_API_TOKEN
    };

    const dateRange = {
        startDate: startDate,
        endDate: endDate,
        startDateFormatted: startDate.toISOString().split('T')[0],
        endDateFormatted: endDate.toISOString().split('T')[0]
    };

    syncZeroPayoutFix(config, dateRange)
        .then(summary => {
            console.log('✅ Sync completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Sync failed:', error.message);
            if (error.stack) {
                console.error(error.stack);
            }
            process.exit(1);
        });
}
