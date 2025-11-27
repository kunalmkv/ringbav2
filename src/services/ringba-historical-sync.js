/**
 * Ringba Historical Sync Service
 * 
 * Fetches historical call data from Ringba API and saves it to the call_processing_queue table.
 * This is used to retrospectively populate the table with data that wasn't captured via webhooks.
 * 
 * The service maps Ringba API response fields to the webhook-style JSONB structure used in call_processing_queue.
 * 
 * Table Structure:
 *   - id: auto-increment
 *   - status: 'pending' | 'completed' | etc.
 *   - retry_count: integer
 *   - created_at: timestamp
 *   - processed_at: timestamp
 *   - error_message: text
 *   - call_data: JSONB (contains all call details)
 *   - transcript: text (not available from API)
 *   - language: text (not available from API)
 */

import fetch from 'node-fetch';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

/**
 * Fetch all calls from Ringba API for a given date range
 * Uses the /calllogs endpoint with all available columns
 * 
 * Column naming convention (from Ringba UI):
 * - Built-in: callDt, inboundPhoneNumber, campaignId, conversionAmount, etc.
 * - Tag-based: RecordingUrl, utm_adset, TargetName, ZipCode, Identity_FirstName, etc.
 */
const fetchCallsFromRingba = async (accountId, apiToken, startDate, endDate, options = {}) => {
  const allCalls = [];
  let offset = 0;
  const pageSize = options.pageSize || 1000;
  let hasMore = true;
  
  console.log(`[Ringba Historical] Fetching calls from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  while (hasMore) {
    const url = `${RINGBA_BASE_URL}/${accountId}/calllogs`;
    const headers = {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    };
    
    // Request columns using exact names from Ringba UI
    // Built-in columns use camelCase, tag columns use specific naming
    const body = {
      reportStart: startDate.toISOString(),
      reportEnd: endDate.toISOString(),
      offset: offset,
      size: pageSize,
      formatDateTime: true,
      orderByColumns: [
        { column: 'callDt', direction: 'desc' }
      ],
      valueColumns: [
        // === Built-in Call Fields (from Ringba API docs) ===
        { column: 'inboundCallId' },
        { column: 'callDt' },
        { column: 'inboundPhoneNumber' },
        { column: 'callerId' },
        { column: 'campaignId' },
        { column: 'campaignName' },
        { column: 'targetId' },
        { column: 'targetName' },
        { column: 'publisherName' },
        
        // Financial
        { column: 'conversionAmount' },       // Revenue
        { column: 'payoutAmount' },           // Payout
        
        // Recording URL (correct column name per API docs)
        { column: 'recordingUrl' },
        
        // Call timing
        { column: 'callLengthInSeconds' },
        { column: 'timeToConnectInSeconds' },
        { column: 'timeToCallInSeconds' },
        
        // Caller ID (tag format)
        { column: 'tag:InboundNumber:Number' },
        
        // === Tag-based Fields ===
        // UTM tracking
        { column: 'tag:User:utm_adset' },
        { column: 'tag:User:loc_physical_ms' },
        
        // End call info
        { column: 'tag:EndCall:EndCallSource' },
        
        // Geo
        { column: 'tag:Geo:ZipCode' },
        
        // Caller identity
        { column: 'tag:Identity:First Name' },
        { column: 'tag:Identity:Last Name' },
        { column: 'tag:EmailAddresses:Email 1 Address' },
        
        // Address
        { column: 'tag:Address:Street Number' },
        { column: 'tag:Address:Street Name' },
        { column: 'tag:Address:Street Type' },
        { column: 'tag:Address:City' },
        { column: 'tag:Address:State' },
        
        // Conversion
        { column: 'tag:Conversion:ConvertedDuringCall' }
      ]
    };
    
    // Apply filters if specified
    if (options.targetId || options.campaignId) {
      body.filters = [
        {
          anyConditionToMatch: [
            options.targetId ? {
              column: 'targetId',
              comparisonType: 'EQUALS',
              value: options.targetId,
              isNegativeMatch: false
            } : {
              column: 'campaignId',
              comparisonType: 'EQUALS',
              value: options.campaignId,
              isNegativeMatch: false
            }
          ]
        }
      ];
    }
    
    console.log(`[Ringba Historical] Fetching page: offset=${offset}, size=${pageSize}`);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        
        // If we get a 422 error about unknown columns, try with minimal columns
        if (response.status === 422) {
          console.warn(`[Ringba Historical] Got 422 error, retrying with minimal columns...`);
          return await fetchCallsFromRingbaMinimal(accountId, apiToken, startDate, endDate, options);
        }
        
        throw new Error(`Ringba API error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      const records = data.report?.records || [];
      const totalCount = data.report?.totalCount || data.report?.total || records.length;
      
      console.log(`[Ringba Historical] Retrieved ${records.length} calls (total available: ${totalCount})`);
      
      // Log raw API response for first record to debug column names
      if (offset === 0 && records.length > 0) {
        console.log('');
        console.log('[DEBUG] === Raw API Response (First Record) ===');
        console.log('[DEBUG] All keys in record:', Object.keys(records[0]).join(', '));
        console.log('');
        
        // Check specific fields we care about
        const r = records[0];
        
        console.log('[DEBUG] Built-in fields:');
        console.log(`  - inboundCallId: ${r.inboundCallId || '(not found)'}`);
        console.log(`  - callDt: ${r.callDt || '(not found)'}`);
        console.log(`  - callerId: ${r.callerId || '(not found)'}`);
        console.log(`  - inboundPhoneNumber: ${r.inboundPhoneNumber || '(not found)'}`);
        console.log(`  - targetName: ${r.targetName || '(not found)'}`);
        console.log(`  - publisherName: ${r.publisherName || '(not found)'}`);
        console.log(`  - conversionAmount: ${r.conversionAmount || '(not found)'}`);
        console.log(`  - payoutAmount: ${r.payoutAmount || '(not found)'}`);
        console.log(`  - recordingUrl: ${r.recordingUrl || '(not found)'}`);  // <-- Key field!
        console.log(`  - callLengthInSeconds: ${r.callLengthInSeconds || '(not found)'}`);
        console.log(`  - timeToConnectInSeconds: ${r.timeToConnectInSeconds || '(not found)'}`);
        console.log(`  - timeToCallInSeconds: ${r.timeToCallInSeconds || '(not found)'}`);
        
        console.log('[DEBUG] Tag-based fields:');
        console.log(`  - tag:InboundNumber:Number: ${r['tag:InboundNumber:Number'] || '(not found)'}`);
        console.log(`  - tag:Geo:ZipCode: ${r['tag:Geo:ZipCode'] || '(not found)'}`);
        console.log(`  - tag:Address:City: ${r['tag:Address:City'] || '(not found)'}`);
        console.log(`  - tag:Address:State: ${r['tag:Address:State'] || '(not found)'}`);
        console.log(`  - tag:Identity:First Name: ${r['tag:Identity:First Name'] || '(not found)'}`);
        console.log(`  - tag:Identity:Last Name: ${r['tag:Identity:Last Name'] || '(not found)'}`);
        console.log(`  - tag:User:utm_adset: ${r['tag:User:utm_adset'] || '(not found)'}`);
        console.log(`  - tag:EndCall:EndCallSource: ${r['tag:EndCall:EndCallSource'] || '(not found)'}`);
        console.log(`  - tag:Conversion:ConvertedDuringCall: ${r['tag:Conversion:ConvertedDuringCall'] || '(not found)'}`);
        
        // Check if recording URL is present
        if (r.recordingUrl) {
          console.log('');
          console.log('[DEBUG] ✅ RECORDING URL FOUND!');
          console.log(`  URL: ${r.recordingUrl.substring(0, 100)}...`);
        } else {
          console.log('');
          console.log('[DEBUG] ⚠️ No recording URL in this record');
        }
        
        console.log('');
        console.log('[DEBUG] Full first record JSON:');
        console.log(JSON.stringify(r, null, 2));
        console.log('[DEBUG] === End Raw API Response ===');
        console.log('');
      }
      
      // Process and add records
      allCalls.push(...records);
      
      // Check if there are more records
      if (records.length < pageSize || allCalls.length >= totalCount) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
      
      // Add a small delay to avoid rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
    } catch (error) {
      console.error(`[Ringba Historical] Error fetching page: ${error.message}`);
      throw error;
    }
  }
  
  console.log(`[Ringba Historical] Total calls fetched: ${allCalls.length}`);
  return allCalls;
};

/**
 * Fallback function to fetch calls with minimal columns
 * Used when the full column set causes 422 errors
 * Uses only built-in columns that are guaranteed to work
 */
const fetchCallsFromRingbaMinimal = async (accountId, apiToken, startDate, endDate, options = {}) => {
  const allCalls = [];
  let offset = 0;
  const pageSize = options.pageSize || 1000;
  let hasMore = true;
  
  console.log(`[Ringba Historical] Using minimal columns fallback (built-in columns only)...`);
  
  while (hasMore) {
    const url = `${RINGBA_BASE_URL}/${accountId}/calllogs`;
    const headers = {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    };
    
    // Minimal set of built-in columns guaranteed to work
    const body = {
      reportStart: startDate.toISOString(),
      reportEnd: endDate.toISOString(),
      offset: offset,
      size: pageSize,
      formatDateTime: true,
      orderByColumns: [
        { column: 'callDt', direction: 'desc' }
      ],
      valueColumns: [
        // Built-in columns proven to work (from ringba-target-calls.js)
        { column: 'inboundCallId' },
        { column: 'callDt' },
        { column: 'targetName' },
        { column: 'targetId' },
        { column: 'conversionAmount' },  // Revenue
        { column: 'payoutAmount' },      // Payout
        { column: 'inboundPhoneNumber' },
        { column: 'tag:InboundNumber:Number' }, // Caller ID
        { column: 'campaignName' },
        { column: 'campaignId' },
        { column: 'publisherName' },
        // Recording URL (per API docs)
        { column: 'recordingUrl' }
      ]
    };
    
    // Apply filters if specified
    if (options.targetId || options.campaignId) {
      body.filters = [
        {
          anyConditionToMatch: [
            options.targetId ? {
              column: 'targetId',
              comparisonType: 'EQUALS',
              value: options.targetId,
              isNegativeMatch: false
            } : {
              column: 'campaignId',
              comparisonType: 'EQUALS',
              value: options.campaignId,
              isNegativeMatch: false
            }
          ]
        }
      ];
    }
    
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
    const totalCount = data.report?.totalCount || data.report?.total || records.length;
    
    console.log(`[Ringba Historical] Retrieved ${records.length} calls (total available: ${totalCount})`);
    
    // Debug: Log first record in minimal fallback
    if (offset === 0 && records.length > 0) {
      const r = records[0];
      console.log('');
      console.log('[DEBUG MINIMAL] === First Record ===');
      console.log('[DEBUG MINIMAL] Keys:', Object.keys(r).join(', '));
      console.log(`[DEBUG MINIMAL] recordingUrl: ${r.recordingUrl || '(not found)'}`);
      if (r.recordingUrl) {
        console.log('[DEBUG MINIMAL] ✅ RECORDING URL FOUND!');
        console.log(`[DEBUG MINIMAL] URL: ${r.recordingUrl.substring(0, 80)}...`);
      }
      console.log('');
    }
    
    allCalls.push(...records);
    
    if (records.length < pageSize || allCalls.length >= totalCount) {
      hasMore = false;
    } else {
      offset += pageSize;
    }
    
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return allCalls;
};

/**
 * Format date to match webhook format: "MM/DD/YYYY H:MM:SS AM/PM"
 */
const formatDateForWebhook = (dateStr) => {
  if (!dateStr) return null;
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    
    // Format to match webhook: "11/26/2025 9:48:06 PM"
    const month = String(date.getMonth() + 1);
    const day = String(date.getDate());
    const year = date.getFullYear();
    
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    
    return `${month}/${day}/${year} ${hours}:${minutes}:${seconds} ${ampm}`;
  } catch (e) {
    return dateStr;
  }
};

/**
 * Map Ringba API response to call_data JSONB format (matching webhook structure)
 * 
 * Column name mapping (API response -> webhook field):
 * Uses tag: prefix format for tag-based columns
 */
const mapRingbaCallToCallData = (record) => {
  // Get caller ID - try tag format first, then built-in callerId, then inboundPhoneNumber
  const callerId = record['tag:InboundNumber:Number'] || 
                   record.callerId ||
                   record.inboundPhoneNumber || 'NA';
  
  // Get recording URL (built-in column per API docs)
  const recordingUrl = record.recordingUrl || 'NA';
  
  // Get zip code (tag-based column)
  const zip = record['tag:Geo:ZipCode'] || 'NA';
  
  // Get city and state (tag-based columns)
  const city = record['tag:Address:City'] || 'NA';
  const state = record['tag:Address:State'] || 'NA';
  
  // Get target name (built-in)
  const target = record.targetName || 'NA';
  
  // Get publisher name (built-in)
  const publisher = record.publisherName || 'NA';
  
  // Format date to match webhook format
  const formattedDate = formatDateForWebhook(record.callDt);
  
  // Get billed status
  const convertedDuringCall = record['tag:Conversion:ConvertedDuringCall'];
  const billed = convertedDuringCall === true || 
                 convertedDuringCall === 'true' || 
                 convertedDuringCall === 'yes' || 
                 convertedDuringCall === 'Yes' ? 'true' : 'NA';
  
  // Get duration from built-in column (callLengthInSeconds)
  const duration = record.callLengthInSeconds || 0;
  
  // Build call_data JSONB matching exact webhook structure
  const callData = {
    // Call identification
    caller_id: callerId,
    date: formattedDate || 'NA',
    
    // Campaign and routing
    campaign: record.campaignId || 'NA',
    target: target,
    publisher: publisher,
    
    // UTM tracking (tag-based columns)
    adset: record['tag:User:utm_adset'] || 'NA',
    locationID: record['tag:User:loc_physical_ms'] || 'NA',
    term: 'NA', // Not commonly available
    
    // Financial (built-in columns)
    revenue: String(parseFloat(record.conversionAmount) || 0),
    latestPayout: String(parseFloat(record.payoutAmount) || 0),
    ringbaCost: '0', // callCost not available in this API call
    adCost: '0',
    
    // Call details (built-in columns)
    duration: String(parseInt(duration) || 0),
    timetoconnect: String(parseInt(record.timeToConnectInSeconds) || 0),
    timetocall: String(parseInt(record.timeToCallInSeconds) || 0),
    endsource: record['tag:EndCall:EndCallSource'] || 'NA',
    billed: billed,
    
    // Call type
    type: 'Inbound',
    
    // Recording (built-in column per API docs)
    recording: recordingUrl,
    
    // Caller identity (tag-based columns)
    firstName: record['tag:Identity:First Name'] || 'NA',
    lastName: record['tag:Identity:Last Name'] || 'NA',
    email: record['tag:EmailAddresses:Email 1 Address'] || 'NA',
    
    // Address (tag-based columns)
    street_number: record['tag:Address:Street Number'] || 'NA',
    street_name: record['tag:Address:Street Name'] || 'NA',
    street_type: record['tag:Address:Street Type'] || 'NA',
    address: 'NA',
    city: city,
    state: state,
    zip: zip
  };
  
  return {
    ringbaCallId: record.inboundCallId,
    callData: callData
  };
};

/**
 * Save calls to call_processing_queue table
 * Uses UPSERT logic - inserts new records, updates existing ones
 * Status is set to 'pending' for processing by downstream services
 */
const saveCallsToDatabase = async (pool, mappedCalls) => {
  const client = await pool.connect();
  
  let inserted = 0;
  let updated = 0;
  let skippedNoId = 0;
  let errors = 0;
  
  try {
    console.log(`[Ringba Historical] Saving ${mappedCalls.length} calls to database...`);
    
    for (const { ringbaCallId, callData } of mappedCalls) {
      // Only skip if there's no Ringba call ID
      if (!ringbaCallId) {
        skippedNoId++;
        continue;
      }
      
      try {
        // Check if call already exists (using caller_id and date from call_data)
        const checkQuery = `
          SELECT id, call_data FROM call_processing_queue 
          WHERE call_data->>'caller_id' = $1 
          AND call_data->>'date' = $2
          LIMIT 1;
        `;
        const checkResult = await client.query(checkQuery, [
          callData.caller_id,
          callData.date
        ]);
        
        if (checkResult.rows.length > 0) {
          // Record exists - UPDATE it with new data (merge call_data)
          const existingId = checkResult.rows[0].id;
          const existingCallData = checkResult.rows[0].call_data || {};
          
          // Merge: new data overwrites existing, but keep existing values if new is 'NA'
          const mergedCallData = { ...existingCallData };
          for (const [key, value] of Object.entries(callData)) {
            // Only update if new value is not 'NA' or if existing is 'NA'/null/undefined
            if (value !== 'NA' || !existingCallData[key] || existingCallData[key] === 'NA') {
              mergedCallData[key] = value;
            }
          }
          
          const updateQuery = `
            UPDATE call_processing_queue 
            SET 
              call_data = $1,
              status = 'pending'
            WHERE id = $2;
          `;
          
          await client.query(updateQuery, [JSON.stringify(mergedCallData), existingId]);
          updated++;
          
        } else {
          // Record doesn't exist - INSERT new record
          const insertQuery = `
            INSERT INTO call_processing_queue (
              status,
              retry_count,
              call_data,
              created_at
            ) VALUES (
              'pending',
              0,
              $1,
              CURRENT_TIMESTAMP
            );
          `;
          
          await client.query(insertQuery, [JSON.stringify(callData)]);
          inserted++;
        }
        
      } catch (error) {
        errors++;
        console.error(`[Ringba Historical] Error saving call ${ringbaCallId}: ${error.message}`);
      }
    }
    
    console.log(`[Ringba Historical] Database save complete:`);
    console.log(`  - Inserted: ${inserted}`);
    console.log(`  - Updated: ${updated}`);
    console.log(`  - Skipped (no ID): ${skippedNoId}`);
    console.log(`  - Errors: ${errors}`);
    
    return { inserted, updated, skipped: skippedNoId, errors };
    
  } finally {
    client.release();
  }
};

/**
 * Main function to sync historical Ringba data
 */
export const syncHistoricalRingbaData = async (config, dateRange, options = {}) => {
  const { startDate, endDate } = dateRange;
  
  console.log('======================================================================');
  console.log('Ringba Historical Sync');
  console.log('======================================================================');
  console.log(`Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  if (options.targetId) console.log(`Target ID: ${options.targetId}`);
  if (options.campaignId) console.log(`Campaign ID: ${options.campaignId}`);
  console.log('======================================================================');
  console.log('');
  
  const pool = new Pool({
    host: config.dbHost,
    port: config.dbPort,
    database: config.dbName,
    user: config.dbUser,
    password: config.dbPassword,
    ssl: config.dbSsl ? { rejectUnauthorized: false } : false
  });
  
  try {
    // Step 1: Fetch calls from Ringba
    console.log('[Step 1] Fetching calls from Ringba API...');
    const rawCalls = await fetchCallsFromRingba(
      config.ringbaAccountId,
      config.ringbaApiToken,
      startDate,
      endDate,
      options
    );
    
    if (rawCalls.length === 0) {
      console.log('[INFO] No calls found in the specified date range');
      return { success: true, callsFetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };
    }
    
    // Step 2: Map calls to database format (JSONB call_data)
    console.log('[Step 2] Mapping calls to database format...');
    const mappedCalls = rawCalls.map(mapRingbaCallToCallData);
    console.log(`[Step 2] ✅ Mapped ${mappedCalls.length} calls`);
    
    // Show sample of mapped data
    if (mappedCalls.length > 0) {
      console.log('');
      console.log('[Sample] First mapped call_data:');
      console.log(JSON.stringify(mappedCalls[0].callData, null, 2));
      console.log('');
    }
    
    // Step 3: Save to database
    console.log('[Step 3] Saving calls to database...');
    const saveResult = await saveCallsToDatabase(pool, mappedCalls);
    
    // Summary
    console.log('');
    console.log('======================================================================');
    console.log('Sync Summary');
    console.log('======================================================================');
    console.log(`Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`Calls Fetched: ${rawCalls.length}`);
    console.log(`Inserted: ${saveResult.inserted}`);
    console.log(`Updated: ${saveResult.updated}`);
    console.log(`Skipped (no ID): ${saveResult.skipped}`);
    console.log(`Errors: ${saveResult.errors}`);
    console.log(`Total Processed: ${saveResult.inserted + saveResult.updated}`);
    console.log('======================================================================');
    
    return {
      success: true,
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
      callsFetched: rawCalls.length,
      ...saveResult
    };
    
  } catch (error) {
    console.error(`[ERROR] Sync failed: ${error.message}`);
    throw error;
  } finally {
    await pool.end();
  }
};

/**
 * Build config from environment variables
 */
export const buildConfig = () => {
  return {
    dbHost: process.env.DB_HOST || process.env.POSTGRES_HOST || 'localhost',
    dbPort: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
    dbName: process.env.DB_NAME || process.env.POSTGRES_DB_NAME || 'postgres',
    dbUser: process.env.DB_USER || process.env.POSTGRES_USER_NAME,
    dbPassword: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
    dbSsl: process.env.DB_SSL === 'true',
    ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
    ringbaApiToken: process.env.RINGBA_API_TOKEN
  };
};

export default {
  syncHistoricalRingbaData,
  buildConfig,
  fetchCallsFromRingba,
  mapRingbaCallToCallData,
  saveCallsToDatabase
};
