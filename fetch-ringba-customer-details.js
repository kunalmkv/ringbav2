#!/usr/bin/env node

/**
 * Fetch customer personal details from Ringba API and sync to ringba_call_data table
 * Uses correct tag names based on verified configuration
 * 
 * Usage:
 *   node fetch-ringba-customer-details.js <startDate> <endDate>
 *   Example: node fetch-ringba-customer-details.js 2026-01-01 2026-01-31
 */

import fetch from 'node-fetch';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Hardcoded database credentials
const DB_CONFIG = {

    ssl: {
        rejectUnauthorized: false
    }
};

// Ringba configuration
const RINGBA_ACCOUNT_ID = process.env.RINGBA_ACCOUNT_ID || 'RA8d14dda94480425c9897a659ed1e6453';
const RINGBA_API_TOKEN = process.env.RINGBA_API_TOKEN;
const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

// Parse CLI arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.error('Usage: node fetch-ringba-customer-details.js <startDate> <endDate>');
    console.error('Example: node fetch-ringba-customer-details.js 2026-01-01 2026-01-31');
    process.exit(1);
}

const START_DATE_ARG = args[0];
const END_DATE_ARG = args[1];

// Cache for table columns
let tableColumns = null;

/**
 * Get existing columns from ringba_call_data table
 */
async function getTableColumns(pool) {
    if (tableColumns) return tableColumns;

    const query = `
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'ringba_call_data'
    ORDER BY ordinal_position
  `;

    try {
        const result = await pool.query(query);
        tableColumns = result.rows.map(row => row.column_name);
        console.log(`\n✅ Detected ${tableColumns.length} columns in ringba_call_data table`);
        return tableColumns;
    } catch (error) {
        console.error('❌ Error reading table structure:', error.message);
        throw error;
    }
}

/**
 * Fetch calls from Ringba API for a specific date
 * Uses tag:User:* and tag:Address:* for customer details
 */
async function fetchCallsForDate(date) {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    console.log(`\n[${date}] Fetching calls from Ringba API...`);

    const url = `${RINGBA_BASE_URL}/${RINGBA_ACCOUNT_ID}/calllogs`;
    const headers = {
        'Authorization': `Token ${RINGBA_API_TOKEN}`,
        'Content-Type': 'application/json'
    };

    // Request body with correct tag names from verified configuration
    const body = {
        reportStart: startDate.toISOString(),
        reportEnd: endDate.toISOString(),
        offset: 0,
        size: 1000,
        orderByColumns: [
            { column: 'callDt', direction: 'desc' }
        ],
        valueColumns: [
            // Core call data
            { column: 'inboundCallId' },
            { column: 'callDt' },
            { column: 'campaignName' },
            { column: 'targetName' },
            { column: 'publisherName' },

            // Financial data
            { column: 'conversionAmount' },
            { column: 'payoutAmount' },

            // Call metrics
            { column: 'callLengthInSeconds' },
            { column: 'inboundPhoneNumber' },
            { column: 'number' },
            { column: 'recordingUrl' },
            { column: 'timeToConnectInSeconds' },
            { column: 'timeToCallInSeconds' },

            // Customer Identity - USER TAGS (CORRECT FORMAT!)
            { column: 'tag:User:firstName' },
            { column: 'tag:User:lastName' },
            { column: 'tag:User:first_name' },  // Alternative format
            { column: 'tag:Identity:Last Name' },  // Additional field
            { column: 'tag:Email Addresses:Email 1 Address' },
            { column: 'tag:Email Addresses:Email 2 Address' },
            { column: 'tag:Email Addresses:Email 3 Address' },

            // Customer Address - ADDRESS TAGS
            { column: 'tag:User:address' },  // From User tags
            { column: 'tag:Address:Street Number' },
            { column: 'tag:Address:Street Name' },
            { column: 'tag:Address:Street Type' },
            { column: 'tag:Address:City' },
            { column: 'tag:Address:State' },
            { column: 'tag:Address:Zip 5' },
            { column: 'tag:Address:Zip 4' },

            // Location data
            { column: 'tag:User:ipAddress' },
            { column: 'tag:User:ip_address' },
            { column: 'tag:Technology:IPAddress' },
            { column: 'tag:User:loc_physical_ms' },
            { column: 'tag:User:utm_adset' }
        ],
        filters: [
            {
                anyConditionToMatch: [
                    {
                        column: 'campaignName',
                        comparisonType: 'EQUALS',
                        value: 'Appliance Repair',
                        isNegativeMatch: false
                    }
                ]
            }
        ],
        formatDateTime: true,
        formatTimespans: true,
        formatPercentages: true
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unable to read error response');
            throw new Error(`Ringba API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const records = data.report?.records || [];

        console.log(`[${date}] ✅ Retrieved ${records.length} calls`);
        return records;
    } catch (error) {
        console.error(`[${date}] ❌ Failed to fetch calls:`, error.message);
        throw error;
    }
}

/**
 * Transform Ringba API record to database schema format
 */
function transformRecord(record) {
    // Build full address from components
    const streetNumber = record['tag:Address:Street Number'] || '';
    const streetName = record['tag:Address:Street Name'] || '';
    const streetType = record['tag:Address:Street Type'] || '';
    const fullAddress = [streetNumber, streetName, streetType].filter(Boolean).join(' ').trim() || '';

    return {
        // Core fields
        inboundCallId: record.inboundCallId || null,
        call_timestamp: record.callDt ? new Date(record.callDt) : null,
        campaignName: record.campaignName || '',
        targetName: record.targetName || '',
        publisherName: record.publisherName || '',

        // Financial data
        revenue: record.conversionAmount || 0,
        latestPayout: record.payoutAmount || 0,
        ringbaCost: parseFloat(record.ringbaCost) || 0,

        // Call metrics
        callLengthInSeconds: record.callLengthInSeconds || 0,
        phoneNumber: record.number || record.inboundPhoneNumber || '',
        recordingUrl: record.recordingUrl || '',

        // Customer Identity
        firstName: record['tag:Identity:First Name'] || record['tag:User:firstName'] || record['tag:User:first_name'] || '',
        lastName: record['tag:Identity:Last Name'] || record['tag:User:lastName'] || '',
        email: record['tag:Email Addresses:Email 1 Address'] ||
            record['tag:Email Addresses:Email 2 Address'] ||
            record['tag:Email Addresses:Email 3 Address'] || '',

        // Customer Address
        address: record['tag:User:address'] || fullAddress || '',
        city: record['tag:Address:City'] || '',
        state: record['tag:Address:State'] || '',
        g_zip: record['tag:Address:Zip 5'] || '',

        // Additional fields in attributes
        attributes: {
            ipAddress: record['tag:User:ipAddress'] || record['tag:User:ip_address'] || record['tag:Technology:IPAddress'] || '',
            locationID: record['tag:User:loc_physical_ms'] || '',
            utm_adset: record['tag:User:utm_adset'] || '',
            timeToConnect: record.timeToConnectInSeconds || 0,
            timeToCall: record.timeToCallInSeconds || 0,
            zip4: record['tag:Address:Zip 4'] || ''
        },

        // AI metadata
        processed_at: new Date(),
        ai_processed: true
    };
}

/**
 * Filter data to only include columns that exist in the table
 */
function filterDataByColumns(data, existingColumns) {
    const filtered = {};

    for (const [key, value] of Object.entries(data)) {
        if (existingColumns.includes(key)) {
            filtered[key] = value;
        }
    }

    return filtered;
}

/**
 * Build INSERT query based on available columns
 */
function buildInsertQuery(columns) {
    const insertColumns = columns.filter(col => !['id', 'created_at'].includes(col));
    const columnNames = insertColumns.map(col => `"${col}"`).join(', ');
    const placeholders = insertColumns.map((_, i) => `$${i + 1}`).join(', ');

    return `INSERT INTO ringba_call_data (${columnNames}) VALUES (${placeholders})`;
}

/**
 * Build UPDATE query based on available columns
 */
function buildUpdateQuery(columns) {
    const updateColumns = columns.filter(col =>
        !['id', 'created_at', 'inboundCallId'].includes(col)
    );

    const customerFields = ['firstName', 'lastName', 'fullName', 'email', 'phone',
        'address', 'city', 'state', 'zipCode', 'country', 'company', 'notes', 'message',
        'zip4', 'ipAddress', 'locationID', 'utm_adset'];

    const setClauses = updateColumns.map((col, i) => {
        if (customerFields.includes(col)) {
            return `"${col}" = COALESCE($${i + 1}, "${col}")`;
        } else if (col === 'updated_at') {
            return `"${col}" = NOW()`;
        } else {
            return `"${col}" = $${i + 1}`;
        }
    }).join(', ');

    return `UPDATE ringba_call_data SET ${setClauses} WHERE "inboundCallId" = $${updateColumns.length + 1}`;
}

/**
 * Upsert call data to database (INSERT or UPDATE based on existence)
 */
async function upsertCallToDatabase(pool, callData, existingColumns, exists) {
    // Filter data to only include existing columns
    const filteredData = filterDataByColumns(callData, existingColumns);

    // Add updated_at timestamp if column exists
    if (existingColumns.includes('updated_at')) {
        filteredData.updated_at = new Date();
    }

    try {
        if (exists) {
            // UPDATE existing record
            const updateCols = Object.keys(filteredData).filter(col => col !== 'inboundCallId');
            const query = buildUpdateQuery(updateCols.concat(['inboundCallId']));
            const values = updateCols.map(col => filteredData[col]).concat([filteredData.inboundCallId]);
            await pool.query(query, values);
        } else {
            // INSERT new record
            const query = buildInsertQuery(Object.keys(filteredData));
            const values = Object.values(filteredData);
            await pool.query(query, values);
        }
        return { success: true };
    } catch (error) {
        console.error(`  ❌ Failed to upsert call ${callData.inboundCallId}:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Generate array of dates between start and end
 */
function getDateRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
        dates.push(new Date(current).toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

/**
 * Main execution function
 */
async function main() {
    console.log('\n' + '='.repeat(70));
    console.log('Ringba Customer Details Sync (Unified Version)');
    console.log('='.repeat(70));
    console.log(`Date Range: ${START_DATE_ARG} to ${END_DATE_ARG}`);
    console.log(`Campaign Filter: Appliance Repair only`);
    console.log(`Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
    console.log('Mode: ANALYSIS - Identifying calls with missing timestamps (No DB writes)');
    console.log('='.repeat(70) + '\n');

    // Validate Ringba credentials
    if (!RINGBA_API_TOKEN) {
        console.error('❌ Error: RINGBA_API_TOKEN not set in environment');
        process.exit(1);
    }

    // Create database connection pool
    const pool = new Pool(DB_CONFIG);

    try {
        // Test database connection
        console.log('Testing database connection...');
        await pool.query('SELECT 1');
        console.log('✅ Database connection successful');

        // Get existing table columns
        const existingColumns = await getTableColumns(pool);

        // Generate date range
        const dates = getDateRange(START_DATE_ARG, END_DATE_ARG);
        console.log(`Processing ${dates.length} days...\n`);

        let totalCalls = 0;
        let totalInserted = 0;
        let totalUpdated = 0;
        let totalFailed = 0;
        let callsWithCustomerData = 0;
        const missingTimestampCalls = [];

        // Process each date
        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            console.log(`\n[${i + 1}/${dates.length}] Processing ${date}...`);

            try {
                // Fetch calls for this date
                const records = await fetchCallsForDate(date);
                totalCalls += records.length;

                if (records.length === 0) {
                    console.log(`[${date}] No calls found, skipping...`);
                    continue;
                }

                // Process each call
                let inserted = 0;
                let updated = 0;
                let failed = 0;
                let dateCustomerData = 0;

                for (const record of records) {
                    const callData = transformRecord(record);

                    // Track customer data stats
                    if (callData.firstName || callData.lastName || callData.email || callData.address) {
                        callsWithCustomerData++;
                        dateCustomerData++;
                    }

                    // CHECK FOR MISSING OR INVALID TIMESTAMP
                    const isInvalidDate = callData.call_timestamp instanceof Date && isNaN(callData.call_timestamp.getTime());
                    if (!callData.call_timestamp || isInvalidDate) {
                        missingTimestampCalls.push({
                            inboundCallId: callData.inboundCallId,
                            date: date,
                            phoneNumber: callData.phoneNumber,
                            campaign: callData.campaignName,
                            rawCallDt: record.callDt
                        });
                        console.warn(`  ⚠️ Missing or Invalid timestamp for call: ${callData.inboundCallId} (Raw: ${record.callDt})`);
                    }

                    /* 
                    // DATABASE WRITES DISABLED FOR ANALYSIS
                    // Check if call already exists
                    if (!callData.inboundCallId) {
                        console.warn('  ⚠️ Skipping record without inboundCallId');
                        failed++;
                        continue;
                    }

                    const checkQuery = 'SELECT "inboundCallId" FROM ringba_call_data WHERE "inboundCallId" = $1';
                    const checkResult = await pool.query(checkQuery, [callData.inboundCallId]);
                    const exists = checkResult.rows.length > 0;

                    // Upsert to database
                    const result = await upsertCallToDatabase(pool, callData, existingColumns, exists);

                    if (result.success) {
                        if (exists) {
                            updated++;
                            // console.log(`  ✅ Updated call ${callData.inboundCallId}`);
                        } else {
                            inserted++;
                            // console.log(`  ✅ Inserted call ${callData.inboundCallId}`);
                        }
                    } else {
                        failed++;
                    }
                    */
                    // For analysis, we just count "updated" as processed
                    updated++;
                }

                totalInserted += inserted;
                totalUpdated += updated;
                totalFailed += failed;

                console.log(`[${date}] ✅ Processed: ${inserted} inserted, ${updated} updated, ${failed} failed (${dateCustomerData} with customer data)`);

                // Small delay to avoid rate limiting
                if (i < dates.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`[${date}] ❌ Error processing date:`, error.message);
                totalFailed++;
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(70));
        console.log('Sync Summary');
        console.log('='.repeat(70));
        console.log(`Date Range:         ${START_DATE_ARG} to ${END_DATE_ARG}`);
        console.log(`Days Processed:     ${dates.length}`);
        console.log(`Total Calls:        ${totalCalls}`);
        console.log(`  Inserted:         ${totalInserted}`);
        console.log(`  Updated:          ${totalUpdated}`);
        console.log(`  Failed:           ${totalFailed}`);
        console.log(`With Customer Data: ${callsWithCustomerData} (${totalCalls > 0 ? ((callsWithCustomerData / totalCalls) * 100).toFixed(1) : 0}%)`);
        console.log(`Missing Timestamp:  ${missingTimestampCalls.length}`);
        console.log('='.repeat(70));

        if (missingTimestampCalls.length > 0) {
            console.log('\n❌ CALLS WITH MISSING TIMESTAMP:');
            missingTimestampCalls.forEach((call, index) => {
                console.log(`${index + 1}. [${call.date}] ID: ${call.inboundCallId} | Phone: ${call.phoneNumber}`);
            });
        } else {
            console.log('\n✅ All retrieved calls have valid timestamps!');
        }
        console.log('\n' + '='.repeat(70) + '\n');

    } catch (error) {
        console.error('\n❌ Fatal error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run main function
main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
});
