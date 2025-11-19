# Ringba Original Sync Scheduler

This scheduler automatically runs the Ringba Original Sync service multiple times daily at:
- **9:02 PM IST**
- **12:02 PM IST**
- **3:02 AM IST**
- **4:02 AM IST**

## Overview

The Ringba Original Sync service fetches all calls from Ringba for the **current day only** and saves them to the `ringba_calls` table. This ensures the database is kept up-to-date with the latest Ringba call data.

### Timezone Logic

The service uses intelligent timezone handling:
- **If time in IST is after 12 AM (00:00)**: Fetches **previous day's** data
- **If time in IST is 12 PM (12:00) or later**: Fetches **current day's** data

This is because Ringba uses **CST (Central Standard Time)** which is approximately **11-12 hours behind IST**. For example:
- If it's 1 AM IST on November 20, it's still November 19 in CST (around 1:30 PM CST)
- So the service fetches November 19 data even though it's already November 20 in IST

## What the Service Does

1. **Fetches Calls from Ringba**: Retrieves calls for the current day (or previous day based on IST time) from Ringba API
2. **Filters by Target IDs**: Only fetches calls for 2 specific target IDs:
   - `TA48aa3e3f5a0544af8549703f76a24faa` (Elocal - Appliance repair - Static Line) - STATIC category
   - `PI1175ac62aa1c4748b21216666b398135` (Elocal - Appliance Repair) - API category
3. **Converts Timezone**: Converts Ringba dates from UTC to EST to match eLocal data
4. **Saves to Database**: Stores all calls in the `ringba_calls` table with:
   - Inbound Call ID (unique identifier)
   - Call date/time (in EST)
   - Caller ID (original and E.164 format)
   - Payout and Revenue amounts
   - Target ID, Target Name, Campaign Name, Publisher Name

## Usage

### Start the Scheduler

**Option 1: Using npm script (Recommended)**
```bash
npm run scheduler:ringba-original
```

**Option 2: Direct node command**
```bash
node start-ringba-original-scheduler.js
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
| 9:02 PM | 21:02 | Evening sync |
| 12:02 PM | 12:02 | Midday sync |
| 3:02 AM | 03:02 | Early morning sync |
| 4:02 AM | 04:02 | Early morning sync |

All times are in **IST (Indian Standard Time)** / **Asia/Kolkata** timezone.

## Date Range

The service processes data for **one day only** (current day or previous day based on IST time):

### Timezone-Based Date Selection

- **If IST time is 12:00 AM - 11:59 AM**: Fetches **previous day's** data
  - Example: If it's 9:02 AM IST on November 20, fetches November 19 data
  - Reason: In CST it's still November 19 (around 9:32 PM CST on Nov 19)

- **If IST time is 12:00 PM - 11:59 PM**: Fetches **current day's** data
  - Example: If it's 3:02 PM IST on November 20, fetches November 20 data
  - Reason: In CST it's November 20 (around 3:32 AM CST on Nov 20)

### Examples

| IST Time | Date Fetched | Reason |
|----------|--------------|--------|
| 3:02 AM IST (Nov 20) | November 19 | Still Nov 19 in CST (~3:32 PM CST Nov 19) |
| 4:02 AM IST (Nov 20) | November 19 | Still Nov 19 in CST (~4:32 PM CST Nov 19) |
| 12:02 PM IST (Nov 20) | November 20 | Now Nov 20 in CST (~12:32 AM CST Nov 20) |
| 9:02 PM IST (Nov 20) | November 20 | Nov 20 in CST (~9:32 AM CST Nov 20) |

## Logging

All scheduler activities and service executions are automatically logged to files:

### Log File Location
- **Directory**: `ringbav2/logs/`
- **Filename Format**: `ringba-original-scheduler-YYYY-MM-DDTHH-MM-SS.log`
- **Example**: `ringba-original-scheduler-2025-11-19T14-30-00.log`

### What Gets Logged
- Scheduler startup and configuration
- All service executions (start, progress, completion)
- Service results (calls fetched, inserted, updated, skipped)
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
cat ringbav2/logs/ringba-original-scheduler-2025-11-19T14-30-00.log

# Follow log file in real-time (if scheduler is running)
tail -f ringbav2/logs/ringba-original-scheduler-*.log
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
- Displays progress and results
- **All output saved to log file**

### Statistics
- Total runs per schedule
- Successful runs
- Failed runs
- Success rate
- Last run timestamp

## Requirements

1. **Environment Variables**: Must be configured in `.env` file:
   - `POSTGRES_HOST` or `DB_HOST`
   - `POSTGRES_PORT` or `DB_PORT` (default: 5432)
   - `POSTGRES_DB_NAME` or `DB_NAME`
   - `POSTGRES_USER_NAME` or `DB_USER`
   - `POSTGRES_PASSWORD` or `DB_PASSWORD`
   - `RINGBA_ACCOUNT_ID` (required)
   - `RINGBA_API_TOKEN` (required)
   - `ELOCAL_BASE_URL` (optional, defaults to https://elocal.com)

2. **Database**: PostgreSQL database must be set up and accessible
   - The `ringba_calls` table must exist (created by `setup-database.js`)

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
- Check that `ringba_calls` table exists (run `npm run setup:db` if needed)

### Ringba API Errors
- Verify Ringba account ID and API token are correct
- Check Ringba API status and rate limits
- Review error messages in log files

## Running as a Background Service

To run the scheduler as a background service (e.g., using PM2):

```bash
# Install PM2 globally
npm install -g pm2

# Start the scheduler
pm2 start start-ringba-original-scheduler.js --name "ringba-original-scheduler"

# View logs
pm2 logs ringba-original-scheduler

# Stop the scheduler
pm2 stop ringba-original-scheduler

# Restart the scheduler
pm2 restart ringba-original-scheduler

# View status
pm2 status
```

## Manual Execution

To manually run the Ringba Original Sync service without waiting for the scheduler:

```bash
# Run for past 10 days
node run-ringba-original-sync.js past10days

# Run for specific date range
node run-ringba-original-sync.js 18-11-2025:19-11-2025

# Run for specific category
node run-ringba-original-sync.js past10days API
```

## Notes

- The scheduler runs continuously and must remain active for scheduled tasks to execute
- All 4 schedules run independently and may execute simultaneously if they overlap
- The scheduler uses `node-cron` with IST timezone support
- All logs are displayed in the console and saved to log files
- The service fetches calls for both target IDs (STATIC and API) in a single run
- Calls are saved to the `ringba_calls` table with upsert logic (updates existing, inserts new)

## Service Output

Each execution provides:
- **Date Range**: The date range processed
- **Ringba Calls Fetched**: Total number of calls retrieved from Ringba
- **Inserted (New)**: Number of new calls added to database
- **Updated (Existing)**: Number of existing calls updated
- **Skipped (Errors)**: Number of calls that failed to save

## Integration with Other Services

This scheduler works alongside:
- **Historical eLocal Scheduler**: Scrapes eLocal data for past 10 days
- **Ringba Cost Sync Service**: Syncs cost changes from eLocal to Ringba
- Both services use the `ringba_calls` table as a reference for matching

