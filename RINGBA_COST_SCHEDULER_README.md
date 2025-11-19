# Ringba Cost Sync Scheduler

This scheduler automatically runs the Ringba Cost Sync service multiple times daily at:
- **9:04 PM IST**
- **12:00 PM IST**
- **3:00 AM IST**
- **6:00 AM IST**

## Overview

The Ringba Cost Sync service syncs cost changes from the eLocal database to the Ringba dashboard. It:
1. Fetches eLocal calls from the database (past 10 days)
2. Fetches matching Ringba calls from the `ringba_calls` table
3. Matches calls by caller ID, time (10-minute buffer), and payout
4. Detects differences in payout/revenue
5. Updates Ringba via API in bulk

## What the Service Does

1. **Fetches eLocal Calls**: Retrieves calls from `elocal_call_data` table for past 10 days
2. **Fetches Ringba Calls**: Retrieves matching calls from `ringba_calls` table
3. **Matches Calls**: Uses caller ID (E.164 format), time window (10 minutes), and payout tolerance
4. **Detects Changes**: Compares eLocal payout/revenue with Ringba payout/revenue
5. **Updates Ringba**: Posts bulk updates to Ringba API for calls that need changes

## Usage

### Start the Scheduler

**Option 1: Using npm script (Recommended)**
```bash
npm run scheduler:ringba-cost
```

**Option 2: Direct node command**
```bash
node start-ringba-cost-scheduler.js
```

### Stop the Scheduler

Press `Ctrl+C` to gracefully stop the scheduler. The scheduler will:
- Stop all scheduled tasks
- Display final statistics
- Close log files properly
- Exit cleanly

## Schedule Details

The scheduler runs the service **4 times daily**:

| Time | IST | Description |
|------|-----|-------------|
| 9:04 PM | 21:04 | Evening sync |
| 12:00 PM | 12:00 | Midday sync |
| 3:00 AM | 03:00 | Early morning sync |
| 6:00 AM | 06:00 | Early morning sync |

All times are in **IST (Indian Standard Time)** / **Asia/Kolkata** timezone.

## Date Range

The service processes data for the **past 10 days** (excluding today):
- **Start Date**: 10 days ago (from yesterday)
- **End Date**: Yesterday
- **Example**: If today is November 19, 2025, it processes November 9-18, 2025

## Matching Logic

The service matches eLocal calls with Ringba calls using:

1. **Caller ID**: Normalized to E.164 format (e.g., `+12015551234`)
2. **Time Window**: 10-minute buffer (calls within 10 minutes are considered matches)
3. **Payout Tolerance**: 0.01 (payouts must match within $0.01)

### Matching Criteria

- **Caller ID Match**: Both calls have the same E.164 formatted caller ID
- **Time Match**: Call times are within 10 minutes of each other
- **Payout Match**: Payout values are within $0.01 tolerance

## Logging

All scheduler activities and service executions are automatically logged to files:

### Log File Location
- **Directory**: `ringbav2/logs/`
- **Filename Format**: `ringba-cost-scheduler-YYYY-MM-DDTHH-MM-SS.log`
- **Example**: `ringba-cost-scheduler-2025-11-19T14-30-00.log`

### What Gets Logged
- Scheduler startup and configuration
- All service executions (start, progress, completion)
- All eLocal calls fetched (with payout/revenue)
- All Ringba calls fetched (with payout/revenue)
- All unmatched calls (with reasons)
- All matched calls requiring updates (with details)
- Service results (calls updated, failed, unmatched)
- Errors and stack traces
- Statistics and summaries
- Shutdown information

### Log File Features
- **Automatic Logging**: All console output is automatically saved to the log file
- **Timestamped Entries**: Each log entry includes a timestamp
- **Service-Specific Headers**: Log files include service name in headers
- **Graceful Closure**: Log files are properly closed on shutdown with footer

### Viewing Logs
```bash
# View latest log file
ls -lt ringbav2/logs/ | head -5

# View specific log file
cat ringbav2/logs/ringba-cost-scheduler-2025-11-19T14-30-00.log

# Follow log file in real-time (if scheduler is running)
tail -f ringbav2/logs/ringba-cost-scheduler-*.log
```

## Monitoring

The scheduler provides real-time monitoring:

### During Startup
- Displays configuration verification
- Shows all scheduled times
- Lists next run times
- **Shows log file path**

### During Execution
- Logs start time (IST)
- Shows date range being processed
- Displays all eLocal calls fetched
- Displays all Ringba calls fetched
- Shows unmatched calls with reasons
- Shows matched calls requiring updates
- Displays progress and results
- **All output saved to log file**

### Statistics
- Total runs per schedule
- Successful runs
- Failed runs
- Success rate
- Last run timestamp

## Service Output

Each execution provides:
- **Date Range**: The date range processed
- **eLocal Calls**: Number of eLocal calls fetched
- **Ringba Calls**: Number of Ringba calls fetched
- **Changes Detected**: Number of calls that need updating
- **Successfully Updated**: Number of calls updated in Ringba
- **Failed**: Number of calls that failed to update
- **Unmatched**: Number of eLocal calls that couldn't be matched with Ringba calls

### Understanding "Unmatched"

**Unmatched** means eLocal calls that couldn't be matched with any Ringba call. Reasons include:
- **Invalid caller ID**: Caller ID can't be normalized to E.164 format
- **No matching Ringba call**: No Ringba call exists with the same caller ID
- **Time/payout mismatch**: Ringba call exists but time difference > 10 minutes or payout doesn't match

## Requirements

1. **Environment Variables**: Must be configured in `.env` file:
   - `POSTGRES_HOST` or `DB_HOST`
   - `POSTGRES_PORT` or `DB_PORT` (default: 5432)
   - `POSTGRES_DB_NAME` or `DB_NAME`
   - `POSTGRES_USER_NAME` or `DB_USER`
   - `POSTGRES_PASSWORD` or `DB_PASSWORD`
   - `RINGBA_ACCOUNT_ID` (required)
   - `RINGBA_API_TOKEN` (required)

2. **Database**: PostgreSQL database must be set up and accessible
   - The `elocal_call_data` table must exist
   - The `ringba_calls` table must exist (populated by Ringba Original Sync)

3. **Node.js**: Version 18.0.0 or higher

4. **Dependencies**: All npm packages must be installed:
   ```bash
   npm install
   ```

## Troubleshooting

### Scheduler Not Starting
- Check that all required environment variables are set
- Verify Ringba credentials (`RINGBA_ACCOUNT_ID` and `RINGBA_API_TOKEN`)
- Check database connection settings

### Services Not Running
- Verify the system timezone is correct
- Check that the scheduler process is still running
- Review logs for error messages

### Database Errors
- Ensure PostgreSQL is running and accessible
- Verify database credentials in `.env`
- Check that required tables exist

### Ringba API Errors
- Verify Ringba account ID and API token are correct
- Check Ringba API status and rate limits
- Review error messages in log files

### High Unmatched Count
- Ensure Ringba Original Sync has run to populate `ringba_calls` table
- Check that date ranges overlap between eLocal and Ringba data
- Review unmatched call details in log files for patterns

## Running as a Background Service

To run the scheduler as a background service (e.g., using PM2):

```bash
# Install PM2 globally
npm install -g pm2

# Start the scheduler
pm2 start start-ringba-cost-scheduler.js --name "ringba-cost-scheduler"

# View logs
pm2 logs ringba-cost-scheduler

# Stop the scheduler
pm2 stop ringba-cost-scheduler

# Restart the scheduler
pm2 restart ringba-cost-scheduler

# View status
pm2 status
```

## Manual Execution

To manually run the Ringba Cost Sync service without waiting for the scheduler:

```bash
# Run for past 10 days
npm run sync:cost past10days

# Run for past 10 days (specific category)
npm run sync:cost past10days API
npm run sync:cost past10days STATIC

# Run for specific date range
node run-ringba-cost-sync.js 18-11-2025 to 19-11-2025
```

## Notes

- The scheduler runs continuously and must remain active for scheduled tasks to execute
- All 4 schedules run independently and may execute simultaneously if they overlap
- The scheduler uses `node-cron` with IST timezone support
- All logs are displayed in the console and saved to log files
- The service processes all categories (API and STATIC) unless filtered
- Updates are sent to Ringba in bulk for efficiency
- The service only updates calls where payout/revenue differences exceed $0.01

## Integration with Other Services

This scheduler works alongside:
- **Historical eLocal Scheduler**: Scrapes eLocal data for past 10 days
- **Ringba Original Sync Scheduler**: Fetches Ringba calls and saves to `ringba_calls` table
- Both services provide the data needed for cost sync to work

## Workflow

1. **Ringba Original Sync** runs and populates `ringba_calls` table
2. **eLocal Historical Service** runs and populates `elocal_call_data` table
3. **Ringba Cost Sync** runs and:
   - Compares eLocal calls with Ringba calls
   - Detects payout/revenue differences
   - Updates Ringba dashboard via API

