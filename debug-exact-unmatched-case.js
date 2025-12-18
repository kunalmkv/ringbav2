#!/usr/bin/env node

/**
 * Deep analysis of why specific calls are unmatched
 * Tests all possible failure points
 */

const callerId1 = '(727) 804-3296';
const date1 = '2025-12-16T11:30:00';
const date2 = '2025-12-16T11:28:00';

console.log('='.repeat(70));
console.log('DEEP ANALYSIS: Why Calls Are Unmatched');
console.log('='.repeat(70));
console.log('');

// Test 1: Caller ID variations
console.log('TEST 1: Caller ID Variations');
console.log('-'.repeat(70));

const callerIdVariations = [
  '(727) 804-3296',
  '(727)804-3296',
  '(727) 804-3296 ',
  ' (727) 804-3296',
  '7278043296',
  '+17278043296',
  '17278043296'
];

console.log('Testing caller ID matching:');
callerIdVariations.forEach((id, i) => {
  const match1 = id === callerId1;
  const match2 = id.trim() === callerId1.trim();
  const match3 = id.replace(/\s/g, '') === callerId1.replace(/\s/g, '');
  console.log(`  ${i+1}. "${id}"`);
  console.log(`     Exact match: ${match1}`);
  console.log(`     Trimmed match: ${match2}`);
  console.log(`     No-space match: ${match3}`);
  console.log('');
});

// Test 2: Date format variations
console.log('TEST 2: Date Format Variations');
console.log('-'.repeat(70));

const dateVariations1 = [
  '2025-12-16T11:30:00',
  '2025-12-16 11:30:00',
  '2025-12-16T11:30:00.000',
  '2025-12-16T11:30:00Z',
  '2025-12-16T11:30:00.000Z',
  '12/16/2025 11:30:00'
];

const dateVariations2 = [
  '2025-12-16T11:28:00',
  '2025-12-16 11:28:00',
  '2025-12-16T11:28:00.000',
  '2025-12-16T11:28:00Z',
  '2025-12-16T11:28:00.000Z',
  '12/16/2025 11:28:00'
];

const toDate = (s) => {
  try {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const sameDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  return d1.toISOString().substring(0, 10) === d2.toISOString().substring(0, 10);
};

console.log('Testing date parsing and sameDay check:');
dateVariations1.forEach((dateStr1, i) => {
  const dateStr2 = dateVariations2[i];
  const d1 = toDate(dateStr1);
  const d2 = toDate(dateStr2);
  
  console.log(`  Format ${i+1}:`);
  console.log(`    Date1: "${dateStr1}" -> ${d1 ? d1.toISOString() : 'NULL'}`);
  console.log(`    Date2: "${dateStr2}" -> ${d2 ? d2.toISOString() : 'NULL'}`);
  
  if (d1 && d2) {
    const same = sameDay(d1, d2);
    const diff = Math.abs(d1.getTime() - d2.getTime()) / 60000;
    console.log(`    Same day: ${same}`);
    console.log(`    Time diff: ${diff.toFixed(2)} min`);
    console.log(`    Would match: ${same && diff <= 30}`);
  } else {
    console.log(`    ❌ Parsing failed`);
  }
  console.log('');
});

// Test 3: Map key matching
console.log('TEST 3: Map Key Matching');
console.log('-'.repeat(70));

const testKeys = [
  { callerId: '(727) 804-3296', dateOfCall: '2025-12-16T11:30:00' },
  { callerId: '(727) 804-3296 ', dateOfCall: '2025-12-16T11:30:00' },
  { callerId: '(727) 804-3296', dateOfCall: '2025-12-16T11:30:00 ' },
  { callerId: '(727)804-3296', dateOfCall: '2025-12-16T11:30:00' },
  { callerId: '(727) 804-3296', dateOfCall: '2025-12-16 11:30:00' }
];

const baseKey = `${callerId1}|${date1}`;
console.log(`Base key: "${baseKey}"`);
console.log('');

testKeys.forEach((test, i) => {
  const testKey = `${test.callerId}|${test.dateOfCall}`;
  const exactMatch = testKey === baseKey;
  const trimmedMatch = testKey.trim() === baseKey.trim();
  
  console.log(`  Key ${i+1}: "${testKey}"`);
  console.log(`    Exact match: ${exactMatch}`);
  console.log(`    Trimmed match: ${trimmedMatch}`);
  console.log(`    Caller ID: "${test.callerId}"`);
  console.log(`    Date: "${test.dateOfCall}"`);
  console.log('');
});

// Test 4: Simulate the actual matching process with edge cases
console.log('TEST 4: Simulated Matching Process');
console.log('-'.repeat(70));

// Simulate what happens in the actual code
const processedCalls = [
  { callerId: callerId1, dateOfCall: date1 }
];

const processedAdjustments = [
  { callerId: callerId1, timeOfCall: date2 }
];

console.log('Input data:');
console.log(`  Calls: ${processedCalls.length}`);
processedCalls.forEach((c, i) => {
  console.log(`    ${i+1}. callerId="${c.callerId}", dateOfCall="${c.dateOfCall}"`);
  console.log(`       callerId type: ${typeof c.callerId}, length: ${c.callerId.length}`);
  console.log(`       dateOfCall type: ${typeof c.dateOfCall}, length: ${c.dateOfCall.length}`);
});

console.log(`  Adjustments: ${processedAdjustments.length}`);
processedAdjustments.forEach((a, i) => {
  console.log(`    ${i+1}. callerId="${a.callerId}", timeOfCall="${a.timeOfCall}"`);
  console.log(`       callerId type: ${typeof a.callerId}, length: ${a.callerId.length}`);
  console.log(`       timeOfCall type: ${typeof a.timeOfCall}, length: ${a.timeOfCall.length}`);
});

console.log('');

// Step 1: Build callerToCalls map
const callerToCalls = new Map();
for (const c of processedCalls) {
  const list = callerToCalls.get(c.callerId) || [];
  const dt = toDate(c.dateOfCall);
  list.push({ ...c, dt });
  callerToCalls.set(c.callerId, list);
  
  console.log(`Step 1: Added call to map`);
  console.log(`  Key: "${c.callerId}"`);
  console.log(`  Date parsed: ${dt ? dt.toISOString() : 'NULL'}`);
  console.log(`  Map size: ${callerToCalls.size}`);
  console.log(`  List size for this caller: ${list.length}`);
}

console.log('');

// Step 2: Try to match adjustments
const matchMap = new Map();
for (const a of processedAdjustments) {
  console.log(`Step 2: Processing adjustment`);
  console.log(`  Caller ID: "${a.callerId}"`);
  console.log(`  Time of Call: "${a.timeOfCall}"`);
  
  const adjDt = toDate(a.timeOfCall);
  console.log(`  Parsed date: ${adjDt ? adjDt.toISOString() : 'NULL'}`);
  
  const candidates = callerToCalls.get(a.callerId) || [];
  console.log(`  Candidates found: ${candidates.length}`);
  
  if (candidates.length === 0) {
    console.log(`  ❌ NO CANDIDATES - Caller ID mismatch!`);
    console.log(`     Looking for: "${a.callerId}"`);
    console.log(`     Available keys in map:`);
    for (const key of callerToCalls.keys()) {
      console.log(`       - "${key}" (length: ${key.length})`);
      console.log(`         Match: ${key === a.callerId}`);
      console.log(`         Trimmed match: ${key.trim() === a.callerId.trim()}`);
    }
  }
  
  let best = null;
  for (const cand of candidates) {
    console.log(`  Checking candidate:`);
    console.log(`    Caller ID: "${cand.callerId}"`);
    console.log(`    Date of Call: "${cand.dateOfCall}"`);
    console.log(`    Parsed date: ${cand.dt ? cand.dt.toISOString() : 'NULL'}`);
    
    if (!cand.dt || !adjDt) {
      console.log(`    ❌ Date parsing failed`);
      console.log(`      cand.dt: ${cand.dt ? 'OK' : 'NULL'}`);
      console.log(`      adjDt: ${adjDt ? 'OK' : 'NULL'}`);
      continue;
    }
    
    const sameDayResult = sameDay(cand.dt, adjDt);
    console.log(`    Same day check: ${sameDayResult}`);
    console.log(`      cand.dt UTC: ${cand.dt.toISOString().substring(0,10)}`);
    console.log(`      adjDt UTC: ${adjDt.toISOString().substring(0,10)}`);
    
    if (!sameDayResult) {
      console.log(`    ❌ Failed same day check`);
      continue;
    }
    
    const dm = Math.abs(cand.dt.getTime() - adjDt.getTime()) / 60000;
    console.log(`    Time difference: ${dm.toFixed(2)} minutes`);
    console.log(`    Within window (30 min): ${dm <= 30}`);
    
    if (dm <= 30) {
      if (!best || dm < best.diff) {
        best = { diff: dm, call: cand };
        console.log(`    ✅ New best match`);
      }
    }
  }
  
  if (best && best.call) {
    const key = `${best.call.callerId}|${best.call.dateOfCall}`;
    matchMap.set(key, a);
    console.log(`  ✅ MATCHED! Key: "${key}"`);
  } else {
    console.log(`  ❌ NO MATCH FOUND`);
  }
  console.log('');
}

// Step 3: Check if merge would work
console.log('Step 3: Checking merge');
for (const c of processedCalls) {
  const key = `${c.callerId}|${c.dateOfCall}`;
  const adj = matchMap.get(key);
  console.log(`  Call key: "${key}"`);
  console.log(`  Found adjustment: ${adj ? 'YES' : 'NO'}`);
  if (adj) {
    console.log(`    Adjustment time: "${adj.timeOfCall}"`);
  } else {
    console.log(`    Available keys in matchMap:`);
    for (const mapKey of matchMap.keys()) {
      console.log(`      - "${mapKey}"`);
      console.log(`        Match: ${mapKey === key}`);
      console.log(`        Trimmed match: ${mapKey.trim() === key.trim()}`);
    }
  }
}

console.log('');
console.log('='.repeat(70));
console.log('');

// Test 5: Check for whitespace or hidden characters
console.log('TEST 5: Character Analysis');
console.log('-'.repeat(70));

const analyzeString = (str, label) => {
  console.log(`${label}: "${str}"`);
  console.log(`  Length: ${str.length}`);
  console.log(`  Char codes: ${Array.from(str).map(c => c.charCodeAt(0)).join(', ')}`);
  console.log(`  Has leading space: ${str.startsWith(' ')}`);
  console.log(`  Has trailing space: ${str.endsWith(' ')}`);
  console.log(`  Trimmed: "${str.trim()}"`);
  console.log(`  Normalized (no spaces): "${str.replace(/\s/g, '')}"`);
  console.log('');
};

analyzeString(callerId1, 'Caller ID');
analyzeString(date1, 'Date 1');
analyzeString(date2, 'Date 2');

console.log('='.repeat(70));

