# Services Restart Required - Adjustment Double Application Fix

## Summary

The changes made to prevent double application of adjustments affect **all eLocal scraping services**. Any running schedulers or services that use the eLocal scraper need to be restarted to pick up the changes.

---

## Files Modified

1. **`src/services/elocal.scrapper.js`**
   - Added logic to skip adjustments already applied to calls
   - Enhanced matching logic to check for existing adjustments

2. **`src/database/postgres-operations.js`**
   - Updated `getCallsForDateRange()` to include adjustment fields
   - Updated `getCallById()` to include adjustment fields

---

## Services Affected

All services that use `scrapeElocalDataWithDateRange()` are affected:

### 1. Historical Services
- **Historical STATIC Service** (`scrapeHistoricalData`)
- **Historical API Service** (`scrapeHistoricalDataAPI`)

### 2. Current Day Services
- **Current STATIC Service** (`scrapeCurrentDayData`)
- **Current API Service** (`scrapeCurrentDayDataAPI`)

---

## Schedulers That Need Restart

### ✅ **MUST RESTART** (if running):

1. **Historical Scheduler**
   - **Script**: `start-historical-scheduler.js`
   - **Command**: `npm run scheduler:historical`
   - **Runs**: Historical STATIC and API services at 11:58 PM IST daily
   - **Status**: ⚠️ **RESTART REQUIRED**

2. **Current Day Scheduler**
   - **Script**: `start-current-scheduler.js`
   - **Command**: `npm run scheduler:current`
   - **Runs**: Current STATIC and API services multiple times daily
   - **Status**: ⚠️ **RESTART REQUIRED**

3. **Main Scheduler** (if using)
   - **Script**: `src/services/scheduler.js`
   - **Command**: `npm run scheduler` or `npm start`
   - **Runs**: All configured services from `schedule-config.json`
   - **Status**: ⚠️ **RESTART REQUIRED**

---

## Manual Scripts (No Restart Needed)

These scripts are run on-demand and will automatically use the new code:

- ✅ `run-scraper.js` - Custom date range scraper
- ✅ `test-service.js` - Test script for services
- ✅ `run-current-service-for-date.js` - Run current service for specific date

**No action needed** - They will use the updated code on next run.

---

## How to Restart Services

### Option 1: Restart Individual Schedulers

```bash
# Stop the scheduler (Ctrl+C or kill process)
# Then restart:

# Historical Scheduler
npm run scheduler:historical

# Current Day Scheduler
npm run scheduler:current

# Main Scheduler
npm run scheduler
```

### Option 2: Restart All Services (if using PM2 or similar)

```bash
# If using PM2
pm2 restart all

# Or restart specific processes
pm2 restart historical-scheduler
pm2 restart current-scheduler
pm2 restart main-scheduler
```

### Option 3: Restart System Service (if running as systemd service)

```bash
# If running as systemd service
sudo systemctl restart elocal-historical-scheduler
sudo systemctl restart elocal-current-scheduler
sudo systemctl restart elocal-main-scheduler
```

---

## Verification Steps

After restarting, verify the fix is working:

1. **Check Logs**: Look for messages like:
   ```
   [INFO] Skipping adjustment for call ID X - adjustment already applied
   ```

2. **Run Test Script**:
   ```bash
   node test-adjustment-double-application.js 22-12-2025
   ```
   Should show: `✅ SUCCESS: All adjustments would be correctly skipped!`

3. **Monitor Next Run**: When the scheduler runs next, check that:
   - Adjustments are not applied multiple times
   - Payout values remain correct
   - No duplicate adjustments in logs

---

## Impact if Not Restarted

If services are **NOT restarted**:

- ❌ Old code will continue running
- ❌ Adjustments may still be applied multiple times
- ❌ Payout values may be incorrect
- ❌ Data integrity issues may persist

**Recommendation**: Restart all affected schedulers as soon as possible.

---

## Services NOT Affected

These services are **NOT affected** and do **NOT need restart**:

- ✅ Ringba Cost Sync Service (`ringba-cost-sync.js`)
- ✅ Ringba Original Sync Service (`ringba-original-sync.js`)
- ✅ Ringba Historical Sync Service (`ringba-historical-sync.js`)
- ✅ Auth Refresh Scheduler
- ✅ Campaign Summary Scheduler
- ✅ Payout Comparison Scheduler

---

## Quick Checklist

- [ ] Identify which schedulers are currently running
- [ ] Stop running schedulers
- [ ] Restart Historical Scheduler (if enabled)
- [ ] Restart Current Day Scheduler (if enabled)
- [ ] Restart Main Scheduler (if using)
- [ ] Verify logs show correct behavior
- [ ] Run test script to confirm fix is working
- [ ] Monitor next scheduled run

---

## Questions?

If you're unsure which services are running:

1. Check running processes:
   ```bash
   ps aux | grep -E "scheduler|scraper"
   ```

2. Check PM2 processes (if using):
   ```bash
   pm2 list
   ```

3. Check systemd services (if using):
   ```bash
   sudo systemctl list-units | grep elocal
   ```


