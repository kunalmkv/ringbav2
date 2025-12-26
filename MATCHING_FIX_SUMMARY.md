# Matching Logic Fix Summary

## Issues Fixed

### 1. **Cross-Session Matching Issue** ✅ FIXED
**Problem**: Adjustments could only match with calls from the current scraping session, not with calls already in the database from previous sessions.

**Solution**: 
- Modified matching logic to fetch existing calls from database for the date range
- Added existing calls to the `callerToCalls` map for matching
- When adjustment matches an existing database call, update that call instead of creating a new record

### 2. **sameDay() Function Timezone Bug** ✅ FIXED
**Problem**: The `sameDay()` function used `toISOString()` which converts to UTC, causing timezone-related mismatches.

**Solution**: 
- Changed to compare date parts directly from strings (first 10 characters: `YYYY-MM-DD`)
- Eliminates timezone conversion issues
- More reliable and predictable

### 3. **Payout Update Logic** ✅ FIXED
**Problem**: When matching adjustments to existing calls, payout wasn't being updated correctly.

**Solution**:
- For new calls: Calculate `newPayout = originalPayout + adjustmentAmount`
- For existing database calls: Fetch current payout, then `newPayout = currentPayout + adjustmentAmount`
- Only updates payout and adjustment fields, preserves all other call data

## Code Changes

### File: `src/services/elocal.scrapper.js`

1. **Fixed sameDay() function** (line 124-130):
   ```javascript
   // OLD (buggy):
   const sameDay = (d1, d2) => d1 && d2 && d1.toISOString().substring(0,10) === d2.toISOString().substring(0,10);
   
   // NEW (fixed):
   const sameDay = (dateStr1, dateStr2) => {
     if (!dateStr1 || !dateStr2) return false;
     const date1 = dateStr1.substring(0, 10); // YYYY-MM-DD
     const date2 = dateStr2.substring(0, 10);
     return date1 === date2;
   };
   ```

2. **Added database call fetching** (line 145-170):
   - Fetches existing calls from database for the date range
   - Adds them to `callerToCalls` map with `fromDatabase: true` flag
   - Stores database ID for later updates

3. **Enhanced matching logic** (line 175-200):
   - Matches adjustments to both new calls and existing database calls
   - Tracks database call matches separately in `dbCallMatches` map

4. **Added database call updates** (line 224-253):
   - Updates existing database calls with matched adjustments
   - Fetches current payout, adds adjustment amount
   - Updates only payout and adjustment fields

5. **Fixed adjustment counting** (line 272-283):
   - Counts adjustments matched to both new calls and database calls
   - Accurate unmatched adjustment count

6. **Fixed unmatched adjustment filtering** (line 309-329):
   - Properly filters out adjustments matched to database calls
   - Prevents duplicate unmatched records

### File: `src/database/postgres-operations.js`

1. **Added getCallById() function** (line 493-505):
   - Fetches call by ID to get current payout before update

2. **Added updateCallWithAdjustment() function** (line 507-530):
   - Updates existing call with adjustment data
   - Only updates: payout, adjustment fields, unmatched flag
   - Preserves all other call data

## How It Works Now

### Matching Flow

1. **Build Call Map**:
   - Add calls from current session
   - Fetch existing calls from database for date range
   - Add existing calls to map with `fromDatabase: true` flag

2. **Match Adjustments**:
   - For each adjustment, find matching calls (same caller ID, same day, within 30 min)
   - If match found:
     - If new call → merge adjustment into call object
     - If database call → store in `dbCallMatches` map

3. **Update Calls**:
   - New calls: Merge adjustment data, calculate new payout
   - Database calls: Update directly in database with new payout

4. **Handle Unmatched**:
   - Only insert as unmatched if not matched to either new or database calls

## Testing

The fix addresses the specific case:
- **Caller ID**: `(727) 804-3296`
- **Call**: `2025-12-16T11:30:00` (Record 1416)
- **Adjustment**: `2025-12-16T11:28:00` (Record 1511)
- **Time Difference**: 2 minutes
- **Expected**: Should match ✅

### Before Fix:
- Adjustment couldn't find call (call was in database from previous session)
- Adjustment inserted as unmatched record

### After Fix:
- Adjustment matches with existing database call
- Call's payout updated: `$35.00 + (-$35.00) = $0.00`
- Adjustment fields added to call
- No unmatched record created

## Benefits

1. ✅ **Cross-session matching**: Adjustments can now match with calls from previous sessions
2. ✅ **Timezone-safe**: String-based date comparison eliminates timezone issues
3. ✅ **Accurate payout**: Payout correctly updated for both new and existing calls
4. ✅ **No duplicates**: Prevents creating unmatched records when matches exist in database
5. ✅ **Data integrity**: Only updates payout and adjustment fields, preserves other data

## Notes

- The fix maintains backward compatibility
- Existing unmatched records in database are not automatically fixed (would need a separate cleanup script)
- The matching window remains 30 minutes
- Only STATIC category calls are matched with adjustments



