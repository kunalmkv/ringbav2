# Ringba Campaign Summary Scheduler

## Overview

The Ringba Campaign Summary Scheduler automatically fetches and saves campaign summary data from Ringba API multiple times daily. The service tracks RPC (Revenue Per Call), total calls, revenue, payout, profit, margin, conversion rate, and other metrics per campaign per day.

## Features

- **Multiple Daily Runs**: Runs 4 times daily at 9:05 PM, 12:05 AM, 3:05 AM, and 6:05 AM IST
- **Timezone-Aware**: Automatically fetches previous day's data if running after 12:00 AM IST (because Ringba uses EST/CST which is behind IST)
- **Comprehensive Metrics**: Tracks RPC, total calls, revenue, payout, profit, margin, conversion rate, no connections, duplicates, blocked, IVR handled
- **Combined Summary**: Creates aggregated summary across all campaigns
- **File Logging**: All logs are saved to timestamped log files
- **Error Handling**: Graceful error handling with detailed logging
- **Statistics Tracking**: Tracks successful runs and failures

## Usage

### Start the Scheduler

```bash
npm run scheduler:campaign-summary
```

Or directly:

```bash
node start-campaign-summary-scheduler.js
```

### Stop the Scheduler

Press `Ctrl+C` to stop the scheduler gracefully. It will:
- Stop all scheduled tasks
- Save final statistics
- Close log files properly

## Schedule Details

- **Times**: 
  - 9:05 PM IST (21:05)
  - 12:05 AM IST (00:05 - midnight)
  - 3:05 AM IST (03:05)
  - 6:05 AM IST (06:05)
- **Timezone**: Asia/Kolkata (IST)
- **Timezone Logic**: If the service runs after 12:00 AM IST, it fetches the previous day's data (because Ringba uses EST/CST timezone which is behind IST)

### Timezone Logic Example

- **9:05 PM IST**: Fetches current day's data (it's still the same day in EST/CST)
- **12:05 AM IST**: Fetches previous day's data (it's still the previous day in EST/CST)
- **3:05 AM IST**: Fetches previous day's data (it's still the previous day in EST/CST)
- **6:05 AM IST**: Fetches previous day's data (it's still the previous day in EST/CST)

After 12:00 PM IST (noon), the service will fetch the current day's data.

## Configuration

### Required Environment Variables

The scheduler requires the following environment variables in your `.env` file:

```env
# PostgreSQL Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB_NAME=your_database
POSTGRES_USER_NAME=your_user
POSTGRES_PASSWORD=your_password
DB_SSL=false  # Set to 'true' if using SSL

# Ringba API
RINGBA_ACCOUNT_ID=your_account_id
RINGBA_API_TOKEN=your_api_token
```

### Database Table

The scheduler requires the `ringba_campaign_summary` table to exist. Create it using:

```bash
npm run setup:db
```

## How It Works

1. **Scheduled Execution**: The scheduler runs a cron job at the specified times
2. **Date Selection**: Determines the target date based on IST timezone:
   - If after 12:00 AM IST and before 12:00 PM IST: Previous day
   - If 12:00 PM IST or later: Current day
3. **Fetch from Ringba**: Calls Ringba API to fetch call data for all configured target IDs
4. **Calculate Metrics**: Aggregates call data to calculate:
   - Total Calls
   - Revenue (total conversionAmount)
   - Payout (total payoutAmount)
   - RPC (Revenue Per Call = Revenue / Total Calls)
   - Total Call Length (TCL)
   - Average Call Length (ACL)
   - Profit (Revenue - Payout)
   - Margin (Profit / Revenue * 100)
   - Conversion Rate (Calls with revenue / Total calls * 100)
   - No Connections
   - Duplicates
   - Blocked
   - IVR Handled
5. **Save to Database**: Saves individual campaign summaries and a combined summary to `ringba_campaign_summary` table

## Log Files

All scheduler activity is logged to files in the `logs/` directory:

```
logs/campaign-summary-scheduler-YYYY-MM-DDTHH-MM-SS.log
```

Log files include:
- Scheduler startup information
- Each execution attempt with date selection logic
- Detailed metrics for each campaign
- Error messages and stack traces
- Statistics and summary information

## Statistics

The scheduler tracks the following statistics:

- **Total Runs**: Number of times the scheduler executed
- **Successful Runs**: Number of successful syncs
- **Failed Runs**: Number of failed attempts
- **Success Rate**: Percentage of successful runs
- **Last Run**: Timestamp of the last execution

## Manual Execution

You can also run the campaign summary service manually without the scheduler:

```bash
# Sync for today (or previous day based on timezone logic)
npm run sync:campaign-summary

# Sync for a specific date
npm run sync:campaign-summary 2025-11-20

# Sync for a specific campaign ID
npm run sync:campaign-summary CA56446512fe4e4926a05e76574a7d6963 2025-11-20
```

## Data Saved

The service saves the following data to `ringba_campaign_summary` table:

- **Campaign Information**: campaign_name, campaign_id, target_id, target_name
- **Date**: summary_date (YYYY-MM-DD format)
- **Call Metrics**: total_calls, no_connections, duplicates, blocked, ivr_handled
- **Financial Metrics**: revenue, payout, rpc, total_cost, profit, margin
- **Call Duration**: total_call_length_seconds, average_call_length_seconds
- **Conversion**: conversion_rate

## Combined Summary

The service automatically creates a combined summary that aggregates all individual campaign summaries into a single "Appliance Repair" summary. This matches the format shown in the Ringba dashboard.

## Troubleshooting

### Scheduler Not Running

1. Check that all required environment variables are set
2. Verify database connection is working
3. Ensure `ringba_campaign_summary` table exists
4. Check log files for error messages

### Campaign Summary Failing

1. Verify Ringba API credentials are correct
2. Check if Ringba API is accessible
3. Ensure target IDs are configured correctly
4. Review log files for detailed error messages

### Date Selection Issues

If the wrong date is being fetched:
1. Check current IST time
2. Verify timezone logic is working correctly
3. Review logs to see which date was selected
4. The logic: After 12 AM IST = Previous day, After 12 PM IST = Current day

## Related Services

- **Campaign Summary Service**: `src/services/ringba-campaign-summary.js`
- **Run Script**: `run-ringba-campaign-summary.js`
- **Target IDs Config**: `src/http/ringba-target-calls.js`

## Notes

- The scheduler uses IST timezone for scheduling but accounts for EST/CST timezone differences when selecting the date
- Sessions are saved with UTC timestamps to avoid timezone issues
- The combined summary is created automatically and saved with campaign_name = "Appliance Repair"
- If a summary already exists for a date, it will be updated (UPSERT logic)

