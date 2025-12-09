# Date Calculation Fixes - Timezone Issues Resolved

## Problem Summary

When services run around 12:00 AM IST (midnight), they were incorrectly calculating the target date, fetching data for 2 days ago instead of yesterday. This was caused by timezone-related issues when using `new Date()` and `setDate()` methods.

## Root Cause

The issue occurred because:
1. `new Date()` creates a date in the server's local timezone
2. `setDate()` can cause unexpected behavior when crossing day boundaries
3. Timezone conversions between IST and UTC were causing off-by-one errors

## Files Fixed

### 1. `start-campaign-summary-scheduler.js`
- **Function:** `getCampaignSummaryDate()`
- **Fix:** Changed from using `new Date()` and `setDate()` to direct date component manipulation
- **Logic:** 
  - Parses IST date components directly from `toLocaleString()`
  - Works with year, month, day as integers
  - Subtracts 1 from day when needed (handles month/year boundaries correctly)
  - Creates final Date using `Date.UTC()` to avoid timezone issues

### 2. `src/utils/date-utils.js`
- **Function:** `getCurrentDayRangeWithTimezone()`
- **Fix:** Same approach - direct date component manipulation instead of `setDate()`
- **Used by:** `start-current-scheduler.js` (via scheduler.js)

- **Function:** `getRingbaSyncDateRange()`
- **Fix:** Same approach - direct date component manipulation instead of `setDate()`
- **Used by:** `start-ringba-original-scheduler.js`

## How the Fix Works

### Before (Problematic):
```javascript
targetDate = new Date();
targetDate.setDate(targetDate.getDate() - 1); // Can cause timezone issues
```

### After (Fixed):
```javascript
// Parse IST date components
const monthIST = parseInt(istParts[1], 10);
const dayIST = parseInt(istParts[2], 10);
const yearIST = parseInt(istParts[3], 10);
let hoursIST = parseInt(istParts[4], 10);

// Work directly with components
if (hoursIST >= 0 && hoursIST < 12) {
  if (dayIST > 1) {
    targetDay = dayIST - 1; // Simple subtraction
  } else {
    // Handle month/year boundaries
    // ...
  }
}

// Create Date using UTC
const targetDate = new Date(Date.UTC(targetYear, targetMonth - 1, targetDay, 0, 0, 0, 0));
```

## Date Calculation Logic

### When Service Runs at 12:05 AM IST on November 25:
- **IST Date Parsed:** November 25, 00:05
- **Hour Check:** `hoursIST = 0` (which is < 12)
- **Calculation:** `dayIST - 1 = 25 - 1 = 24`
- **Result:** Fetches November 24 ✓ (Correct!)

### When Service Runs at 9:05 PM IST on November 25:
- **IST Date Parsed:** November 25, 21:05
- **Hour Check:** `hoursIST = 21` (which is >= 12)
- **Calculation:** Uses current day
- **Result:** Fetches November 25 ✓ (Correct!)

## Services Affected

All services that run at midnight IST (12:00 AM - 11:59 AM) are now fixed:

1. ✅ **Campaign Summary Scheduler** - Runs at 9:05 PM, 12:05 AM, 3:05 AM, 6:05 AM IST
2. ✅ **Ringba Original Sync Scheduler** - Runs at 9:04 PM, 12:04 AM, 3:04 AM, 6:04 AM IST
3. ✅ **Current Day Scheduler** - Uses `getCurrentDayRangeWithTimezone()` which is now fixed
4. ✅ **Ringba Cost Sync Scheduler** - Uses `getPast10DaysRange()` (not affected, but verified)

## Testing

To verify the fix works correctly:

1. **Check logs** when service runs at 12:05 AM IST:
   - Should show: `[DEBUG] Parsed IST: 2025-11-25 00:05`
   - Should show: `Target Date: 2025-11-24`
   - Should fetch data for November 24 (not November 23)

2. **Check logs** when service runs at 9:05 PM IST:
   - Should show: `[DEBUG] Parsed IST: 2025-11-25 21:05`
   - Should show: `Target Date: 2025-11-25`
   - Should fetch data for November 25

## Edge Cases Handled

1. ✅ **Month boundaries:** When day is 1, correctly goes to last day of previous month
2. ✅ **Year boundaries:** When month is January (1) and day is 1, correctly goes to December 31 of previous year
3. ✅ **Hour 24:** Handles edge case where hour might be returned as 24 (converts to 0)
4. ✅ **Timezone parsing:** Uses `toLocaleString()` with `timeZone: 'Asia/Kolkata'` for accurate IST time

## Debug Logging

Added debug logging to help troubleshoot:
- `[DEBUG] IST Date String:` - Shows raw IST date string
- `[DEBUG] Parsed IST:` - Shows parsed date components
- `[DEBUG] Date Calculation:` - Shows calculation logic and result

## Notes

- All date calculations now use UTC internally to avoid timezone shifts
- Date components are manipulated as integers before creating Date objects
- The fix ensures consistent behavior regardless of server timezone
- Services that run after 12:00 PM IST are unaffected (they fetch current day)

## Related Files

- `start-campaign-summary-scheduler.js` - Fixed
- `src/utils/date-utils.js` - Fixed (2 functions)
- `start-ringba-original-scheduler.js` - Uses fixed `getRingbaSyncDateRange()`
- `start-current-scheduler.js` - Uses fixed `getCurrentDayRangeWithTimezone()`
- `run-ringba-campaign-summary.js` - Already correct (uses UTC methods)


