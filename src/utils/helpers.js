// Helper functions for processing scraping data
import { normalizeDateTime } from './date-normalizer.js';

// Create a new scraping session object
export const createSession = () => {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 15);
  return {
    sessionId: `session_${timestamp}_${randomId}`,
    startedAt: new Date().toISOString(),
    status: 'running'
  };
};

// Process raw campaign calls - deduplicate and normalize
export const processCampaignCalls = (rawCalls) => {
  if (!rawCalls || rawCalls.length === 0) {
    return [];
  }

  // Deduplicate based on callerId, dateOfCall, and category
  const seen = new Map();
  const processed = [];

  for (const call of rawCalls) {
    // Normalize date+time to ISO format (YYYY-MM-DDTHH:mm:ss) before creating key
    // Use date part only for deduplication key to allow multiple calls same day
    const normalizedDateTime = normalizeDateTime(call.dateOfCall) || call.dateOfCall || '';
    const datePart = normalizedDateTime.split('T')[0]; // Extract date part for key
    const key = `${call.callerId}|${datePart}|${call.category || 'STATIC'}`;
    
    if (!seen.has(key)) {
      seen.set(key, true);
      
      // Normalize the call object with standardized date+time format
      const processedCall = {
        callerId: call.callerId || '',
        dateOfCall: normalizedDateTime, // Use normalized date+time (YYYY-MM-DDTHH:mm:ss)
        campaignPhone: call.campaignPhone || '(877) 834-1273',
        payout: parseFloat(call.payout) || 0,
        category: call.category || 'STATIC',
        cityState: call.cityState || null,
        zipCode: call.zipCode || null,
        screenDuration: call.screenDuration || null,
        postScreenDuration: call.postScreenDuration || null,
        totalDuration: call.totalDuration || null,
        assessment: call.assessment || null,
        classification: call.classification || null
      };

      processed.push(processedCall);
    }
  }

  return processed;
};

// Process adjustment details - normalize and validate
export const processAdjustmentDetails = (rawAdjustments) => {
  if (!rawAdjustments || rawAdjustments.length === 0) {
    return [];
  }

  return rawAdjustments.map(adj => ({
    timeOfCall: normalizeDateTime(adj.timeOfCall) || adj.timeOfCall || '', // Normalize date+time
    adjustmentTime: adj.adjustmentTime || '',
    campaignPhone: adj.campaignPhone || '(877) 834-1273',
    callerId: adj.callerId || '',
    duration: parseInt(adj.duration) || 0,
    callSid: adj.callSid || null,
    amount: parseFloat(adj.amount) || 0,
    classification: adj.classification || null
  }));
};

// Aggregate scraping results from multiple sessions
export const aggregateScrapingResults = (results) => {
  if (!results || results.length === 0) {
    return {
      totalCalls: 0,
      totalPayout: 0,
      uniqueCallers: 0,
      totalSessions: 0
    };
  }

  const allCalls = [];
  const allCallers = new Set();

  for (const result of results) {
    if (result.calls && Array.isArray(result.calls)) {
      allCalls.push(...result.calls);
      result.calls.forEach(call => {
        if (call.callerId) {
          allCallers.add(call.callerId);
        }
      });
    }
  }

  return {
    totalCalls: allCalls.length,
    totalPayout: allCalls.reduce((sum, call) => sum + (call.payout || 0), 0),
    uniqueCallers: allCallers.size,
    totalSessions: results.length
  };
};
