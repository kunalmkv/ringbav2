#!/usr/bin/env node

/**
 * Debug script to analyze why specific calls are unmatched
 * Tests the exact matching logic with the provided examples
 */

// Replicate the EXACT matching logic from elocal.scrapper.js
const toDate = (s) => { 
  try { 
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  } catch { 
    return null; 
  }
};

// CURRENT (BUGGY) sameDay function
const sameDayCurrent = (d1, d2) => {
  if (!d1 || !d2) return false;
  const iso1 = d1.toISOString().substring(0, 10);
  const iso2 = d2.toISOString().substring(0, 10);
  return iso1 === iso2;
};

// FIXED sameDay function (compares strings directly)
const sameDayFixed = (dateStr1, dateStr2) => {
  if (!dateStr1 || !dateStr2) return false;
  const date1 = dateStr1.substring(0, 10); // YYYY-MM-DD
  const date2 = dateStr2.substring(0, 10);
  return date1 === date2;
};

const diffMinutes = (d1, d2) => Math.abs(d1.getTime() - d2.getTime()) / 60000;
const WINDOW_MIN = 30;

console.log('='.repeat(70));
console.log('DEBUGGING UNMATCHED CALLS');
console.log('='.repeat(70));
console.log('');

// Test case from user
const callerId = '(727) 804-3296';
const date1 = '2025-12-16T11:30:00';
const date2 = '2025-12-16T11:28:00';

console.log('Test Case:');
console.log(`  Caller ID: ${callerId}`);
console.log(`  Date 1: ${date1}`);
console.log(`  Date 2: ${date2}`);
console.log(`  Time Difference: 2 minutes`);
console.log('');

// Simulate: One is a call, one is an adjustment
console.log('Scenario 1: Date1 is call, Date2 is adjustment');
console.log('-'.repeat(70));

const callDate1 = toDate(date1);
const adjDate1 = toDate(date2);

console.log(`Call date string: "${date1}"`);
console.log(`Adj date string:  "${date2}"`);
console.log('');

console.log('Step 1: Date Parsing');
console.log(`  callDate1 = toDate("${date1}")`);
console.log(`    Result: ${callDate1 ? callDate1.toISOString() : 'NULL'}`);
console.log(`    Local: ${callDate1 ? callDate1.toString() : 'NULL'}`);
console.log(`  adjDate1 = toDate("${date2}")`);
console.log(`    Result: ${adjDate1 ? adjDate1.toISOString() : 'NULL'}`);
console.log(`    Local: ${adjDate1 ? adjDate1.toString() : 'NULL'}`);
console.log('');

if (!callDate1 || !adjDate1) {
  console.log('❌ ERROR: One or both dates failed to parse!');
  console.log(`  callDate1: ${callDate1 ? 'OK' : 'FAILED'}`);
  console.log(`  adjDate1: ${adjDate1 ? 'OK' : 'FAILED'}`);
} else {
  console.log('Step 2: Same Day Check (CURRENT - BUGGY)');
  const sameDayResult1 = sameDayCurrent(callDate1, adjDate1);
  console.log(`  callDate1.toISOString().substring(0,10) = "${callDate1.toISOString().substring(0,10)}"`);
  console.log(`  adjDate1.toISOString().substring(0,10) = "${adjDate1.toISOString().substring(0,10)}"`);
  console.log(`  Same day (UTC): ${sameDayResult1}`);
  console.log('');

  console.log('Step 2: Same Day Check (FIXED - String Comparison)');
  const sameDayResult2 = sameDayFixed(date1, date2);
  console.log(`  date1.substring(0,10) = "${date1.substring(0,10)}"`);
  console.log(`  date2.substring(0,10) = "${date2.substring(0,10)}"`);
  console.log(`  Same day (string): ${sameDayResult2}`);
  console.log('');

  console.log('Step 3: Time Difference Check');
  const timeDiff = diffMinutes(callDate1, adjDate1);
  console.log(`  Time difference: ${timeDiff.toFixed(2)} minutes`);
  console.log(`  Within window (${WINDOW_MIN} min): ${timeDiff <= WINDOW_MIN}`);
  console.log('');

  console.log('Step 4: Final Match Result');
  console.log(`  Same day (current): ${sameDayResult1}`);
  console.log(`  Same day (fixed): ${sameDayResult2}`);
  console.log(`  Within time window: ${timeDiff <= WINDOW_MIN}`);
  console.log(`  Caller ID match: ${callerId === callerId} (assuming same)`);
  console.log('');
  
  const wouldMatchCurrent = sameDayResult1 && timeDiff <= WINDOW_MIN;
  const wouldMatchFixed = sameDayResult2 && timeDiff <= WINDOW_MIN;
  
  console.log('MATCH RESULT:');
  console.log(`  With CURRENT logic: ${wouldMatchCurrent ? '✅ WOULD MATCH' : '❌ WOULD NOT MATCH'}`);
  console.log(`  With FIXED logic: ${wouldMatchFixed ? '✅ WOULD MATCH' : '❌ WOULD NOT MATCH'}`);
  
  if (!wouldMatchCurrent && wouldMatchFixed) {
    console.log('');
    console.log('🔍 ROOT CAUSE IDENTIFIED:');
    console.log('  The sameDay check is failing due to UTC conversion!');
    console.log('  Current logic compares UTC dates, which can differ from local dates.');
  }
}

console.log('');
console.log('='.repeat(70));
console.log('');

// Test reverse scenario
console.log('Scenario 2: Date2 is call, Date1 is adjustment');
console.log('-'.repeat(70));

const callDate2 = toDate(date2);
const adjDate2 = toDate(date1);

if (callDate2 && adjDate2) {
  const sameDayResult1_rev = sameDayCurrent(callDate2, adjDate2);
  const sameDayResult2_rev = sameDayFixed(date2, date1);
  const timeDiff_rev = diffMinutes(callDate2, adjDate2);
  
  console.log(`Same day (current): ${sameDayResult1_rev}`);
  console.log(`Same day (fixed): ${sameDayResult2_rev}`);
  console.log(`Time difference: ${timeDiff_rev.toFixed(2)} minutes`);
  console.log(`Within window: ${timeDiff_rev <= WINDOW_MIN}`);
  
  const wouldMatchCurrent_rev = sameDayResult1_rev && timeDiff_rev <= WINDOW_MIN;
  const wouldMatchFixed_rev = sameDayResult2_rev && timeDiff_rev <= WINDOW_MIN;
  
  console.log(`  With CURRENT logic: ${wouldMatchCurrent_rev ? '✅ WOULD MATCH' : '❌ WOULD NOT MATCH'}`);
  console.log(`  With FIXED logic: ${wouldMatchFixed_rev ? '✅ WOULD MATCH' : '❌ WOULD NOT MATCH'}`);
}

console.log('');
console.log('='.repeat(70));
console.log('');

// Test with different timezone scenarios
console.log('Testing Timezone Edge Cases');
console.log('-'.repeat(70));

const testDates = [
  '2025-12-16T11:30:00',
  '2025-12-16T23:58:00',
  '2025-12-17T00:02:00',
  '2025-12-16T00:01:00'
];

testDates.forEach(dateStr => {
  const d = toDate(dateStr);
  if (d) {
    console.log(`"${dateStr}"`);
    console.log(`  Local: ${d.toString()}`);
    console.log(`  UTC:   ${d.toISOString()}`);
    console.log(`  Date part (local): ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    console.log(`  Date part (UTC):   ${d.toISOString().substring(0,10)}`);
    console.log(`  Date part (string): ${dateStr.substring(0,10)}`);
    console.log('');
  }
});

console.log('='.repeat(70));
console.log('');

// Check caller ID matching
console.log('Caller ID Matching Analysis');
console.log('-'.repeat(70));
console.log(`Caller ID: "${callerId}"`);
console.log(`Type: ${typeof callerId}`);
console.log(`Length: ${callerId.length}`);
console.log(`Trimmed: "${callerId.trim()}"`);
console.log('');

// Simulate the actual matching process
console.log('Simulating Full Matching Process');
console.log('-'.repeat(70));

// Simulate processed calls and adjustments
const processedCalls = [
  { callerId: callerId, dateOfCall: date1 }
];

const processedAdjustments = [
  { callerId: callerId, timeOfCall: date2 }
];

console.log('Processed Calls:');
processedCalls.forEach((c, i) => {
  console.log(`  ${i+1}. Caller: "${c.callerId}", Date: "${c.dateOfCall}"`);
});

console.log('Processed Adjustments:');
processedAdjustments.forEach((a, i) => {
  console.log(`  ${i+1}. Caller: "${a.callerId}", Time: "${a.timeOfCall}"`);
});

console.log('');

// Simulate the matching logic
const callerToCalls = new Map();
for (const c of processedCalls) {
  const list = callerToCalls.get(c.callerId) || [];
  list.push({ ...c, dt: toDate(c.dateOfCall) });
  callerToCalls.set(c.callerId, list);
}

console.log('Caller-to-Calls Map:');
for (const [caller, calls] of callerToCalls.entries()) {
  console.log(`  "${caller}": ${calls.length} call(s)`);
  calls.forEach((call, i) => {
    console.log(`    ${i+1}. Date: "${call.dateOfCall}", Parsed: ${call.dt ? call.dt.toISOString() : 'NULL'}`);
  });
}

console.log('');

const matchMap = new Map();
for (const a of processedAdjustments) {
  const adjDt = toDate(a.timeOfCall);
  const candidates = callerToCalls.get(a.callerId) || [];
  
  console.log(`Processing adjustment: Caller="${a.callerId}", Time="${a.timeOfCall}"`);
  console.log(`  Found ${candidates.length} candidate call(s) with same caller ID`);
  
  let best = null;
  for (const cand of candidates) {
    console.log(`  Checking candidate: Date="${cand.dateOfCall}"`);
    
    if (!cand.dt || !adjDt) {
      console.log(`    ❌ Date parsing failed`);
      console.log(`      cand.dt: ${cand.dt ? 'OK' : 'NULL'}`);
      console.log(`      adjDt: ${adjDt ? 'OK' : 'NULL'}`);
      continue;
    }
    
    const sameDayCheck = sameDayCurrent(cand.dt, adjDt);
    console.log(`    Same day check (current): ${sameDayCheck}`);
    console.log(`      cand.dt UTC date: ${cand.dt.toISOString().substring(0,10)}`);
    console.log(`      adjDt UTC date:  ${adjDt.toISOString().substring(0,10)}`);
    
    if (!sameDayCheck) {
      console.log(`    ❌ Failed same day check - SKIPPING`);
      continue;
    }
    
    const dm = diffMinutes(cand.dt, adjDt);
    console.log(`    Time difference: ${dm.toFixed(2)} minutes`);
    console.log(`    Within window (${WINDOW_MIN} min): ${dm <= WINDOW_MIN}`);
    
    if (dm <= WINDOW_MIN) {
      if (!best || dm < best.diff) {
        best = { diff: dm, call: cand };
        console.log(`    ✅ New best match (diff: ${dm.toFixed(2)} min)`);
      }
    } else {
      console.log(`    ❌ Time difference too large`);
    }
  }
  
  if (best && best.call) {
    const key = `${best.call.callerId}|${best.call.dateOfCall}`;
    matchMap.set(key, a);
    console.log(`  ✅ MATCHED! Key: "${key}"`);
  } else {
    console.log(`  ❌ NO MATCH FOUND`);
    if (!best) {
      console.log(`     Reason: No valid candidate passed all checks`);
    }
  }
  console.log('');
}

console.log('Final Match Map:');
if (matchMap.size === 0) {
  console.log('  ❌ NO MATCHES FOUND');
} else {
  for (const [key, adj] of matchMap.entries()) {
    console.log(`  ✅ "${key}" -> Adjustment time: "${adj.timeOfCall}"`);
  }
}

console.log('');
console.log('='.repeat(70));




