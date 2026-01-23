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
const TARGET_NAME_FILTER = "Phonely.AI";

// User requested mapping (Output Key -> Ringba UI Label/Description or known key)
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

const runSync = async () => {
    const accountId = process.env.RINGBA_ACCOUNT_ID;
    const apiToken = process.env.RINGBA_API_TOKEN;

    if (!accountId || !apiToken) {
        console.error('Missing RINGBA_ACCOUNT_ID or RINGBA_API_TOKEN');
        process.exit(1);
    }

    // CLI Arguments: node src/services/phonely-ai-sync.js [startDate] [endDate]
    const args = process.argv.slice(2);
    let startDate = args[0];
    let endDate = args[1];

    if (!startDate) {
        console.error('Usage: node src/services/phonely-ai-sync.js <startDate> [endDate]');
        process.exit(1);
    }

    if (startDate.match(/^\d{4}-\d{2}-\d{2}$/)) startDate += 'T00:00:00.000Z';
    if (endDate && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) endDate += 'T23:59:59.999Z';

    console.log(`Starting sync for Target Name: "${TARGET_NAME_FILTER}"`);
    console.log(`Date Range: ${startDate} to ${endDate || 'Now'}`);

    try {
        // 1. Fetch available columns to resolve correct keys
        console.log('Resolving Ringba column keys...');
        const columnMapEither = await getColumnKeyMap(accountId, apiToken)();
        if (columnMapEither._tag === 'Left') throw columnMapEither.left;
        const columnMap = columnMapEither.right;

        // 2. Build the list of columns to request and the final mapping
        const finalMapping = {};
        const requestColumnsSet = new Set();

        // Standard columns that are always good to have
        requestColumnsSet.add('inboundCallId');

        for (const [outKey, candidates] of Object.entries(TARGET_MAPPING)) {
            const resolvedKey = resolveColumn(columnMap, candidates);
            if (resolvedKey) {
                finalMapping[outKey] = resolvedKey;
                requestColumnsSet.add(resolvedKey);
            } else {
                console.warn(`  WARNING: Could not find Ringba column for '${outKey}'. Candidates: ${candidates.join(', ')}`);

                const firstCandidate = candidates[0];
                if (firstCandidate.startsWith('tag:')) {
                    finalMapping[outKey] = firstCandidate;
                    requestColumnsSet.add(firstCandidate);
                    console.log(`  Forcing tag column: ${firstCandidate}`);
                } else {
                    console.log(`  SKIPPING ${outKey} (not found in API columns)`);
                }
            }
        }

        const requestColumns = Array.from(requestColumnsSet);
        console.log(`Requesting ${requestColumns.length} columns.`);

        // 3. Define Filters for Target Name
        const filters = [
            {
                anyConditionToMatch: [
                    {
                        column: 'targetName', // Or 'targetId' if using ID
                        comparisonType: 'EQUALS',
                        value: TARGET_NAME_FILTER,
                        isNegativeMatch: false
                    }
                ]
            }
        ];

        // 4. Fetch Calls
        const resultEither = await getCalls(accountId, apiToken)(
            filters,
            requestColumns,
            { startDate, endDate }
        )();

        if (resultEither._tag === 'Left') throw resultEither.left;

        const { calls } = resultEither.right;
        console.log(`Fetched ${calls.length} calls.`);

        // 5. Map Data
        const mappedCalls = calls.map(record => {
            const row = {
                type: "Inbound",
                adCost: "0"
            };

            for (const [outKey, apiKey] of Object.entries(finalMapping)) {
                row[outKey] = record[apiKey] !== undefined ? record[apiKey] : "";

                // Special handling for numeric fields
                if (['revenue', 'duration', 'latestPayout', 'ringbaCost', 'timetoconnect', 'timetocall'].includes(outKey)) {
                    if (!row[outKey] && row[outKey] !== 0) row[outKey] = "0";
                    else row[outKey] = String(row[outKey]);
                }
                // Handle boolean "billed"
                if (outKey === 'billed') {
                    row[outKey] = record[apiKey] ? "true" : "false";
                }
            }

            // Defaults
            for (const outKey of Object.keys(TARGET_MAPPING)) {
                if (!row[outKey]) {
                    if (['revenue', 'duration', 'latestPayout', 'ringbaCost', 'timetoconnect', 'timetocall', 'adCost'].includes(outKey)) {
                        row[outKey] = "0";
                    } else {
                        row[outKey] = "";
                    }
                    if (outKey === "billed") row[outKey] = "false";
                    if (outKey === "type") row[outKey] = "Inbound";
                    if (outKey === "adCost") row[outKey] = "0";
                }
            }

            // Fallback for caller_id
            if ((!row.caller_id || row.caller_id === "") && record.inboundPhoneNumber) row.caller_id = record.inboundPhoneNumber;

            return row;
        });

        const outputContent = JSON.stringify(mappedCalls, null, 2);
        const filename = `phonely_ai_calls_${new Date().getTime()}.txt`;
        const outputPath = path.join(process.cwd(), filename);

        fs.writeFileSync(outputPath, outputContent);
        console.log(`Successfully saved data to ${outputPath}`);

        // 6. Post to Webhook
        const WEBHOOK_URL = 'https://insidefi.co/assembly/audio/send/urls';
        console.log(`\nPosting ${mappedCalls.length} records to webhook: ${WEBHOOK_URL}...`);

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
                type: "Inbound", // Hardcoded as per request
                billed: call.billed,
                latestPayout: call.latestPayout,
                ringbaCost: call.ringbaCost,
                adCost: "0" // Hardcoded as per request
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
                    if (successCount % 10 === 0) process.stdout.write('.'); // Progress indicator
                } else {
                    failCount++;
                    const errorText = await response.text();
                    console.error(`\nFailed to post record ${index + 1}: ${response.status} ${response.statusText} - ${errorText}`);
                }
            } catch (err) {
                failCount++;
                console.error(`\nError posting record ${index + 1}:`, err.message);
            }
            // Small delay to be nice to the server
            await new Promise(r => setTimeout(r, 50));
        }
        console.log(`\nWebhook sync completed. Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${failCount}`);

    } catch (error) {
        console.error('Error during sync:', error);
        process.exit(1);
    }
};

// Execute
runSync();
