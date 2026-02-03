import { getCalls } from '../http/ringba-calls.js';
import { getColumnKeyMap } from '../http/ringba-client.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const CAMPAIGN_NAME_FILTER = "Appliance Repair";
const WEBHOOK_URL = 'https://insidefi.co/assembly/ringba/call-recording/submit';

// Field mapping (Output Key -> Ringba UI Label/Description or known key)
const TARGET_MAPPING = {
    "caller_id": ["tag:InboundNumber:NumberE164", "tag:InboundNumber:Number", "inboundPhoneNumber"],
    "date": ["callDt", "Call Date"],
    "campaign": ["tag:Campaign:Id", "campaignId"],
    "adset": ["tag:User:utm_adset"],
    "revenue": ["conversionAmount", "revenue"],
    "recording": ["tag:Recording:RecordingUrl", "Recording Url"],
    "locationID": ["tag:User:loc_physical_ms"],
    "endsource": ["tag:EndCall:EndCallSource"],
    "duration": ["callLengthInSeconds", "callDuration", "p:CallDuration"],
    "target": ["targetName"],
    "zip": ["tag:Geo:ZipCode", "Zip Code"],
    "publisher": ["publisherName"],
    "timetoconnect": ["timeToConnectInSeconds", "Call:TimeToConnectInSeconds"],
    "timetocall": ["timeToCallInSeconds", "Call:TimeToCallInSeconds"],
    "firstName": ["tag:Identity:First Name"],
    "lastName": ["tag:Identity:Last Name"],
    "email": ["tag:EmailAddresses:Email 1 Address"],
    "street_number": ["tag:Address:Street Number"],
    "street_name": ["tag:Address:Street Name"],
    "street_type": ["tag:Address:Street Type"],
    "city": ["tag:Address:City"],
    "state": ["tag:Address:State"],
    "billed": ["tag:Conversion:ConvertedDuringCall"],
    "latestPayout": ["payoutAmount", "payout"],
    "ringbaCost": ["callCost", "payoutAmount"],
    "utm_campaign": ["tag:User:utm_campaign"],
    "utm_adset": ["tag:User:utm_adset"]
};

// Helper to find the best matching key from the map
const resolveColumn = (map, possibleKeys) => {
    for (const key of possibleKeys) {
        // Check exact match in map values
        for (const validKey of Object.values(map)) {
            if (validKey === key) return key;
        }
        // Check case-insensitive match in map keys (UI labels)
        if (map[key.toLowerCase()]) {
            return map[key.toLowerCase()];
        }
    }
    return null;
};

const runBackfill = async () => {
    const accountId = process.env.RINGBA_ACCOUNT_ID;
    const apiToken = process.env.RINGBA_API_TOKEN;

    if (!accountId || !apiToken) {
        console.error('Missing RINGBA_ACCOUNT_ID or RINGBA_API_TOKEN');
        process.exit(1);
    }

    // CLI Arguments: node src/services/appliance-repair-backfill.js [startDate] [endDate]
    const args = process.argv.slice(2);
    let startDate = args[0];
    let endDate = args[1];

    // Default to today if no date provided
    if (!startDate) {
        const today = new Date();
        startDate = today.toISOString().split('T')[0];
        endDate = startDate;
    }

    if (startDate.match(/^\d{4}-\d{2}-\d{2}$/)) startDate += 'T00:00:00.000Z';
    if (endDate && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) endDate += 'T23:59:59.999Z';
    if (!endDate) endDate = startDate.replace('T00:00:00.000Z', 'T23:59:59.999Z');

    console.log('');
    console.log('='.repeat(70));
    console.log('Appliance Repair Webhook Backfill');
    console.log('='.repeat(70));
    console.log(`Campaign: "${CAMPAIGN_NAME_FILTER}"`);
    console.log(`Date Range: ${startDate} to ${endDate}`);
    console.log(`Webhook URL: ${WEBHOOK_URL}`);
    console.log('='.repeat(70));
    console.log('');

    try {
        // 1. Fetch available columns to resolve correct keys
        console.log('[Step 1] Resolving Ringba column keys...');
        const columnMapEither = await getColumnKeyMap(accountId, apiToken)();
        if (columnMapEither._tag === 'Left') throw columnMapEither.left;
        const columnMap = columnMapEither.right;

        // 2. Build the list of columns to request and the final mapping
        const finalMapping = {};
        const requestColumnsSet = new Set();

        // Standard columns that are always good to have
        requestColumnsSet.add('inboundCallId');

        for (const [outputKey, possibleKeys] of Object.entries(TARGET_MAPPING)) {
            const resolvedKey = resolveColumn(columnMap, possibleKeys);
            if (resolvedKey) {
                finalMapping[outputKey] = resolvedKey;
                requestColumnsSet.add(resolvedKey);
            } else {
                console.warn(`Warning: Could not resolve column for "${outputKey}"`);
            }
        }

        const requestColumns = Array.from(requestColumnsSet);
        console.log(`[Step 1] ✓ Resolved ${requestColumns.length} columns`);
        console.log('');

        // 3. Fetch calls using Campaign Name filter
        console.log('[Step 2] Fetching calls from Ringba API...');
        const filters = [
            {
                anyConditionToMatch: [
                    {
                        column: 'tag:Campaign:Name',
                        comparisonType: 'EQUALS',
                        value: CAMPAIGN_NAME_FILTER,
                        isNegativeMatch: false
                    }
                ]
            }
        ];

        const callsEither = await getCalls(accountId, apiToken)(
            filters,
            requestColumns,
            {
                startDate: startDate,
                endDate: endDate
            }
        )();
        if (callsEither._tag === 'Left') throw callsEither.left;
        const callsData = callsEither.right;
        const calls = callsData.calls;

        console.log(`[Step 2] ✓ Fetched ${calls.length} calls`);
        console.log('');

        if (calls.length === 0) {
            console.log('No calls found for the specified criteria.');
            return;
        }

        // 4. Map the data
        console.log('[Step 3] Mapping call data...');
        const mappedCalls = calls.map(call => {
            const mapped = {};
            for (const [outputKey, ringbaKey] of Object.entries(finalMapping)) {
                mapped[outputKey] = call[ringbaKey] !== undefined ? call[ringbaKey] : "";
            }
            return mapped;
        });
        console.log(`[Step 3] ✓ Mapped ${mappedCalls.length} calls`);
        console.log('');

        // 5. Save to file
        console.log('[Step 4] Saving to file...');
        const outputContent = JSON.stringify(mappedCalls, null, 2);
        const filename = `appliance_repair_backfill_${new Date().getTime()}.txt`;
        const outputPath = path.join(process.cwd(), filename);

        fs.writeFileSync(outputPath, outputContent);
        console.log(`[Step 4] ✓ Saved data to ${outputPath}`);
        console.log('');

        // 6. Post to Webhook
        console.log('[Step 5] Posting to webhook...');
        console.log(`Webhook URL: ${WEBHOOK_URL}`);
        console.log(`Total records: ${mappedCalls.length}`);
        console.log('');

        let skippedCount = 0;
        let successCount = 0;
        let failCount = 0;

        for (const [index, call] of mappedCalls.entries()) {
            // Skip if no recording
            if (!call.recording || call.recording === "") {
                skippedCount++;
                continue;
            }

            const payload = {
                caller_id: call.caller_id,
                date: call.date,
                campaign: call.campaign,
                adset: call.adset,
                revenue: call.revenue,
                recording: call.recording,
                endsource: call.endsource,
                duration: call.duration,
                target: call.target,
                zip: call.zip,
                publisher: call.publisher,
                timetoconnect: call.timetoconnect,
                timetocall: call.timetocall,
                type: "Inbound", // Hardcoded
                billed: call.billed,
                latestPayout: call.latestPayout,
                ringbaCost: call.ringbaCost,
                adCost: "0" // Hardcoded
            };

            // Ensure empty strings for missing values
            for (const key of Object.keys(payload)) {
                if (payload[key] === undefined || payload[key] === null) {
                    payload[key] = "";
                }
            }

            try {
                const response = await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    successCount++;
                    console.log(`\n[${successCount}/${mappedCalls.length - skippedCount}] Successfully posted record ${index + 1}`);
                } else {
                    failCount++;
                    const errorText = await response.text();
                    console.error(`\n[FAILED] Record ${index + 1}: ${response.status} ${response.statusText} - ${errorText}`);
                }
            } catch (err) {
                failCount++;
                console.error(`\n[ERROR] Record ${index + 1}:`, err.message);
            }

            // 20-second delay to prevent server overload
            if (index < mappedCalls.length - 1) { // Don't wait after the last record
                console.log(`[DELAY] Waiting 20 seconds before next request... (${index + 2}/${mappedCalls.length} pending)`);
                await new Promise(r => setTimeout(r, 20000));
            }
        }

        console.log('');
        console.log('');
        console.log('='.repeat(70));
        console.log('Webhook Backfill Summary');
        console.log('='.repeat(70));
        console.log(`Total Calls:          ${mappedCalls.length}`);
        console.log(`Successfully Posted:  ${successCount}`);
        console.log(`Skipped (no recording): ${skippedCount}`);
        console.log(`Failed:               ${failCount}`);
        console.log('='.repeat(70));
        console.log('');

    } catch (error) {
        console.error('');
        console.error('='.repeat(70));
        console.error('Error during backfill:');
        console.error('='.repeat(70));
        console.error(error);
        if (error.stack) {
            console.error('');
            console.error('Stack trace:');
            console.error(error.stack);
        }
        console.error('='.repeat(70));
        process.exit(1);
    }
};

// Execute
runBackfill();
