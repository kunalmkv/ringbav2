// Service to fetch calls from Ringba for a date range and save original payout/revenue
// Only fetches calls for specific target IDs (2 target IDs)
// IMPORTANT: Converts Ringba dates to EST timezone to match eLocal data
import { dbOps } from '../database/postgres-operations.js';
import { convertRingbaDateToEST } from '../utils/date-normalizer.js';
import { getCallsByTargetId, TARGET_IDS, getCategoryFromTargetId } from '../http/ringba-target-calls.js';

// Convert phone number to E.164 format
// This matches the logic from ringba-client.js to ensure consistent normalization
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
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    // Try parsing as ISO string first (handles most cases)
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
    
    // Try Ringba format: MM/DD/YYYY HH:MM:SS AM/PM (e.g., "11/18/2025 06:27:25 PM")
    const ringbaFormat = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
    if (ringbaFormat) {
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
      
      return new Date(year, month, day, hours, minutes, seconds);
    }
    
    // Try YYYY-MM-DDTHH:mm:ss format (ISO with time)
    const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10) - 1;
      const day = parseInt(isoMatch[3], 10);
      const hours = parseInt(isoMatch[4], 10);
      const minutes = parseInt(isoMatch[5], 10);
      const seconds = parseInt(isoMatch[6], 10);
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

// Fetch calls from Ringba for a date range filtered by target IDs (only 2 target IDs)
const fetchAllRingbaCalls = async (accountId, apiToken, startDate, endDate) => {
  const allCalls = [];
  
  console.log(`[Ringba Original Sync] Fetching calls from Ringba for target IDs only...`);
  console.log(`[Ringba Original Sync] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`[Ringba Original Sync] Target IDs to fetch: ${Object.keys(TARGET_IDS).join(', ')}`);
  
  // Fetch calls for each target ID
  for (const [targetId, targetName] of Object.entries(TARGET_IDS)) {
    const category = getCategoryFromTargetId(targetId);
    console.log(`[Ringba Original Sync] Fetching calls for target: ${targetId} (${targetName}) - Category: ${category}`);
    
    try {
      const resultEither = await getCallsByTargetId(accountId, apiToken)(targetId, {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        pageSize: 1000
      })();
      
      if (resultEither._tag === 'Right') {
        const result = resultEither.right;
        const { calls } = result;
        
        console.log(`[Ringba Original Sync] Retrieved ${calls.length} calls for target ${targetId}`);
        
        // Transform calls to our format
        for (const call of calls) {
          // Get payout and revenue from call
          const payout = Number(call.ringbaCost || call.payout || 0);
          const revenue = Number(call.revenue || 0);
          
          // Get caller ID (E.164 format)
          const ringbaCallerId = call.callerId || null;
          const callerIdE164 = ringbaCallerId 
            ? (ringbaCallerId.startsWith('+') ? ringbaCallerId : toE164(ringbaCallerId))
            : null;
          
          // Convert Ringba date to EST to match eLocal data timezone
          // getCallsByTargetId returns callDate in MM/DD/YYYY HH:MM:SS AM/PM format (with formatDateTime: true)
          // Ringba returns dates in UTC, we convert to EST
          let callDtEST = call.callDate || call.callDt || ''; // Use callDate from getCallsByTargetId
          const callDtOriginal = callDtEST; // Keep original for reference
          
          try {
            // getCallsByTargetId with formatDateTime: true returns MM/DD/YYYY HH:MM:SS AM/PM format
            // Convert this to EST and then to ISO format (YYYY-MM-DDTHH:mm:ss)
            if (callDtEST) {
              const converted = convertRingbaDateToEST(callDtEST);
              if (converted) {
                callDtEST = converted; // Store in EST format (YYYY-MM-DDTHH:mm:ss)
              } else {
                // If conversion fails, try to parse as ISO or other format
                console.warn(`[Ringba Original Sync] Could not convert date to EST: ${callDtEST}, using as-is`);
              }
            }
          } catch (error) {
            console.warn(`[Ringba Original Sync] Failed to convert date to EST: ${callDtEST}`, error.message);
            // Keep original format if conversion fails
          }
          
          // Get call duration
          const callDuration = call.callDuration || 0;
          
          allCalls.push({
            inboundCallId: call.inboundCallId,
            callDt: callDtEST, // Store EST converted date (YYYY-MM-DDTHH:mm:ss)
            callDtOriginal: callDtOriginal, // Keep original Ringba format for reference
            callerId: ringbaCallerId, // Store original from Ringba
            callerIdE164: callerIdE164, // Normalized E.164 format for matching
            inboundPhoneNumber: call.inboundPhoneNumber || null,
            payout: payout,
            revenue: revenue,
            callDuration: callDuration, // Duration in seconds
            targetId: targetId,
            targetName: call.targetName || targetName,
            campaignName: call.campaignName || null,
            publisherName: call.publisherName || null
          });
        }
        
        console.log(`[Ringba Original Sync] Processed ${calls.length} calls for target ${targetId}`);
      } else {
        const error = resultEither.left;
        const errorMsg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
        console.error(`[Ringba Original Sync] ❌ Failed to fetch calls for target ${targetId} (${targetName}):`, errorMsg);
        console.error(`[Ringba Original Sync] Continuing with next target...`);
        // Continue with next target instead of throwing
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
      console.error(`[Ringba Original Sync] ❌ Exception fetching calls for target ${targetId} (${targetName}):`, errorMsg);
      console.error(`[Ringba Original Sync] Continuing with next target...`);
      // Continue with next target instead of throwing
    }
    
    // Small delay between target requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`[Ringba Original Sync] Total calls fetched from Ringba (all targets): ${allCalls.length}`);
  return allCalls;
};

// Get eLocal calls for matching (same as ringba-cost-sync)
const getElocalCallsForMatching = async (db, startDate, endDate, category = null) => {
  try {
    return await db.getCallsForDateRange(startDate, endDate, category);
  } catch (error) {
    console.error('[Ringba Original Sync] Error fetching eLocal calls:', error.message);
    throw error;
  }
};

// Match Ringba calls with eLocal calls and prepare updates
// Matching flow: 1) Target ID (category), 2) Caller ID, 3) Time (hour:minute only, ignore seconds)
// IMPORTANT: Only updates if original_payout and original_revenue are NULL or 0
// This preserves the original Ringba cost data that was already saved
const matchAndPrepareUpdates = (ringbaCalls, elocalCalls) => {
  const updates = [];
  const unmatched = [];
  const skipped = []; // Calls that already have original_payout/revenue values
  
  // Group eLocal calls by category first, then by normalized caller ID for faster lookup
  // Structure: Map<category, Map<callerE164, Array<elocalCall>>>
  const elocalCallsByCategoryAndCaller = new Map();
  for (const elocalCall of elocalCalls) {
    const category = elocalCall.category || 'STATIC';
    const callerE164 = toE164(elocalCall.caller_id);
    
    if (!callerE164) {
      continue; // Skip calls without valid caller ID
    }
    
    if (!elocalCallsByCategoryAndCaller.has(category)) {
      elocalCallsByCategoryAndCaller.set(category, new Map());
    }
    
    const callsByCaller = elocalCallsByCategoryAndCaller.get(category);
    if (!callsByCaller.has(callerE164)) {
      callsByCaller.set(callerE164, []);
    }
    callsByCaller.get(callerE164).push(elocalCall);
  }
  
  // Track which eLocal calls have been matched
  const matchedElocalIds = new Set();
  
  // Match each Ringba call
  for (const ringbaCall of ringbaCalls) {
    // Step 1: Match by target ID (which corresponds to category)
    const ringbaCategory = getCategoryFromTargetId(ringbaCall.targetId);
    if (!ringbaCategory) {
      unmatched.push({ ringbaCall, reason: `Invalid or unknown target ID: ${ringbaCall.targetId}` });
      continue;
    }
    
    // Step 2: Match by caller ID
    const callerE164 = ringbaCall.callerIdE164 || toE164(ringbaCall.callerId);
    if (!callerE164) {
      unmatched.push({ ringbaCall, reason: 'Invalid caller ID' });
      continue;
    }
    
    // Get eLocal calls for this category and caller ID
    const categoryCalls = elocalCallsByCategoryAndCaller.get(ringbaCategory);
    if (!categoryCalls) {
      unmatched.push({ ringbaCall, reason: `No eLocal calls found for category: ${ringbaCategory}` });
      continue;
    }
    
    const candidateElocalCalls = categoryCalls.get(callerE164) || [];
    
    if (candidateElocalCalls.length === 0) {
      unmatched.push({ ringbaCall, reason: `No matching eLocal call found for category ${ringbaCategory} and caller ${callerE164}` });
      continue;
    }
    
    // Step 3: Find best match by time (hour:minute only, ignore seconds)
    let bestMatch = null;
    let bestScore = Infinity;
    
    for (const elocalCall of candidateElocalCalls) {
      if (matchedElocalIds.has(elocalCall.id)) {
        continue; // Already matched
      }
      
      const match = matchCall(ringbaCall, elocalCall);
      if (match && match.matchScore < bestScore) {
        bestMatch = match;
        bestScore = match.matchScore;
      }
    }
    
    if (!bestMatch) {
      unmatched.push({ ringbaCall, reason: 'No matching eLocal call found (time/payout mismatch)' });
      continue;
    }
    
    matchedElocalIds.add(bestMatch.elocalCall.id);
    
    // Check if original_payout or original_revenue already exist (preserve original Ringba data)
    // Only update if both are NULL or 0 (not already filled)
    const existingOriginalPayout = Number(bestMatch.elocalCall.original_payout || 0);
    const existingOriginalRevenue = Number(bestMatch.elocalCall.original_revenue || 0);
    
    // Skip update if either original_payout or original_revenue already has a value (not NULL and not 0)
    // This preserves the original Ringba cost data that was already saved
    if (existingOriginalPayout !== 0 || existingOriginalRevenue !== 0) {
      // Data already exists, skip update to preserve original Ringba cost
      skipped.push({
        elocalCallId: bestMatch.elocalCall.id,
        existingOriginalPayout: existingOriginalPayout,
        existingOriginalRevenue: existingOriginalRevenue,
        newPayout: ringbaCall.payout,
        newRevenue: ringbaCall.revenue,
        reason: 'original_payout or original_revenue already filled (preserving original Ringba cost)'
      });
      continue;
    }
    
    // Prepare update with Ringba payout and revenue (only if not already filled)
    updates.push({
      elocalCallId: bestMatch.elocalCall.id,
      ringbaInboundCallId: ringbaCall.inboundCallId,
      originalPayout: ringbaCall.payout,
      originalRevenue: ringbaCall.revenue,
      matchInfo: {
        timeDiff: bestMatch.timeDiff,
        payoutMatch: bestMatch.payoutMatch
      }
    });
  }
  
  return { updates, unmatched, skipped };
};

// Match Ringba call with eLocal call
// Matching flow: 1) Target ID (category) - already filtered, 2) Caller ID - already filtered, 3) Time (hour:minute only, ignore seconds)
// Uses: time range (±120 minutes), and payout (if available)
const matchCall = (ringbaCall, elocalCall, windowMinutes = 120, payoutTolerance = 0.01) => {
  // Note: Caller ID matching is already done in matchAndPrepareUpdates
  // This function only matches by time (hour:minute, ignore seconds) and payout
  
  // Match date and time (only hour and minutes, ignore seconds)
  // eLocal dates are in EST timezone (stored as YYYY-MM-DDTHH:mm:ss)
  // Ringba dates are also in EST timezone (converted during fetch)
  const elocalDate = parseDate(elocalCall.date_of_call);
  const ringbaDate = parseDate(ringbaCall.callDt);
  
  if (!elocalDate || !ringbaDate) {
    return null; // Can't match without dates
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
  
  // Calculate time difference in minutes, but only using hour and minutes (ignore seconds)
  // Set seconds to 0 for both dates before comparing
  const elocalTimeOnly = new Date(elocalDate);
  elocalTimeOnly.setSeconds(0, 0);
  const ringbaTimeOnly = new Date(ringbaDate);
  ringbaTimeOnly.setSeconds(0, 0);
  
  const timeDiff = timeDiffMinutes(elocalTimeOnly, ringbaTimeOnly);
  const effectiveWindow = daysDiff === 0 ? windowMinutes : (24 * 60); // 24 hours if different days
  
  if (timeDiff > effectiveWindow) {
    return null; // Time difference too large
  }
  
  // 3. Match payout (if available)
  const elocalPayout = Number(elocalCall.payout || 0);
  const ringbaPayout = Number(ringbaCall.payout || 0);
  const payoutDiff = Math.abs(elocalPayout - ringbaPayout);
  
  // Calculate match score (lower is better)
  let matchScore = timeDiff;
  
  if (elocalPayout > 0 && ringbaPayout > 0) {
    if (payoutDiff <= payoutTolerance) {
      matchScore = timeDiff * 0.1; // Exact payout match
    } else {
      matchScore = timeDiff + (payoutDiff * 10); // Penalize payout differences
    }
  }
  
  return {
    elocalCall,
    ringbaCall,
    matchScore,
    timeDiff,
    payoutDiff,
    payoutMatch: payoutDiff <= payoutTolerance
  };
};

// Main sync function - saves all Ringba calls to ringba_calls table
export const syncRingbaOriginalPayout = async (config, dateRange, category = null) => {
  const accountId = config.ringbaAccountId;
  const apiToken = config.ringbaApiToken;
  
  if (!accountId || !apiToken) {
    throw new Error('Ringba account ID and API token are required');
  }
  
  const db = dbOps(config);
  
  // Parse date range
  const startDate = new Date(dateRange.startDate);
  const endDate = new Date(dateRange.endDate);
  endDate.setHours(23, 59, 59, 999); // End of day
  
  const categoryLabel = category ? ` (${category} category)` : ' (all categories)';
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Ringba Calls Sync - Save to ringba_calls table');
  console.log('='.repeat(70));
  console.log(`Date Range: ${dateRange.startDateFormatted} to ${dateRange.endDateFormatted}${categoryLabel}`);
  console.log(`Start: ${startDate.toISOString()}`);
  console.log(`End: ${endDate.toISOString()}`);
  console.log('='.repeat(70));
  console.log('');
  
  // Step 1: Fetch all calls from Ringba
  console.log('[Step 1] Fetching calls from Ringba...');
  const ringbaCalls = await fetchAllRingbaCalls(accountId, apiToken, startDate, endDate);
  console.log(`[Step 1] ✅ Fetched ${ringbaCalls.length} calls from Ringba`);
  console.log('');
  
  // Step 2: Save all Ringba calls to ringba_calls table
  console.log('[Step 2] Saving Ringba calls to database...');
  const saveResult = await db.insertRingbaCallsBatch(ringbaCalls);
  console.log(`[Step 2] ✅ Saved Ringba calls to database:`);
  console.log(`         - Inserted: ${saveResult.inserted} new calls`);
  console.log(`         - Updated: ${saveResult.updated} existing calls`);
  console.log(`         - Skipped: ${saveResult.skipped} calls (errors)`);
  console.log('');
  
  // Step 3: Fetch eLocal calls for matching
  console.log(`[Step 3] Fetching eLocal calls${categoryLabel} for matching...`);
  const elocalCalls = await getElocalCallsForMatching(db, startDate, endDate, category);
  console.log(`[Step 3] ✅ Fetched ${elocalCalls.length} eLocal calls`);
  console.log('');
  
  // Step 4: Match Ringba calls with eLocal calls and update original_payout/revenue
  let matchedCount = 0;
  let updatedCount = 0;
  let failedCount = 0;
  let unmatchedCount = 0;
  let skippedCount = 0;
  
  if (elocalCalls.length > 0 && ringbaCalls.length > 0) {
    console.log('[Step 4] Matching Ringba calls with eLocal calls...');
    console.log(`[Step 4] Matching flow: 1) Target ID (category), 2) Caller ID, 3) Time (hour:minute only, ignore seconds)`);
    const { updates, unmatched, skipped } = matchAndPrepareUpdates(ringbaCalls, elocalCalls);
    unmatchedCount = unmatched.length;
    skippedCount = skipped.length;
    
    console.log(`[Step 4] ✅ Found ${updates.length} matches to update`);
    console.log(`         - Unmatched Ringba calls: ${unmatched.length}`);
    console.log(`         - Skipped (already have original_payout/revenue): ${skipped.length}`);
    console.log('');
    
    // Log skipped calls (if any)
    if (skipped.length > 0) {
      console.log(`[Step 4] Skipped calls (preserving original Ringba cost):`);
      skipped.forEach((item, index) => {
        console.log(`         [${index + 1}] eLocal Call ID: ${item.elocalCallId}`);
        console.log(`             - Existing: payout=$${item.existingOriginalPayout.toFixed(2)}, revenue=$${item.existingOriginalRevenue.toFixed(2)}`);
        console.log(`             - New (not applied): payout=$${item.newPayout.toFixed(2)}, revenue=$${item.newRevenue.toFixed(2)}`);
        console.log(`             - Reason: ${item.reason}`);
      });
      console.log('');
    }
    
    // Update original_payout and original_revenue in elocal_call_data
    if (updates.length > 0) {
      console.log('[Step 5] Updating original_payout and original_revenue in eLocal calls...');
      
      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];
        
        try {
          const result = await db.updateOriginalPayout(
            update.elocalCallId,
            update.originalPayout,
            update.originalRevenue,
            update.ringbaInboundCallId
          );
          
          if (result.updated > 0) {
            updatedCount++;
            matchedCount++;
            if ((i + 1) % 10 === 0 || i === updates.length - 1) {
              console.log(`         [${i + 1}/${updates.length}] Updated ${updatedCount} calls so far...`);
            }
          } else {
            failedCount++;
            console.warn(`         [${i + 1}/${updates.length}] Failed to update call ID ${update.elocalCallId}`);
          }
        } catch (error) {
          failedCount++;
          console.error(`         [${i + 1}/${updates.length}] Error updating call ID ${update.elocalCallId}:`, error.message);
        }
      }
      
      console.log(`[Step 5] ✅ Updated ${updatedCount} eLocal calls with original payout/revenue`);
      console.log(`         - Failed: ${failedCount} calls`);
      console.log('');
    } else {
      console.log('[Step 5] No matches found. Skipping update step.');
      console.log('');
    }
  } else {
    if (elocalCalls.length === 0) {
      console.log('[Step 4] No eLocal calls found. Skipping matching step.');
      console.log('');
    }
    if (ringbaCalls.length === 0) {
      console.log('[Step 4] No Ringba calls found. Skipping matching step.');
      console.log('');
    }
  }
  
  // Summary
  const summary = {
    dateRange: {
      start: dateRange.startDateFormatted,
      end: dateRange.endDateFormatted
    },
    category: category || 'all',
    ringbaCalls: ringbaCalls.length,
    inserted: saveResult.inserted,
    updated: saveResult.updated,
    skipped: saveResult.skipped,
    elocalCalls: elocalCalls.length,
    matched: matchedCount,
    updatedOriginal: updatedCount,
    failed: failedCount,
    unmatched: unmatchedCount,
    skipped: skippedCount
  };
  
  console.log('='.repeat(70));
  console.log('Sync Summary');
  console.log('='.repeat(70));
  console.log(`Date Range:                ${summary.dateRange.start} to ${summary.dateRange.end}`);
  console.log(`Category:                  ${summary.category}`);
  console.log(`Ringba Calls Fetched:      ${summary.ringbaCalls}`);
  console.log(`  - Inserted (New):       ${summary.inserted}`);
  console.log(`  - Updated (Existing):   ${summary.updated}`);
  console.log(`  - Skipped (Errors):     ${summary.skipped}`);
  console.log(`eLocal Calls Fetched:      ${summary.elocalCalls}`);
  console.log(`Matches Found:            ${summary.matched}`);
  console.log(`  - Updated (original_*): ${summary.updatedOriginal}`);
  console.log(`  - Skipped (preserved):   ${summary.skipped}`);
  console.log(`  - Failed:                ${summary.failed}`);
  console.log(`  - Unmatched:             ${summary.unmatched}`);
  console.log('='.repeat(70));
  console.log('');
  
  return summary;
};

