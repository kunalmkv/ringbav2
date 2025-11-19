# Ringba Original Payout/Revenue Sync Service

## Overview

This service fetches all calls from Ringba for a specified date range and matches them with existing database records. It then updates the matched records with `original_payout` and `original_revenue` values from Ringba.

## Features

- **Fetches all calls from Ringba** for a date range (no target filter)
- **Intelligent matching** using:
  - Caller ID (converted to E.164 format)
  - Time range (±60 minutes window)
  - Payout values (if available)
- **Updates database** with original payout/revenue from Ringba
- **Comprehensive logging** and summary statistics

## Database Schema

The service requires two new columns in the `elocal_call_data` table:

- `original_payout` (DECIMAL(10, 2)) - Original payout value from Ringba
- `original_revenue` (DECIMAL(10, 2)) - Original revenue value from Ringba

These columns are automatically added when you run the migration script.

## Setup

### 1. Run Database Migration

First, add the required columns to your database:

```bash
node migrate-add-original-columns.js
```

This will:
- Add `original_payout` column
- Add `original_revenue` column
- Create indexes on both columns

### 2. Environment Variables

Ensure you have the following environment variables set:

```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB_NAME=your_database
POSTGRES_USER_NAME=your_user
POSTGRES_PASSWORD=your_password

# Ringba API
RINGBA_ACCOUNT_ID=your_account_id
RINGBA_API_TOKEN=your_api_token
```

## Usage

### Command Line

```bash
node run-ringba-original-sync.js <date-range>
```

### Date Range Formats

The script accepts various date formats:

**Special Keywords:**
- `historical` or `past10days` - Past 10 days (excluding today)

**Single Date:**
- `2025-11-19` (YYYY-MM-DD)
- `11/19/2025` (MM/DD/YYYY)
- `19-11-2025` (DD-MM-YYYY)

**Date Range:**
- `2025-11-19:2025-11-20` (YYYY-MM-DD:YYYY-MM-DD)
- `11/19/2025:11/20/2025` (MM/DD/YYYY:MM/DD/YYYY)
- `18-11-2025:19-11-2025` (DD-MM-YYYY:DD-MM-YYYY)

### Examples

```bash
# Sync past 10 days
node run-ringba-original-sync.js historical

# Sync specific date range
node run-ringba-original-sync.js 18-11-2025:19-11-2025

# Sync single date
node run-ringba-original-sync.js 2025-11-19
```

## How It Works

### Step 1: Fetch Calls from Ringba

The service fetches all calls from Ringba for the specified date range using the Ringba Call Logs API. It retrieves:
- `inboundCallId`
- `callDt` (call date/time)
- `tag:InboundNumber:Number` (caller ID in E.164 format)
- `payoutAmount` (payout)
- `conversionAmount` (revenue)
- Additional metadata (target, campaign, publisher)

### Step 2: Fetch Calls from Database

The service queries the database for all calls within the date range from the `elocal_call_data` table.

### Step 3: Match Calls

For each Ringba call, the service finds the best matching database call using:

1. **Caller ID Match**: Both caller IDs are converted to E.164 format and compared
2. **Time Window**: Call times must be within ±60 minutes
3. **Payout Match** (if available): Payout values are compared with a tolerance of $0.01

The matching algorithm prioritizes:
- Exact payout matches (best)
- Close payout matches
- Time proximity

### Step 4: Update Database

Matched calls are updated with:
- `original_payout` - Payout value from Ringba
- `original_revenue` - Revenue value from Ringba
- `ringba_inbound_call_id` - Ringba inbound call ID (if not already set)

**Note**: The service only updates records where `original_payout` is `NULL` (first-time sync). This prevents overwriting existing values.

## Output

The service provides detailed logging and a summary:

```
======================================================================
Ringba Original Payout/Revenue Sync
======================================================================
Date Range: 11/18/2025 to 11/19/2025
Start: 2025-11-18T00:00:00.000Z
End: 2025-11-19T23:59:59.999Z
======================================================================

[Step 1] Fetching calls from Ringba...
[Step 1] ✅ Fetched 1234 calls from Ringba

[Step 2] Fetching calls from database...
[Step 2] ✅ Fetched 1000 calls from database

[Step 3] Matching Ringba calls with database calls...
[Step 3] ✅ Matched 950 calls
         - Unmatched Ringba calls: 284
         - Unmatched database calls: 50

[Step 4] Updating database with original payout/revenue from Ringba...
[Step 4] ✅ Updated 900 calls, skipped 50 (already had values), 0 errors

======================================================================
Sync Summary
======================================================================
Date Range:           11/18/2025 to 11/19/2025
Ringba Calls:         1234
Database Calls:       1000
Matched:              950
Unmatched Ringba:     284
Unmatched Database:   50
Updated:              900
Skipped:              50 (already had original values)
Errors:               0
Match Rate:           95.00%
======================================================================
```

## Matching Logic Details

### Caller ID Conversion

Phone numbers are normalized to E.164 format:
- Removes all non-digit characters
- Removes leading "1" if present (US country code)
- Adds "+" prefix

Example: `(555) 123-4567` → `+15551234567`

### Time Window Matching

Calls are matched if their timestamps are within ±60 minutes of each other. The service calculates the time difference and uses it as part of the match score.

### Payout Matching

If both calls have payout values:
- **Exact match**: Payout difference ≤ $0.01 → Best match (score × 0.1)
- **Close match**: Payout difference > $0.01 → Penalty added to score
- **No payout**: Falls back to time-based matching only

## Error Handling

The service handles various error scenarios:

- **API Errors**: Logs and continues with next page
- **Database Errors**: Logs and continues with next record
- **Matching Errors**: Logs and continues with next call
- **Missing Data**: Skips calls with missing required fields

## Performance Considerations

- **Batch Processing**: Processes calls in batches of 1000
- **Rate Limiting**: Adds 200ms delay between API pages
- **Efficient Matching**: Groups database calls by caller ID for faster lookup
- **Selective Updates**: Only updates records without existing `original_payout` values

## Troubleshooting

### Low Match Rate

If the match rate is low, check:

1. **Caller ID Format**: Ensure caller IDs in database are in a format that can be converted to E.164
2. **Time Accuracy**: Verify that call times in database match Ringba call times
3. **Date Range**: Ensure the date range includes all relevant calls
4. **Payout Values**: Check if payout values in database match Ringba payouts

### Unmatched Calls

Unmatched calls can occur due to:

- **Missing Caller ID**: Calls without valid caller IDs cannot be matched
- **Time Mismatch**: Calls outside the ±60 minute window
- **Payout Mismatch**: Calls with significantly different payout values
- **Missing in Database**: Ringba calls that don't exist in database
- **Missing in Ringba**: Database calls that don't exist in Ringba

## Files

- `src/services/ringba-original-sync.js` - Main sync service
- `run-ringba-original-sync.js` - Command-line script
- `migrate-add-original-columns.js` - Database migration script
- `src/database/postgres-operations.js` - Database operations (updated with new methods)

## Related Services

- `ringba-cost-sync.js` - Syncs Ringba cost data by target ID
- `ringba-sync.js` - Syncs adjustments from eLocal to Ringba

