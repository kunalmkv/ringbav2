# Auth Refresh Scheduler

## Overview

The Auth Refresh Scheduler automatically refreshes eLocal authentication cookies every 3 days at 8:00 PM IST (20:00). The service uses Puppeteer to log into the eLocal website and saves the authentication session to the PostgreSQL database.

## Features

- **Automatic Refresh**: Runs every 3 days at 8:00 PM IST
- **Puppeteer Login**: Uses headless browser automation to log into eLocal
- **Database Storage**: Saves sessions to PostgreSQL `auth_sessions` table
- **Smart Scheduling**: Checks daily at 8 PM but only executes if 3 days have passed since last successful run
- **File Logging**: All logs are saved to timestamped log files
- **Error Handling**: Graceful error handling with detailed logging
- **Statistics Tracking**: Tracks successful runs, skipped runs, and failures

## Usage

### Start the Scheduler

```bash
npm run scheduler:auth-refresh
```

Or directly:

```bash
node start-auth-refresh-scheduler.js
```

### Stop the Scheduler

Press `Ctrl+C` to stop the scheduler gracefully. It will:
- Stop all scheduled tasks
- Save final statistics
- Close log files properly

## Schedule Details

- **Time**: 8:00 PM IST (20:00) daily
- **Execution Logic**: Checks daily at 8 PM, but only executes if 3 days have passed since the last successful run
- **Timezone**: Asia/Kolkata (IST)

### Example Timeline

- **Day 1 (8 PM)**: First run - executes immediately
- **Day 2 (8 PM)**: Checks - skips (only 1 day since last run)
- **Day 3 (8 PM)**: Checks - skips (only 2 days since last run)
- **Day 4 (8 PM)**: Executes (3 days since last run)
- **Day 5-7 (8 PM)**: Checks - skips
- **Day 8 (8 PM)**: Executes (3 days since last run)
- And so on...

## Configuration

### Required Environment Variables

The scheduler requires the following environment variables in your `.env` file:

```env
# eLocal Credentials
ELOCAL_USERNAME=your_username
ELOCAL_PASSWORD=your_password
ELOCAL_BASE_URL=https://elocal.com  # Optional, defaults to https://elocal.com

# PostgreSQL Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB_NAME=your_database
POSTGRES_USER_NAME=your_user
POSTGRES_PASSWORD=your_password
DB_SSL=false  # Set to 'true' if using SSL

# Optional
AUTH_REFRESH_TIMEOUT_MS=30000  # Timeout for Puppeteer operations (default: 30000ms)
```

### Database Table

The scheduler requires the `auth_sessions` table to exist. Create it using:

```bash
npm run auth:migrate
```

## How It Works

1. **Daily Check**: The scheduler runs a cron job daily at 8:00 PM IST
2. **3-Day Check**: Before executing, it checks if 3 days have passed since the last successful run
3. **Puppeteer Login**: If 3 days have passed, it:
   - Launches a headless browser (Puppeteer)
   - Navigates to eLocal login page
   - Fills in username and password
   - Submits the login form
   - Captures authentication cookies
4. **Save to Database**: Saves the session to PostgreSQL `auth_sessions` table
5. **Update Tracking**: Updates the last successful run date

## Log Files

All scheduler activity is logged to files in the `logs/` directory:

```
logs/auth-refresh-scheduler-YYYY-MM-DDTHH-MM-SS.log
```

Log files include:
- Scheduler startup information
- Each execution attempt (successful, skipped, or failed)
- Detailed error messages and stack traces
- Statistics and summary information

## Statistics

The scheduler tracks the following statistics:

- **Total Checks**: Number of times the scheduler checked (daily at 8 PM)
- **Successful Runs**: Number of successful auth refreshes
- **Skipped Runs**: Number of times execution was skipped (not yet 3 days)
- **Failed Runs**: Number of failed attempts
- **Success Rate**: Percentage of successful runs
- **Skip Rate**: Percentage of skipped runs
- **Last Run**: Timestamp of the last execution

## Manual Execution

You can also run the auth refresh service manually without the scheduler:

```bash
npm run auth:refresh
```

This will immediately refresh the auth session and save it to the database.

## Troubleshooting

### Scheduler Not Running

1. Check that all required environment variables are set
2. Verify database connection is working
3. Ensure `auth_sessions` table exists
4. Check log files for error messages

### Auth Refresh Failing

1. Verify eLocal credentials are correct
2. Check if eLocal website is accessible
3. Ensure Puppeteer can launch browser (check system dependencies)
4. Review log files for detailed error messages

### Browser Launch Issues

If Puppeteer fails to launch:
- On Linux: Install Chromium: `sudo apt-get install chromium-browser`
- On macOS: Ensure Chrome/Chromium is installed
- Check that `--no-sandbox` flag is working (may need system configuration)

## Related Services

- **Auth Refresh Service**: `src/services/auth-refresh.js`
- **Session Store**: `src/auth/session-store-postgres.js`
- **Run Script**: `run-auth-refresh.js`

## Notes

- The scheduler uses a "check daily, execute every 3 days" approach to ensure reliability
- If a run fails, it will retry on the next scheduled check (next day at 8 PM)
- The last successful run date is tracked in memory and resets when the scheduler restarts
- Sessions are valid for 3 days (matching the refresh interval)

