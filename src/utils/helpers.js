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

  // Deduplicate based on callerId, dateOfCall (full timestamp), and category
  // IMPORTANT: Use full timestamp (not just date) to allow multiple calls per day
  const seen = new Map();
  const processed = [];
  const timestampCounts = new Map(); // Track calls with same timestamp to add sequence

  console.log(`[INFO] Processing ${rawCalls.length} raw calls for deduplication...`);

  for (const call of rawCalls) {
    // Normalize date+time to ISO format (YYYY-MM-DDTHH:mm:ss) before creating key
    // Use FULL timestamp for deduplication to allow multiple calls per day
    let normalizedDateTime = normalizeDateTime(call.dateOfCall) || call.dateOfCall || '';

    // If normalization failed or returned empty, skip this call
    if (!normalizedDateTime) {
      console.warn(`[WARN] Skipping call with invalid date: ${call.dateOfCall} for caller ${call.callerId}`);
      continue;
    }

    // If eLocal doesn't provide seconds, default to :00
    // But if multiple calls have the same timestamp down to the minute, we need to differentiate them
    // Check if we already have a call with this exact timestamp
    const baseKey = `${call.callerId}|${normalizedDateTime}|${call.category || 'STATIC'}`;

    // Check if we've already processed a call with this exact timestamp
    // If so, increment the sequence counter and modify the timestamp
    let count = timestampCounts.get(baseKey) || 0;
    if (count > 0) {
      // This is a duplicate with the same timestamp - we need to differentiate it
      // Add sequence as seconds offset (1, 2, 3 seconds) to differentiate
      // Parse the timestamp and add the sequence
      const [datePart, timePart] = normalizedDateTime.split('T');
      if (timePart) {
        const [hours, minutes, seconds] = timePart.split(':');
        const newSeconds = String((parseInt(seconds || '0', 10) + count) % 60).padStart(2, '0');
        normalizedDateTime = `${datePart}T${hours}:${minutes}:${newSeconds}`;
      }
    }

    // Increment counter for this base timestamp (for next call with same timestamp)
    timestampCounts.set(baseKey, count + 1);

    // Use full normalized timestamp (with sequence if needed) for deduplication key
    const key = `${call.callerId}|${normalizedDateTime}|${call.category || 'STATIC'}`;

    if (!seen.has(key)) {
      seen.set(key, true);

      // Normalize the call object with standardized date+time format
      const processedCall = {
        callerId: call.callerId || '',
        dateOfCall: normalizedDateTime, // Use normalized date+time (YYYY-MM-DDTHH:mm:ss) with sequence if needed
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
    } else {
      // This exact combination already exists - log a warning
      console.warn(`[WARN] Duplicate call skipped: ${call.callerId} at ${normalizedDateTime} (category: ${call.category || 'STATIC'})`);
    }
  }

  console.log(`[INFO] After deduplication: ${processed.length} unique calls (from ${rawCalls.length} raw calls)`);
  if (processed.length < rawCalls.length) {
    console.log(`[INFO] Removed ${rawCalls.length - processed.length} duplicate calls during processing`);
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
