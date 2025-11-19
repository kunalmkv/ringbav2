#!/usr/bin/env node

/**
 * Test script to verify caller ID normalization and matching
 */

// Convert phone number to E.164 format (matching ringba-client.js)
const toE164 = (raw) => {
  if (!raw) return null;
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  // If already in E.164 format (starts with +), return as-is
  if (raw.startsWith('+')) return raw;
  // 11 digits starting with 1 (US with country code)
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // 10 digits (US without country code)
  if (digits.length === 10) return `+1${digits}`;
  // Last resort: try to format as E.164
  return digits.length > 0 ? `+${digits}` : null;
};

// Test cases
const testCases = [
  // Database formats (various formats from eLocal)
  { db: '(555) 123-4567', ringba: '+15551234567', expected: true },
  { db: '555-123-4567', ringba: '+15551234567', expected: true },
  { db: '5551234567', ringba: '+15551234567', expected: true },
  { db: '15551234567', ringba: '+15551234567', expected: true },
  { db: '+15551234567', ringba: '+15551234567', expected: true },
  { db: '1-555-123-4567', ringba: '+15551234567', expected: true },
  
  // Edge cases
  { db: 'anonymous', ringba: '+15551234567', expected: false },
  { db: '', ringba: '+15551234567', expected: false },
  { db: null, ringba: '+15551234567', expected: false },
  { db: '(555) 123-4567', ringba: null, expected: false },
  { db: '(555) 123-4567', ringba: '', expected: false },
  
  // Different numbers (should not match)
  { db: '(555) 123-4567', ringba: '+15551234568', expected: false },
  { db: '(444) 123-4567', ringba: '+15551234567', expected: false },
];

console.log('Testing Caller ID Normalization and Matching');
console.log('='.repeat(70));
console.log('');

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const dbE164 = toE164(testCase.db);
  const ringbaE164 = testCase.ringba ? (testCase.ringba.startsWith('+') ? testCase.ringba : toE164(testCase.ringba)) : null;
  
  // Skip anonymous/invalid
  const dbCallerLower = (testCase.db || '').toLowerCase();
  const isAnonymous = dbCallerLower.includes('anonymous') || dbCallerLower === '' || !testCase.db;
  
  let matches = false;
  if (!isAnonymous && dbE164 && ringbaE164) {
    matches = dbE164 === ringbaE164;
  }
  
  const result = matches === testCase.expected;
  
  if (result) {
    passed++;
    console.log(`✅ PASS: DB="${testCase.db}" (${dbE164}) vs Ringba="${testCase.ringba}" (${ringbaE164}) - Match: ${matches}`);
  } else {
    failed++;
    console.log(`❌ FAIL: DB="${testCase.db}" (${dbE164}) vs Ringba="${testCase.ringba}" (${ringbaE164}) - Expected: ${testCase.expected}, Got: ${matches}`);
  }
}

console.log('');
console.log('='.repeat(70));
console.log(`Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(70));

if (failed === 0) {
  console.log('');
  console.log('✅ All tests passed! Caller ID normalization is working correctly.');
  process.exit(0);
} else {
  console.log('');
  console.log('❌ Some tests failed. Please review the caller ID normalization logic.');
  process.exit(1);
}

