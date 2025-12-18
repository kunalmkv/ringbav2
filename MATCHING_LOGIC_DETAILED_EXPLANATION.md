# Detailed Explanation: Adjustment-to-Call Matching Logic in STATIC Service

## Overview

The STATIC service matches **adjustments** (chargebacks, refunds, modifications) with **calls** from eLocal. This matching happens in the `elocal.scrapper.js` file when processing STATIC category data.

## Purpose

When eLocal returns call data, it also includes adjustment details. These adjustments need to be matched with their corresponding calls so that:
- Adjustment amounts can be applied to the correct call records
- Adjustment metadata (time, classification, duration) can be attached to calls
- Unmatched adjustments are flagged and stored separately

## Data Flow

### Step 1: Data Collection
1. **Calls** are scraped from eLocal HTML pages
2. **Adjustments** are extracted from the same HTML pages
3. Both are normalized using `normalizeDateTime()` to format: `YYYY-MM-DDTHH:mm:ss`

### Step 2: Processing
- **Calls** → `processCampaignCalls()` → Normalized `dateOfCall` field
- **Adjustments** → `processAdjustmentDetails()` → Normalized `timeOfCall` field

### Step 3: Matching (The Critical Part)
The matching logic is in `elocal.scrapper.js` lines 119-168.

## Current Matching Logic (Lines 119-168)

### Code Structure

```javascript
if (includeAdjustments && processedAdjustments.length > 0) {
  // Helper functions
  const toDate = (s) => { try { return new Date(s); } catch { return null; } };
  const sameDay = (d1, d2) => d1 && d2 && d1.toISOString().substring(0,10) === d2.toISOString().substring(0,10);
  const diffMinutes = (d1, d2) => Math.abs(d1.getTime() - d2.getTime()) / 60000;
  const WINDOW_MIN = 30; // 30 minutes window
  
  // Step 1: Group calls by caller ID
  const callerToCalls = new Map();
  for (const c of processedCalls) {
    const list = callerToCalls.get(c.callerId) || [];
    list.push({ ...c, dt: toDate(c.dateOfCall) });
    callerToCalls.set(c.callerId, list);
  }
  
  // Step 2: Match each adjustment to best call
  const matchMap = new Map();
  for (const a of processedAdjustments) {
    const adjDt = toDate(a.timeOfCall);
    const candidates = callerToCalls.get(a.callerId) || [];
    let best = null;
    
    for (const cand of candidates) {
      if (!cand.dt || !adjDt) continue;
      if (!sameDay(cand.dt, adjDt)) continue;  // ⚠️ ISSUE HERE
      const dm = diffMinutes(cand.dt, adjDt);
      if (dm <= WINDOW_MIN) {
        if (!best || dm < best.diff) best = { diff: dm, call: cand };
      }
    }
    
    if (best && best.call) {
      matchMap.set(`${best.call.callerId}|${best.call.dateOfCall}`, a);
    }
  }
  
  // Step 3: Merge matched adjustments into calls
  callsMerged = processedCalls.map(c => {
    const a = matchMap.get(`${c.callerId}|${c.dateOfCall}`);
    if (a) {
      return { ...c, adjustmentTime: a.adjustmentTime, ... };
    }
    return c;
  });
}
```

## Matching Criteria

For an adjustment to match a call, **ALL** of these must be true:

1. **Same Caller ID**: `adjustment.callerId === call.callerId`
2. **Same Day**: Both dates must be on the same calendar day
3. **Within Time Window**: Time difference ≤ 30 minutes (`WINDOW_MIN = 30`)
4. **Best Match**: If multiple calls match, choose the one with smallest time difference

## The Critical Bug: `sameDay()` Function

### Current Implementation (Line 122)

```javascript
const sameDay = (d1, d2) => d1 && d2 && d1.toISOString().substring(0,10) === d2.toISOString().substring(0,10);
```

### How It Works

1. Takes two Date objects (`d1`, `d2`)
2. Converts both to UTC using `toISOString()` (e.g., `"2025-12-17T18:30:00.000Z"`)
3. Extracts first 10 characters (date part: `"2025-12-17"`)
4. Compares if they're equal

### The Problem

**Issue 1: Timezone Conversion**
- `toISOString()` converts dates to **UTC timezone**
- Dates stored as `"2025-12-17T23:30:00"` (no timezone = local time)
- When parsed with `new Date()`, JavaScript interprets them as **server's local timezone**
- Then `toISOString()` converts to UTC, which can change the date part

**Example of the Bug:**
```
Server timezone: EST (UTC-5)
Call date string: "2025-12-17T23:30:00"
Adjustment date string: "2025-12-17T23:32:00"

Step 1: Parse as local time (EST)
  callDate = new Date("2025-12-17T23:30:00") 
    → Interprets as: Dec 17, 2025 23:30 EST
  
Step 2: Convert to UTC for comparison
  callDate.toISOString() 
    → "2025-12-18T04:30:00.000Z" (next day in UTC!)
  
  adjDate.toISOString()
    → "2025-12-18T04:32:00.000Z" (next day in UTC)
  
Step 3: Compare date parts
  "2025-12-18" === "2025-12-18" ✅ Same day in UTC
  
BUT if server is in different timezone:
  Server timezone: PST (UTC-8)
  callDate.toISOString() → "2025-12-18T07:30:00.000Z"
  adjDate.toISOString() → "2025-12-18T07:32:00.000Z"
  Still works...
```

**The Real Issue: Edge Cases**

If dates are near midnight and server timezone differs:
```
Call: "2025-12-17T23:58:00" (EST)
Adj:  "2025-12-18T00:00:00" (EST) - 2 minutes later, but next day

Server in EST:
  Call UTC: "2025-12-18T04:58:00.000Z"
  Adj UTC:  "2025-12-18T05:00:00.000Z"
  Same day ✅

Server in PST:
  Call UTC: "2025-12-18T07:58:00.000Z"  
  Adj UTC:  "2025-12-18T08:00:00.000Z"
  Same day ✅

But if dates are stored differently or parsed incorrectly:
  Call: "2025-12-17T23:58:00" → parsed as UTC → "2025-12-17T23:58:00.000Z"
  Adj:  "2025-12-18T00:00:00" → parsed as UTC → "2025-12-18T00:00:00.000Z"
  Different days ❌ FAILS!
```

**Issue 2: Date String Format Inconsistency**

The dates are normalized to `YYYY-MM-DDTHH:mm:ss` format, but:
- If one has timezone info and other doesn't
- If parsing fails and returns `null`
- If dates are in different formats before normalization

The `toDate()` function can return `null` if parsing fails, which causes the match to be skipped.

## Why 2-Minute Difference Fails

### Scenario
- **Call**: `"2025-12-17T23:30:00"`
- **Adjustment**: `"2025-12-17T23:32:00"` (2 minutes later)
- **Caller ID**: Same
- **Expected**: Should match ✅
- **Actual**: May fail ❌

### Why It Fails

1. **Date Parsing Issue**:
   ```javascript
   const callDate = toDate("2025-12-17T23:30:00");  // May parse incorrectly
   const adjDate = toDate("2025-12-17T23:32:00");  // May parse differently
   ```

2. **Timezone Conversion Issue**:
   ```javascript
   // If server timezone causes date shift
   callDate.toISOString() → "2025-12-18T04:30:00.000Z"  // Next day in UTC
   adjDate.toISOString()  → "2025-12-18T04:32:00.000Z"  // Next day in UTC
   // But if one shifts and other doesn't:
   callDate.toISOString() → "2025-12-17T23:30:00.000Z"  // Same day
   adjDate.toISOString()  → "2025-12-18T04:32:00.000Z"  // Next day
   // Different days → FAILS sameDay check
   ```

3. **String Comparison Issue**:
   The `sameDay` function compares UTC date strings. If the dates are stored in EST but the server interprets them differently, the UTC conversion can produce different date parts.

## The Fix

### Solution: Compare Date Parts Directly from Strings

Since both `dateOfCall` and `timeOfCall` are normalized to `YYYY-MM-DDTHH:mm:ss` format, we can extract the date part directly from the strings without timezone conversion:

```javascript
// FIXED VERSION
const sameDay = (dateStr1, dateStr2) => {
  if (!dateStr1 || !dateStr2) return false;
  // Extract date part (first 10 characters: YYYY-MM-DD)
  const date1 = dateStr1.substring(0, 10);
  const date2 = dateStr2.substring(0, 10);
  return date1 === date2;
};

// Use it with strings instead of Date objects
if (!sameDay(c.dateOfCall, a.timeOfCall)) continue;
```

### Why This Works

1. **No Timezone Conversion**: Directly compares date strings
2. **Consistent Format**: Both are normalized to same format
3. **Reliable**: No dependency on server timezone or Date parsing
4. **Simple**: Extracts first 10 characters (YYYY-MM-DD)

### Updated Matching Logic

```javascript
// FIXED: Compare date parts from strings directly
const sameDay = (dateStr1, dateStr2) => {
  if (!dateStr1 || !dateStr2) return false;
  const date1 = dateStr1.substring(0, 10); // YYYY-MM-DD
  const date2 = dateStr2.substring(0, 10);
  return date1 === date2;
};

// Still use Date objects for time difference calculation
const diffMinutes = (d1, d2) => Math.abs(d1.getTime() - d2.getTime()) / 60000;

// In matching loop:
for (const cand of candidates) {
  if (!cand.dt || !adjDt) continue;
  // FIXED: Compare strings directly, not UTC dates
  if (!sameDay(cand.dateOfCall, a.timeOfCall)) continue;
  const dm = diffMinutes(cand.dt, adjDt);
  if (dm <= WINDOW_MIN) {
    if (!best || dm < best.diff) best = { diff: dm, call: cand };
  }
}
```

## Summary

### Current Logic Flow
1. Parse date strings to Date objects
2. Convert to UTC for same-day check ❌ **BUG HERE**
3. Calculate time difference
4. Match if same day AND within window

### Fixed Logic Flow
1. Compare date parts directly from strings ✅ **FIX**
2. Parse to Date objects for time difference calculation
3. Match if same day AND within window

### Key Changes
- `sameDay()` now compares string date parts instead of UTC-converted dates
- Eliminates timezone conversion issues
- More reliable and predictable matching
- Still uses Date objects for accurate time difference calculation

## Testing

After the fix, test cases that should work:
- ✅ Same day, 2 minutes apart → Should match
- ✅ Same day, 1 minute apart → Should match  
- ✅ Same day, 30 minutes apart → Should match
- ✅ Same day, 31 minutes apart → Should NOT match
- ✅ Different days, 2 minutes apart → Should NOT match
- ✅ Same caller, same day, multiple calls → Should match closest time

