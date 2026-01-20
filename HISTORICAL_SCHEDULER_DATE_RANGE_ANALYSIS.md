# Historical Scheduler Date Range Analysis

## Overview
This document analyzes the date range calculation for the historical scheduler service when running `npm run scheduler:historical`.

## Command Flow
1. **Command**: `npm run scheduler:historical`
2. **Executes**: `node start-historical-scheduler.js`
3. **Scheduler**: Runs at **11:58 PM IST** daily
4. **Service Type**: Historical (both STATIC and API categories)
5. **Date Range Function**: `getPast15DaysRangeForHistorical()` from `src/utils/date-utils.js`

## Date Range Calculation Logic

### Function: `getPast15DaysRangeForHistorical()`

**Location**: `src/utils/date-utils.js` (lines 44-172)

### Key Characteristics:
1. **Timezone**: Uses IST (Asia/Kolkata) regardless of server location
2. **Range**: Past 15 days **EXCLUDING** today
3. **End Date**: Always "yesterday" relative to calculated "today"
4. **Start Date**: 14 days before end date (15 days total including end date)

### Time-Based Logic:

The function determines "today" based on IST time:

#### Before 12:00 PM IST (00:00 - 11:59)
- **"Today"** = Previous IST day
- **End Date** = Day before "today" (2 days ago from actual IST date)
- **Start Date** = 14 days before end date

#### After 12:00 PM IST (12:00 - 23:59)
- **"Today"** = Current IST day
- **End Date** = Yesterday (1 day ago from actual IST date)
- **Start Date** = 14 days before end date

## Examples

### Example 1: Running at 11:58 PM IST on November 26
- **Current IST Time**: November 26, 11:58 PM
- **Hours IST**: 23 (after 12:00 PM)
- **"Today" Calculation**: November 26 (current day)
- **End Date**: November 25 (yesterday)
- **Start Date**: November 11 (14 days before Nov 25)
- **Date Range**: **November 11 to November 25** (15 days)

### Example 2: Running at 3:08 AM IST on November 26
- **Current IST Time**: November 26, 3:08 AM
- **Hours IST**: 3 (before 12:00 PM)
- **"Today" Calculation**: November 25 (previous day)
- **End Date**: November 24 (yesterday relative to "today")
- **Start Date**: November 10 (14 days before Nov 24)
- **Date Range**: **November 10 to November 24** (15 days)

### Example 3: Running at 12:08 AM IST on November 26
- **Current IST Time**: November 26, 12:08 AM
- **Hours IST**: 0 (before 12:00 PM)
- **"Today" Calculation**: November 25 (previous day)
- **End Date**: November 24 (yesterday relative to "today")
- **Start Date**: November 10 (14 days before Nov 24)
- **Date Range**: **November 10 to November 24** (15 days)

### Example 4: Running at 1:00 PM IST on November 26
- **Current IST Time**: November 26, 1:00 PM
- **Hours IST**: 13 (after 12:00 PM)
- **"Today" Calculation**: November 26 (current day)
- **End Date**: November 25 (yesterday)
- **Start Date**: November 11 (14 days before Nov 25)
- **Date Range**: **November 11 to November 25** (15 days)

## Scheduler Execution Time

The scheduler is configured to run at **11:58 PM IST** daily. At this time:
- **Hours IST**: 23 (after 12:00 PM)
- **"Today"**: Current IST day
- **End Date**: Yesterday
- **Start Date**: 14 days before yesterday

### Typical Execution Scenario (11:58 PM IST)
If the scheduler runs on **November 26 at 11:58 PM IST**:
- **Date Range**: **November 11 to November 25** (15 days)
- This scrapes the past 15 days of historical data, excluding today (November 26)

## Code Reference

### Scheduler Service Call
**File**: `src/services/scheduler.js` (lines 109-111)
```javascript
if (serviceType === 'historical') {
  dateRange = getPast15DaysRangeForHistorical();
  console.log(`[INFO] Date Range: ${getDateRangeDescription(dateRange)} (15 days historical, IST-aware)`);
```

### Date Range Function
**File**: `src/utils/date-utils.js` (lines 44-172)
- Function: `getPast15DaysRangeForHistorical()`
- Returns object with:
  - `startDate`: Date object (UTC, start of day)
  - `endDate`: Date object (UTC, end of day)
  - `startDateFormatted`: "MM/DD/YYYY"
  - `endDateFormatted`: "MM/DD/YYYY"
  - `startDateURL`: "YYYY-MM-DD"
  - `endDateURL`: "YYYY-MM-DD"

## Summary

When you run `npm run scheduler:historical`:

1. **Scheduler starts** and runs continuously
2. **At 11:58 PM IST daily**, it triggers the historical service
3. **Date range calculation**:
   - Uses IST timezone (Asia/Kolkata)
   - At 11:58 PM IST, it's after 12:00 PM, so:
     - "Today" = Current IST day
     - End Date = Yesterday
     - Start Date = 14 days before yesterday
   - **Result**: Past 15 days excluding today

4. **Both services run**:
   - Historical STATIC service
   - Historical API service
   - Both use the same date range

## Important Notes

- The date range is **IST-aware** and works regardless of server timezone
- The range **excludes today** (always ends at yesterday)
- The range is **15 days** (including both start and end dates)
- The calculation handles month/year boundaries correctly
- Edge cases (midnight, month boundaries, year boundaries) are handled

## Verification

To verify the date range at runtime, check the console logs:
- `[getPast15DaysRangeForHistorical] Current IST: YYYY-MM-DD HH:MM`
- `[getPast15DaysRangeForHistorical] Date Range: MM/DD/YYYY to MM/DD/YYYY (excludes today)`
- `[INFO] Date Range: MM/DD/YYYY to MM/DD/YYYY (15 days historical, IST-aware)`




