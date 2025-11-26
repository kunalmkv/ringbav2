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
          // =====================================================================
          // FUZZY ADJUSTMENT MERGE LOGIC
          // =====================================================================
          // Matches adjustments to calls using multiple criteria:
          // 1. Same caller ID (exact match)
          // 2. Same day (date only comparison)
          // 3. Within ±30 minute time window
          // 4. Duration match (call.totalDuration === adjustment.duration)
          //
          // Scoring system (lower = better match):
          // - Time difference (in minutes)
          // - Duration match bonus: -1000 points (strongly prefer duration match)
          // - Duration mismatch: 0 points (no penalty, but no bonus)
          // =====================================================================
          
          const toDate = (s) => { try { return new Date(s); } catch { return null; } };
          const sameDay = (d1, d2) => d1 && d2 && d1.toISOString().substring(0,10) === d2.toISOString().substring(0,10);
          const diffMinutes = (d1, d2) => Math.abs(d1.getTime() - d2.getTime()) / 60000;
          const WINDOW_MIN = 30;
          const DURATION_MATCH_BONUS = -1000; // Strong bonus for duration match (makes it highest priority)
          const DURATION_TOLERANCE = 5; // Allow ±5 seconds tolerance for duration match

          // Helper function to check if durations match (with tolerance)
          const durationsMatch = (callDuration, adjDuration) => {
            // Handle null/undefined cases
            if (callDuration == null || adjDuration == null) return false;
            const callDur = parseInt(callDuration, 10) || 0;
            const adjDur = parseInt(adjDuration, 10) || 0;
            // Exact match or within tolerance
            return Math.abs(callDur - adjDur) <= DURATION_TOLERANCE;
          };

          // Helper function to calculate match score (lower = better)
          const calculateMatchScore = (timeDiffMinutes, callDuration, adjDuration) => {
            let score = timeDiffMinutes; // Base score is time difference
            
            // If durations match, apply strong bonus (makes this the best match)
            if (durationsMatch(callDuration, adjDuration)) {
              score += DURATION_MATCH_BONUS;
            }
            
            return score;
          };

          // STEP 1: Index calls by caller ID for fast lookup
          const callerToCalls = new Map();
          for (const c of processedCalls) {
            const list = callerToCalls.get(c.callerId) || [];
            list.push({ ...c, dt: toDate(c.dateOfCall) });
            callerToCalls.set(c.callerId, list);
          }

          // STEP 2: Find best matching call for each adjustment
          const matchMap = new Map(); // key: "callerId|dateOfCall" -> adjustment
          let matchStats = { total: 0, withDuration: 0, withoutDuration: 0, noMatch: 0 };
          
          for (const a of processedAdjustments) {
            matchStats.total++;
            const adjDt = toDate(a.timeOfCall);
            const adjDuration = parseInt(a.duration, 10) || 0;
            const candidates = callerToCalls.get(a.callerId) || [];
            let best = null;
            
            for (const cand of candidates) {
              if (!cand.dt || !adjDt) continue;
              if (!sameDay(cand.dt, adjDt)) continue; // Must be same day
              
              const timeDiff = diffMinutes(cand.dt, adjDt);
              if (timeDiff > WINDOW_MIN) continue; // Must be within ±30 minutes
              
              // Calculate match score (considers both time and duration)
              const callDuration = cand.totalDuration;
              const score = calculateMatchScore(timeDiff, callDuration, adjDuration);
              const durationMatched = durationsMatch(callDuration, adjDuration);
              
              // Update best match if this candidate has better score
              if (!best || score < best.score) {
                best = { 
                  score: score, 
                  diff: timeDiff, 
                  call: cand,
                  durationMatched: durationMatched,
                  callDuration: callDuration,
                  adjDuration: adjDuration
                };
              }
            }
            
            if (best && best.call) {
              matchMap.set(`${best.call.callerId}|${best.call.dateOfCall}`, a);
              
              // Track match statistics
              if (best.durationMatched) {
                matchStats.withDuration++;
              } else {
                matchStats.withoutDuration++;
              }
              
              // Log match details for debugging
              if (best.durationMatched) {
                console.log(`[MATCH] Caller: ${a.callerId.substring(0,10)}... | Time diff: ${best.diff.toFixed(1)} min | Duration: ${best.callDuration}s = ${best.adjDuration}s ✓`);
              } else {
                console.log(`[MATCH] Caller: ${a.callerId.substring(0,10)}... | Time diff: ${best.diff.toFixed(1)} min | Duration: ${best.callDuration || 'N/A'}s ≠ ${best.adjDuration}s (no duration match)`);
              }
            } else {
              matchStats.noMatch++;
            }
          }
          
          // Log match statistics
          console.log(`[INFO] Adjustment matching stats:`);
          console.log(`  - Total adjustments: ${matchStats.total}`);
          console.log(`  - Matched with duration: ${matchStats.withDuration}`);
          console.log(`  - Matched without duration: ${matchStats.withoutDuration}`);
          console.log(`  - No match found: ${matchStats.noMatch}`);

          // STEP 3: Merge adjustments into matching calls
          // IMPORTANT: When a match is found, the adjustment's "Time of Call" is treated
          // as the correct/original timestamp. The call's dateOfCall is updated to match.
          let timestampCorrections = 0;
          
          callsMerged = processedCalls.map(c => {
            const a = matchMap.get(`${c.callerId}|${c.dateOfCall}`);
            if (a) {
              // Check if timestamps are different (adjustment has the correct time)
              const originalDateOfCall = c.dateOfCall;
              const correctedDateOfCall = a.timeOfCall; // Adjustment's "Time of Call" is the real timestamp
              const timestampChanged = originalDateOfCall !== correctedDateOfCall;
              
              if (timestampChanged) {
                timestampCorrections++;
                console.log(`[TIMESTAMP FIX] Caller: ${c.callerId.substring(0,10)}...`);
                console.log(`  - Original (call table):    ${originalDateOfCall}`);
                console.log(`  - Corrected (adjustment):   ${correctedDateOfCall}`);
              }
              
              return {
                ...c,
                // UPDATE: Use adjustment's timeOfCall as the correct dateOfCall
                dateOfCall: correctedDateOfCall,
                // Store original timestamp for reference (optional)
                originalDateOfCall: timestampChanged ? originalDateOfCall : null,
                category: c.category || category, // Ensure category is preserved
                adjustmentTime: a.adjustmentTime,
                adjustmentAmount: a.amount,
                adjustmentClassification: a.classification,
                adjustmentDuration: a.duration,
                // Flag indicating timestamp was corrected from adjustment table
                timestampCorrected: timestampChanged
              };
            }
            return {
              ...c,
              category: c.category || category // Ensure category is preserved
            };
          });
          
          if (timestampCorrections > 0) {
            console.log(`[INFO] Timestamp corrections applied: ${timestampCorrections} calls updated with adjustment's "Time of Call"`);
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
        const adjustmentsApplied = includeAdjustments 
          ? callsMerged.filter(c => c.adjustmentAmount != null).length 
          : 0;
        let adjustmentsUnmatched = includeAdjustments 
          ? processedAdjustments.length - adjustmentsApplied 
          : 0;

        // For unmatched adjustments, insert new rows with unmatched=true (only for STATIC category)
        if (includeAdjustments && adjustmentsUnmatched > 0) {
          const matchedKeys = new Set(
            callsMerged.filter(c => c.adjustmentAmount != null)
              .map(c => `${c.callerId}|${c.dateOfCall}`)
          );
          // Import normalizeDateTime for unmatched adjustments
          const { normalizeDateTime } = await import('../utils/date-normalizer.js');
          
          const toInsert = processedAdjustments
            .filter(a => !Array.from(matchedKeys).some(k => k.startsWith(`${a.callerId}|`)))
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
              const ins = await db.insertCallsBatch(toInsert);
              console.log(`[INFO] Inserted ${ins.inserted || 0} unmatched adjustment rows as new calls`);
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
