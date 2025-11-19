# Ringba Cost Sync Service - Logic and Process Flow

## Overview

The Ringba Cost Sync service synchronizes cost changes from the eLocal database to the Ringba dashboard. It detects differences in payout/revenue between eLocal and Ringba calls, and updates Ringba via API.

## Complete Process Flow

### Step 1: Fetch eLocal Calls
**Function:** `getElocalCallsForSync()`

1. **Query Database:**
   - Fetches calls from `elocal_call_data` table
   - Filters by date range (past 10 days by default)
   - Optional category filter (API or STATIC)
   - Selects: `id`, `caller_id`, `date_of_call`, `payout`, `category`, `original_payout`, `original_revenue`

2. **Date Range Processing:**
   - Generates all dates in the range (YYYY-MM-DD format)
   - Uses `SUBSTRING(date_of_call, 1, 10)` to match date part
   - Handles full timestamps stored as `YYYY-MM-DDTHH:mm:ss`

3. **Result:**
   - Returns array of eLocal calls with all payout/revenue information

### Step 2: Fetch Ringba Calls
**Function:** `getRingbaCallsForMatching()`

1. **Query Database:**
   - Fetches calls from `ringba_calls` table
   - Filters by same date range
   - Selects: `id`, `inbound_call_id`, `call_date_time`, `caller_id`, `caller_id_e164`, `payout_amount`, `revenue_amount`

2. **Date Matching:**
   - Ringba dates stored as `YYYY-MM-DDTHH:mm:ss` (EST timezone)
   - Uses `SUBSTRING(call_date_time, 1, 10)` to extract date part
   - Matches against date range

3. **Result:**
   - Returns array of Ringba calls with payout/revenue from database

### Step 3: Match Calls
**Function:** `matchCall()` - Called for each eLocal call

#### Matching Criteria (All Must Pass):

**1. Caller ID Match (E.164 Format)**
- Normalizes both eLocal and Ringba caller IDs to E.164 format
- E.164 format: `+1XXXXXXXXXX` (e.g., `+12015551234`)
- Conversion logic:
  - If already starts with `+`, use as-is
  - 11 digits starting with `1`: Add `+` prefix
  - 10 digits: Add `+1` prefix
- Skips anonymous or invalid caller IDs
- **Must match exactly** in E.164 format

**2. Time Window Match**
- Parses both dates to Date objects
- eLocal dates: Stored as `YYYY-MM-DDTHH:mm:ss` (EST timezone)
- Ringba dates: Stored as `YYYY-MM-DDTHH:mm:ss` (EST timezone, converted during sync)
- **Time Window:** 120 minutes (2 hours) by default
  - If same day: 120-minute window
  - If adjacent days: 24-hour window (1440 minutes)
- Calculates time difference in minutes
- **Must be within time window**

**3. Payout Match (Optional but Used for Scoring)**
- Compares eLocal payout with Ringba payout
- **Tolerance:** $0.01
- Used to calculate match score (lower is better)
- Exact payout match: `matchScore = timeDiff * 0.1`
- Payout difference: `matchScore = timeDiff + (payoutDiff * 10)`

**Match Score Calculation:**
- Lower score = better match
- Time difference is primary factor
- Payout match reduces score significantly
- Best match is selected (lowest score)

### Step 4: Detect Changes
**Function:** `detectChanges()`

1. **Group Ringba Calls by Caller ID:**
   - Creates a Map: `callerE164 -> [ringbaCalls]`
   - Groups all Ringba calls with same caller ID for faster lookup

2. **Match Each eLocal Call:**
   - For each eLocal call:
     - Normalize caller ID to E.164
     - Find candidate Ringba calls with same caller ID
     - Try to match with each candidate using `matchCall()`
     - Select best match (lowest match score)
     - Mark Ringba call as matched (prevents duplicate matches)

3. **Check for Updates:**
   - Compare eLocal payout/revenue with Ringba payout/revenue
   - **Skip if:** Both are $0.00 (no update needed)
   - **Update if:** Difference > $0.01 tolerance
   - Use eLocal payout for both new payout and new revenue

4. **Categorize Results:**
   - **Updates:** Calls that need updating in Ringba
   - **Unmatched:** eLocal calls that couldn't be matched
     - Reasons: Invalid caller ID, no matching Ringba call, time/payout mismatch

### Step 5: Update Ringba
**Function:** `updateRingbaCall()`

1. **For Each Update:**
   - Prepare payload:
     ```javascript
     {
       newConversionAmount: newRevenue,  // Same as newPayout
       newPayoutAmount: newPayout,
       reason: 'Call payments synced from eLocal database.'
     }
     ```

2. **API Call:**
   - Calls Ringba API: `updateCallPayment()`
   - Updates single call by `inbound_call_id`
   - Uses `fp-ts` TaskEither for error handling

3. **Rate Limiting:**
   - 500ms delay between requests
   - Prevents API rate limit issues

4. **Track Results:**
   - **Updated:** Successfully updated calls
   - **Failed:** Calls that failed to update (with error message)

## Matching Algorithm Details

### Time Window Logic

```javascript
// Default window: 120 minutes (2 hours)
windowMinutes = 120

// If same day:
effectiveWindow = 120 minutes

// If adjacent days (crosses midnight):
effectiveWindow = 24 hours (1440 minutes)

// Time difference must be <= effectiveWindow
if (timeDiff > effectiveWindow) {
  return null; // No match
}
```

### Match Score Calculation

```javascript
// Base score = time difference in minutes
matchScore = timeDiff

// If both have payout > 0:
if (elocalPayout > 0 && ringbaPayout > 0) {
  if (payoutDiff <= 0.01) {
    // Exact payout match - reduce score significantly
    matchScore = timeDiff * 0.1
  } else {
    // Payout difference - penalize score
    matchScore = timeDiff + (payoutDiff * 10)
  }
}

// Lower score = better match
// Best match is selected (lowest score)
```

### Example Matching Scenarios

**Scenario 1: Perfect Match**
- Caller ID: Both `+12015551234` ✓
- Time: 5 minutes apart ✓
- Payout: Both $30.00 (diff = $0.00) ✓
- **Result:** Match score = 0.5 (5 min * 0.1) → **MATCHED**

**Scenario 2: Time Match, Payout Mismatch**
- Caller ID: Both `+12015551234` ✓
- Time: 10 minutes apart ✓
- Payout: eLocal $30.00, Ringba $25.00 (diff = $5.00)
- **Result:** Match score = 60 (10 min + $5 * 10) → **MATCHED** (if best score)

**Scenario 3: Time Mismatch**
- Caller ID: Both `+12015551234` ✓
- Time: 150 minutes apart ✗ (exceeds 120 min window)
- **Result:** **NO MATCH** → Unmatched

**Scenario 4: No Ringba Call**
- Caller ID: `+12015551234` ✓
- No Ringba call with same caller ID
- **Result:** **NO MATCH** → Unmatched (reason: "No matching Ringba call found")

## Data Flow Diagram

```
┌─────────────────┐
│  eLocal DB      │
│  elocal_call_   │
│  data table     │
└────────┬────────┘
         │
         │ Step 1: Fetch eLocal Calls
         ▼
┌─────────────────┐
│  eLocal Calls    │
│  (278 calls)     │
└────────┬────────┘
         │
         │ Step 2: Fetch Ringba Calls
         ▼
┌─────────────────┐
│  ringba_calls   │
│  table          │
└────────┬────────┘
         │
         │ Step 3: Match Calls
         ▼
┌─────────────────┐
│  Matching       │
│  Algorithm      │
│  - Caller ID    │
│  - Time Window  │
│  - Payout       │
└────────┬────────┘
         │
         │ Step 4: Detect Changes
         ▼
┌─────────────────┐      ┌─────────────────┐
│  Updates        │      │  Unmatched      │
│  (1 call)       │      │  (276 calls)    │
└────────┬────────┘      └─────────────────┘
         │
         │ Step 5: Update Ringba
         ▼
┌─────────────────┐
│  Ringba API     │
│  updateCall     │
│  Payment        │
└─────────────────┘
```

## Key Parameters

### Matching Parameters
- **Time Window:** 120 minutes (2 hours) - configurable
- **Payout Tolerance:** $0.01 - configurable
- **Date Range:** Past 10 days (default) - configurable

### Update Parameters
- **Update Tolerance:** $0.01 (only update if difference > $0.01)
- **Rate Limit Delay:** 500ms between API calls
- **Revenue = Payout:** Always uses same value for both

## Error Handling

1. **Invalid Caller ID:**
   - Cannot normalize to E.164 format
   - Marked as unmatched with reason: "Invalid caller ID"

2. **No Matching Ringba Call:**
   - No Ringba call exists with same caller ID
   - Marked as unmatched with reason: "No matching Ringba call found"

3. **Time/Payout Mismatch:**
   - Caller ID matches but time difference > 120 minutes
   - Or payout difference too large
   - Marked as unmatched with reason: "No matching Ringba call found (time/payout mismatch)"

4. **API Update Failures:**
   - Tracked in `failed` count
   - Error message logged
   - Service continues with next update

## Summary Statistics

After completion, the service returns:
- **eLocal Calls:** Total eLocal calls fetched
- **Ringba Calls:** Total Ringba calls fetched
- **Changes Detected:** Number of calls needing updates
- **Successfully Updated:** Number of calls updated in Ringba
- **Failed:** Number of calls that failed to update
- **Unmatched:** Number of eLocal calls that couldn't be matched

## Important Notes

1. **One-to-One Matching:**
   - Each Ringba call can only be matched once
   - Prevents duplicate updates

2. **Best Match Selection:**
   - If multiple Ringba calls match, selects the one with lowest match score
   - Match score considers time difference and payout match

3. **Timezone Handling:**
   - Both eLocal and Ringba dates are stored in EST
   - Time window accounts for small timezone differences

4. **Payout/Revenue Sync:**
   - Always sets both payout and revenue to eLocal payout value
   - Both fields updated together in Ringba

5. **Zero Payout Handling:**
   - If both eLocal and Ringba payouts are $0.00, no update is performed
   - Reduces unnecessary API calls

