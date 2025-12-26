# Root Cause Analysis: Unmatched Adjustment Issue

## Problem Statement

Two records with the same caller ID `(727) 804-3296` and only 2 minutes apart are not matching:
1. Call: `2025-12-16T11:30:00` (Record ID: 1416)
2. Adjustment: `2025-12-16T11:28:00` (Record ID: 1511)

## Database Analysis Results

### Record 1416 (Call)
- **Date**: `2025-12-16T11:30:00`
- **Category**: STATIC
- **Payout**: $35.00
- **Unmatched**: `false`
- **Has Adjustment**: `false`
- **Created**: Dec 16, 2025
- **Status**: Normal call record

### Record 1511 (Unmatched Adjustment)
- **Date**: `2025-12-16T11:28:00`
- **Category**: STATIC
- **Payout**: $0.00
- **Unmatched**: `true` ⚠️
- **Has Adjustment**: `true` (Amount: -$35.00)
- **Created**: Dec 18, 2025
- **Status**: Adjustment that was inserted as unmatched call

### Adjustment Details (Record 55)
- **Time of Call**: `2025-12-16T11:28:00`
- **Amount**: -$35.00
- **Created**: Dec 18, 2025

## Root Cause Identified

### The Issue

**The matching logic only works within a single scraping session**, not across different sessions.

1. **Dec 16, 2025**: Call was scraped and saved to database (Record 1416)
2. **Dec 18, 2025**: Adjustment was scraped in a different session
3. **Matching Logic**: Only matches adjustments to calls that are in the **same `processedCalls` array** during the current scraping session
4. **Result**: Adjustment couldn't find the call because it was already in the database from a previous session
5. **Fallback**: Adjustment was inserted as an unmatched record (Record 1511)

### Code Evidence

Looking at `elocal.scrapper.js` lines 126-149:

```javascript
// Step 1: Group calls by caller ID (ONLY from current session)
const callerToCalls = new Map();
for (const c of processedCalls) {  // ← Only processes calls from CURRENT scraping session
  const list = callerToCalls.get(c.callerId) || [];
  list.push({ ...c, dt: toDate(c.dateOfCall) });
  callerToCalls.set(c.callerId, list);
}

// Step 2: Match adjustments to calls (ONLY from current session)
for (const a of processedAdjustments) {
  const candidates = callerToCalls.get(a.callerId) || [];  // ← Only finds calls from current session
  // ... matching logic ...
}
```

**The problem**: `processedCalls` only contains calls scraped in the **current session**, not calls already in the database from previous sessions.

## Why This Happens

### Scenario

1. **First Run (Dec 16)**: 
   - Scrapes calls for Dec 16
   - Finds call at 11:30:00
   - Saves to database
   - No adjustments found in this run

2. **Second Run (Dec 18)**:
   - Scrapes adjustments for Dec 16 (historical data)
   - Finds adjustment at 11:28:00
   - Tries to match with calls in `processedCalls` array
   - `processedCalls` is empty (no new calls scraped in this run)
   - No match found → Inserted as unmatched

## The Fix

### Option 1: Match Against Database (Recommended)

Modify the matching logic to also check existing calls in the database:

```javascript
// After building callerToCalls from processedCalls, also fetch from database
const existingCalls = await db.getCallsForMatching(callerIds, dateRange);
for (const existingCall of existingCalls) {
  const list = callerToCalls.get(existingCall.callerId) || [];
  list.push({ 
    ...existingCall, 
    dt: toDate(existingCall.dateOfCall),
    fromDatabase: true  // Flag to indicate it's from DB
  });
  callerToCalls.set(existingCall.callerId, list);
}
```

### Option 2: Post-Processing Match (Alternative)

After inserting unmatched adjustments, run a post-processing step to match them with existing calls:

```javascript
// After inserting unmatched adjustments
const unmatchedAdjustments = await db.getUnmatchedAdjustments(dateRange);
for (const adj of unmatchedAdjustments) {
  const matchingCall = await db.findMatchingCall(adj.callerId, adj.timeOfCall, 30);
  if (matchingCall) {
    await db.updateCallWithAdjustment(matchingCall.id, adj);
    await db.deleteUnmatchedAdjustment(adj.id);
  }
}
```

### Option 3: Fix the sameDay Bug (Still Needed)

Even with the above fixes, we should still fix the `sameDay()` function to use string comparison instead of UTC conversion to avoid timezone issues.

## Recommended Solution

**Implement Option 1** (match against database) because:
1. Prevents unmatched records from being created
2. Works for both same-session and cross-session matching
3. More efficient than post-processing
4. Maintains data integrity

## Impact

- **Current**: Adjustments from different sessions become unmatched records
- **After Fix**: Adjustments will match with calls from previous sessions
- **Data Cleanup**: Existing unmatched records (like Record 1511) should be matched and merged with their corresponding calls



