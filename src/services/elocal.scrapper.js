// Separate service functions for historical and current day data
import { dbOps } from '../database/postgres-operations.js';
import { fetchCampaignResultsHtmlWithSavedSession, fetchAllCampaignResultsPages } from '../http/elocal-client.js';
import { extractCampaignCallsFromHtml, extractAdjustmentDetailsFromHtml } from '../scrapers/html-extractor.js';
import { processAdjustmentDetails } from '../utils/helpers.js';
import {
  processCampaignCalls,
  createSession,
  aggregateScrapingResults
} from '../utils/helpers.js';
import {
  getPast10DaysRange,
  getCurrentDayRange,
  getCurrentDayRangeWithTimezone,
  getDateRangeDescription,
  getServiceScheduleInfo
} from '../utils/date-utils.js';

  // Base scraping workflow with date range support
export const scrapeElocalDataWithDateRange = (config) => (dateRange) => (serviceType = 'unknown') => (category = 'STATIC') => {
  return (async () => {
    const session = createSession();
    // Include service type (historical/current) and category in session_id for filtering
    session.sessionId = `${serviceType}_${category.toLowerCase()}_${session.sessionId}_${dateRange.startDateFormatted.replace(/\//g, '-')}_to_${dateRange.endDateFormatted.replace(/\//g, '-')}`;
    
    const db = dbOps(config);
    
    // Determine campaign ID and whether to include adjustments based on category
    const campaignId = category === 'API' ? '46775' : '50033';
    const includeAdjustments = category === 'STATIC';
    
    try {
      console.log(`[INFO] Starting scraping session: ${session.sessionId}`);
      console.log(`[INFO] Category: ${category}, Campaign ID: ${campaignId}`);
      console.log(`[INFO] Date range: ${getDateRangeDescription(dateRange)}`);
      
      // Create session in database
      try {
        await db.createSession(session);
      } catch (error) {
        console.warn('[WARN] Failed to create session in database:', error.message);
      }
      
      // NO-PUPPETEER path using saved cookies with pagination support
      try {
        console.log(`[INFO] Running ${category} category via HTTP only (no Puppeteer)...`);
        
        // Fetch all pages with pagination support
        const paginatedData = await fetchAllCampaignResultsPages(config, dateRange, campaignId, includeAdjustments);
        const rawCalls = paginatedData.calls;
        const rawAdjustments = paginatedData.adjustments;
        
        console.log(`[INFO] Fetched ${paginatedData.pagesFetched} page(s) with ${rawCalls.length} total calls${includeAdjustments ? ` and ${rawAdjustments.length} total adjustments` : ''}`);
        
        // Add category to raw calls BEFORE processing so deduplication can use it
        // This ensures that calls with same callerId but different times/categories are preserved
        rawCalls.forEach(call => {
          call.category = category;
        });
        
        const processedAdjustments = includeAdjustments ? processAdjustmentDetails(rawAdjustments) : [];
        const processedCalls = processCampaignCalls(rawCalls);
        
        // Ensure category is preserved after processing
        processedCalls.forEach(call => { 
          if (!call.category) {
            call.category = category;
          }
        });
        
        console.log(`[INFO] Processed ${processedCalls.length} campaign calls (category: ${category})`);
        if (processedCalls.length > 0) {
          console.log(`[INFO] Sample call category: ${processedCalls[0].category}`);
        }
        if (includeAdjustments) {
          console.log(`[INFO] Parsed ${processedAdjustments.length} adjustment rows`);
        }

        // Save to DB (upsert)
        console.log('[INFO] Saving data to database...');
        
        // Use eLocal data only - no Ringba lookups
        // All payout/revenue values come directly from eLocal and are saved as-is
        // IMPORTANT: eLocal dates are saved EXACTLY as received without timezone conversion
        // If eLocal sends "11/18/25 04:38 PM EST", we save it as "2025-11-18T16:38:00"
        // We only convert 12-hour to 24-hour format, but do NOT convert timezone
        console.log(`[INFO] ${category} category: Using eLocal data only (no Ringba lookups)`);
        console.log(`[INFO] Note: eLocal dates are saved as-is (no timezone conversion)`);
        
        // Save adjustment details to separate adjustment_details table (only for STATIC category)
        if (includeAdjustments && processedAdjustments.length > 0) {
          try {
            const adjustmentsResult = await db.insertAdjustmentsBatch(processedAdjustments);
            console.log(`[SUCCESS] Saved ${adjustmentsResult.inserted || 0} adjustment details to adjustment_details table (${adjustmentsResult.skipped || 0} skipped as duplicates)`);
          } catch (error) {
            console.warn('[WARN] Failed to save adjustment details to adjustment_details table:', error.message);
          }
        }
        
        let callsInserted = 0; let callsUpdated = 0;
        
        // For STATIC category: Fuzzy merge adjustments with calls
        // For API category: No adjustments to merge
        let callsMerged = processedCalls;
        
        // Initialize dbCallMatches map (will be used later for counting and filtering)
        // Declared outside if block so it's accessible later
        let dbCallMatches = new Map();
        
        // Ensure category is preserved for API category (no merge needed)
        if (!includeAdjustments) {
          // For API category, ensure all calls have category set
          callsMerged = processedCalls.map(c => ({
            ...c,
            category: c.category || category // Ensure category is set
          }));
          console.log(`[INFO] API category: Prepared ${callsMerged.length} calls for database (category: ${category})`);
          if (callsMerged.length > 0) {
            console.log(`[INFO] Sample merged call category: ${callsMerged[0].category}`);
          }
        }
        
        if (includeAdjustments && processedAdjustments.length > 0) {
          // Fuzzy merge: same caller_id and within ±30 minutes on same day
          // FIXED: Now also matches against existing calls in database
          const toDate = (s) => { try { return new Date(s); } catch { return null; } };
          // FIXED: Compare date parts directly from strings to avoid timezone issues
          const sameDay = (dateStr1, dateStr2) => {
            if (!dateStr1 || !dateStr2) return false;
            // Extract date part (first 10 characters: YYYY-MM-DD) directly from strings
            const date1 = dateStr1.substring(0, 10);
            const date2 = dateStr2.substring(0, 10);
            return date1 === date2;
          };
          const diffMinutes = (d1, d2) => Math.abs(d1.getTime() - d2.getTime()) / 60000;
          const WINDOW_MIN = 30;

          // Step 1: Build map from calls in current session
          const callerToCalls = new Map();
          for (const c of processedCalls) {
            const list = callerToCalls.get(c.callerId) || [];
            list.push({ ...c, dt: toDate(c.dateOfCall), fromDatabase: false });
            callerToCalls.set(c.callerId, list);
          }

          // Step 2: Fetch existing calls from database for the date range and add to map
          try {
            console.log(`[INFO] Fetching existing calls from database for date range: ${getDateRangeDescription(dateRange)}`);
            const existingCalls = await db.getCallsForDateRange(dateRange.startDate, dateRange.endDate, category);
            console.log(`[INFO] Found ${existingCalls.length} existing call(s) in database for matching`);
            
            for (const existingCall of existingCalls) {
              // Skip if already unmatched (those are adjustments that couldn't match before)
              if (existingCall.unmatched) continue;
              
              const list = callerToCalls.get(existingCall.caller_id) || [];
              list.push({
                callerId: existingCall.caller_id,
                dateOfCall: existingCall.date_of_call,
                payout: parseFloat(existingCall.payout) || 0,
                category: existingCall.category || category,
                dt: toDate(existingCall.date_of_call),
                fromDatabase: true,
                dbId: existingCall.id, // Store database ID for updates
                originalPayout: parseFloat(existingCall.original_payout) || null,
                originalRevenue: parseFloat(existingCall.original_revenue) || null,
                // Store adjustment info to prevent double application
                hasAdjustment: !!(existingCall.adjustment_amount && parseFloat(existingCall.adjustment_amount) !== 0),
                adjustmentAmount: parseFloat(existingCall.adjustment_amount) || null,
                adjustmentTime: existingCall.adjustment_time || null
              });
              callerToCalls.set(existingCall.caller_id, list);
            }
          } catch (error) {
            console.warn('[WARN] Failed to fetch existing calls from database:', error.message);
            console.warn('[WARN] Continuing with only current session calls for matching');
          }

          // Step 3: Match adjustments to calls (both new and existing)
          // IMPORTANT: Only match adjustments that haven't been applied to calls yet
          const matchMap = new Map(); // key: caller|date_of_call -> adjustment
          const dbCallMatches = new Map(); // key: dbId -> adjustment (for database call updates)
          
          for (const a of processedAdjustments) {
            const adjDt = toDate(a.timeOfCall);
            const candidates = callerToCalls.get(a.callerId) || [];
            let best = null;
            
            for (const cand of candidates) {
              if (!cand.dt || !adjDt) continue;
              // FIXED: Use string comparison for sameDay check
              if (!sameDay(cand.dateOfCall, a.timeOfCall)) continue;
              
              // CRITICAL FIX: Skip if this existing call already has an adjustment applied
              // This prevents double application when service runs multiple times
              if (cand.fromDatabase && cand.hasAdjustment) {
                // Check if this adjustment matches the one already applied
                // Compare adjustment amount and time to see if it's the same adjustment
                const existingAdjAmount = cand.adjustmentAmount;
                const existingAdjTime = cand.adjustmentTime;
                
                // If amounts match and times are close (within 1 minute), it's the same adjustment
                const amountMatch = Math.abs((existingAdjAmount || 0) - (a.amount || 0)) < 0.01;
                if (amountMatch && existingAdjTime) {
                  const existingAdjDt = toDate(existingAdjTime);
                  if (existingAdjDt && adjDt) {
                    const timeDiff = diffMinutes(existingAdjDt, adjDt);
                    if (timeDiff <= 1) {
                      // This adjustment was already applied to this call, skip it
                      console.log(`[INFO] Skipping adjustment for call ID ${cand.dbId} - already applied (amount: $${a.amount}, time: ${a.adjustmentTime})`);
                      continue;
                    }
                  }
                }
              }
              
              const dm = diffMinutes(cand.dt, adjDt);
              if (dm <= WINDOW_MIN) {
                if (!best || dm < best.diff) best = { diff: dm, call: cand };
              }
            }
            
            if (best && best.call) {
              if (best.call.fromDatabase) {
                // Match with existing database call - will update separately
                // Double-check: Skip if call already has this adjustment applied
                if (best.call.hasAdjustment) {
                  const existingAdjAmount = best.call.adjustmentAmount;
                  const amountMatch = Math.abs((existingAdjAmount || 0) - (a.amount || 0)) < 0.01;
                  if (amountMatch) {
                    console.log(`[INFO] Skipping adjustment for call ID ${best.call.dbId} - adjustment already applied`);
                    continue;
                  }
                }
                
                dbCallMatches.set(best.call.dbId, a);
                console.log(`[INFO] Matched adjustment to existing database call ID ${best.call.dbId} (caller: ${a.callerId.substring(0, 10)}..., time diff: ${best.diff.toFixed(2)} min)`);
              } else {
                // Match with new call from current session
              matchMap.set(`${best.call.callerId}|${best.call.dateOfCall}`, a);
              }
            }
          }

          // Step 4: Merge adjustments into new calls from current session
          callsMerged = processedCalls.map(c => {
            const a = matchMap.get(`${c.callerId}|${c.dateOfCall}`);
            if (a) {
              // Calculate new payout: original payout + adjustment amount
              const newPayout = (c.payout || 0) + (a.amount || 0);
              return {
                ...c,
                category: c.category || category, // Ensure category is preserved
                payout: newPayout, // Update payout with adjustment
                adjustmentTime: a.adjustmentTime,
                adjustmentAmount: a.amount,
                adjustmentClassification: a.classification,
                adjustmentDuration: a.duration
              };
            }
            return {
              ...c,
              category: c.category || category // Ensure category is preserved
            };
          });

          // Step 5: Update existing database calls with matched adjustments
          if (dbCallMatches.size > 0) {
            console.log(`[INFO] Updating ${dbCallMatches.size} existing database call(s) with adjustments`);
            let dbUpdatesCount = 0;
            
            for (const [dbId, adj] of dbCallMatches.entries()) {
              try {
                // Fetch current call to get existing payout and adjustment info
                const currentCall = await db.getCallById(dbId);
                
                if (currentCall) {
                  // CRITICAL FIX: Check if this adjustment was already applied
                  // Compare adjustment amount and time to prevent double application
                  const existingAdjAmount = parseFloat(currentCall.adjustment_amount || 0);
                  const existingAdjTime = currentCall.adjustment_time;
                  
                  // If call already has an adjustment, check if it's the same one
                  if (existingAdjAmount !== 0 && existingAdjTime) {
                    const amountMatch = Math.abs(existingAdjAmount - (adj.amount || 0)) < 0.01;
                    if (amountMatch) {
                      const existingAdjDt = toDate(existingAdjTime);
                      const adjDt = toDate(adj.adjustmentTime);
                      if (existingAdjDt && adjDt) {
                        const timeDiff = diffMinutes(existingAdjDt, adjDt);
                        if (timeDiff <= 1) {
                          // This adjustment was already applied, skip it
                          console.log(`[INFO] Skipping adjustment for call ID ${dbId} - already applied (amount: $${adj.amount}, time: ${adj.adjustmentTime})`);
                          continue;
                        }
                      }
                    }
                  }
                  
                  const currentPayout = parseFloat(currentCall.payout) || 0;
                  const newPayout = currentPayout + (adj.amount || 0);
                  
                  await db.updateCallWithAdjustment(dbId, {
                    payout: newPayout, // Update payout: existing + adjustment
                    adjustmentTime: adj.adjustmentTime,
                    adjustmentAmount: adj.amount,
                    adjustmentClassification: adj.classification,
                    adjustmentDuration: adj.duration
                  });
                  dbUpdatesCount++;
                }
              } catch (error) {
                console.warn(`[WARN] Failed to update database call ID ${dbId} with adjustment:`, error.message);
              }
            }
            
            console.log(`[SUCCESS] Updated ${dbUpdatesCount} existing database call(s) with adjustments`);
          }
        }

        if (callsMerged.length > 0) {
          // Debug: Log category before insert
          const categoryCounts = callsMerged.reduce((acc, c) => {
            acc[c.category || 'null'] = (acc[c.category || 'null'] || 0) + 1;
            return acc;
          }, {});
          console.log(`[INFO] About to save ${callsMerged.length} calls with categories:`, categoryCounts);
          
          const callsResult = await db.insertCallsBatch(callsMerged);
          callsInserted = callsResult.inserted || 0;
          callsUpdated = callsResult.updated || 0;
          console.log(`[SUCCESS] Saved ${callsInserted} new campaign calls (category: ${category}), updated ${callsUpdated} existing`);
        } else {
          console.log(`[WARN] No calls to save for category: ${category}`);
        }

        // Count applied adjustments (only for STATIC category)
        // Include both new calls and database call matches
        let adjustmentsAppliedToNewCalls = 0;
        let adjustmentsAppliedToDbCalls = 0;
        
        if (includeAdjustments) {
          adjustmentsAppliedToNewCalls = callsMerged.filter(c => c.adjustmentAmount != null).length;
          // dbCallMatches is defined in the matching block above, check if it exists
          if (typeof dbCallMatches !== 'undefined' && dbCallMatches) {
            adjustmentsAppliedToDbCalls = dbCallMatches.size;
          }
        }
        
        let adjustmentsApplied = adjustmentsAppliedToNewCalls + adjustmentsAppliedToDbCalls;
        let adjustmentsUnmatched = includeAdjustments 
          ? processedAdjustments.length - adjustmentsApplied 
          : 0;

        // For unmatched adjustments, try to match with existing calls in database before inserting
        // Only insert if adjustment wasn't matched to either new calls or database calls
        if (includeAdjustments && adjustmentsUnmatched > 0) {
          // Collect all matched adjustment keys (from both new calls and database calls)
          const matchedKeys = new Set(
            callsMerged.filter(c => c.adjustmentAmount != null)
              .map(c => `${c.callerId}|${c.dateOfCall}`)
          );
          
          // Filter out adjustments that were matched to database calls
          // Create a set of matched adjustment timeOfCall values from dbCallMatches
          const dbMatchedAdjustments = new Set();
          if (dbCallMatches && dbCallMatches.size > 0) {
            for (const adj of dbCallMatches.values()) {
              dbMatchedAdjustments.add(`${adj.callerId}|${adj.timeOfCall}`);
            }
          }
          
          // Import normalizeDateTime for unmatched adjustments
          const { normalizeDateTime } = await import('../utils/date-normalizer.js');
          
          // Helper functions for matching (same as above)
          const toDate = (s) => { try { return new Date(s); } catch { return null; } };
          const sameDay = (dateStr1, dateStr2) => {
            if (!dateStr1 || !dateStr2) return false;
            const date1 = dateStr1.substring(0, 10);
            const date2 = dateStr2.substring(0, 10);
            return date1 === date2;
          };
          const diffMinutes = (d1, d2) => Math.abs(d1.getTime() - d2.getTime()) / 60000;
          const WINDOW_MIN = 30;
          
          // Get truly unmatched adjustments (not matched to new calls or already matched DB calls)
          const trulyUnmatched = processedAdjustments.filter(a => {
            // Skip if matched to a new call
            const key = `${a.callerId}|${a.timeOfCall}`;
            if (matchedKeys.has(key)) return false;
            
            // Skip if already matched to a database call
            const dbKey = `${a.callerId}|${a.timeOfCall}`;
            if (dbMatchedAdjustments.has(dbKey)) return false;
            
            return true;
          });
          
          // Try to match truly unmatched adjustments with existing calls in database
          // This handles cases where the call exists but wasn't in the date range we fetched earlier
          let additionalDbMatches = 0;
          for (const adj of trulyUnmatched) {
            try {
              // Search for existing calls with same caller ID and category
              // Use a wider date range (±1 day) to catch calls that might match
              const adjDate = toDate(adj.timeOfCall);
              if (!adjDate) continue;
              
              // Search ±1 day around adjustment date to catch calls that might match
              const searchStartDate = new Date(adjDate);
              searchStartDate.setDate(searchStartDate.getDate() - 1);
              searchStartDate.setHours(0, 0, 0, 0);
              const searchEndDate = new Date(adjDate);
              searchEndDate.setDate(searchEndDate.getDate() + 1);
              searchEndDate.setHours(23, 59, 59, 999);
              
              const existingCalls = await db.getCallsForDateRange(searchStartDate, searchEndDate, category);
              
              // Filter to same caller ID and not already matched
              const candidateCalls = existingCalls.filter(c => 
                c.caller_id === adj.callerId && 
                !c.unmatched &&
                (!c.adjustment_amount || parseFloat(c.adjustment_amount) === 0)
              );
              
              if (candidateCalls.length > 0) {
                const adjDt = toDate(adj.timeOfCall);
                let bestMatch = null;
                let bestDiff = Infinity;
                
                for (const existingCall of candidateCalls) {
                  const callDt = toDate(existingCall.date_of_call);
                  if (!callDt || !adjDt) continue;
                  
                  // Check same day and time window
                  if (!sameDay(existingCall.date_of_call, adj.timeOfCall)) continue;
                  
                  const timeDiff = diffMinutes(callDt, adjDt);
                  if (timeDiff <= WINDOW_MIN && timeDiff < bestDiff) {
                    bestDiff = timeDiff;
                    bestMatch = existingCall;
                  }
                }
                
                if (bestMatch) {
                  // Found a match! Update the existing call
                  const currentPayout = parseFloat(bestMatch.payout) || 0;
                  const newPayout = currentPayout + (adj.amount || 0);
                  
                  await db.updateCallWithAdjustment(bestMatch.id, {
                    payout: newPayout,
                    adjustmentTime: adj.adjustmentTime,
                    adjustmentAmount: adj.amount,
                    adjustmentClassification: adj.classification,
                    adjustmentDuration: adj.duration
                  });
                  
                  additionalDbMatches++;
                  console.log(`[INFO] Matched unmatched adjustment to existing database call ID ${bestMatch.id} (caller: ${adj.callerId.substring(0, 10)}..., time diff: ${bestDiff.toFixed(2)} min)`);
                  
                  // Mark as matched so it won't be inserted
                  dbMatchedAdjustments.add(`${adj.callerId}|${adj.timeOfCall}`);
                }
              }
            } catch (error) {
              console.warn(`[WARN] Failed to search for matching call for adjustment (caller: ${adj.callerId.substring(0, 10)}...):`, error.message);
            }
          }
          
          if (additionalDbMatches > 0) {
            console.log(`[INFO] Matched ${additionalDbMatches} additional adjustment(s) to existing database calls`);
            // Update counts
            adjustmentsApplied += additionalDbMatches;
            adjustmentsUnmatched -= additionalDbMatches;
          }
          
          // Now insert only adjustments that still couldn't be matched
          const toInsert = trulyUnmatched
            .filter(a => {
              // Skip if we just matched it to a database call
              const dbKey = `${a.callerId}|${a.timeOfCall}`;
              return !dbMatchedAdjustments.has(dbKey);
            })
            .map(a => ({
              dateOfCall: normalizeDateTime(a.timeOfCall) || a.timeOfCall, // Normalize date+time
              campaignPhone: a.campaignPhone,
              callerId: a.callerId,
              payout: 0,
              category: 'STATIC',
              adjustmentTime: a.adjustmentTime,
              adjustmentAmount: a.amount,
              adjustmentClassification: a.classification,
              adjustmentDuration: a.duration,
              unmatched: true
            }));
          
          if (toInsert.length > 0) {
            try {
              // Before inserting, check if any of these would update an existing call
              // insertCallsBatch will handle the upsert, but we want to log it properly
              const ins = await db.insertCallsBatch(toInsert);
              console.log(`[INFO] Inserted ${ins.inserted || 0} unmatched adjustment rows as new calls, updated ${ins.updated || 0} existing`);
            } catch (error) {
              console.error('[ERROR] Failed to insert unmatched adjustments:', error.message);
            }
          }
        }
        
        if (includeAdjustments) {
          console.log(`[SUCCESS] Applied adjustments to ${adjustmentsApplied} calls (${adjustmentsUnmatched} unmatched)`);
        }

        try {
          await db.updateSession(session.sessionId)({
            completed_at: new Date().toISOString(), 
            status: 'completed', 
            calls_scraped: processedCalls.length, 
            adjustments_scraped: adjustmentsApplied
          });
        } catch (error) {
          console.warn('[WARN] Failed to update session:', error.message);
        }

        const summary = {
          totalCalls: processedCalls.length,
          totalPayout: processedCalls.reduce((sum, call) => sum + (call.payout || 0), 0),
          uniqueCallers: new Set(processedCalls.map(call => call.callerId)).size,
          adjustmentsApplied
        };
        return { sessionId: session.sessionId, dateRange: getDateRangeDescription(dateRange), summary, calls: processedCalls, downloadedFile: { file: 'skipped', size: 0 }, databaseResults: { callsInserted, callsUpdated } };
      } catch (noPuppeteerErr) {
        throw new Error(`HTTP-only flow failed: ${noPuppeteerErr.message}`);
      }
    } catch (error) {
      console.error('[ERROR] Scraping failed:', error.message);
      
      // Update session with error
      try {
        await db.updateSession(session.sessionId)({
          completed_at: new Date().toISOString(),
          status: 'failed',
          error_message: error.message
        });
      } catch (updateError) {
        console.warn('[WARN] Failed to update session with error:', updateError.message);
      }
      
      throw error;
    }
  })();
};

// Historical data service (past 10 days, excluding today) - STATIC category
export const scrapeHistoricalData = async (config) => {
  const dateRange = getPast10DaysRange();
  console.log(`[INFO] Historical Data Service (STATIC): ${getDateRangeDescription(dateRange)}`);
  return await scrapeElocalDataWithDateRange(config)(dateRange)('historical')('STATIC');
};

// Current day service (current day only) - STATIC category
// Uses timezone-aware date range: if after 12:00 AM IST, fetches previous day (CST consideration)
export const scrapeCurrentDayData = async (config, dateRange = null) => {
  // If dateRange is provided (e.g., from scheduler with timezone logic), use it
  // Otherwise, use timezone-aware date range
  const finalDateRange = dateRange || getCurrentDayRangeWithTimezone();
  console.log(`[INFO] Current Day Service (STATIC): ${getDateRangeDescription(finalDateRange)}`);
  return await scrapeElocalDataWithDateRange(config)(finalDateRange)('current')('STATIC');
};

// Historical data service for API category (past 10 days, excluding today)
export const scrapeHistoricalDataAPI = async (config) => {
  const dateRange = getPast10DaysRange();
  console.log(`[INFO] Historical Data Service (API): ${getDateRangeDescription(dateRange)}`);
  return await scrapeElocalDataWithDateRange(config)(dateRange)('historical')('API');
};

// Current day service for API category (current day only)
// Uses timezone-aware date range: if after 12:00 AM IST, fetches previous day (CST consideration)
export const scrapeCurrentDayDataAPI = async (config, dateRange = null) => {
  // If dateRange is provided (e.g., from scheduler with timezone logic), use it
  // Otherwise, use timezone-aware date range
  const finalDateRange = dateRange || getCurrentDayRangeWithTimezone();
  console.log(`[INFO] Current Day Service (API): ${getDateRangeDescription(finalDateRange)}`);
  return await scrapeElocalDataWithDateRange(config)(finalDateRange)('current')('API');
};

// Get service info
export const getServiceInfo = (serviceType) => {
  return getServiceScheduleInfo(serviceType);
};

// Export
export const elocalServices = {
  scrapeHistoricalData,
  scrapeCurrentDayData,
  scrapeHistoricalDataAPI,
  scrapeCurrentDayDataAPI,
  getServiceInfo,
  getPast10DaysRange,
  getCurrentDayRange
};
