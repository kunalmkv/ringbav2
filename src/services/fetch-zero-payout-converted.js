
import { getColumnKeyMap } from '../http/ringba-client.js';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

const fetchCalls = async (accountId, apiToken, startDate, endDate, convertedKey) => {
    let allCalls = [];
    let offset = 0;
    const size = 1000;
    let hasMore = true;

    console.log(`fetching calls from ${startDate} to ${endDate}...`);
    if (convertedKey) {
        console.log(`Requesting additional column: ${convertedKey}`);
    }

    while (hasMore) {
        const body = {
            reportStart: startDate,
            reportEnd: endDate,
            offset,
            size,
            valueColumns: [
                { column: 'inboundCallId' },
                { column: 'callDt' },
                { column: 'conversionAmount' },
                { column: 'payoutAmount' },
                { column: 'targetId' },
                { column: 'targetName' },
                { column: 'tag:InboundNumber:Number' }, // Caller ID
                { column: 'campaignName' },
                { column: 'callLengthInSeconds' }
            ]
        };

        if (convertedKey) {
            body.valueColumns.push({ column: convertedKey });
        }

        const response = await fetch(`${RINGBA_BASE_URL}/${accountId}/calllogs`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Ringba API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const records = data.report.records;

        if (records.length === 0) {
            hasMore = false;
        } else {
            if (offset === 0 && records.length > 0) {
                console.log("First record keys:", Object.keys(records[0]));
                console.log("First record sample:", JSON.stringify(records[0], null, 2));
            }
            allCalls = allCalls.concat(records);
            offset += size;
            console.log(`Fetched ${allCalls.length} calls so far...`);

            // Safety break for huge datasets if needed, or remove for full fetch
            if (records.length < size) {
                hasMore = false;
            }
        }
    }
    return allCalls;
};

const run = async () => {
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('Usage: node src/services/fetch-zero-payout-converted.js <startDate> <endDate>');
        process.exit(1);
    }

    const [startDate, endDate] = args;

    // Format dates to ISO strings if they aren't already (simple assumption: YYYY-MM-DD)
    const startISO = new Date(startDate).toISOString();
    // For end date, ensure we cover the whole day if only date is provided
    let endObj = new Date(endDate);
    if (endDate.length === 10) { // YYYY-MM-DD
        endObj.setHours(23, 59, 59, 999);
    }
    const endISO = endObj.toISOString();

    const accountId = process.env.RINGBA_ACCOUNT_ID;
    const apiToken = process.env.RINGBA_API_TOKEN;

    try {
        console.log("Resolving Ringba columns...");
        const columnMapEither = await getColumnKeyMap(accountId, apiToken)();
        if (columnMapEither._tag === 'Left') throw columnMapEither.left;
        const columnMap = columnMapEither.right;

        // Find the 'Converted' column key
        // Iterate over keys (titles/labels) to find a match for 'converted'
        let convertedKey = null;
        const possibleTitles = ['converted', 'hasconversion', 'isconverted', 'conversion'];

        for (const [title, key] of Object.entries(columnMap)) {
            if (possibleTitles.includes(title.toLowerCase())) {
                convertedKey = key;
                console.log(`Found 'Converted' column key: '${key}' (Title: ${title})`);
                break;
            }
        }

        if (!convertedKey) {
            console.warn("WARNING: Could not find explicitly named 'Converted' column. Checking for 'hasConversion' manually...");
            // Manual fallback if map lookup fails
            convertedKey = 'hasConversion';
        }

        // Add the resolved key to fetch logic (we need to pass it to fetchCalls)
        // Since fetchCalls is hardcoded with columns, we'll need to modify it or make it dynamic.
        // Actually, let's just pass the extra column to fetchCalls as an optional argument or modify fetchCalls to take a columns list.

        // RE-DEFINING fetchCalls to accept columns would be best, but for this patching,
        // I'll just pass it as a global or argument.
        // Easier: Modify fetchCalls in this closure to us `convertedKey`.
        // But fetchCalls is defined outside.
        // I will modify fetchCalls signature in a separate edit or just update the run function to pass it.

        // Let's assume I will update `fetchCalls` signature next.
        // calls = await fetchCalls(accountId, apiToken, startISO, endISO, convertedKey);

        // ... (skipping fetchCalls execution until signature updated)

        const calls = await fetchCalls(accountId, apiToken, startISO, endISO, convertedKey);

        const TARGET_IDS = [
            'PI1175ac62aa1c4748b21216666b398135',
            'TA48aa3e3f5a0544af8549703f76a24faa'
        ];

        const anomalousCalls = calls.filter(call => {
            const payout = parseFloat(call.payoutAmount || 0);
            const revenue = parseFloat(call.conversionAmount || 0);
            const duration = parseInt(call.callLengthInSeconds || 0, 10);

            // Check converted status if key was resolved
            let isConverted = false;
            let conversionInfo = "Not Converted";

            // 1. Explicit Check
            if (convertedKey && call[convertedKey] !== undefined) {
                const val = call[convertedKey];
                if (val === true || val === 'true' || val === 'YES' || val === 'Yes' || val === 1) {
                    isConverted = true;
                    conversionInfo = "Explicit (API)";
                }
            }

            // 2. Fallback Check (User says API flag is sparse)
            if (!isConverted && duration > 0) {
                isConverted = true;
                conversionInfo = "Implied (Duration > 0)";
            }

            // Filter 1: Must be one of our target IDs
            if (!TARGET_IDS.includes(call.targetId)) {
                return false;
            }

            // Filter 2: BOTH Revenue and Payout must be 0
            const isZeroMoney = payout === 0 && revenue === 0;

            if (isZeroMoney && isConverted) {
                // Enrich output for readability
                call.callerId = call['tag:InboundNumber:Number'] || call['inboundPhoneNumber'] || 'Unknown';
                call.detectionMethod = conversionInfo;
                return true;
            }
            return false;
        });

        console.log(`Found ${anomalousCalls.length} anomalous calls.`);

        if (anomalousCalls.length > 0) {
            const outputString = anomalousCalls.map(c => JSON.stringify(c)).join('\n');
            const filename = `zero_payout_converted_calls_${Date.now()}.txt`;
            fs.writeFileSync(filename, outputString);
            console.log(`Saved results to ${filename}`);
        } else {
            console.log("No anomalous calls found.");
        }

    } catch (error) {
        console.error("Error:", error);
    }
};

run();
