// Service to fetch and save Ringba campaign summary data using hybrid API approach (v2)
// Uses /insights API for totalCost and /calllogs API for call details (connected calls, etc.)
// Tracks RPC (Revenue Per Call), total calls, connected calls per day per campaign

import { dbOps } from '../database/postgres-operations.js';
import { TARGET_IDS } from '../http/ringba-target-calls.js';
import fetch from 'node-fetch';

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

/**
 * Fetch totalCost from Ringba Insights API
 * This is the only metric reliably available from the insights endpoint
 */
const getTotalCostFromInsights = async (accountId, apiToken, filterColumn, filterValue, startDate, endDate) => {
  const url = `${RINGBA_BASE_URL}/${accountId}/insights`;
  const headers = {
    'Authorization': `Token ${apiToken}`,
    'Content-Type': 'application/json'
  };
  
  const body = {
    reportStart: startDate.toISOString(),
    reportEnd: endDate.toISOString(),
    valueColumns: [
      { column: 'totalCost' }
    ],
    filters: [
      {
        anyConditionToMatch: [
          {
            column: filterColumn,
            comparisonType: 'EQUALS',
            value: filterValue,
            isNegativeMatch: false
          }
        ]
      }
    ]
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error response');
    console.warn(`[Campaign Summary V2] Insights API error: ${errorText}`);
    return 0;
  }
  
  const data = await response.json();
  
  // Extract totalCost from response
  let totalCost = 0;
  if (data.report) {
    if (data.report.records && data.report.records.length > 0) {
      totalCost = Number(data.report.records[0].totalCost || 0);
    } else if (data.report.aggregated) {
      totalCost = Number(data.report.aggregated.totalCost || 0);
    } else if (data.report.summary) {
      totalCost = Number(data.report.summary.totalCost || 0);
    }
  } else if (data.totalCost !== undefined) {
    totalCost = Number(data.totalCost);
  }
  
  return totalCost;
};

/**
 * Fetch call logs from Ringba /calllogs API
 * Uses hasConnected filter to get connected/not connected calls
 * 
 * @param {string} accountId - Ringba account ID
 * @param {string} apiToken - Ringba API token
 * @param {string} filterColumn - Column to filter by (targetId, campaignId)
 * @param {string} filterValue - Value to filter
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string|null} hasConnected - Filter: "yes" for connected, "no" for not connected, null for all
 * @returns {Promise<{calls: Array, totalCount: number}>}
 */
const getCallLogs = async (accountId, apiToken, filterColumn, filterValue, startDate, endDate, hasConnected = null) => {
  const url = `${RINGBA_BASE_URL}/${accountId}/calllogs`;
  const headers = {
    'Authorization': `Token ${apiToken}`,
    'Content-Type': 'application/json'
  };
  
  // Build filters array
  const filters = [
    {
      anyConditionToMatch: [
        {
          column: filterColumn,
          comparisonType: 'EQUALS',
          value: filterValue,
          isNegativeMatch: false
        }
      ]
    }
  ];
  
  // Add hasConnected filter if specified
  if (hasConnected !== null) {
    filters.push({
      anyConditionToMatch: [
        {
          column: 'hasConnected',
          comparisonType: 'EQUALS',
          value: hasConnected,
          isNegativeMatch: false
        }
      ]
    });
  }
  
  const body = {
    reportStart: startDate.toISOString(),
    reportEnd: endDate.toISOString(),
    offset: 0,
    size: 1000,
    orderByColumns: [
      { column: 'callDt', direction: 'desc' }
    ],
    valueColumns: [
      // Core call identification
      { column: 'inboundCallId' },
      { column: 'callDt' },
      { column: 'targetName' },
      { column: 'targetId' },
      // Financial data
      { column: 'conversionAmount' },  // Revenue
      { column: 'payoutAmount' },      // Payout
      // Call routing
      { column: 'inboundPhoneNumber' },
      { column: 'tag:InboundNumber:Number' }, // Caller ID
      // Campaign info
      { column: 'campaignName' },
      { column: 'publisherName' }
    ],
    filters: filters,
    formatDateTime: true
  };
  
  const allCalls = [];
  let offset = 0;
  let hasMore = true;
  let totalCount = 0;
  
  while (hasMore) {
    body.offset = offset;
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error response');
      throw new Error(`Ringba CallLogs API error ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    const records = data.report?.records || [];
    totalCount = data.report?.totalCount || data.report?.total || records.length;
    
    // Process records
    for (const record of records) {
      allCalls.push({
        inboundCallId: record.inboundCallId || null,
        callDate: record.callDt || null,
        targetId: record.targetId || filterValue,
        targetName: record.targetName || null,
        revenue: Number(record.conversionAmount || 0),
        payout: Number(record.payoutAmount || 0),
        inboundPhoneNumber: record.inboundPhoneNumber || null,
        callerId: record['tag:InboundNumber:Number'] || null,
        campaignName: record.campaignName || null,
        publisherName: record.publisherName || null
      });
    }
    
    // Check if there are more records
    if (records.length < 1000 || allCalls.length >= totalCount) {
      hasMore = false;
    } else {
      offset += 1000;
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return { calls: allCalls, totalCount: Math.max(totalCount, allCalls.length) };
};

/**
 * Fetch call statistics using /calllogs API with hasConnected filter
 * Gets total calls, connected calls, and financial data
 */
const getCallStats = async (accountId, apiToken, filterColumn, filterValue, startDate, endDate) => {
  console.log(`[Campaign Summary V2] Fetching call stats from /calllogs API...`);
  
  // Fetch ALL calls (no hasConnected filter)
  console.log(`[Campaign Summary V2] Fetching all calls...`);
  const allCallsResult = await getCallLogs(accountId, apiToken, filterColumn, filterValue, startDate, endDate, null);
  const allCalls = allCallsResult.calls;
  const totalCalls = allCallsResult.totalCount;
  
  console.log(`[Campaign Summary V2] Total calls fetched: ${totalCalls}`);
  
  // Fetch CONNECTED calls only (hasConnected = "yes")
  console.log(`[Campaign Summary V2] Fetching connected calls (hasConnected=yes)...`);
  const connectedResult = await getCallLogs(accountId, apiToken, filterColumn, filterValue, startDate, endDate, 'yes');
  const connectedCalls = connectedResult.totalCount;
  
  console.log(`[Campaign Summary V2] Connected calls: ${connectedCalls}`);
  
  // Calculate financial totals from all calls
  let totalRevenue = 0;
  let totalPayout = 0;
  
  for (const call of allCalls) {
    totalRevenue += call.revenue;
    totalPayout += call.payout;
  }
  
  // Get campaign/target name from first call if available
  const campaignName = allCalls.length > 0 ? allCalls[0].campaignName : null;
  const targetName = allCalls.length > 0 ? allCalls[0].targetName : null;
  
  return {
    totalCalls,
    connectedCalls,
    noConnections: totalCalls - connectedCalls,
    totalRevenue,
    totalPayout,
    campaignName,
    targetName,
    calls: allCalls
  };
};

/**
 * Fetch campaign summary for a specific date using hybrid API approach
 * - Uses /insights API for totalCost (telco cost)
 * - Uses /calllogs API with hasConnected filter for call details
 * Can fetch by campaignId or targetId
 */
const fetchCampaignSummary = async (accountId, apiToken, identifier, identifierName, date, useCampaignId = false) => {
  try {
    // Set date range to cover the entire day (start of day to end of day) in UTC
    let year, month, day;
    
    if (typeof date === 'string') {
      // Parse YYYY-MM-DD format
      const parts = date.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      day = parseInt(parts[2], 10);
    } else {
      // Extract from Date object using UTC methods to avoid timezone shifts
      year = date.getUTCFullYear();
      month = date.getUTCMonth();
      day = date.getUTCDate();
    }
    
    // Create start date: YYYY-MM-DD 00:00:00.000 UTC
    const startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    
    // Create end date: YYYY-MM-DD 23:59:59.999 UTC
    const endDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    
    const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
    const filterColumn = useCampaignId ? 'campaignId' : 'targetId';
    
    console.log(`[Campaign Summary V2] Fetching data for ${identifierName} on ${dateStr}`);
    console.log(`[Campaign Summary V2] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`[Campaign Summary V2] Filter: ${filterColumn} = ${identifier}`);
    
    // Step 1: Get totalCost from /insights API
    console.log(`[Campaign Summary V2] Step 1: Fetching totalCost from /insights API...`);
    const totalCost = await getTotalCostFromInsights(accountId, apiToken, filterColumn, identifier, startDate, endDate);
    console.log(`[Campaign Summary V2] Total Cost from Insights: $${totalCost.toFixed(2)}`);
    
    // Step 2: Get call stats from /calllogs API (uses hasConnected filter)
    console.log(`[Campaign Summary V2] Step 2: Fetching call stats from /calllogs API...`);
    const callStats = await getCallStats(accountId, apiToken, filterColumn, identifier, startDate, endDate);
    
    const { totalCalls, connectedCalls, noConnections, totalRevenue, totalPayout } = callStats;
    
    // Get campaign/target name from call data if available
    const campaignName = callStats.campaignName || identifierName || 'Unknown Campaign';
    const targetName = callStats.targetName || identifierName;
    
    // Calculate derived metrics
    const rpc = totalCalls > 0 ? totalRevenue / totalCalls : 0;
    const connectionRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;
    const profit = totalRevenue - totalPayout;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    
    const summary = {
      campaignName: campaignName,
      targetId: useCampaignId ? null : identifier,
      targetName: targetName,
      campaignId: useCampaignId ? identifier : null,
      summaryDate: dateStr,
      totalCalls: totalCalls,                    // Total incoming calls (from /calllogs)
      revenue: parseFloat(totalRevenue.toFixed(2)),
      payout: parseFloat(totalPayout.toFixed(2)),
      rpc: parseFloat(rpc.toFixed(2)),
      totalCallLengthSeconds: 0,                 // Not available without extended columns
      averageCallLengthSeconds: 0,
      totalCost: parseFloat(totalCost.toFixed(2)), // From /insights API
      telco: parseFloat(totalCost.toFixed(2)),    // Telco is same as total_cost
      noConnections: noConnections,              // Calls that didn't connect (calculated)
      duplicates: 0,
      blocked: 0,
      ivrHandled: 0,
      profit: parseFloat(profit.toFixed(2)),
      margin: parseFloat(margin.toFixed(2)),
      conversionRate: 0,
      // Connected calls from /calllogs API with hasConnected filter
      connectedCalls: connectedCalls,           // Connected calls (from hasConnected=yes)
      connectionRate: parseFloat(connectionRate.toFixed(2)),
      totalTalkTime: 0,
      averageTalkTime: 0,
      totalWaitTime: 0,
      averageWaitTime: 0,
      totalHoldTime: 0,
      averageHoldTime: 0,
      totalTimeToAnswer: 0,
      averageTimeToAnswer: 0,
      totalPostCallDuration: 0,
      averagePostCallDuration: 0,
      callsWithRecordings: 0,
      totalRecordingDuration: 0,
      averageRecordingDuration: 0,
      totalTransfers: 0,
      averageTransfers: 0,
      totalConferences: 0,
      averageConferences: 0,
      reroutedCalls: 0,
      rootCalls: totalCalls,
      averageQualityScore: null,
      topStates: null,
      topCities: null,
      deviceTypeDistribution: null,
      sourceDistribution: null,
      mediumDistribution: null
    };
    
    console.log(`[Campaign Summary V2] Calculated summary for ${targetName}:`);
    console.log(`  - Total Calls (Incoming): ${summary.totalCalls}`);
    console.log(`  - Connected Calls: ${summary.connectedCalls} (${summary.connectionRate.toFixed(1)}%)`);
    console.log(`  - No Connections: ${summary.noConnections}`);
    console.log(`  - Total Cost (Telco): $${summary.totalCost}`);
    console.log(`  - Revenue: $${summary.revenue}`);
    console.log(`  - Payout: $${summary.payout}`);
    console.log(`  - RPC: $${summary.rpc}`);
    console.log(`  - Profit: $${summary.profit}`);
    console.log(`  - Margin: ${summary.margin.toFixed(1)}%`);
    
    return summary;
  } catch (error) {
    console.error(`[Campaign Summary V2] Error fetching summary for ${identifierName}:`, error.message);
    throw error;
  }
};

/**
 * Save campaign summary to database
 * Uses the same saveCampaignSummary function structure as v1
 */
const saveCampaignSummary = async (db, summary) => {
  try {
    // Build dynamic query to handle optional extended columns
    // Check if extended columns exist by querying information_schema
    let hasExtendedColumns = false;
    let hasTelco = false;
    try {
      const checkQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ringba_campaign_summary' 
        AND column_name = 'connected_calls'
      `;
      const checkResult = await db.pool.query(checkQuery);
      hasExtendedColumns = checkResult.rows.length > 0;
      
      // Check if telco column exists
      const checkTelcoQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ringba_campaign_summary' 
        AND column_name = 'telco'
      `;
      const checkTelcoResult = await db.pool.query(checkTelcoQuery);
      hasTelco = checkTelcoResult.rows.length > 0;
    } catch (e) {
      // Extended columns don't exist yet, use basic query
      hasExtendedColumns = false;
      hasTelco = false;
    }
    
    let query, params;
    
    if (hasExtendedColumns) {
      // Build column list and values based on whether telco exists
      const telcoColumn = hasTelco ? ', telco' : '';
      const telcoValue = hasTelco ? ', $47' : '';
      
      // Full query with all extended columns
      query = `
        INSERT INTO ringba_campaign_summary (
          campaign_name, campaign_id, target_id, target_name, summary_date,
          total_calls, revenue, payout, rpc,
          total_call_length_seconds, average_call_length_seconds, total_cost,
          no_connections, duplicates, blocked, ivr_handled,
          profit, margin, conversion_rate,
          connected_calls, connection_rate,
          total_talk_time, average_talk_time,
          total_wait_time, average_wait_time,
          total_hold_time, average_hold_time,
          total_time_to_answer, average_time_to_answer,
          total_post_call_duration, average_post_call_duration,
          calls_with_recordings, total_recording_duration, average_recording_duration,
          total_transfers, average_transfers,
          total_conferences, average_conferences,
          rerouted_calls, root_calls,
          average_quality_score,
          top_states, top_cities,
          device_type_distribution, source_distribution, medium_distribution${telcoColumn}
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46${telcoValue}
        )
        ON CONFLICT (campaign_name, summary_date)
        DO UPDATE SET
          campaign_id = EXCLUDED.campaign_id,
          target_id = EXCLUDED.target_id,
          target_name = EXCLUDED.target_name,
          total_calls = EXCLUDED.total_calls,
          revenue = EXCLUDED.revenue,
          payout = EXCLUDED.payout,
          rpc = EXCLUDED.rpc,
          total_call_length_seconds = EXCLUDED.total_call_length_seconds,
          average_call_length_seconds = EXCLUDED.average_call_length_seconds,
          total_cost = EXCLUDED.total_cost,
          no_connections = EXCLUDED.no_connections,
          duplicates = EXCLUDED.duplicates,
          blocked = EXCLUDED.blocked,
          ivr_handled = EXCLUDED.ivr_handled,
          profit = EXCLUDED.profit,
          margin = EXCLUDED.margin,
          conversion_rate = EXCLUDED.conversion_rate,
          connected_calls = EXCLUDED.connected_calls,
          connection_rate = EXCLUDED.connection_rate,
          total_talk_time = EXCLUDED.total_talk_time,
          average_talk_time = EXCLUDED.average_talk_time,
          total_wait_time = EXCLUDED.total_wait_time,
          average_wait_time = EXCLUDED.average_wait_time,
          total_hold_time = EXCLUDED.total_hold_time,
          average_hold_time = EXCLUDED.average_hold_time,
          total_time_to_answer = EXCLUDED.total_time_to_answer,
          average_time_to_answer = EXCLUDED.average_time_to_answer,
          total_post_call_duration = EXCLUDED.total_post_call_duration,
          average_post_call_duration = EXCLUDED.average_post_call_duration,
          calls_with_recordings = EXCLUDED.calls_with_recordings,
          total_recording_duration = EXCLUDED.total_recording_duration,
          average_recording_duration = EXCLUDED.average_recording_duration,
          total_transfers = EXCLUDED.total_transfers,
          average_transfers = EXCLUDED.average_transfers,
          total_conferences = EXCLUDED.total_conferences,
          average_conferences = EXCLUDED.average_conferences,
          rerouted_calls = EXCLUDED.rerouted_calls,
          root_calls = EXCLUDED.root_calls,
          average_quality_score = EXCLUDED.average_quality_score,
          top_states = EXCLUDED.top_states,
          top_cities = EXCLUDED.top_cities,
          device_type_distribution = EXCLUDED.device_type_distribution,
          source_distribution = EXCLUDED.source_distribution,
          medium_distribution = EXCLUDED.medium_distribution${hasTelco ? ',\n          telco = EXCLUDED.telco' : ''},
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;
      
      params = [
        summary.campaignName,
        summary.campaignId || null,
        summary.targetId || null,
        summary.targetName,
        summary.summaryDate,
        summary.totalCalls,
        summary.revenue,
        summary.payout,
        summary.rpc,
        summary.totalCallLengthSeconds,
        summary.averageCallLengthSeconds,
        summary.totalCost,
        summary.noConnections,
        summary.duplicates,
        summary.blocked,
        summary.ivrHandled,
        summary.profit,
        summary.margin,
        summary.conversionRate,
        summary.connectedCalls || 0,
        summary.connectionRate || 0,
        summary.totalTalkTime || 0,
        summary.averageTalkTime || 0,
        summary.totalWaitTime || 0,
        summary.averageWaitTime || 0,
        summary.totalHoldTime || 0,
        summary.averageHoldTime || 0,
        summary.totalTimeToAnswer || 0,
        summary.averageTimeToAnswer || 0,
        summary.totalPostCallDuration || 0,
        summary.averagePostCallDuration || 0,
        summary.callsWithRecordings || 0,
        summary.totalRecordingDuration || 0,
        summary.averageRecordingDuration || 0,
        summary.totalTransfers || 0,
        summary.averageTransfers || 0,
        summary.totalConferences || 0,
        summary.averageConferences || 0,
        summary.reroutedCalls || 0,
        summary.rootCalls || 0,
        summary.averageQualityScore || null,
        summary.topStates || null,
        summary.topCities || null,
        summary.deviceTypeDistribution || null,
        summary.sourceDistribution || null,
        summary.mediumDistribution || null
      ];
      
      // Add telco if column exists
      if (hasTelco) {
        params.push(summary.telco || null);
      }
    } else {
      // Basic query without extended columns (backward compatible)
      query = `
        INSERT INTO ringba_campaign_summary (
          campaign_name, campaign_id, target_id, target_name, summary_date,
          total_calls, revenue, payout, rpc,
          total_call_length_seconds, average_call_length_seconds, total_cost,
          no_connections, duplicates, blocked, ivr_handled,
          profit, margin, conversion_rate
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )
        ON CONFLICT (campaign_name, summary_date)
        DO UPDATE SET
          campaign_id = EXCLUDED.campaign_id,
          target_id = EXCLUDED.target_id,
          target_name = EXCLUDED.target_name,
          total_calls = EXCLUDED.total_calls,
          revenue = EXCLUDED.revenue,
          payout = EXCLUDED.payout,
          rpc = EXCLUDED.rpc,
          total_call_length_seconds = EXCLUDED.total_call_length_seconds,
          average_call_length_seconds = EXCLUDED.average_call_length_seconds,
          total_cost = EXCLUDED.total_cost,
          no_connections = EXCLUDED.no_connections,
          duplicates = EXCLUDED.duplicates,
          blocked = EXCLUDED.blocked,
          ivr_handled = EXCLUDED.ivr_handled,
          profit = EXCLUDED.profit,
          margin = EXCLUDED.margin,
          conversion_rate = EXCLUDED.conversion_rate,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id
      `;
      
      params = [
        summary.campaignName,
        summary.campaignId || null,
        summary.targetId || null,
        summary.targetName,
        summary.summaryDate,
        summary.totalCalls,
        summary.revenue,
        summary.payout,
        summary.rpc,
        summary.totalCallLengthSeconds,
        summary.averageCallLengthSeconds,
        summary.totalCost,
        summary.noConnections,
        summary.duplicates,
        summary.blocked,
        summary.ivrHandled,
        summary.profit,
        summary.margin,
        summary.conversionRate
      ];
    }
    
    const result = await db.pool.query(query, params);
    const savedId = result.rows[0].id;
    
    console.log(`[Campaign Summary V2] Saved summary to database (ID: ${savedId})`);
    return savedId;
  } catch (error) {
    console.error('[Campaign Summary V2] Error saving summary to database:', error.message);
    throw error;
  }
};

/**
 * Fetch and save campaign summary by campaign ID using Insights API
 */
export const syncCampaignSummaryByCampaignId = async (config, campaignId, date = null) => {
  const accountId = config.ringbaAccountId;
  const apiToken = config.ringbaApiToken;
  
  if (!accountId || !apiToken) {
    throw new Error('Ringba account ID and API token are required');
  }
  
  if (!campaignId) {
    throw new Error('Campaign ID is required');
  }
  
  const db = dbOps(config);
  
  // Use provided date or default to today
  let targetDate;
  if (date) {
    if (typeof date === 'string') {
      // Parse YYYY-MM-DD format and create in UTC
      const parts = date.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    } else {
      // Extract UTC components from Date object to avoid timezone shifts
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const day = date.getUTCDate();
      targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    }
  } else {
    // Default to today in UTC
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Ringba Campaign Summary Sync V2 (By Campaign ID - Insights API)');
  console.log('='.repeat(70));
  console.log(`Campaign ID: ${campaignId}`);
  console.log(`Date: ${targetDate.toISOString().split('T')[0]}`);
  console.log('='.repeat(70));
  console.log('');
  
  try {
    console.log(`[Campaign ID: ${campaignId}] Processing...`);
    
    // Fetch summary from Ringba Insights API by campaign ID
    const summary = await fetchCampaignSummary(
      accountId,
      apiToken,
      campaignId,
      `Campaign ${campaignId}`,
      targetDate,
      true // useCampaignId = true
    );
    
    // Save to database
    const savedId = await saveCampaignSummary(db, summary);
    
    console.log('');
    console.log('='.repeat(70));
    console.log('Sync Summary');
    console.log('='.repeat(70));
    console.log(`Campaign ID: ${campaignId}`);
    console.log(`Campaign Name: ${summary.campaignName}`);
    console.log(`Date: ${targetDate.toISOString().split('T')[0]}`);
    console.log(`Total Calls: ${summary.totalCalls}`);
    console.log(`Total Cost: $${summary.totalCost}`);
    console.log(`Revenue: $${summary.revenue}`);
    console.log(`Payout: $${summary.payout}`);
    console.log(`RPC: $${summary.rpc}`);
    console.log(`Profit: $${summary.profit}`);
    console.log(`Margin: ${summary.margin}%`);
    console.log(`Conversion Rate: ${summary.conversionRate}%`);
    console.log('='.repeat(70));
    console.log('');
    
    return {
      date: targetDate.toISOString().split('T')[0],
      campaignId: campaignId,
      summary,
      savedId,
      success: true
    };
  } catch (error) {
    console.error(`[Campaign ID: ${campaignId}] ❌ Error:`, error.message);
    throw error;
  }
};

/**
 * Main function to fetch and save campaign summary for a specific date using Insights API
 */
export const syncCampaignSummary = async (config, date = null) => {
  const accountId = config.ringbaAccountId;
  const apiToken = config.ringbaApiToken;
  
  if (!accountId || !apiToken) {
    throw new Error('Ringba account ID and API token are required');
  }
  
  const db = dbOps(config);
  
  // Use provided date or default to today
  let targetDate;
  if (date) {
    if (typeof date === 'string') {
      // Parse YYYY-MM-DD format and create in UTC
      const parts = date.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    } else {
      // Extract UTC components from Date object to avoid timezone shifts
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const day = date.getUTCDate();
      targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    }
  } else {
    // Default to today in UTC
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Ringba Campaign Summary Sync V2 (Insights API)');
  console.log('='.repeat(70));
  console.log(`Date: ${targetDate.toISOString().split('T')[0]}`);
  console.log(`Targets: ${Object.keys(TARGET_IDS).length}`);
  console.log('='.repeat(70));
  console.log('');
  
  const results = [];
  const errors = [];
  
  // Fetch summary for each target/campaign
  for (const [targetId, targetName] of Object.entries(TARGET_IDS)) {
    try {
      console.log(`\n[${targetName}] Processing...`);
      
      // Fetch summary from Ringba Insights API
      const summary = await fetchCampaignSummary(
        accountId,
        apiToken,
        targetId,
        targetName,
        targetDate
      );
      
      // Save individual campaign summary to database
      const savedId = await saveCampaignSummary(db, summary);
      
      results.push({
        targetId,
        targetName,
        summary,
        savedId,
        success: true
      });
      
      console.log(`[${targetName}] ✅ Successfully synced`);
    } catch (error) {
      console.error(`[${targetName}] ❌ Error:`, error.message);
      errors.push({
        targetId,
        targetName,
        error: error.message
      });
    }
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Sync Summary');
  console.log('='.repeat(70));
  console.log(`Date: ${targetDate.toISOString().split('T')[0]}`);
  console.log(`Successful: ${results.length}`);
  console.log(`Failed: ${errors.length}`);
  console.log('='.repeat(70));
  
  if (results.length > 0) {
    console.log('\nSuccessful syncs:');
    results.forEach(r => {
      console.log(`  - ${r.targetName}: ${r.summary.totalCalls} calls, Total Cost: $${r.summary.totalCost}, RPC: $${r.summary.rpc}, Revenue: $${r.summary.revenue}`);
    });
  }
  
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => {
      console.log(`  - ${e.targetName}: ${e.error}`);
    });
  }
  
  console.log('');
  
  return {
    date: targetDate.toISOString().split('T')[0],
    successful: results.length,
    failed: errors.length,
    results,
    errors
  };
};

