// Service to fetch and save Ringba campaign summary data using Insights API (v2)
// Uses the /insights endpoint to fetch aggregated metrics like totalCost
// Tracks RPC (Revenue Per Call) and total calls per day per campaign

import { dbOps } from '../database/postgres-operations.js';
import { TARGET_IDS } from '../http/ringba-target-calls.js';
import fetch from 'node-fetch';

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

/**
 * Fetch insights data by campaign ID from Ringba Insights API
 */
const getInsightsByCampaignId = async (accountId, apiToken, campaignId, startDate, endDate) => {
  const url = `${RINGBA_BASE_URL}/${accountId}/insights`;
  const headers = {
    'Authorization': `Token ${apiToken}`,
    'Content-Type': 'application/json'
  };
  
  const body = {
    reportStart: startDate.toISOString(),
    reportEnd: endDate.toISOString(),
    valueColumns: [
      { column: 'totalCost' },
      { column: 'totalCalls' },           // Total incoming calls
      { column: 'completedCalls' },      // Completed calls
      { column: 'connectedCalls' },      // Connected calls
      { column: 'totalRevenue' },         // Total revenue
      { column: 'totalPayout' },         // Total payout
      { column: 'conversionCount' },     // Number of conversions
      { column: 'averageCallDuration' }, // Average call duration
      { column: 'averageTalkTime' },     // Average talk time
      { column: 'connectionRate' },      // Connection rate
      { column: 'revenuePerCall' },      // Revenue per call (RPC)
      { column: 'costPerCall' },         // Cost per call
      { column: 'profit' },              // Profit
      { column: 'margin' }               // Margin percentage
    ],
    filters: [
      {
        anyConditionToMatch: [
          {
            column: 'campaignId',
            comparisonType: 'EQUALS',
            value: campaignId,
            isNegativeMatch: false
          }
        ]
      }
    ]
  };
  
  // Try with all columns first, fall back to basic columns if needed
  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  
  // If we get a 422 error (unknown column), try with just basic columns
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error response');
    let errorJson = null;
    try {
      errorJson = JSON.parse(errorText);
    } catch (e) {
      // Not JSON, use as-is
    }
    
    // If it's a column error, try with just totalCost (the only column we know works)
    if (response.status === 422 && (errorJson?.message?.includes('Unknown value column') || errorText.includes('Unknown value column'))) {
      console.log(`[Campaign Summary V2] Column error detected, retrying with totalCost only...`);
      body.valueColumns = [
        { column: 'totalCost' }
      ];
      
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
    }
    
    if (!response.ok) {
      const finalErrorText = await response.text().catch(() => 'Unable to read error response');
      throw new Error(`Ringba Insights API error ${response.status}: ${finalErrorText}`);
    }
  }
  
  const data = await response.json();
  
  // The insights API might return data in different formats
  // Try to extract the aggregated values
  let insights = null;
  
  if (data.report) {
    // If there's a report object, check for records or aggregated data
    if (data.report.records && data.report.records.length > 0) {
      insights = data.report.records[0];
    } else if (data.report.aggregated) {
      insights = data.report.aggregated;
    } else if (data.report.summary) {
      insights = data.report.summary;
    }
  } else if (data.data) {
    insights = data.data;
  } else if (data.insights) {
    insights = data.insights;
  } else if (Array.isArray(data) && data.length > 0) {
    insights = data[0];
  } else {
    // Try to use the root object if it has the expected fields
    if (data.totalCost !== undefined || data.totalCalls !== undefined) {
      insights = data;
    }
  }
  
  return insights;
};

/**
 * Fetch insights data by target ID from Ringba Insights API
 */
const getInsightsByTargetId = async (accountId, apiToken, targetId, startDate, endDate) => {
  const url = `${RINGBA_BASE_URL}/${accountId}/insights`;
  const headers = {
    'Authorization': `Token ${apiToken}`,
    'Content-Type': 'application/json'
  };
  
  const body = {
    reportStart: startDate.toISOString(),
    reportEnd: endDate.toISOString(),
    valueColumns: [
      { column: 'totalCost' },
      { column: 'totalCalls' },           // Total incoming calls
      { column: 'completedCalls' },       // Completed calls
      { column: 'connectedCalls' },      // Connected calls
      { column: 'totalRevenue' },         // Total revenue
      { column: 'totalPayout' },         // Total payout
      { column: 'conversionCount' },      // Number of conversions
      { column: 'averageCallDuration' },  // Average call duration
      { column: 'averageTalkTime' },      // Average talk time
      { column: 'connectionRate' },      // Connection rate
      { column: 'revenuePerCall' },       // Revenue per call (RPC)
      { column: 'costPerCall' },          // Cost per call
      { column: 'profit' },               // Profit
      { column: 'margin' }                // Margin percentage
    ],
    filters: [
      {
        anyConditionToMatch: [
          {
            column: 'targetId',
            comparisonType: 'EQUALS',
            value: targetId,
            isNegativeMatch: false
          }
        ]
      }
    ]
  };
  
  // Try with all columns first, fall back to basic columns if needed
  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  
  // If we get a 422 error (unknown column), try with just basic columns
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unable to read error response');
    let errorJson = null;
    try {
      errorJson = JSON.parse(errorText);
    } catch (e) {
      // Not JSON, use as-is
    }
    
    // If it's a column error, try with just totalCost (the only column we know works)
    if (response.status === 422 && (errorJson?.message?.includes('Unknown value column') || errorText.includes('Unknown value column'))) {
      console.log(`[Campaign Summary V2] Column error detected, retrying with totalCost only...`);
      body.valueColumns = [
        { column: 'totalCost' }
      ];
      
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });
    }
    
    if (!response.ok) {
      const finalErrorText = await response.text().catch(() => 'Unable to read error response');
      throw new Error(`Ringba Insights API error ${response.status}: ${finalErrorText}`);
    }
  }
  
  const data = await response.json();
  
  // The insights API might return data in different formats
  // Try to extract the aggregated values
  let insights = null;
  
  if (data.report) {
    if (data.report.records && data.report.records.length > 0) {
      insights = data.report.records[0];
    } else if (data.report.aggregated) {
      insights = data.report.aggregated;
    } else if (data.report.summary) {
      insights = data.report.summary;
    }
  } else if (data.data) {
    insights = data.data;
  } else if (data.insights) {
    insights = data.insights;
  } else if (Array.isArray(data) && data.length > 0) {
    insights = data[0];
  } else {
    if (data.totalCost !== undefined || data.totalCalls !== undefined) {
      insights = data;
    }
  }
  
  return insights;
};

/**
 * Fetch campaign summary for a specific date from Ringba Insights API
 * Aggregates insights data to calculate RPC, total calls, revenue, payout, etc.
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
    console.log(`[Campaign Summary V2] Fetching insights for ${identifierName} on ${dateStr}`);
    console.log(`[Campaign Summary V2] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    let insights = null;
    
    if (useCampaignId) {
      // Fetch by campaign ID
      console.log(`[Campaign Summary V2] Fetching by Campaign ID: ${identifier}`);
      insights = await getInsightsByCampaignId(accountId, apiToken, identifier, startDate, endDate);
    } else {
      // Fetch by target ID
      console.log(`[Campaign Summary V2] Fetching by Target ID: ${identifier}`);
      insights = await getInsightsByTargetId(accountId, apiToken, identifier, startDate, endDate);
    }
    
    if (!insights) {
      console.log(`[Campaign Summary V2] No insights data returned for ${identifierName}`);
      // Return empty summary
      return {
        campaignName: identifierName || 'Unknown Campaign',
        targetId: useCampaignId ? null : identifier,
        targetName: identifierName,
        campaignId: useCampaignId ? identifier : null,
        summaryDate: dateStr,
        totalCalls: 0,
        revenue: 0,
        payout: 0,
        rpc: 0,
        totalCallLengthSeconds: 0,
        averageCallLengthSeconds: 0,
        totalCost: 0,
        noConnections: 0,
        duplicates: 0,
        blocked: 0,
        ivrHandled: 0,
        profit: 0,
        margin: 0,
        conversionRate: 0,
        connectedCalls: 0,
        connectionRate: 0,
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
        rootCalls: 0,
        averageQualityScore: null,
        topStates: null,
        topCities: null,
        deviceTypeDistribution: null,
        sourceDistribution: null,
        mediumDistribution: null
      };
    }
    
    console.log(`[Campaign Summary V2] Retrieved insights data for ${identifierName}`);
    console.log(`[Campaign Summary V2] Raw insights:`, JSON.stringify(insights, null, 2));
    
    // Note: Insights API appears to only support totalCost column
    // For call details (incoming calls, completed calls, etc.), we would need to use the calllogs API
    // For now, we'll fetch totalCost from Insights and use calllogs API for call details
    
    // Extract values from insights data
    // Handle different possible field names
    const totalCalls = Number(insights.totalCalls || insights.calls || insights.callCount || insights.incomingCalls || 0);
    const completedCalls = Number(insights.completedCalls || insights.completed || 0);
    const connectedCallsFromAPI = Number(insights.connectedCalls || insights.connected || 0);
    const totalRevenue = Number(insights.totalRevenue || insights.revenue || insights.conversionAmount || 0);
    const totalPayout = Number(insights.totalPayout || insights.payout || insights.payoutAmount || 0);
    const totalCost = Number(insights.totalCost || insights.cost || 0);
    const conversionCount = Number(insights.conversionCount || insights.conversions || 0);
    const averageCallDuration = Number(insights.averageCallDuration || insights.avgCallDuration || 0);
    const averageTalkTime = Number(insights.averageTalkTime || insights.avgTalkTime || 0);
    const connectionRateFromAPI = Number(insights.connectionRate || 0);
    const revenuePerCall = Number(insights.revenuePerCall || insights.rpc || 0);
    const costPerCall = Number(insights.costPerCall || 0);
    const profit = Number(insights.profit || (totalRevenue - totalPayout));
    const margin = Number(insights.margin || (totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0));
    
    // Calculate derived metrics
    const rpc = revenuePerCall > 0 ? revenuePerCall : (totalCalls > 0 ? totalRevenue / totalCalls : 0);
    const totalCallLengthSeconds = averageCallDuration * totalCalls;
    const conversionRate = totalCalls > 0 ? (conversionCount / totalCalls) * 100 : 0;
    
    // Use connectedCalls from API if available, otherwise calculate from connectionRate
    let connectedCalls = connectedCallsFromAPI;
    if (connectedCalls === 0 && connectionRateFromAPI > 0 && totalCalls > 0) {
      connectedCalls = Math.round((connectionRateFromAPI / 100) * totalCalls);
    } else if (connectedCalls === 0 && completedCalls > 0) {
      // If we have completedCalls but no connectedCalls, use completedCalls as connected
      connectedCalls = completedCalls;
    }
    
    // Calculate connection rate if not provided
    const connectionRate = connectionRateFromAPI > 0 
      ? connectionRateFromAPI 
      : (totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0);
    
    const totalTalkTime = averageTalkTime * connectedCalls;
    
    // Calculate no connections (incoming calls that didn't connect)
    const noConnections = totalCalls - connectedCalls;
    
    // Get campaign name from insights if available
    const campaignName = insights.campaignName || identifierName || 'Unknown Campaign';
    const targetName = insights.targetName || identifierName;
    
    const summary = {
      campaignName: campaignName,
      targetId: useCampaignId ? (insights.targetId || null) : identifier,
      targetName: targetName,
      campaignId: useCampaignId ? identifier : (insights.campaignId || null),
      summaryDate: dateStr,
      totalCalls: totalCalls,                    // Total incoming calls
      revenue: parseFloat(totalRevenue.toFixed(2)),
      payout: parseFloat(totalPayout.toFixed(2)),
      rpc: parseFloat(rpc.toFixed(2)),
      totalCallLengthSeconds: parseFloat(totalCallLengthSeconds.toFixed(2)),
      averageCallLengthSeconds: parseFloat(averageCallDuration.toFixed(2)),
      totalCost: parseFloat(totalCost.toFixed(2)),
      telco: parseFloat(totalCost.toFixed(2)),    // Telco is same as total_cost
      noConnections: noConnections,              // Calls that didn't connect
      duplicates: 0, // Not available in insights API
      blocked: 0, // Not available in insights API
      ivrHandled: 0, // Not available in insights API
      profit: parseFloat(profit.toFixed(2)),
      margin: parseFloat(margin.toFixed(2)),
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      // Additional metrics
      connectedCalls: connectedCalls,           // Connected calls
      connectionRate: parseFloat(connectionRate.toFixed(2)),
      totalTalkTime: parseFloat(totalTalkTime.toFixed(2)),
      averageTalkTime: parseFloat(averageTalkTime.toFixed(2)),
      totalWaitTime: 0, // Not available in insights API
      averageWaitTime: 0,
      totalHoldTime: 0, // Not available in insights API
      averageHoldTime: 0,
      totalTimeToAnswer: 0, // Not available in insights API
      averageTimeToAnswer: 0,
      totalPostCallDuration: 0, // Not available in insights API
      averagePostCallDuration: 0,
      callsWithRecordings: 0, // Not available in insights API
      totalRecordingDuration: 0,
      averageRecordingDuration: 0,
      totalTransfers: 0, // Not available in insights API
      averageTransfers: 0,
      totalConferences: 0, // Not available in insights API
      averageConferences: 0,
      reroutedCalls: 0, // Not available in insights API
      rootCalls: totalCalls,
      averageQualityScore: null, // Not available in insights API
      topStates: null, // Not available in insights API
      topCities: null, // Not available in insights API
      deviceTypeDistribution: null, // Not available in insights API
      sourceDistribution: null, // Not available in insights API
      mediumDistribution: null // Not available in insights API
    };
    
    console.log(`[Campaign Summary V2] Calculated summary for ${targetName}:`);
    console.log(`  - Total Calls (Incoming): ${summary.totalCalls}`);
    console.log(`  - Completed Calls: ${completedCalls || 'N/A'}`);
    console.log(`  - Connected Calls: ${summary.connectedCalls} (${summary.connectionRate}%)`);
    console.log(`  - No Connections: ${summary.noConnections}`);
    console.log(`  - Total Cost: $${summary.totalCost}`);
    console.log(`  - Revenue: $${summary.revenue}`);
    console.log(`  - Payout: $${summary.payout}`);
    console.log(`  - RPC: $${summary.rpc}`);
    console.log(`  - Profit: $${summary.profit}`);
    console.log(`  - Margin: ${summary.margin}%`);
    console.log(`  - Conversion Rate: ${summary.conversionRate}%`);
    console.log(`  - Conversions: ${conversionCount}`);
    console.log(`  - Average Call Duration: ${summary.averageCallLengthSeconds}s`);
    console.log(`  - Average Talk Time: ${summary.averageTalkTime}s`);
    
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

