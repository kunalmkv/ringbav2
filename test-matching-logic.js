#!/usr/bin/env node

/**
 * Test script to debug the matching logic issue
 * Tests the sameDay and diffMinutes functions with various date scenarios
 */

// Replicate the exact matching logic from elocal.scrapper.js
const toDate = (s) => { try { return new Date(s); } catch { return null; } };
const sameDay = (d1, d2) => d1 && d2 && d1.toISOString().substring(0,10) === d2.toISOString().substring(0,10);
const diffMinutes = (d1, d2) => Math.abs(d1.getTime() - d2.getTime()) / 60000;
const WINDOW_MIN = 30;

console.log('Testing Matching Logic\n');
console.log('='.repeat(70));

// Test Case 1: Same day, 2 minutes apart (should match)
console.log('\nTest Case 1: Same day, 2 minutes apart');
const callDate1 = '2025-12-17T23:30:00';
const adjDate1 = '2025-12-17T23:32:00';
const d1 = toDate(callDate1);
const d2 = toDate(adjDate1);
console.log(`Call date: ${callDate1}`);
console.log(`Adj date:  ${adjDate1}`);
console.log(`Parsed call: ${d1 ? d1.toISOString() : 'NULL'}`);
console.log(`Parsed adj:  ${d2 ? d2.toISOString() : 'NULL'}`);
console.log(`Same day check: ${sameDay(d1, d2)}`);
if (d1 && d2) {
  const diff = diffMinutes(d1, d2);
  console.log(`Time difference: ${diff.toFixed(2)} minutes`);
  console.log(`Within window (${WINDOW_MIN} min): ${diff <= WINDOW_MIN}`);
  console.log(`✅ Should match: ${sameDay(d1, d2) && diff <= WINDOW_MIN}`);
} else {
  console.log('❌ Failed to parse dates');
}

// Test Case 2: Same day, 1 minute apart (should match)
console.log('\nTest Case 2: Same day, 1 minute apart');
const callDate2 = '2025-12-17T14:15:00';
const adjDate2 = '2025-12-17T14:16:00';
const d3 = toDate(callDate2);
const d4 = toDate(adjDate2);
console.log(`Call date: ${callDate2}`);
console.log(`Adj date:  ${adjDate2}`);
console.log(`Parsed call: ${d3 ? d3.toISOString() : 'NULL'}`);
console.log(`Parsed adj:  ${d4 ? d4.toISOString() : 'NULL'}`);
console.log(`Same day check: ${sameDay(d3, d4)}`);
if (d3 && d4) {
  const diff = diffMinutes(d3, d4);
  console.log(`Time difference: ${diff.toFixed(2)} minutes`);
  console.log(`Within window (${WINDOW_MIN} min): ${diff <= WINDOW_MIN}`);
  console.log(`✅ Should match: ${sameDay(d3, d4) && diff <= WINDOW_MIN}`);
} else {
  console.log('❌ Failed to parse dates');
}

// Test Case 3: Edge case - near midnight, same EST day but different UTC day
console.log('\nTest Case 3: Edge case - near midnight (EST)');
const callDate3 = '2025-12-17T23:58:00';  // 11:58 PM EST
const adjDate3 = '2025-12-18T00:00:00';   // 12:00 AM EST (next day)
const d5 = toDate(callDate3);
const d6 = toDate(adjDate3);
console.log(`Call date: ${callDate3} (interpreted as local time)`);
console.log(`Adj date:  ${adjDate3} (interpreted as local time)`);
console.log(`Parsed call: ${d5 ? d5.toISOString() : 'NULL'}`);
console.log(`Parsed adj:  ${d6 ? d6.toISOString() : 'NULL'}`);
console.log(`Same day check (UTC): ${sameDay(d5, d6)}`);
if (d5 && d6) {
  const diff = diffMinutes(d5, d6);
  console.log(`Time difference: ${diff.toFixed(2)} minutes`);
  console.log(`Within window (${WINDOW_MIN} min): ${diff <= WINDOW_MIN}`);
  console.log(`Same day in UTC: ${d5.toISOString().substring(0,10)} === ${d6.toISOString().substring(0,10)}`);
  console.log(`⚠️  Issue: If dates are in EST but compared in UTC, they might fail sameDay check`);
}

// Test Case 4: Different formats - what if one has timezone info?
console.log('\nTest Case 4: Testing with different date string formats');
const formats = [
  '2025-12-17T23:30:00',
  '2025-12-17T23:30:00Z',
  '2025-12-17 23:30:00',
  '12/17/2025 23:30:00'
];

formats.forEach((fmt, i) => {
  const d = toDate(fmt);
  console.log(`Format ${i+1}: "${fmt}" -> ${d ? d.toISOString() : 'NULL'}`);
});

console.log('\n' + '='.repeat(70));
console.log('\nDIAGNOSIS:');
console.log('The issue is likely in the sameDay function using toISOString()');
console.log('which converts to UTC. If dates are stored in EST but the server');
console.log('is in a different timezone, or if dates are parsed differently,');
console.log('they might appear on different days in UTC even if same day in EST.');
console.log('\nSOLUTION:');
console.log('Compare dates using local date components (year, month, day)');
console.log('instead of UTC date strings, OR ensure consistent timezone handling.');

