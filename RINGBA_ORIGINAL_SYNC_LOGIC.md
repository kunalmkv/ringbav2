# Ringba Original Sync Service - Detailed Step-by-Step Logic

## Overview
The `ringba-original-sync` service fetches calls from Ringba API, saves them to the database, and matches them with eLocal calls to populate `original_payout` and `original_revenue` fields in the `elocal_call_data` table.

---

## Entry Point: `run-ringba-original-sync.js`

### Step 1: Command Line Parsing
1. **Read Arguments:**
   - `process.argv[2]` = date range (defaults to "current" if not provided)
   - `process.argv[3]` = category filter (optional: "API" or "STATIC")

2. **Date Range Parsing:**
   - **Special Keywords:**
     - `"current"` or `"today"` → Uses `getRingbaSyncDateRange()` (current day with timezone logic)
     - `"historical"` or `"past10days"` → Uses `getPast10DaysRange()` (past 10 days excluding today)
   - **Single Date:** `"2025-12-02"`, `"12/02/2025"`, or `"02-12-2025"`
   - **Date Range:** `"2025-12-01:2025-12-02"` (start:end format)
   - **Result:** Returns object with `{ startDate, endDate, startDateFormatted, endDateFormatted }`

3. **Category Validation:**
   - If provided, must be "API" or "STATIC"
   - If invalid, shows error and exits

4. **Config Building:**
   - Reads environment variables:
     - `POSTGRES_HOST` / `DB_HOST`
     - `POSTGRES_PORT` / `DB_PORT` (default: 5432)
     - `POSTGRES_DB_NAME` / `DB_NAME`
     - `POSTGRES_USER_NAME` / `DB_USER`
     - `POSTGRES_PASSWORD` / `DB_PASSWORD`
     - `DB_SSL` (true/false)
     - `RINGBA_ACCOUNT_ID`
     - `RINGBA_API_TOKEN`

5. **Config Validation:**
   - Checks all required environment variables are present
   - Exits with error if any are missing

---

## Main Service: `syncRingbaOriginalPayout()`

### Step 1: Fetch All Calls from Ringba API

**Function:** `fetchAllRingbaCalls(accountId, apiToken, startDate, endDate)`

**Process:**
1. **Initialize:** Creates empty `allCalls` array
2. **Target IDs:** Iterates through `TARGET_IDS` object:
   - `TA48aa3e3f5a0544af8549703f76a24faa` → "Elocal - Appliance repair - Static Line" (STATIC)
   - `PI1175ac62aa1c4748b21216666b398135` → "Elocal - Appliance Repair" (API)

3. **For Each Target ID:**
   a. **Determine Category:**
      - Uses `getCategoryFromTargetId(targetId)`
      - Checks if target name contains "static" (case-insensitive)
      - Returns "STATIC" if found, otherwise "API"
   
   b. **Fetch Calls from Ringba API:**
      - Calls `getCallsByTargetId(accountId, apiToken)(targetId, options)`
      - Options: `{ startDate, endDate, pageSize: 1000 }`
      - Uses Ringba API endpoint: `/v2/{accountId}/calllogs`
      - Handles pagination automatically
   
   c. **Transform Each Call:**
      - **Extract Payout/Revenue:**
        - `payout = Number(call.ringbaCost || call.payout || 0)`
        - `revenue = Number(call.revenue || 0)`
      
      - **Normalize Caller ID:**
        - Gets `call.callerId` from Ringba
        - Converts to E.164 format using `toE164()`:
          - If already starts with "+", use as-is
          - If 11 digits starting with "1", add "+" prefix
          - If 10 digits, add "+1" prefix
          - Otherwise, try to format as E.164
      
      - **Convert Date to EST:**
        - Ringba returns dates in format: `MM/DD/YYYY HH:MM:SS AM/PM`
        - Calls `convertRingbaDateToEST(callDate)` to convert to EST timezone
        - Result: `YYYY-MM-DDTHH:mm:ss` format (EST timezone)
        - If conversion fails, logs warning and uses original format
      
      - **Extract Call Duration:**
        - `callDuration = call.callDuration || 0` (in seconds)
      
      - **Build Call Object:**
        ```javascript
        {
          inboundCallId: call.inboundCallId,
          callDt: callDtEST,              // EST converted date
          callDtOriginal: callDtOriginal, // Original Ringba format
          callerId: ringbaCallerId,       // Original caller ID
          callerIdE164: callerIdE164,     // E.164 normalized
          inboundPhoneNumber: call.inboundPhoneNumber,
          payout: payout,
          revenue: revenue,
          callDuration: callDuration,
          targetId: targetId,
          targetName: call.targetName || targetName,
          campaignName: call.campaignName,
          publisherName: call.publisherName
        }
        ```
      
      - **Add to Array:** `allCalls.push(callObject)`
   
   d. **Error Handling:**
      - If API call fails, logs error but continues with next target
      - Does not throw error (graceful degradation)
   
   e. **Rate Limiting:**
      - Waits 500ms between target requests to avoid rate limiting

4. **Return:** Returns `allCalls` array with all fetched and transformed calls

---

### Step 2: Save Ringba Calls to Database

**Function:** `db.insertRingbaCallsBatch(ringbaCalls)`

**Process:**
1. **Batch Processing:**
   - Processes calls in batches of 500
   - For each call in batch:
   
2. **Check if Call Exists:**
   - Queries: `SELECT id FROM ringba_calls WHERE inbound_call_id = $1`
   - If record exists:
     - **UPDATE** existing record with new data:
       ```sql
       UPDATE ringba_calls SET
         call_date_time = $2,
         caller_id = $3,
         caller_id_e164 = $4,
         payout_amount = $5,
         revenue_amount = $6,
         ...
       WHERE inbound_call_id = $1
       ```
     - Increments `updated` counter
   
   - If record doesn't exist:
     - **INSERT** new record:
       ```sql
       INSERT INTO ringba_calls (
         inbound_call_id, call_date_time, caller_id, caller_id_e164,
         payout_amount, revenue_amount, ...
       ) VALUES ($1, $2, $3, $4, ...)
       ```
     - Increments `inserted` counter
   
3. **Error Handling:**
   - If insert/update fails for a call, logs warning and increments `skipped` counter
   - Continues processing remaining calls

4. **Return:** `{ inserted, updated, skipped }`

---

### Step 3: Fetch eLocal Calls for Matching

**Function:** `getElocalCallsForMatching(db, startDate, endDate, category)`

**Process:**
1. **Calls:** `db.getCallsForDateRange(startDate, endDate, category)`

2. **Query Logic:**
   - Generates array of all dates in range (YYYY-MM-DD format)
   - Builds SQL query:
     ```sql
     SELECT 
       id, caller_id, date_of_call, payout, category,
       original_payout, original_revenue, ringba_inbound_call_id
     FROM elocal_call_data
     WHERE SUBSTRING(date_of_call, 1, 10) = ANY(ARRAY[dates...])
       [AND category = $N]  -- if category filter provided
     ORDER BY caller_id, date_of_call
     ```

3. **Return:** Array of eLocal call objects

---

### Step 4: Match Ringba Calls with eLocal Calls

**Function:** `matchAndPrepareUpdates(ringbaCalls, elocalCalls)`

**Process:**

#### Phase 1: Pre-process eLocal Calls (Indexing)

1. **Create Index Structure:**
   - Structure: `Map<category, Map<callerE164, Array<elocalCall>>>`
   - Purpose: Fast lookup by category and caller ID

2. **For Each eLocal Call:**
   a. **Get Category:**
      - `category = elocalCall.category || 'STATIC'`
   
   b. **Normalize Caller ID:**
      - `callerE164 = toE164(elocalCall.caller_id)`
      - If normalization fails (returns null), **skip** this call
   
   c. **Add to Index:**
      - If category doesn't exist in outer Map, create it
      - If callerE164 doesn't exist in inner Map, create array
      - Push eLocal call to array: `callsByCaller.get(callerE164).push(elocalCall)`

3. **Initialize Tracking:**
   - `matchedElocalIds = new Set()` - Tracks which eLocal calls have been matched (to prevent duplicate matches)

---

#### Phase 2: Match Each Ringba Call

**For Each Ringba Call in `ringbaCalls` array:**

##### Step 4.1: Filter by Category (Target ID)

1. **Get Category from Target ID:**
   - `ringbaCategory = getCategoryFromTargetId(ringbaCall.targetId)`
   - Uses same logic as Step 1.3a
   - If target ID is unknown/invalid:
     - Add to `unmatched` array with reason: `"Invalid or unknown target ID"`
     - **Continue** to next Ringba call

##### Step 4.2: Filter by Caller ID

1. **Normalize Ringba Caller ID:**
   - `callerE164 = ringbaCall.callerIdE164 || toE164(ringbaCall.callerId)`
   - If normalization fails:
     - Add to `unmatched` array with reason: `"Invalid caller ID"`
     - **Continue** to next Ringba call

2. **Lookup eLocal Calls:**
   - `categoryCalls = elocalCallsByCategoryAndCaller.get(ringbaCategory)`
   - If category doesn't exist in index:
     - Add to `unmatched` array with reason: `"No eLocal calls found for category"`
     - **Continue** to next Ringba call
   
   - `candidateElocalCalls = categoryCalls.get(callerE164) || []`
   - If no candidates found:
     - Add to `unmatched` array with reason: `"No matching eLocal call found for category and caller"`
     - **Continue** to next Ringba call

##### Step 4.3: Find Best Match by Time

1. **Initialize:**
   - `bestMatch = null`
   - `bestScore = Infinity` (lower score = better match)

2. **For Each Candidate eLocal Call:**
   
   a. **Check if Already Matched:**
      - If `matchedElocalIds.has(elocalCall.id)`:
        - **Skip** this candidate (already matched to another Ringba call)
        - **Continue** to next candidate
   
   b. **Call `matchCall()` Function:**
      - Passes: `(ringbaCall, elocalCall)`
      - Returns: Match object or `null`
   
   c. **If Match Found:**
      - Compare `match.matchScore` with `bestScore`
      - If `match.matchScore < bestScore`:
        - Update `bestMatch = match`
        - Update `bestScore = match.matchScore`
        - (This ensures we select the best time match)

3. **After Checking All Candidates:**
   - If `bestMatch === null`:
     - Determine reason:
       - If no candidates: `"no candidates"`
       - If all candidates already matched: `"all candidates already matched"`
       - Otherwise: `"time/payout mismatch"`
     - Add to `unmatched` array with reason
     - **Continue** to next Ringba call
   
   - If `bestMatch !== null`:
     - Mark eLocal call as matched: `matchedElocalIds.add(bestMatch.elocalCall.id)`
     - Proceed to Step 4.4

##### Step 4.4: Check if Update is Allowed

1. **Check Existing Values:**
   - `existingOriginalPayout = Number(bestMatch.elocalCall.original_payout || 0)`
   - `existingOriginalRevenue = Number(bestMatch.elocalCall.original_revenue || 0)`

2. **Preservation Logic:**
   - If `existingOriginalPayout !== 0` OR `existingOriginalRevenue !== 0`:
     - **Skip update** (preserve existing data)
     - Add to `skipped` array with:
       - `elocalCallId`
       - `existingOriginalPayout`
       - `existingOriginalRevenue`
       - `newPayout` (from Ringba)
       - `newRevenue` (from Ringba)
       - `reason: "original_payout or original_revenue already filled"`
     - **Continue** to next Ringba call

3. **If Both are NULL or 0:**
   - Proceed to Step 4.5

##### Step 4.5: Prepare Update

1. **Add to Updates Array:**
   ```javascript
   updates.push({
     elocalCallId: bestMatch.elocalCall.id,
     ringbaInboundCallId: ringbaCall.inboundCallId,
     originalPayout: ringbaCall.payout,
     originalRevenue: ringbaCall.revenue,
     matchInfo: {
       timeDiff: bestMatch.timeDiff,
       payoutMatch: bestMatch.payoutMatch
     }
   })
   ```

2. **Continue** to next Ringba call

---

#### Phase 3: Return Results

**Return:** `{ updates, unmatched, skipped }`

---

### Step 5: Update eLocal Calls in Database

**Function:** `db.updateOriginalPayout(elocalCallId, originalPayout, originalRevenue, ringbaInboundCallId)`

**Process:**
1. **For Each Update in `updates` Array:**
   
   a. **Execute SQL Update:**
      ```sql
      UPDATE elocal_call_data SET
        original_payout = $2,
        original_revenue = $3,
        ringba_inbound_call_id = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      ```
   
   b. **Check Result:**
      - If `result.updated > 0`: Success
        - Increment `updatedCount`
        - Increment `matchedCount`
      - If `result.updated === 0`: Failed
        - Increment `failedCount`
        - Log warning
   
   c. **Error Handling:**
      - If SQL error occurs:
        - Increment `failedCount`
        - Log error message
        - Continue with next update

2. **Progress Logging:**
   - Logs progress every 10 updates: `"[10/23] Updated 10 calls so far..."`
   - Logs final count when complete

---

## Detailed Function: `matchCall()`

**Purpose:** Determines if a Ringba call matches an eLocal call based on time and payout.

**Parameters:**
- `ringbaCall`: Ringba call object with `callDt` (EST format)
- `elocalCall`: eLocal call object with `date_of_call` (EST format)
- `windowMinutes`: Time window (default: 120 minutes)
- `payoutTolerance`: Payout difference tolerance (default: 0.01)

**Process:**

### Step 1: Parse Dates

1. **Parse eLocal Date:**
   - `elocalDate = parseDate(elocalCall.date_of_call)`
   - Handles formats: ISO, YYYY-MM-DDTHH:mm:ss, YYYY-MM-DD, MM/DD/YYYY
   - If parsing fails: **Return `null`**

2. **Parse Ringba Date:**
   - `ringbaDate = parseDate(ringbaCall.callDt)`
   - Same parsing logic as eLocal
   - If parsing fails: **Return `null`**

### Step 2: Check Date Proximity

1. **Extract Date Part (YYYY-MM-DD):**
   - `elocalDateStr = elocalDate.toISOString().split('T')[0]`
   - `ringbaDateStr = ringbaDate.toISOString().split('T')[0]`

2. **Calculate Days Difference:**
   - `daysDiff = Math.abs((elocalDateOnly - ringbaDateOnly) / (1000 * 60 * 60 * 24))`

3. **Validation:**
   - If `daysDiff > 1`: **Return `null`** (dates more than 1 day apart)

### Step 3: Calculate Time Difference

1. **Normalize Times (Ignore Seconds):**
   - `elocalTimeOnly = new Date(elocalDate)`
   - `elocalTimeOnly.setSeconds(0, 0)`
   - `ringbaTimeOnly = new Date(ringbaDate)`
   - `ringbaTimeOnly.setSeconds(0, 0)`

2. **Calculate Difference:**
   - `timeDiff = Math.abs(elocalTimeOnly - ringbaTimeOnly) / (1000 * 60)` (in minutes)

3. **Determine Effective Window:**
   - If `daysDiff === 0`: `effectiveWindow = windowMinutes` (120 minutes)
   - If `daysDiff === 1`: `effectiveWindow = 24 * 60` (1440 minutes = 24 hours)

4. **Validation:**
   - If `timeDiff > effectiveWindow`: **Return `null`** (time difference too large)

### Step 4: Calculate Match Score

1. **Extract Payouts:**
   - `elocalPayout = Number(elocalCall.payout || 0)`
   - `ringbaPayout = Number(ringbaCall.payout || 0)`
   - `payoutDiff = Math.abs(elocalPayout - ringbaPayout)`

2. **Calculate Base Score:**
   - `matchScore = timeDiff` (base score is time difference)

3. **Payout Matching Logic:**
   - **If BOTH payouts > 0:**
     - If `payoutDiff <= payoutTolerance` (0.01):
       - `matchScore = timeDiff * 0.1` (exact payout match - much better score)
     - Else:
       - `matchScore = timeDiff + (payoutDiff * 10)` (penalize payout differences)
   
   - **If EITHER payout is 0:**
     - No payout penalty applied
     - `matchScore = timeDiff` (only time matters)

### Step 5: Return Match Object

**If all validations pass:**
```javascript
return {
  elocalCall,
  ringbaCall,
  matchScore,        // Lower is better
  timeDiff,          // Time difference in minutes
  payoutDiff,        // Payout difference in dollars
  payoutMatch: payoutDiff <= payoutTolerance
}
```

**If any validation fails:**
- **Return `null`**

---

## Helper Functions

### `toE164(raw)`
**Purpose:** Normalize phone numbers to E.164 format

**Logic:**
1. Extract digits only: `digits = raw.replace(/\D/g, '')`
2. If already starts with "+", return as-is
3. If 11 digits starting with "1", return `+${digits}`
4. If 10 digits, return `+1${digits}`
5. Otherwise, return `+${digits}` or `null` if no digits

**Example:**
- `"(407) 474-4571"` → `"+14074744571"`
- `"+14074744571"` → `"+14074744571"` (unchanged)
- `"4074744571"` → `"+14074744571"`

---

### `parseDate(dateStr)`
**Purpose:** Parse various date formats to Date object

**Supported Formats:**
1. ISO format: `"2025-12-02T09:22:00"` → Direct `new Date()` parse
2. Ringba format: `"12/02/2025 09:22:25 AM"` → Manual parse with AM/PM conversion
3. YYYY-MM-DDTHH:mm:ss: Regex parse
4. YYYY-MM-DD: Date only
5. MM/DD/YYYY: Date only

**Returns:** Date object or `null` if parsing fails

---

### `timeDiffMinutes(date1, date2)`
**Purpose:** Calculate absolute time difference in minutes

**Logic:**
- `Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60)`
- Returns `Infinity` if either date is null

---

### `getCategoryFromTargetId(targetId)`
**Purpose:** Determine category (API or STATIC) from Ringba target ID

**Logic:**
1. Look up target name from `TARGET_IDS` map
2. Check if target name (lowercase) contains "static"
3. Return "STATIC" if found, otherwise "API"

---

## Data Flow Summary

```
1. Command Line Input
   ↓
2. Parse Date Range & Validate Config
   ↓
3. Fetch Ringba Calls from API (2 target IDs)
   ├─ Transform dates to EST
   ├─ Normalize caller IDs to E.164
   └─ Build call objects
   ↓
4. Save to ringba_calls table (upsert by inbound_call_id)
   ↓
5. Fetch eLocal Calls from Database
   ↓
6. Index eLocal Calls by Category + Caller ID
   ↓
7. For Each Ringba Call:
   ├─ Filter by Category (Target ID)
   ├─ Filter by Caller ID (E.164)
   ├─ Find Best Match by Time (matchCall function)
   │  ├─ Parse dates
   │  ├─ Check date proximity (≤1 day)
   │  ├─ Check time window (≤120 min same day, ≤24h adjacent days)
   │  └─ Calculate match score (time + payout penalty)
   ├─ Check if eLocal call already has original_payout/revenue
   └─ Prepare update if allowed
   ↓
8. Update eLocal Calls in Database
   ├─ Set original_payout
   ├─ Set original_revenue
   └─ Set ringba_inbound_call_id
   ↓
9. Return Summary Statistics
```

---

## Key Design Decisions

1. **One-to-One Matching:**
   - Each eLocal call can only match ONE Ringba call
   - Once matched, eLocal call is marked and cannot be matched again
   - This prevents duplicate matches

2. **Best Match Selection:**
   - When multiple candidates exist, selects the one with lowest `matchScore`
   - Match score prioritizes:
     - Exact payout match (score × 0.1)
     - Time difference (lower is better)
     - Payout difference penalty (if payouts don't match)

3. **Data Preservation:**
   - If `original_payout` or `original_revenue` already has a value (not NULL and not 0), update is skipped
   - This preserves original Ringba data from previous runs

4. **Timezone Handling:**
   - All dates converted to EST before matching
   - Ensures consistent timezone comparison

5. **Time Window:**
   - Same day: ±120 minutes
   - Adjacent days: ±24 hours
   - Seconds are ignored (only hour:minute matters)

6. **Error Resilience:**
   - API failures for one target don't stop processing of other targets
   - Database update failures are logged but don't stop batch processing
   - Invalid calls are skipped with warnings

---

## Output Summary

The service returns a summary object:
```javascript
{
  dateRange: { start, end },
  category: "all" | "API" | "STATIC",
  ringbaCalls: number,      // Total fetched from API
  inserted: number,          // New calls inserted to DB
  updated: number,           // Existing calls updated in DB
  skipped: number,           // Calls skipped due to errors
  elocalCalls: number,      // Total eLocal calls fetched
  matched: number,           // Total matches found
  updatedOriginal: number,   // Successfully updated
  failed: number,            // Update failures
  unmatched: number,        // Ringba calls with no match
  skipped: number           // Matches skipped (preserved)
}
```

