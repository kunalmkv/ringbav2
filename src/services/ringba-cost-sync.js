// Service to sync cost changes from eLocal to Ringba dashboard
// Detects changes in elocal_call_data compared to ringba_calls
// Matches by: 1) Category (from target ID), 2) caller ID (E.164), 3) time window (±30 minutes), 4) call duration (±30 seconds), 5) payout (for scoring)
// Updates Ringba payout and revenue in bulk

import { dbOps } from '../database/postgres-operations.js';
import { updateCallPayment } from '../http/ringba-client.js';
import { getCategoryFromTargetId } from '../http/ringba-target-calls.js';
import * as TE from 'fp-ts/lib/TaskEither.js';
import * as T from 'fp-ts/lib/Task.js';

const RINGBA_BASE_URL = 'https://api.ringba.com/v2';

// Convert phone number to E.164 format
const toE164 = (raw) => {
  if (!raw) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  // If already in E.164 format (starts with +), return as-is
  if (raw.startsWith('+')) return raw;
  // 11 digits starting with 1 (US with country code)
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // 10 digits (US without country code)
  if (digits.length === 10) return `+1${digits}`;
  // Last resort: try to format as E.164
  return digits.length > 0 ? `+${digits}` : null;
};

// Parse date from various formats to Date object
// Handles: ISO format, MM/DD/YYYY HH:MM:SS AM/PM (Ringba format), YYYY-MM-DD, etc.
// IMPORTANT: eLocal dates are in EST (Eastern Standard Time) USA/Canada timezone
const parseDate = (dateStr, isElocalDate = false) => {
  if (!dateStr) return null;
  try {
    // Try parsing as ISO string first (handles most cases)
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      // If this is an eLocal date (stored as YYYY-MM-DDTHH:mm:ss), treat it as EST
      // EST is UTC-5 (or UTC-4 during DST)
      if (isElocalDate && dateStr.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)) {
        // Parse the date components and create a date in EST
        // We'll treat it as local time but account for EST offset when comparing
        return date; // For now, return as-is since we're storing EST times directly
      }
      return date;
    }
    
    // Try Ringba format: MM/DD/YYYY HH:MM:SS AM/PM (e.g., "11/18/2025 06:29:34 PM")
    // Ringba dates are stored in EST in database (converted during sync)
    // But if we get the original format, we need to handle it
    const ringbaFormat = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
    if (ringbaFormat) {
      // If this is still in Ringba format, it means it wasn't converted yet
      // For database queries, dates should already be in EST (YYYY-MM-DDTHH:mm:ss)
      // But handle the original format just in case
      const month = parseInt(ringbaFormat[1], 10) - 1;
      const day = parseInt(ringbaFormat[2], 10);
      const year = parseInt(ringbaFormat[3], 10);
      let hours = parseInt(ringbaFormat[4], 10);
      const minutes = parseInt(ringbaFormat[5], 10);
      const seconds = parseInt(ringbaFormat[6], 10);
      const ampm = ringbaFormat[7].toUpperCase();
      
      // Convert to 24-hour format
      if (ampm === 'PM' && hours !== 12) {
        hours += 12;
      } else if (ampm === 'AM' && hours === 12) {
        hours = 0;
      }
      
      // Treat as EST (since Ringba dates in DB are already converted to EST)
      return new Date(year, month, day, hours, minutes, seconds);
    }
    
    // Try YYYY-MM-DDTHH:mm:ss format (ISO with time) - this is eLocal format
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      const hours = parseInt(isoMatch[4], 10);
      const minutes = parseInt(isoMatch[5], 10);
      const seconds = parseInt(isoMatch[6], 10);
      // eLocal dates are in EST, but we store them as-is
      // When comparing, the 10-minute window should account for small timezone differences
      return new Date(year, month, day, hours, minutes, seconds);
    }
    
    // Try YYYY-MM-DD format (date only)
    const yyyymmdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (yyyymmdd) {
      const year = parseInt(yyyymmdd[1], 10);
      const month = parseInt(yyyymmdd[2], 10) - 1;
      const day = parseInt(yyyymmdd[3], 10);
      return new Date(year, month, day);
    }
    
    // Try MM/DD/YYYY format (date only, no time)
    const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mmddyyyy) {
      const month = parseInt(mmddyyyy[1], 10) - 1;
      const day = parseInt(mmddyyyy[2], 10);
      const year = parseInt(mmddyyyy[3], 10);
      return new Date(year, month, day);
    }
  } catch (error) {
    // Ignore parsing errors
  }
  return null;
};

// Calculate time difference in minutes
const timeDiffMinutes = (date1, date2) => {
  if (!date1 || !date2) return Infinity;
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
};

// Match eLocal call with Ringba call
// Uses: 1) Category (from target ID), 2) caller ID (E.164), 3) time range (±30 minutes), 4) call duration (±30 seconds), 5) payout (for scoring)
const matchCall = (elocalCall, ringbaCall, windowMinutes = 30, durationTolerance = 30, payoutTolerance = 0.01) => {
  // 0. Match category first (from Ringba target ID)
  const ringbaCategory = getCategoryFromTargetId(ringbaCall.target_id);
  const elocalCategory = elocalCall.category || 'STATIC';
  
  // Categories must match
  if (ringbaCategory !== elocalCategory) {
    return null;
  }
  
  // 1. Match caller ID (convert both to E.164)
  const elocalCallerE164 = toE164(elocalCall.caller_id);
  const ringbaCallerE164 = ringbaCall.caller_id_e164 || toE164(ringbaCall.caller_id);
  
  // Skip anonymous or invalid caller IDs
  const elocalCallerLower = (elocalCall.caller_id || '').toLowerCase();
  if (elocalCallerLower.includes('anonymous') || elocalCallerLower === '' || !elocalCall.caller_id) {
    return null;
  }
  
  if (!elocalCallerE164 || !ringbaCallerE164) {
    return null;
  }
  
  // Compare normalized E.164 formats
  if (elocalCallerE164 !== ringbaCallerE164) {
    return null;
  }
  
  // 2. Match date and time
  // eLocal dates are in EST timezone, Ringba dates may be in different timezone
  // The 10-minute window should account for timezone differences
  const elocalDate = parseDate(elocalCall.date_of_call, true); // Mark as eLocal date (EST)
  const ringbaDate = parseDate(ringbaCall.call_date_time, false); // Ringba date
  
  if (!elocalDate || !ringbaDate) {
    return null;
  }
  
  // Check if dates are on the same day or adjacent days
  const elocalDateStr = elocalDate.toISOString().split('T')[0];
  const ringbaDateStr = ringbaDate.toISOString().split('T')[0];
  const elocalDateOnly = new Date(elocalDateStr);
  const ringbaDateOnly = new Date(ringbaDateStr);
  const daysDiff = Math.abs((elocalDateOnly.getTime() - ringbaDateOnly.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff > 1) {
    return null; // Dates are more than 1 day apart
  }
  
  // Calculate time difference in minutes
  const timeDiff = timeDiffMinutes(elocalDate, ringbaDate);
  const effectiveWindow = daysDiff === 0 ? windowMinutes : (24 * 60);
  
  if (timeDiff > effectiveWindow) {
    return null; // Time difference too large
  }
  
  // 3. Match call duration (if both have duration data)
  const elocalDuration = Number(elocalCall.total_duration || 0);
  const ringbaDuration = Number(ringbaCall.call_duration || 0);
  const durationDiff = Math.abs(elocalDuration - ringbaDuration);
  
  // If both have duration data, check if they match within tolerance
  // This helps distinguish between multiple calls from the same caller
  let durationMatch = true;
  if (elocalDuration > 0 && ringbaDuration > 0) {
    if (durationDiff > durationTolerance) {
      // Duration doesn't match - this is likely a different call
      return null;
    }
    durationMatch = true;
  }
  
  // 4. Match payout (for scoring, not exclusion)
  const elocalPayout = Number(elocalCall.payout || 0);
  const ringbaPayout = Number(ringbaCall.payout_amount || 0);
  const payoutDiff = Math.abs(elocalPayout - ringbaPayout);
  
  // Calculate match score (lower is better)
  // Prioritize: duration match > time match > payout match
  let matchScore = timeDiff;
  
  // Bonus for duration match
  if (elocalDuration > 0 && ringbaDuration > 0 && durationDiff <= 10) {
    matchScore = matchScore * 0.5; // Strong bonus for close duration match
  }
  
  // Bonus for payout match
  if (elocalPayout > 0 && ringbaPayout > 0) {
    if (payoutDiff <= payoutTolerance) {
      matchScore = matchScore * 0.1; // Exact payout match
    } else {
      matchScore = matchScore + (payoutDiff * 10); // Penalize payout differences
    }
  }
  
  return {
    elocalCall,
    ringbaCall,
    matchScore,
    timeDiff,
    durationDiff,
    durationMatch,
    payoutDiff,
    payoutMatch: payoutDiff <= payoutTolerance
  };
};

// Get eLocal calls that need to be synced
const getElocalCallsForSync = async (db, startDate, endDate, category = null) => {
  try {
    // Format dates for query
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    const datesInRange = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      datesInRange.push(formatDate(new Date(current)));
      current.setDate(current.getDate() + 1);
    }
    
    const placeholders = datesInRange.map((_, i) => `$${i + 1}`).join(', ');
    const params = [...datesInRange];
    
    let categoryFilter = '';
    if (category) {
      categoryFilter = ` AND category = $${params.length + 1}`;
      params.push(category);
    }
    
    const query = `
      SELECT 
        id, caller_id, date_of_call, payout, category,
        original_payout, original_revenue, total_duration
      FROM elocal_call_data
      WHERE SUBSTRING(date_of_call, 1, 10) = ANY(ARRAY[${placeholders}])${categoryFilter}
      ORDER BY caller_id, date_of_call
    `;
    
    const result = await db.pool.query(query, params);
    return result.rows || [];
  } catch (error) {
    console.error('[ERROR] Failed to get eLocal calls:', error);
    throw error;
  }
};

// Get Ringba calls for matching
const getRingbaCallsForMatching = async (db, startDate, endDate) => {
  try {
    // Ringba dates are now stored in EST format: YYYY-MM-DDTHH:mm:ss
    // We need to extract the date part (YYYY-MM-DD) and match it with our date range
    
    const formatDateForQuery = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    
    // Generate all dates in the range in YYYY-MM-DD format
    const datesInRange = [];
    const current = new Date(startDate);
    const end = new Date(endDate);
    
    while (current <= end) {
      datesInRange.push(formatDateForQuery(new Date(current)));
      current.setDate(current.getDate() + 1);
    }
    
    // Build query to match date part (first 10 characters: YYYY-MM-DD)
    // Ringba format in DB: "YYYY-MM-DDTHH:mm:ss" (EST timezone)
    const placeholders = datesInRange.map((_, i) => `$${i + 1}`).join(', ');
    const params = [...datesInRange];
    
    console.log(`[Ringba Cost Sync] Querying ringba_calls table for dates: ${datesInRange.join(', ')}`);
    
    const query = `
      SELECT 
        id, inbound_call_id, call_date_time, caller_id, caller_id_e164,
        payout_amount, revenue_amount, target_id, call_duration
      FROM ringba_calls
      WHERE SUBSTRING(call_date_time, 1, 10) = ANY(ARRAY[${placeholders}])
      ORDER BY caller_id_e164, call_date_time
    `;
    
    const result = await db.pool.query(query, params);
    const calls = result.rows || [];
    console.log(`[Ringba Cost Sync] Retrieved ${calls.length} Ringba calls from database`);
    return calls;
  } catch (error) {
    console.error('[ERROR] Failed to get Ringba calls:', error);
    throw error;
  }
};

// Detect changes and prepare update list
const detectChanges = (elocalCalls, ringbaCalls) => {
  const updates = [];
  const unmatched = [];
  
  // Group Ringba calls by category first, then by normalized caller ID for faster lookup
  // Structure: Map<category, Map<callerE164, Array<ringbaCall>>>
  const ringbaCallsByCategoryAndCaller = new Map();
  for (const ringbaCall of ringbaCalls) {
    const category = getCategoryFromTargetId(ringbaCall.target_id);
    if (!category) {
      continue; // Skip calls with invalid target ID
    }
    
    const callerE164 = ringbaCall.caller_id_e164 || toE164(ringbaCall.caller_id);
    if (!callerE164) {
      continue; // Skip calls without valid caller ID
    }
    
    if (!ringbaCallsByCategoryAndCaller.has(category)) {
      ringbaCallsByCategoryAndCaller.set(category, new Map());
    }
    
    const callsByCaller = ringbaCallsByCategoryAndCaller.get(category);
    if (!callsByCaller.has(callerE164)) {
      callsByCaller.set(callerE164, []);
    }
    callsByCaller.get(callerE164).push(ringbaCall);
  }
  
  // Track which Ringba calls have been matched
  const matchedRingbaIds = new Set();
  
  // Match each eLocal call
  for (const elocalCall of elocalCalls) {
    const elocalCategory = elocalCall.category || 'STATIC';
    const callerE164 = toE164(elocalCall.caller_id);
    
    if (!callerE164) {
      unmatched.push({ elocalCall, reason: 'Invalid caller ID' });
      continue;
    }
    
    // Get Ringba calls for this category and caller ID
    const categoryCalls = ringbaCallsByCategoryAndCaller.get(elocalCategory);
    if (!categoryCalls) {
      unmatched.push({ elocalCall, reason: `No Ringba calls found for category: ${elocalCategory}` });
      continue;
    }
    
    const candidateRingbaCalls = categoryCalls.get(callerE164) || [];
    
    if (candidateRingbaCalls.length === 0) {
      unmatched.push({ elocalCall, reason: `No matching Ringba call found for category ${elocalCategory} and caller ${callerE164}` });
      continue;
    }
    
    // Find best match
    let bestMatch = null;
    let bestScore = Infinity;
    
    for (const ringbaCall of candidateRingbaCalls) {
      if (matchedRingbaIds.has(ringbaCall.id)) {
        continue; // Already matched
      }
      
      const match = matchCall(elocalCall, ringbaCall);
      if (match && match.matchScore < bestScore) {
        bestMatch = match;
        bestScore = match.matchScore;
      }
    }
    
    if (!bestMatch) {
      unmatched.push({ elocalCall, reason: 'No matching Ringba call found (time/payout mismatch)' });
      continue;
    }
    
    matchedRingbaIds.add(bestMatch.ringbaCall.id);
    
    // Check if payout/revenue needs updating
    const elocalPayout = Number(elocalCall.payout || 0);
    const ringbaPayout = Number(bestMatch.ringbaCall.payout_amount || 0);
    const ringbaRevenue = Number(bestMatch.ringbaCall.revenue_amount || 0);
    
    // Skip if eLocal payout is 0 and Ringba payout is also 0 (no change needed)
    if (elocalPayout === 0 && ringbaPayout === 0 && ringbaRevenue === 0) {
      continue; // No update needed
    }
    
    // Use eLocal payout for both revenue and payout (same value)
    const newPayout = elocalPayout;
    const newRevenue = elocalPayout; // Always same as payout
    
    // Check if update is needed (tolerance: 0.01)
    const payoutDiff = Math.abs(newPayout - ringbaPayout);
    const revenueDiff = Math.abs(newRevenue - ringbaRevenue);
    
    if (payoutDiff > 0.01 || revenueDiff > 0.01) {
      updates.push({
        elocalCallId: elocalCall.id,
        ringbaInboundCallId: bestMatch.ringbaCall.inbound_call_id,
        targetId: bestMatch.ringbaCall.target_id || null, // Include target ID for API call
        currentPayout: ringbaPayout,
        currentRevenue: ringbaRevenue,
        newPayout: newPayout,
        newRevenue: newRevenue,
        payoutDiff: payoutDiff,
        revenueDiff: revenueDiff,
        matchInfo: {
          timeDiff: bestMatch.timeDiff,
          payoutMatch: bestMatch.payoutMatch
        }
      });
    }
  }
  
  return { updates, unmatched };
};

// Update a single call in Ringba
const updateRingbaCall = async (accountId, apiToken, update) => {
  try {
    const payload = {
      newConversionAmount: Number(update.newRevenue),
      newPayoutAmount: Number(update.newPayout),
      reason: 'Call payments synced from eLocal database.',
      targetId: update.targetId || null // Include target ID if available
    };
    
    const updateEither = await updateCallPayment(accountId, apiToken)(update.ringbaInboundCallId, payload)();
    
    if (updateEither._tag === 'Left') {
      const error = updateEither.left;
      throw new Error(error.message || String(error));
    }
    
    return {
      success: true,
      elocalCallId: update.elocalCallId,
      ringbaInboundCallId: update.ringbaInboundCallId,
      result: updateEither.right
    };
  } catch (error) {
    return {
      success: false,
      elocalCallId: update.elocalCallId,
      ringbaInboundCallId: update.ringbaInboundCallId,
      error: error.message || String(error)
    };
  }
};

// Main sync function
export const syncCostToRingba = async (config, dateRange, category = null) => {
  const accountId = config.ringbaAccountId;
  const apiToken = config.ringbaApiToken;
  
  if (!accountId || !apiToken) {
    throw new Error('Ringba account ID and API token are required');
  }
  
  const db = dbOps(config);
  
  // Parse date range
  const startDate = new Date(dateRange.startDate);
  const endDate = new Date(dateRange.endDate);
  endDate.setHours(23, 59, 59, 999);
  
  const categoryLabel = category ? ` (${category} category)` : ' (all categories)';
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Ringba Cost Sync - Sync eLocal Changes to Ringba');
  console.log('='.repeat(70));
  console.log(`Date Range: ${dateRange.startDateFormatted} to ${dateRange.endDateFormatted}${categoryLabel}`);
  console.log(`Start: ${startDate.toISOString()}`);
  console.log(`End: ${endDate.toISOString()}`);
  console.log('='.repeat(70));
  console.log('');
  
  // Step 1: Get eLocal calls
  console.log(`[Step 1] Fetching eLocal calls${categoryLabel}...`);
  const elocalCalls = await getElocalCallsForSync(db, startDate, endDate, category);
  console.log(`[Step 1] ✅ Fetched ${elocalCalls.length} eLocal calls`);
  
  // Log all eLocal calls
  if (elocalCalls.length > 0) {
    console.log(`[Step 1] All eLocal calls fetched:`);
    elocalCalls.forEach((call, index) => {
      const payout = Number(call.payout || 0);
      const revenue = Number(call.original_revenue || call.payout || 0);
      const originalPayout = Number(call.original_payout || call.payout || 0);
      const originalRevenue = Number(call.original_revenue || call.payout || 0);
      
      console.log(`         [${index + 1}] eLocal Call ID: ${call.id}`);
      console.log(`             - Caller ID: ${call.caller_id || 'N/A'}`);
      console.log(`             - Date/Time: ${call.date_of_call || 'N/A'}`);
      console.log(`             - Payout: $${payout.toFixed(2)}, Revenue: $${revenue.toFixed(2)}`);
      console.log(`             - Original Payout: $${originalPayout.toFixed(2)}, Original Revenue: $${originalRevenue.toFixed(2)}`);
      console.log(`             - Category: ${call.category || 'N/A'}`);
    });
  }
  console.log('');
  
  if (elocalCalls.length === 0) {
    console.log('[INFO] No eLocal calls found for the date range. Nothing to sync.');
    return {
      dateRange: {
        start: dateRange.startDateFormatted,
        end: dateRange.endDateFormatted
      },
      category: category || 'all',
      elocalCalls: 0,
      ringbaCalls: 0,
      updates: 0,
      updated: 0,
      failed: 0,
      unmatched: 0
    };
  }
  
  // Step 2: Get Ringba calls
  console.log('[Step 2] Fetching Ringba calls for matching...');
  const ringbaCalls = await getRingbaCallsForMatching(db, startDate, endDate);
  console.log(`[Step 2] ✅ Fetched ${ringbaCalls.length} Ringba calls from database`);
  
  // Log all fetched Ringba calls
  if (ringbaCalls.length > 0) {
    console.log(`[Step 2] All Ringba calls fetched (${ringbaCalls.length}):`);
    ringbaCalls.forEach((call, index) => {
      console.log(`         [${index + 1}] Inbound Call ID: ${call.inbound_call_id}`);
      console.log(`             - Caller ID: ${call.caller_id || 'N/A'} (E.164: ${call.caller_id_e164 || 'N/A'})`);
      console.log(`             - Date/Time: ${call.call_date_time || 'N/A'}`);
      console.log(`             - Payout: $${Number(call.payout_amount || 0).toFixed(2)}, Revenue: $${Number(call.revenue_amount || 0).toFixed(2)}`);
    });
  }
  console.log('');
  
  if (ringbaCalls.length === 0) {
    console.log('[WARN] No Ringba calls found for the date range. Cannot sync.');
    return {
      dateRange: {
        start: dateRange.startDateFormatted,
        end: dateRange.endDateFormatted
      },
      category: category || 'all',
      elocalCalls: elocalCalls.length,
      ringbaCalls: 0,
      updates: 0,
      updated: 0,
      failed: 0,
      unmatched: elocalCalls.length
    };
  }
  
  // Step 3: Detect changes
  console.log('[Step 3] Detecting changes between eLocal and Ringba...');
  const { updates, unmatched } = detectChanges(elocalCalls, ringbaCalls);
  console.log(`[Step 3] ✅ Found ${updates.length} calls that need updating`);
  console.log(`         - Unmatched eLocal calls: ${unmatched.length}`);
  console.log('');
  
  // Log all unmatched calls
  if (unmatched.length > 0) {
    console.log(`[Step 3] Unmatched eLocal calls (${unmatched.length}):`);
    unmatched.forEach((item, index) => {
      const call = item.elocalCall;
      const payout = Number(call.payout || 0);
      const revenue = Number(call.original_revenue || call.payout || 0);
      const originalPayout = Number(call.original_payout || call.payout || 0);
      const originalRevenue = Number(call.original_revenue || call.payout || 0);
      
      console.log(`         [${index + 1}] eLocal Call ID: ${call.id}`);
      console.log(`             - Caller ID: ${call.caller_id || 'N/A'}`);
      console.log(`             - Date/Time: ${call.date_of_call || 'N/A'}`);
      console.log(`             - Payout: $${payout.toFixed(2)}, Revenue: $${revenue.toFixed(2)}`);
      console.log(`             - Original Payout: $${originalPayout.toFixed(2)}, Original Revenue: $${originalRevenue.toFixed(2)}`);
      console.log(`             - Category: ${call.category || 'N/A'}`);
      console.log(`             - Reason: ${item.reason || 'Unknown'}`);
    });
    console.log('');
  }
  
  // Log all matched calls (even if they don't need updating)
  const matchedCount = elocalCalls.length - unmatched.length;
  if (matchedCount > 0) {
    console.log(`[Step 3] Matched calls (${matchedCount}):`);
    console.log(`         - Calls that need updating: ${updates.length}`);
    console.log(`         - Calls already in sync: ${matchedCount - updates.length}`);
    
    // Log details of matched calls that need updating
    if (updates.length > 0) {
      console.log(`         Calls requiring updates:`);
      updates.forEach((update, index) => {
        console.log(`         [${index + 1}] Ringba Call ID: ${update.ringbaInboundCallId}`);
        console.log(`             - eLocal Call ID: ${update.elocalCallId}`);
        console.log(`             - Current Payout: $${update.currentPayout.toFixed(2)}, Revenue: $${update.currentRevenue.toFixed(2)}`);
        console.log(`             - New Payout: $${update.newPayout.toFixed(2)}, Revenue: $${update.newRevenue.toFixed(2)}`);
        console.log(`             - Payout Diff: $${update.payoutDiff.toFixed(2)}, Revenue Diff: $${update.revenueDiff.toFixed(2)}`);
        console.log(`             - Match Info: timeDiff=${update.matchInfo.timeDiff.toFixed(2)}min, payoutMatch=${update.matchInfo.payoutMatch}`);
      });
    }
    console.log('');
  }
  
  if (updates.length === 0) {
    console.log('[INFO] No changes detected. All calls are already in sync.');
    return {
      dateRange: {
        start: dateRange.startDateFormatted,
        end: dateRange.endDateFormatted
      },
      category: category || 'all',
      elocalCalls: elocalCalls.length,
      ringbaCalls: ringbaCalls.length,
      updates: 0,
      updated: 0,
      failed: 0,
      unmatched: unmatched.length
    };
  }
  
  // Step 4: Update Ringba in bulk
  console.log('[Step 4] Updating Ringba calls...');
  let updated = 0;
  let failed = 0;
  
  // Process updates with small delay to avoid rate limiting
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const startTime = new Date().toISOString();
    
    console.log(`[Step 4] [${i + 1}/${updates.length}] Updating call ${update.ringbaInboundCallId}...`);
    console.log(`         - Call ID: ${update.ringbaInboundCallId}`);
    console.log(`         - Target ID: ${update.targetId || 'N/A'}`);
    console.log(`         - eLocal Call ID: ${update.elocalCallId}`);
    console.log(`         - Start Time: ${startTime}`);
    console.log(`         - Current: payout=$${update.currentPayout.toFixed(2)}, revenue=$${update.currentRevenue.toFixed(2)}`);
    console.log(`         - New: payout=$${update.newPayout.toFixed(2)}, revenue=$${update.newRevenue.toFixed(2)}`);
    console.log(`         - Match Info: timeDiff=${update.matchInfo.timeDiff.toFixed(2)}min, payoutMatch=${update.matchInfo.payoutMatch}`);
    
    const result = await updateRingbaCall(accountId, apiToken, update);
    const endTime = new Date().toISOString();
    const duration = ((new Date(endTime) - new Date(startTime)) / 1000).toFixed(2);
    
    if (result.success) {
      updated++;
      console.log(`         ✅ Successfully updated`);
      console.log(`         - End Time: ${endTime}`);
      console.log(`         - Duration: ${duration}s`);
    } else {
      failed++;
      console.error(`         ❌ Failed: ${result.error}`);
      console.error(`         - End Time: ${endTime}`);
      console.error(`         - Duration: ${duration}s`);
    }
    
    // Small delay between requests
    if (i < updates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('');
  console.log(`[Step 4] ✅ Updated ${updated} calls, ${failed} failed`);
  console.log('');
  
  // Summary
  const summary = {
    dateRange: {
      start: dateRange.startDateFormatted,
      end: dateRange.endDateFormatted
    },
    category: category || 'all',
    elocalCalls: elocalCalls.length,
    ringbaCalls: ringbaCalls.length,
    updates: updates.length,
    updated: updated,
    failed: failed,
    unmatched: unmatched.length
  };
  
  console.log('='.repeat(70));
  console.log('Sync Summary');
  console.log('='.repeat(70));
  console.log(`Date Range:           ${summary.dateRange.start} to ${summary.dateRange.end}`);
  console.log(`Category:             ${summary.category}`);
  console.log(`eLocal Calls:          ${summary.elocalCalls}`);
  console.log(`Ringba Calls:          ${summary.ringbaCalls}`);
  console.log(`Changes Detected:      ${summary.updates}`);
  console.log(`Successfully Updated:  ${summary.updated}`);
  console.log(`Failed:                ${summary.failed}`);
  console.log(`Unmatched:             ${summary.unmatched}`);
  console.log('='.repeat(70));
  console.log('');
  
  return summary;
};

