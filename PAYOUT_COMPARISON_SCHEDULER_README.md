# Payout Comparison Sync Scheduler

This scheduler automatically runs the Payout Comparison Sync service multiple times daily at:
- **9:30 PM IST** (21:30)
- **12:30 AM IST** (00:30 - midnight)
- **3:30 AM IST** (03:30)
- **6:30 AM IST** (06:30)

## Overview

The Payout Comparison Sync service calculates and stores payout comparison data (Ringba vs eLocal) in the `payout_comparison_daily` table for the **past 15 days**. This data is used for reporting and analysis.

### Date Range Logic

The service syncs **past 15 days** (excluding today) based on IST timezone:
- **If time in IST is before 12 PM (12:00)**: Considers "today" as the **previous IST day**
- **If time in IST is 12 PM (12:00) or later**: Considers "today" as the **current IST day**

The end date is always "yesterday" relative to the calculated "today", and the start date is 14 days before the end date (15 days total including the end date).

### Timezone Logic

This is because Ringba uses **EST/CST (Eastern/Central Standard Time)** which is approximately **10-11 hours behind IST**. For example:
- If it's 12:30 AM IST on December 3, it's still December 2 in EST (around 2:00 PM EST)
- So the service syncs past 15 days ending on December 2 even though it's already December 3 in IST

## What the Service Does

For each date in the past 15 days range:

1. **Fetches eLocal Call Data**: Retrieves call data from `elocal_call_data` table for each date
2. **Groups by Category**: Separates calls into STATIC and API categories
3. **Calculates Totals**: 
   - Ringba Static/API/Total (from `original_payout` and `original_revenue`)
   - eLocal Static/API/Total (from `payout`)
   - Adjustments (difference between Ringba and eLocal)
4. **Fetches Campaign Summary Data**: Gets RPC, Google Ads spend, and Telco costs from `ringba_campaign_summary` table
5. **Calculates Metrics**:
   - Cost per call
   - Net profit
   - Net profit percentage
6. **Stores Results**: Saves all calculated data to `payout_comparison_daily` table for each date

The service processes all dates sequentially and provides aggregate totals across all dates processed.

## Usage

### Start the Scheduler

**Option 1: Using npm script (Recommended)**
```bash
npm run scheduler:payout-comparison
```

**Option 2: Direct node command**
```bash
node start-payout-comparison-scheduler.js
```

### Run Manually for a Specific Date

**Option 1: Using npm script**
```bash
npm run sync:payout-comparison 2025-12-02
```

**Option 2: Direct node command**
```bash
node run-payout-comparison-sync.js 2025-12-02
```

### Run for a Date Range

```bash
node run-payout-comparison-sync.js 2025-11-01 2025-11-30
# or
node run-payout-comparison-sync.js 2025-11-01:2025-11-30
```

### Stop the Scheduler

Press `Ctrl+C` to gracefully stop the scheduler. The scheduler will:
- Stop all scheduled tasks
- Display final statistics
- Close log files
- Exit cleanly

## Date Formats Supported

The run script supports multiple date formats:
- `YYYY-MM-DD` (e.g., `2025-12-02`)
- `MM/DD/YYYY` (e.g., `12/02/2025`)
- `DD-MM-YYYY` (e.g., `02-12-2025`)

## Output

The service outputs:
- **Date Range**: Start and end dates processed
- **Total Dates Processed**: Number of dates in the range
- **Successful/Failed**: Count of successful and failed date syncs
- **Aggregate Totals** (across all dates):
  - Ringba Static/API/Total payouts
  - eLocal Static/API/Total payouts
  - Adjustments (difference)
  - Total calls count
  - RPC (Revenue Per Call)
  - Google Ads spend
  - Telco costs
  - Net profit
  - Net profit percentage

## Database Table

Data is stored in the `payout_comparison_daily` table with the following structure:
- `comparison_date` (PRIMARY KEY) - Date in YYYY-MM-DD format
- `ringba_static` - Ringba STATIC category payout
- `ringba_api` - Ringba API category revenue
- `ringba_total` - Total Ringba payout/revenue
- `elocal_static` - eLocal STATIC category payout
- `elocal_api` - eLocal API category payout
- `elocal_total` - Total eLocal payout
- `adjustments` - Difference (Ringba - eLocal)
- `adjustment_static_pct` - Adjustment percentage for STATIC
- `adjustment_api_pct` - Adjustment percentage for API
- `adjustment_pct` - Overall adjustment percentage
- `total_calls` - Total number of calls
- `rpc` - Revenue Per Call
- `google_ads_spend` - Google Ads spend amount
- `google_ads_notes` - Optional notes for Google Ads spend
- `telco` - Telco costs
- `cost_per_call` - Google Ads spend divided by total calls
- `net` - Net profit (eLocal Total - Google Ads Spend - Telco)
- `net_profit` - Net profit percentage
- `updated_at` - Timestamp of last update

## Logging

The scheduler automatically logs all activities to a file:
- Log file format: `payout-comparison-scheduler-{timestamp}.log`
- Logs include all console output
- Logs are saved in the project root directory

## Error Handling

- If a scheduled run fails, it logs the error but continues running
- Statistics track successful vs failed runs
- The scheduler continues to run even if individual jobs fail

## Statistics

The scheduler tracks statistics for each scheduled time:
- Total runs
- Successful runs
- Failed runs
- Success rate
- Last run timestamp

View statistics by pressing `Ctrl+C` to stop the scheduler (statistics are displayed on shutdown).

