# Historical Data Scheduler

This scheduler automatically runs the eLocal historical scraping service for both **API** and **STATIC** categories every day at **11:58 PM IST**.

## Overview

The historical service scrapes data for the **past 10 days** (excluding today) for both categories:
- **Historical STATIC**: Scrapes STATIC category data for past 10 days
- **Historical API**: Scrapes API category data for past 10 days

Both services run simultaneously at 11:58 PM IST daily.

## Configuration

The scheduler configuration is stored in `schedule-config.json`:

```json
{
  "timezone": "Asia/Kolkata",
  "services": [
    {
      "name": "Historical STATIC",
      "type": "historical",
      "category": "STATIC",
      "enabled": true,
      "schedule": {
        "time": "23:58",
        "timezone": "Asia/Kolkata",
        "description": "Daily at 11:58 PM IST"
      }
    },
    {
      "name": "Historical API",
      "type": "historical",
      "category": "API",
      "enabled": true,
      "schedule": {
        "time": "23:58",
        "timezone": "Asia/Kolkata",
        "description": "Daily at 11:58 PM IST"
      }
    }
  ]
}
```

## Usage

### Start the Historical Scheduler

**Option 1: Using npm script (Recommended)**
```bash
npm run scheduler:historical
```

**Option 2: Direct node command**
```bash
node start-historical-scheduler.js
```

**Option 3: Using the full scheduler (includes all services)**
```bash
npm run scheduler
# or
npm start
```

### Stop the Scheduler

Press `Ctrl+C` to gracefully stop the scheduler. The scheduler will:
- Stop all scheduled tasks
- Display final statistics
- Exit cleanly

## What the Scheduler Does

1. **Loads Configuration**: Reads `schedule-config.json` to get service schedules
2. **Verifies Services**: Ensures both Historical API and STATIC services are enabled
3. **Schedules Tasks**: Sets up cron jobs for 11:58 PM IST daily
4. **Runs Services**: Automatically executes the historical scraping service at the scheduled time
5. **Logs Results**: Displays detailed logs for each run including:
   - Session ID
   - Date range processed
   - Total calls scraped
   - Total payout
   - Unique callers
   - Database insert/update counts

## Service Details

### Historical STATIC Service
- **Type**: Historical (past 10 days)
- **Category**: STATIC
- **Campaign ID**: 50033
- **Includes Adjustments**: Yes
- **Schedule**: Daily at 11:58 PM IST

### Historical API Service
- **Type**: Historical (past 10 days)
- **Category**: API
- **Campaign ID**: 46775
- **Includes Adjustments**: No
- **Schedule**: Daily at 11:58 PM IST

## Date Range

The historical service processes data for the **past 10 days**, excluding today:
- **Start Date**: 10 days ago (from yesterday)
- **End Date**: Yesterday
- **Example**: If today is November 19, 2025, it processes November 9-18, 2025

## Logging

All scheduler activities and service executions are automatically logged to files:

### Log File Location
- **Directory**: `ringbav2/logs/`
- **Filename Format**: `elocal-scheduler-YYYY-MM-DDTHH-MM-SS.log`
- **Example**: `elocal-scheduler-2025-11-19T14-30-00.log`

### What Gets Logged
- Scheduler startup and configuration
- All service executions (start, progress, completion)
- Service results (calls scraped, payouts, database operations)
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
cat ringbav2/logs/elocal-scheduler-2025-11-19T14-30-00.log

# Follow log file in real-time (if scheduler is running)
tail -f ringbav2/logs/elocal-scheduler-*.log
```

## Monitoring

The scheduler provides real-time monitoring:

### During Startup
- Displays configuration verification
- Shows scheduled services
- Lists next run times
- **Shows log file path**

### During Execution
- Logs start time (IST)
- Shows service type and category
- Displays date range being processed
- Shows progress and results
- **All output saved to log file**

### Statistics
- Total runs per service
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
   - `ELOCAL_BASE_URL` (optional, defaults to https://elocal.com)
   - `RINGBA_ACCOUNT_ID` (optional, for Ringba integration)
   - `RINGBA_API_TOKEN` (optional, for Ringba integration)

2. **Database**: PostgreSQL database must be set up and accessible

3. **Node.js**: Version 18.0.0 or higher

## Troubleshooting

### Scheduler Not Starting
- Check that `schedule-config.json` exists and is valid JSON
- Verify both Historical services are `enabled: true`
- Check environment variables are set correctly

### Services Not Running
- Verify the system timezone is correct
- Check that the scheduler process is still running
- Review logs for error messages

### Database Errors
- Ensure PostgreSQL is running and accessible
- Verify database credentials in `.env`
- Check that tables exist (run `npm run setup:db` if needed)

## Running as a Background Service

To run the scheduler as a background service (e.g., using PM2):

```bash
# Install PM2 globally
npm install -g pm2

# Start the scheduler
pm2 start start-historical-scheduler.js --name "elocal-historical-scheduler"

# View logs
pm2 logs elocal-historical-scheduler

# Stop the scheduler
pm2 stop elocal-historical-scheduler

# Restart the scheduler
pm2 restart elocal-historical-scheduler
```

## Manual Execution

To manually run the historical services without waiting for the scheduler:

```bash
# Run Historical STATIC service
npm run test:historical

# Run Historical API service
npm run test:historical-api
```

## Notes

- The scheduler runs continuously and must remain active for scheduled tasks to execute
- Both services run at the same time (11:58 PM IST) but execute sequentially
- The scheduler uses `node-cron` with IST timezone support
- All logs are displayed in the console and can be redirected to a file if needed

