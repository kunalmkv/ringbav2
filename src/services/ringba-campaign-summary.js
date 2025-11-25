// Service to fetch and save Ringba campaign summary data
// Tracks RPC (Revenue Per Call) and total calls per day per campaign

import { dbOps } from '../database/postgres-operations.js';
import { getCallsByTargetId } from '../http/ringba-target-calls.js';
import { TARGET_IDS } from '../http/ringba-target-calls.js';
import * as TE from 'fp-ts/lib/TaskEither.js';
import * as T from 'fp-ts/lib/Task.js';
import * as E from 'fp-ts/lib/Either.js';
import fetch from 'node-fetch';

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

/**
 * Fetch total cost from Ringba Insights API
 */
const getTotalCostFromInsights = async (accountId, apiToken, identifier, startDate, endDate, useCampaignId = false) => {
  try {
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
              column: useCampaignId ? 'campaignId' : 'targetId',
              comparisonType: 'EQUALS',
              value: identifier,
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
      // If Insights API fails, return null to fall back to payout-based calculation
      console.log(`[Campaign Summary] Insights API returned ${response.status}, will use payout as total cost`);
      return null;
    }
    
    const data = await response.json();
    
    // Try to extract totalCost from different response formats
    let totalCost = null;
    
    if (data.report) {
      if (data.report.records && data.report.records.length > 0) {
        totalCost = data.report.records[0].totalCost;
      } else if (data.report.aggregated) {
        totalCost = data.report.aggregated.totalCost;
      } else if (data.report.summary) {
        totalCost = data.report.summary.totalCost;
      }
    } else if (data.data) {
      totalCost = data.data.totalCost;
    } else if (data.insights) {
      totalCost = data.insights.totalCost;
    } else if (Array.isArray(data) && data.length > 0) {
      totalCost = data[0].totalCost;
    } else if (data.totalCost !== undefined) {
      totalCost = data.totalCost;
    }
    
    // Convert to number if it's a string
    if (totalCost !== null && totalCost !== undefined) {
      const costValue = Number(totalCost);
      if (!isNaN(costValue)) {
        console.log(`[Campaign Summary] Fetched total cost from Insights API: $${costValue}`);
        return costValue;
      }
    }
    
    return null;
  } catch (error) {
    // If there's an error fetching from Insights API, return null to fall back
    console.log(`[Campaign Summary] Error fetching total cost from Insights API: ${error.message}, will use payout as total cost`);
    return null;
  }
};

/**
 * Fetch calls by campaign ID from Ringba API
 */
const getCallsByCampaignId = async (accountId, apiToken, campaignId, startDate, endDate) => {
  const allCalls = [];
  let offset = 0;
  const pageSize = 1000;
  let hasMore = true;
  
  while (hasMore) {
    const url = `${RINGBA_BASE_URL}/${accountId}/calllogs`;
    const headers = {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json'
    };
    
    const body = {
      reportStart: startDate.toISOString(),
      reportEnd: endDate.toISOString(),
      offset: offset,
      size: pageSize,
      orderByColumns: [
        { column: 'callDt', direction: 'desc' }
      ],
          // Start with basic columns that are known to work
          // Additional columns will be tried but may not be available in all Ringba accounts
          valueColumns: [
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
            { column: 'publisherName' }
            // Note: Additional columns like callDuration, connected, etc. may not be available
            // in the /calllogs endpoint. They are available in /calllogs/detail endpoint.
            // We'll try to fetch them but handle errors gracefully.
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
      ],
      formatDateTime: true
    };
    
    // Try with basic columns first (some columns may not be available in /calllogs endpoint)
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
      
      // If it's a column error, try with basic columns only
      if (response.status === 422 && (errorJson?.message?.includes('Unknown value column') || errorText.includes('Unknown value column'))) {
        console.log(`[Campaign Summary] Column error detected, retrying with basic columns only...`);
        body.valueColumns = [
          { column: 'inboundCallId' },
          { column: 'callDt' },
          { column: 'targetName' },
          { column: 'targetId' },
          { column: 'conversionAmount' },
          { column: 'payoutAmount' },
          { column: 'inboundPhoneNumber' },
          { column: 'tag:InboundNumber:Number' },
          { column: 'campaignName' },
          { column: 'campaignId' },
          { column: 'publisherName' }
        ];
        
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });
      }
      
      if (!response.ok) {
        const finalErrorText = await response.text().catch(() => 'Unable to read error response');
        throw new Error(`Ringba API error ${response.status}: ${finalErrorText}`);
      }
    }
    
    const data = await response.json();
    const records = data.report?.records || [];
    const totalCount = data.report?.totalCount || data.report?.total || records.length;
    
    // Process records
    for (const record of records) {
      const revenue = record.conversionAmount !== undefined && record.conversionAmount !== null 
        ? Number(record.conversionAmount) 
        : 0;
      const payout = record.payoutAmount !== undefined && record.payoutAmount !== null 
        ? Number(record.payoutAmount) 
        : 0;
      
      const call = {
        inboundCallId: record.inboundCallId || null,
        callDate: record.callDt || null,
        targetId: record.targetId || null,
        targetName: record.targetName || null,
        campaignId: record.campaignId || campaignId,
        campaignName: record.campaignName || null,
        revenue: revenue,
        payout: payout,
        callDuration: record.callDuration ? Number(record.callDuration) : null,
        connected: record.connected !== undefined ? Boolean(record.connected) : null,
        reroutedFromInboundCallId: record.reroutedFromInboundCallId || null,
        rootInboundCallId: record.rootInboundCallId || null,
        postCallDuration: record.postCallDuration ? Number(record.postCallDuration) : null,
        talkTime: record.talkTime ? Number(record.talkTime) : null,
        waitTime: record.waitTime ? Number(record.waitTime) : null,
        holdTime: record.holdTime ? Number(record.holdTime) : null,
        timeToAnswer: record.timeToAnswer ? Number(record.timeToAnswer) : null,
        callStatus: record.callStatus || null,
        callType: record.callType || null,
        recordingUrl: record.recordingUrl || null,
        recordingDuration: record.recordingDuration ? Number(record.recordingDuration) : null,
        transferCount: record.transferCount ? Number(record.transferCount) : 0,
        conferenceCount: record.conferenceCount ? Number(record.conferenceCount) : 0,
        ivrHandled: record.ivrHandled !== undefined ? Boolean(record.ivrHandled) : null,
        duplicate: record.duplicate !== undefined ? Boolean(record.duplicate) : null,
        blocked: record.blocked !== undefined ? Boolean(record.blocked) : null,
        qualityScore: record.qualityScore ? Number(record.qualityScore) : null,
        callerCity: record.callerCity || null,
        callerState: record.callerState || null,
        callerZip: record.callerZip || null,
        callerCountry: record.callerCountry || null,
        areaCode: record.areaCode || null,
        timeZone: record.timeZone || null,
        source: record.source || null,
        medium: record.medium || null,
        keyword: record.keyword || null,
        referrer: record.referrer || null,
        landingPage: record.landingPage || null,
        deviceType: record.deviceType || null,
        browser: record.browser || null,
        operatingSystem: record.operatingSystem || null,
        ipAddress: record.ipAddress || null,
        userAgent: record.userAgent || null,
        sessionId: record.sessionId || null,
        visitorId: record.visitorId || null,
        leadId: record.leadId || null,
        conversionId: record.conversionId || null,
        conversionType: record.conversionType || null,
        conversionValue: record.conversionValue ? Number(record.conversionValue) : null,
        cost: record.cost ? Number(record.cost) : null,
        roi: record.roi ? Number(record.roi) : null,
        margin: record.margin ? Number(record.margin) : null,
        profit: record.profit ? Number(record.profit) : null,
        notes: record.notes || null,
        tags: record.tags || null,
        inboundPhoneNumber: record.inboundPhoneNumber || null,
        callerId: record['tag:InboundNumber:Number'] || null,
        publisherName: record.publisherName || null
      };
      
      allCalls.push(call);
    }
    
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
  }
  
  return allCalls;
};

/**
 * Fetch campaign summary for a specific date from Ringba API
 * Aggregates call data to calculate RPC, total calls, revenue, payout, etc.
 * Can fetch by campaignId or targetId
 */
const fetchCampaignSummary = async (accountId, apiToken, identifier, identifierName, date, useCampaignId = false) => {
  try {
    // Set date range to cover the entire day (start of day to end of day) in UTC
    // Extract year, month, day from the date to avoid timezone shifts
    // If date is a string like "2025-11-21", parse it directly
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
    console.log(`[Campaign Summary] Fetching data for ${identifierName} on ${dateStr}`);
    console.log(`[Campaign Summary] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    let calls = [];
    
    if (useCampaignId) {
      // Fetch by campaign ID
      console.log(`[Campaign Summary] Fetching by Campaign ID: ${identifier}`);
      calls = await getCallsByCampaignId(accountId, apiToken, identifier, startDate, endDate);
    } else {
      // Fetch by target ID (existing method)
      const getCalls = getCallsByTargetId(accountId, apiToken);
      const resultEither = await getCalls(identifier, {
        startDate: startDate,
        endDate: endDate,
        pageSize: 1000
      })();
      
      if (resultEither._tag === 'Left') {
        const error = resultEither.left;
        throw new Error(`Failed to fetch calls: ${error.message}`);
      }
      
      const result = resultEither.right;
      calls = result.calls || [];
    }
    
    console.log(`[Campaign Summary] Retrieved ${calls.length} calls for ${identifierName}`);
    
    // Calculate summary metrics
    const totalCalls = calls.length;
    const totalRevenue = calls.reduce((sum, call) => sum + (call.revenue || 0), 0);
    const totalPayout = calls.reduce((sum, call) => sum + (call.payout || 0), 0);
    
    // Sum call duration (handle null/undefined values)
    const totalCallDuration = calls.reduce((sum, call) => {
      const duration = call.callDuration;
      return sum + (duration && !isNaN(duration) ? Number(duration) : 0);
    }, 0);
    
    // Sum talk time
    const totalTalkTime = calls.reduce((sum, call) => {
      const talkTime = call.talkTime;
      return sum + (talkTime && !isNaN(talkTime) ? Number(talkTime) : 0);
    }, 0);
    
    // Sum wait time
    const totalWaitTime = calls.reduce((sum, call) => {
      const waitTime = call.waitTime;
      return sum + (waitTime && !isNaN(waitTime) ? Number(waitTime) : 0);
    }, 0);
    
    // Sum hold time
    const totalHoldTime = calls.reduce((sum, call) => {
      const holdTime = call.holdTime;
      return sum + (holdTime && !isNaN(holdTime) ? Number(holdTime) : 0);
    }, 0);
    
    // Sum post-call duration
    const totalPostCallDuration = calls.reduce((sum, call) => {
      const postCallDuration = call.postCallDuration;
      return sum + (postCallDuration && !isNaN(postCallDuration) ? Number(postCallDuration) : 0);
    }, 0);
    
    // Sum time to answer
    const totalTimeToAnswer = calls.reduce((sum, call) => {
      const timeToAnswer = call.timeToAnswer;
      return sum + (timeToAnswer && !isNaN(timeToAnswer) ? Number(timeToAnswer) : 0);
    }, 0);
    
    // Sum recording duration
    const totalRecordingDuration = calls.reduce((sum, call) => {
      const recordingDuration = call.recordingDuration;
      return sum + (recordingDuration && !isNaN(recordingDuration) ? Number(recordingDuration) : 0);
    }, 0);
    
    // Count connected calls
    const connectedCalls = calls.filter(call => call.connected === true).length;
    
    // Count calls with recordings
    const callsWithRecordings = calls.filter(call => call.recordingUrl || call.recordingDuration).length;
    
    // Sum transfer count
    const totalTransfers = calls.reduce((sum, call) => sum + (call.transferCount || 0), 0);
    
    // Sum conference count
    const totalConferences = calls.reduce((sum, call) => sum + (call.conferenceCount || 0), 0);
    
    // Count rerouted calls
    const reroutedCalls = calls.filter(call => call.reroutedFromInboundCallId).length;
    
    // Count root calls (calls that are not rerouted)
    const rootCalls = calls.filter(call => !call.reroutedFromInboundCallId).length;
    
    // Calculate average quality score
    const qualityScores = calls.filter(call => call.qualityScore && !isNaN(call.qualityScore)).map(call => Number(call.qualityScore));
    const averageQualityScore = qualityScores.length > 0 
      ? qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length 
      : null;
    
    // Calculate RPC (Revenue Per Call)
    const rpc = totalCalls > 0 ? totalRevenue / totalCalls : 0;
    
    // Calculate Average Call Length (ACL) in seconds
    const averageCallLength = totalCalls > 0 ? totalCallDuration / totalCalls : 0;
    
    // Calculate Average Talk Time
    const averageTalkTime = connectedCalls > 0 ? totalTalkTime / connectedCalls : 0;
    
    // Calculate Average Wait Time
    const averageWaitTime = totalCalls > 0 ? totalWaitTime / totalCalls : 0;
    
    // Calculate Average Hold Time
    const averageHoldTime = connectedCalls > 0 ? totalHoldTime / connectedCalls : 0;
    
    // Calculate Average Time to Answer
    const averageTimeToAnswer = connectedCalls > 0 ? totalTimeToAnswer / connectedCalls : 0;
    
    // Calculate Average Post-Call Duration
    const averagePostCallDuration = totalCalls > 0 ? totalPostCallDuration / totalCalls : 0;
    
    // Calculate Average Recording Duration
    const averageRecordingDuration = callsWithRecordings > 0 ? totalRecordingDuration / callsWithRecordings : 0;
    
    // Calculate connection rate
    const connectionRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;
    
    // Calculate profit (Revenue - Payout)
    const profit = totalRevenue - totalPayout;
    
    // Calculate margin percentage
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
    
    // Calculate conversion rate (calls with revenue / total calls)
    const callsWithRevenue = calls.filter(call => call.revenue > 0).length;
    const conversionRate = totalCalls > 0 ? (callsWithRevenue / totalCalls) * 100 : 0;
    
    // Count other metrics
    // No connections: calls with no duration or zero duration (or no revenue), or explicitly not connected
    const noConnections = calls.filter(call => {
      const duration = call.callDuration;
      const hasRevenue = call.revenue > 0;
      const isConnected = call.connected === true;
      return (!isConnected && (!duration || duration === 0 || isNaN(duration)) && !hasRevenue);
    }).length;
    
    // Duplicates: use explicit duplicate flag if available, otherwise count by caller ID
    let duplicates = 0;
    const explicitDuplicates = calls.filter(call => call.duplicate === true).length;
    if (explicitDuplicates > 0) {
      duplicates = explicitDuplicates;
    } else {
      // Fallback: count by caller ID
      const callerIdCounts = {};
      calls.forEach(call => {
        const callerId = call.callerId || call.inboundPhoneNumber;
        if (callerId) {
          callerIdCounts[callerId] = (callerIdCounts[callerId] || 0) + 1;
        }
      });
      duplicates = Object.values(callerIdCounts).filter(count => count > 1).reduce((sum, count) => sum + (count - 1), 0);
    }
    
    // Blocked: use explicit blocked flag if available
    const blocked = calls.filter(call => call.blocked === true).length;
    
    // IVR Handled: use explicit flag if available, otherwise infer
    let ivrHandled = 0;
    const explicitIvrHandled = calls.filter(call => call.ivrHandled === true).length;
    if (explicitIvrHandled > 0) {
      ivrHandled = explicitIvrHandled;
    } else {
      // Fallback: calls with duration but no conversion
      ivrHandled = calls.filter(call => {
        const duration = call.callDuration;
        const hasRevenue = call.revenue > 0;
        return duration && duration > 0 && !hasRevenue;
      }).length;
    }
    
    // Fetch total cost from Insights API
    const insightsTotalCost = await getTotalCostFromInsights(accountId, apiToken, identifier, startDate, endDate, useCampaignId);
    
    // Total cost is typically the payout amount (fallback if Insights API doesn't return value)
    const totalCost = totalPayout;
    
    // Geographic distribution (top states/cities)
    const stateCounts = {};
    const cityCounts = {};
    calls.forEach(call => {
      if (call.callerState) {
        stateCounts[call.callerState] = (stateCounts[call.callerState] || 0) + 1;
      }
      if (call.callerCity) {
        cityCounts[call.callerCity] = (cityCounts[call.callerCity] || 0) + 1;
      }
    });
    const topStates = Object.entries(stateCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([state, count]) => ({ state, count }));
    const topCities = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([city, count]) => ({ city, count }));
    
    // Device type distribution
    const deviceTypeCounts = {};
    calls.forEach(call => {
      if (call.deviceType) {
        deviceTypeCounts[call.deviceType] = (deviceTypeCounts[call.deviceType] || 0) + 1;
      }
    });
    
    // Source/medium distribution
    const sourceCounts = {};
    const mediumCounts = {};
    calls.forEach(call => {
      if (call.source) {
        sourceCounts[call.source] = (sourceCounts[call.source] || 0) + 1;
      }
      if (call.medium) {
        mediumCounts[call.medium] = (mediumCounts[call.medium] || 0) + 1;
      }
    });
    
    // Get campaign name from first call or use provided name
    const campaignName = calls.length > 0 && calls[0].campaignName 
      ? calls[0].campaignName 
      : identifierName || 'Unknown Campaign';
    
    // Get target name from first call if available
    const targetName = calls.length > 0 && calls[0].targetName 
      ? calls[0].targetName 
      : identifierName;
    
    const summary = {
      campaignName: campaignName,
      targetId: useCampaignId ? (calls.length > 0 ? calls[0].targetId : null) : identifier,
      targetName: targetName,
      campaignId: useCampaignId ? identifier : null,
      summaryDate: date.toISOString().split('T')[0], // YYYY-MM-DD format
      totalCalls: totalCalls,
      revenue: parseFloat(totalRevenue.toFixed(2)),
      payout: parseFloat(totalPayout.toFixed(2)),
      rpc: parseFloat(rpc.toFixed(2)),
      totalCallLengthSeconds: totalCallDuration,
      averageCallLengthSeconds: parseFloat(averageCallLength.toFixed(2)),
      totalCost: parseFloat(totalCost.toFixed(2)),
      insightsTotalCost: insightsTotalCost !== null && insightsTotalCost !== undefined && !isNaN(insightsTotalCost) 
        ? parseFloat(insightsTotalCost.toFixed(2)) 
        : null,
      telco: parseFloat(totalCost.toFixed(2)), // Telco is same as total_cost
      noConnections: noConnections,
      duplicates: duplicates,
      blocked: blocked,
      ivrHandled: ivrHandled,
      profit: parseFloat(profit.toFixed(2)),
      margin: parseFloat(margin.toFixed(2)),
      conversionRate: parseFloat(conversionRate.toFixed(2)),
      // Additional metrics
      connectedCalls: connectedCalls,
      connectionRate: parseFloat(connectionRate.toFixed(2)),
      totalTalkTime: totalTalkTime,
      averageTalkTime: parseFloat(averageTalkTime.toFixed(2)),
      totalWaitTime: totalWaitTime,
      averageWaitTime: parseFloat(averageWaitTime.toFixed(2)),
      totalHoldTime: totalHoldTime,
      averageHoldTime: parseFloat(averageHoldTime.toFixed(2)),
      totalTimeToAnswer: totalTimeToAnswer,
      averageTimeToAnswer: parseFloat(averageTimeToAnswer.toFixed(2)),
      totalPostCallDuration: totalPostCallDuration,
      averagePostCallDuration: parseFloat(averagePostCallDuration.toFixed(2)),
      callsWithRecordings: callsWithRecordings,
      totalRecordingDuration: totalRecordingDuration,
      averageRecordingDuration: parseFloat(averageRecordingDuration.toFixed(2)),
      totalTransfers: totalTransfers,
      averageTransfers: totalCalls > 0 ? parseFloat((totalTransfers / totalCalls).toFixed(2)) : 0,
      totalConferences: totalConferences,
      averageConferences: totalCalls > 0 ? parseFloat((totalConferences / totalCalls).toFixed(2)) : 0,
      reroutedCalls: reroutedCalls,
      rootCalls: rootCalls,
      averageQualityScore: averageQualityScore !== null ? parseFloat(averageQualityScore.toFixed(2)) : null,
      topStates: JSON.stringify(topStates),
      topCities: JSON.stringify(topCities),
      deviceTypeDistribution: JSON.stringify(deviceTypeCounts),
      sourceDistribution: JSON.stringify(sourceCounts),
      mediumDistribution: JSON.stringify(mediumCounts)
    };
    
    console.log(`[Campaign Summary] Calculated summary for ${targetName}:`);
    console.log(`  - Total Calls: ${summary.totalCalls}`);
    console.log(`  - Connected Calls: ${summary.connectedCalls} (${summary.connectionRate}%)`);
    console.log(`  - Revenue: $${summary.revenue}`);
    console.log(`  - Payout: $${summary.payout}`);
    console.log(`  - Total Cost: $${summary.totalCost}`);
    if (summary.insightsTotalCost !== null) {
      console.log(`  - Insights Total Cost: $${summary.insightsTotalCost}`);
    }
    console.log(`  - RPC: $${summary.rpc}`);
    console.log(`  - Profit: $${summary.profit}`);
    console.log(`  - Margin: ${summary.margin}%`);
    console.log(`  - Conversion Rate: ${summary.conversionRate}%`);
    console.log(`  - Average Talk Time: ${summary.averageTalkTime}s`);
    console.log(`  - Average Wait Time: ${summary.averageWaitTime}s`);
    console.log(`  - Average Time to Answer: ${summary.averageTimeToAnswer}s`);
    console.log(`  - Total Transfers: ${summary.totalTransfers}`);
    console.log(`  - Rerouted Calls: ${summary.reroutedCalls}`);
    if (summary.averageQualityScore !== null) {
      console.log(`  - Average Quality Score: ${summary.averageQualityScore}`);
    }
    
    return summary;
  } catch (error) {
    console.error(`[Campaign Summary] Error fetching summary for ${identifierName}:`, error.message);
    throw error;
  }
};

/**
 * Save campaign summary to database
 */
const saveCampaignSummary = async (db, summary) => {
  try {
    // Build dynamic query to handle optional extended columns
    // Check if extended columns exist by querying information_schema
    let hasExtendedColumns = false;
    let hasInsightsTotalCost = false;
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
      
      // Check if insights_total_cost column exists
      const checkInsightsQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'ringba_campaign_summary' 
        AND column_name = 'insights_total_cost'
      `;
      const checkInsightsResult = await db.pool.query(checkInsightsQuery);
      hasInsightsTotalCost = checkInsightsResult.rows.length > 0;
      
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
      hasInsightsTotalCost = false;
      hasTelco = false;
    }
    
    let query, params;
    
    if (hasExtendedColumns) {
      // Build column list and values based on whether insights_total_cost and telco exist
      const additionalColumns = [];
      const additionalValues = [];
      let paramIndex = 47; // Start after the 46 base columns
      
      if (hasInsightsTotalCost) {
        additionalColumns.push('insights_total_cost');
        additionalValues.push(`$${paramIndex}`);
        paramIndex++;
      }
      
      if (hasTelco) {
        additionalColumns.push('telco');
        additionalValues.push(`$${paramIndex}`);
        paramIndex++;
      }
      
      const additionalColumnsStr = additionalColumns.length > 0 ? ', ' + additionalColumns.join(', ') : '';
      const additionalValuesStr = additionalValues.length > 0 ? ', ' + additionalValues.join(', ') : '';
      
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
          device_type_distribution, source_distribution, medium_distribution${additionalColumnsStr}
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46${additionalValuesStr}
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
          medium_distribution = EXCLUDED.medium_distribution${hasInsightsTotalCost ? ',\n          insights_total_cost = EXCLUDED.insights_total_cost' : ''}${hasTelco ? ',\n          telco = EXCLUDED.telco' : ''},
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
      
      // Add insights_total_cost if column exists
      if (hasInsightsTotalCost) {
        params.push(summary.insightsTotalCost || null);
      }
      
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
    
    console.log(`[Campaign Summary] Saved summary to database (ID: ${savedId})`);
    return savedId;
  } catch (error) {
    console.error('[Campaign Summary] Error saving summary to database:', error.message);
    throw error;
  }
};

/**
 * Create combined summary from all campaigns
 * Aggregates all targets into a single "Appliance Repair" summary
 */
const createCombinedSummary = (allSummaries, targetDate) => {
  // Aggregate all metrics
  const combined = {
    campaignName: 'Appliance Repair', // Combined campaign name as per screenshot
    targetId: null, // Combined summary has no single target
    targetName: 'Appliance Repair',
    summaryDate: targetDate.toISOString().split('T')[0],
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
    conversionRate: 0
  };
  
  // Sum all metrics from individual campaigns
  for (const summary of allSummaries) {
    combined.totalCalls += summary.totalCalls || 0;
    combined.revenue += summary.revenue || 0;
    combined.payout += summary.payout || 0;
    combined.totalCallLengthSeconds += summary.totalCallLengthSeconds || 0;
    combined.totalCost += summary.totalCost || 0;
    combined.noConnections += summary.noConnections || 0;
    combined.duplicates += summary.duplicates || 0;
    combined.blocked += summary.blocked || 0;
    combined.ivrHandled += summary.ivrHandled || 0;
    // Extended metrics
    combined.connectedCalls = (combined.connectedCalls || 0) + (summary.connectedCalls || 0);
    combined.totalTalkTime = (combined.totalTalkTime || 0) + (summary.totalTalkTime || 0);
    combined.totalWaitTime = (combined.totalWaitTime || 0) + (summary.totalWaitTime || 0);
    combined.totalHoldTime = (combined.totalHoldTime || 0) + (summary.totalHoldTime || 0);
    combined.totalTimeToAnswer = (combined.totalTimeToAnswer || 0) + (summary.totalTimeToAnswer || 0);
    combined.totalPostCallDuration = (combined.totalPostCallDuration || 0) + (summary.totalPostCallDuration || 0);
    combined.callsWithRecordings = (combined.callsWithRecordings || 0) + (summary.callsWithRecordings || 0);
    combined.totalRecordingDuration = (combined.totalRecordingDuration || 0) + (summary.totalRecordingDuration || 0);
    combined.totalTransfers = (combined.totalTransfers || 0) + (summary.totalTransfers || 0);
    combined.totalConferences = (combined.totalConferences || 0) + (summary.totalConferences || 0);
    combined.reroutedCalls = (combined.reroutedCalls || 0) + (summary.reroutedCalls || 0);
    combined.rootCalls = (combined.rootCalls || 0) + (summary.rootCalls || 0);
  }
  
  // Calculate derived metrics
  combined.rpc = combined.totalCalls > 0 ? combined.revenue / combined.totalCalls : 0;
  combined.averageCallLengthSeconds = combined.totalCalls > 0 
    ? combined.totalCallLengthSeconds / combined.totalCalls 
    : 0;
  combined.profit = combined.revenue - combined.payout;
  combined.margin = combined.revenue > 0 ? (combined.profit / combined.revenue) * 100 : 0;
  // Extended metrics
  combined.connectionRate = combined.totalCalls > 0 ? (combined.connectedCalls / combined.totalCalls) * 100 : 0;
  combined.averageTalkTime = combined.connectedCalls > 0 ? combined.totalTalkTime / combined.connectedCalls : 0;
  combined.averageWaitTime = combined.totalCalls > 0 ? combined.totalWaitTime / combined.totalCalls : 0;
  combined.averageHoldTime = combined.connectedCalls > 0 ? combined.totalHoldTime / combined.connectedCalls : 0;
  combined.averageTimeToAnswer = combined.connectedCalls > 0 ? combined.totalTimeToAnswer / combined.connectedCalls : 0;
  combined.averagePostCallDuration = combined.totalCalls > 0 ? combined.totalPostCallDuration / combined.totalCalls : 0;
  combined.averageRecordingDuration = combined.callsWithRecordings > 0 ? combined.totalRecordingDuration / combined.callsWithRecordings : 0;
  combined.averageTransfers = combined.totalCalls > 0 ? combined.totalTransfers / combined.totalCalls : 0;
  combined.averageConferences = combined.totalCalls > 0 ? combined.totalConferences / combined.totalCalls : 0;
  
  // Calculate conversion rate (calls with revenue / total calls)
  // We need to count calls with revenue from all summaries
  let callsWithRevenue = 0;
  for (const summary of allSummaries) {
    // Estimate: conversion_rate * total_calls / 100
    const convRate = summary.conversionRate || 0;
    const totalCalls = summary.totalCalls || 0;
    callsWithRevenue += Math.round((convRate / 100) * totalCalls);
  }
  combined.conversionRate = combined.totalCalls > 0 
    ? (callsWithRevenue / combined.totalCalls) * 100 
    : 0;
  
  // Round all decimal values
  combined.revenue = parseFloat(combined.revenue.toFixed(2));
  combined.payout = parseFloat(combined.payout.toFixed(2));
  combined.rpc = parseFloat(combined.rpc.toFixed(2));
  combined.averageCallLengthSeconds = parseFloat(combined.averageCallLengthSeconds.toFixed(2));
  combined.totalCost = parseFloat(combined.totalCost.toFixed(3)); // Total Cost shows 3 decimals in screenshot
  combined.profit = parseFloat(combined.profit.toFixed(2));
  combined.margin = parseFloat(combined.margin.toFixed(2));
  combined.conversionRate = parseFloat(combined.conversionRate.toFixed(2));
  // Extended metrics
  combined.connectionRate = parseFloat(combined.connectionRate.toFixed(2));
  combined.averageTalkTime = parseFloat(combined.averageTalkTime.toFixed(2));
  combined.averageWaitTime = parseFloat(combined.averageWaitTime.toFixed(2));
  combined.averageHoldTime = parseFloat(combined.averageHoldTime.toFixed(2));
  combined.averageTimeToAnswer = parseFloat(combined.averageTimeToAnswer.toFixed(2));
  combined.averagePostCallDuration = parseFloat(combined.averagePostCallDuration.toFixed(2));
  combined.averageRecordingDuration = parseFloat(combined.averageRecordingDuration.toFixed(2));
  combined.averageTransfers = parseFloat(combined.averageTransfers.toFixed(2));
  combined.averageConferences = parseFloat(combined.averageConferences.toFixed(2));
  
  return combined;
};

/**
 * Fetch and save campaign summary by campaign ID
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
  // Parse date and create in UTC to avoid timezone shifts
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
  console.log('Ringba Campaign Summary Sync (By Campaign ID)');
  console.log('='.repeat(70));
  console.log(`Campaign ID: ${campaignId}`);
  console.log(`Date: ${targetDate.toISOString().split('T')[0]}`);
  console.log('='.repeat(70));
  console.log('');
  
  try {
    console.log(`[Campaign ID: ${campaignId}] Processing...`);
    
    // Fetch summary from Ringba by campaign ID
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
 * Main function to fetch and save campaign summary for a specific date
 * Creates both individual campaign summaries and a combined summary
 */
export const syncCampaignSummary = async (config, date = null) => {
  const accountId = config.ringbaAccountId;
  const apiToken = config.ringbaApiToken;
  
  if (!accountId || !apiToken) {
    throw new Error('Ringba account ID and API token are required');
  }
  
  const db = dbOps(config);
  
  // Use provided date or default to today
  // Parse date and create in UTC to avoid timezone shifts
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
  console.log('Ringba Campaign Summary Sync');
  console.log('='.repeat(70));
  console.log(`Date: ${targetDate.toISOString().split('T')[0]}`);
  console.log(`Targets: ${Object.keys(TARGET_IDS).length}`);
  console.log('='.repeat(70));
  console.log('');
  
  const results = [];
  const errors = [];
  const allSummaries = [];
  
  // Fetch summary for each target/campaign
  for (const [targetId, targetName] of Object.entries(TARGET_IDS)) {
    try {
      console.log(`\n[${targetName}] Processing...`);
      
      // Fetch summary from Ringba
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
      
      allSummaries.push(summary);
      
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
  
  // Create and save combined summary (matching screenshot format)
  if (allSummaries.length > 0) {
    try {
      console.log(`\n[Combined Summary] Creating aggregated summary...`);
      const combinedSummary = createCombinedSummary(allSummaries, targetDate);
      
      console.log(`[Combined Summary] Calculated combined summary:`);
      console.log(`  - Campaign: ${combinedSummary.campaignName}`);
      console.log(`  - Total Calls: ${combinedSummary.totalCalls}`);
      console.log(`  - Revenue: $${combinedSummary.revenue}`);
      console.log(`  - Payout: $${combinedSummary.payout}`);
      console.log(`  - RPC: $${combinedSummary.rpc}`);
      console.log(`  - Profit: $${combinedSummary.profit}`);
      console.log(`  - Margin: ${combinedSummary.margin}%`);
      console.log(`  - Conversion Rate: ${combinedSummary.conversionRate}%`);
      console.log(`  - No Connections: ${combinedSummary.noConnections}`);
      console.log(`  - Duplicates: ${combinedSummary.duplicates}`);
      console.log(`  - Blocked: ${combinedSummary.blocked}`);
      console.log(`  - IVR Handled: ${combinedSummary.ivrHandled}`);
      console.log(`  - Total Cost: $${combinedSummary.totalCost}`);
      
      // Save combined summary to database
      const combinedId = await saveCampaignSummary(db, combinedSummary);
      console.log(`[Combined Summary] ✅ Saved combined summary (ID: ${combinedId})`);
      
      results.push({
        targetId: 'COMBINED',
        targetName: 'Combined Summary',
        summary: combinedSummary,
        savedId: combinedId,
        success: true
      });
    } catch (error) {
      console.error(`[Combined Summary] ❌ Error:`, error.message);
      errors.push({
        targetId: 'COMBINED',
        targetName: 'Combined Summary',
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
      if (r.targetId === 'COMBINED') {
        console.log(`  - ${r.targetName}: ${r.summary.totalCalls} calls, RPC: $${r.summary.rpc}, Revenue: $${r.summary.revenue}`);
      } else {
        console.log(`  - ${r.targetName}: ${r.summary.totalCalls} calls, RPC: $${r.summary.rpc}`);
      }
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

