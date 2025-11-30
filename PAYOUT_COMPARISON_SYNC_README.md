# Payout Comparison Pre-Calculated Table

This document describes the new pre-calculated table system for the Payout Comparison feature.

## Overview

Previously, the Payout Comparison table calculated all values in real-time from multiple database tables. This has been replaced with a pre-calculated table (`payout_comparison_daily`) that stores all calculated values, improving performance and reducing frontend complexity.

## Database Schema

### Table: `payout_comparison_daily`

Stores pre-calculated daily payout comparison data with all metrics.

**Columns:**
- `comparison_date` (DATE, UNIQUE) - The date for this comparison
- `ringba_static` (DECIMAL) - Ringba static payout
- `ringba_api` (DECIMAL) - Ringba API revenue
- `ringba_total` (DECIMAL) - Total Ringba (static + API)
- `elocal_static` (DECIMAL) - Elocal static payout
- `elocal_api` (DECIMAL) - Elocal API payout
- `elocal_total` (DECIMAL) - Total Elocal (static + API)
- `adjustments` (DECIMAL) - Ringba Total - Elocal Total
- `adjustment_static_pct` (DECIMAL) - (Ringba Static - Elocal Static) / 100
- `adjustment_api_pct` (DECIMAL) - (Ringba API - Elocal API) / 100
- `adjustment_pct` (DECIMAL) - (Adjustments / Ringba Total) * 100
- `total_calls` (INTEGER) - Total number of calls
- `rpc` (DECIMAL) - Revenue Per Call
- `google_ads_spend` (DECIMAL) - Google Ads spend amount
- `google_ads_notes` (TEXT) - Notes for Google Ads spend
- `telco` (DECIMAL) - Telco cost (from insights_total_cost)
- `cost_per_call` (DECIMAL) - Google Ads Spend / Total Calls
- `net` (DECIMAL) - Elocal Total - Google Ads Spend - Telco
- `net_profit` (DECIMAL) - (Net / Elocal Total) * 100
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## Setup

### 1. Create the Table

Run the migration script:

```bash
node migrate-create-payout-comparison-table.js
```

### 2. Sync Data

Sync data for a specific date:

```bash
node run-payout-comparison-sync.js 2025-11-21
```

Sync data for a date range:

```bash
node run-payout-comparison-sync.js 2025-11-01 2025-11-30
# or
node run-payout-comparison-sync.js 2025-11-01:2025-11-30
```

## Service: `payout-comparison-sync.js`

### Functions

#### `syncPayoutComparisonForDate(date)`
Calculates and stores payout comparison data for a specific date.

**Parameters:**
- `date` (string) - Date in YYYY-MM-DD format

**Returns:** Object with calculated values

#### `syncPayoutComparisonForDateRange(startDate, endDate)`
Syncs data for a date range.

**Parameters:**
- `startDate` (string) - Start date in YYYY-MM-DD format
- `endDate` (string) - End date in YYYY-MM-DD format

**Returns:** Object with sync results

#### `updateGoogleAdsSpend(date, spend, notes)`
Updates Google Ads spend and recalculates dependent metrics (cost_per_call, net, net_profit).

**Parameters:**
- `date` (string) - Date in YYYY-MM-DD format
- `spend` (number) - Google Ads spend amount
- `notes` (string, optional) - Notes

**Returns:** Object with updated values

## API Changes

### GET `/api/payout-comparison`

Now fetches data from `payout_comparison_daily` table instead of calculating in real-time.

**Query Parameters:**
- `startDate` (optional) - Start date filter
- `endDate` (optional) - End date filter

**Response:** Array of pre-calculated records

### POST `/api/google-ads-spend`

Updates both `ringba_campaign_summary` and `payout_comparison_daily` tables, and recalculates:
- `cost_per_call`
- `net`
- `net_profit`

## Frontend Changes

The frontend (`PayoutComparison.jsx`) no longer performs any calculations. All values are fetched directly from the API:

- `cost_per_call` - Pre-calculated
- `net` - Pre-calculated
- `net_profit` - Pre-calculated

## Data Sources

The sync service pulls data from:

1. **elocal_call_data** - For Ringba/Elocal payouts by category
2. **ringba_campaign_summary** - For:
   - RPC (Revenue Per Call)
   - Google Ads spend
   - Telco cost (insights_total_cost)

## Scheduling

You can schedule regular syncs using cron or a scheduler. For example, to sync yesterday's data daily:

```bash
# Add to crontab
0 2 * * * cd /path/to/ringbav2 && node run-payout-comparison-sync.js $(date -d "yesterday" +\%Y-\%m-\%d)
```

## Benefits

1. **Performance** - No real-time calculations, faster page loads
2. **Consistency** - All calculations done in one place
3. **Maintainability** - Easier to update calculation logic
4. **Scalability** - Can handle large date ranges efficiently

## Notes

- The table uses `ON CONFLICT` to update existing records
- Google Ads spend updates automatically recalculate dependent metrics
- The sync service handles missing data gracefully (defaults to 0)

