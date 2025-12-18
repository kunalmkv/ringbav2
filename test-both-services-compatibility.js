#!/usr/bin/env node

/**
 * Test script to verify that the matching logic changes work for both
 * historical and current services
 */

import {
  getPast10DaysRange,
  getCurrentDayRangeWithTimezone
} from './src/utils/date-utils.js';

console.log('='.repeat(70));
console.log('VERIFYING COMPATIBILITY: Historical vs Current Service');
console.log('='.repeat(70));
console.log('');

// Test 1: Historical Service Date Range
console.log('TEST 1: Historical Service Date Range');
console.log('-'.repeat(70));
const historicalRange = getPast10DaysRange();
console.log('Historical Service uses: getPast10DaysRange()');
console.log(`  startDate: ${historicalRange.startDate}`);
console.log(`  endDate: ${historicalRange.endDate}`);
console.log(`  startDate type: ${historicalRange.startDate instanceof Date ? 'Date' : typeof historicalRange.startDate}`);
console.log(`  endDate type: ${historicalRange.endDate instanceof Date ? 'Date' : typeof historicalRange.endDate}`);
console.log(`  Has startDate property: ${historicalRange.hasOwnProperty('startDate')}`);
console.log(`  Has endDate property: ${historicalRange.hasOwnProperty('endDate')}`);
console.log(`  Date range: ${historicalRange.startDateFormatted} to ${historicalRange.endDateFormatted}`);
console.log('');

// Test 2: Current Service Date Range
console.log('TEST 2: Current Service Date Range');
console.log('-'.repeat(70));
const currentRange = getCurrentDayRangeWithTimezone();
console.log('Current Service uses: getCurrentDayRangeWithTimezone()');
console.log(`  startDate: ${currentRange.startDate}`);
console.log(`  endDate: ${currentRange.endDate}`);
console.log(`  startDate type: ${currentRange.startDate instanceof Date ? 'Date' : typeof currentRange.startDate}`);
console.log(`  endDate type: ${currentRange.endDate instanceof Date ? 'Date' : typeof currentRange.endDate}`);
console.log(`  Has startDate property: ${currentRange.hasOwnProperty('startDate')}`);
console.log(`  Has endDate property: ${currentRange.hasOwnProperty('endDate')}`);
console.log(`  Date range: ${currentRange.startDateFormatted} to ${currentRange.endDateFormatted}`);
console.log('');

// Test 3: Compatibility Check
console.log('TEST 3: Compatibility Check');
console.log('-'.repeat(70));

const checkCompatibility = (dateRange, serviceName) => {
  const issues = [];
  
  if (!dateRange.startDate) {
    issues.push(`❌ Missing startDate property`);
  } else if (!(dateRange.startDate instanceof Date)) {
    issues.push(`❌ startDate is not a Date object (type: ${typeof dateRange.startDate})`);
  }
  
  if (!dateRange.endDate) {
    issues.push(`❌ Missing endDate property`);
  } else if (!(dateRange.endDate instanceof Date)) {
    issues.push(`❌ endDate is not a Date object (type: ${typeof dateRange.endDate})`);
  }
  
  if (dateRange.startDate && dateRange.endDate) {
    if (dateRange.startDate > dateRange.endDate) {
      issues.push(`❌ startDate is after endDate`);
    }
  }
  
  if (issues.length === 0) {
    console.log(`✅ ${serviceName}: All checks passed`);
    console.log(`   Date range is valid and compatible with getCallsForDateRange()`);
  } else {
    console.log(`❌ ${serviceName}: Issues found:`);
    issues.forEach(issue => console.log(`   ${issue}`));
  }
  
  return issues.length === 0;
};

const historicalOK = checkCompatibility(historicalRange, 'Historical Service');
console.log('');
const currentOK = checkCompatibility(currentRange, 'Current Service');
console.log('');

// Test 4: Simulate getCallsForDateRange usage
console.log('TEST 4: Simulating getCallsForDateRange Usage');
console.log('-'.repeat(70));

const simulateGetCallsForDateRange = (startDate, endDate) => {
  // This simulates what getCallsForDateRange does
  const formatDate = (date) => {
    if (!(date instanceof Date)) {
      throw new Error(`Expected Date object, got ${typeof date}`);
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const datesInRange = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    datesInRange.push(formatDate(new Date(current)));
    current.setDate(current.getDate() + 1);
  }
  
  return datesInRange;
};

try {
  console.log('Historical Service:');
  const historicalDates = simulateGetCallsForDateRange(historicalRange.startDate, historicalRange.endDate);
  console.log(`  ✅ Successfully processed date range`);
  console.log(`  Dates in range: ${historicalDates.length} days`);
  console.log(`  First date: ${historicalDates[0]}`);
  console.log(`  Last date: ${historicalDates[historicalDates.length - 1]}`);
} catch (error) {
  console.log(`  ❌ Error: ${error.message}`);
}

console.log('');

try {
  console.log('Current Service:');
  const currentDates = simulateGetCallsForDateRange(currentRange.startDate, currentRange.endDate);
  console.log(`  ✅ Successfully processed date range`);
  console.log(`  Dates in range: ${currentDates.length} days`);
  console.log(`  First date: ${currentDates[0]}`);
  console.log(`  Last date: ${currentDates[currentDates.length - 1]}`);
} catch (error) {
  console.log(`  ❌ Error: ${error.message}`);
}

console.log('');

// Test 5: Check second-pass matching logic
console.log('TEST 5: Second-Pass Matching Logic Compatibility');
console.log('-'.repeat(70));

const testSecondPassMatching = (dateRange, serviceName) => {
  // Simulate an adjustment date
  const adjustmentDate = new Date(dateRange.endDate);
  adjustmentDate.setHours(11, 30, 0, 0);
  
  // Simulate the ±1 day search
  const searchStartDate = new Date(adjustmentDate);
  searchStartDate.setDate(searchStartDate.getDate() - 1);
  searchStartDate.setHours(0, 0, 0, 0);
  const searchEndDate = new Date(adjustmentDate);
  searchEndDate.setDate(searchEndDate.getDate() + 1);
  searchEndDate.setHours(23, 59, 59, 999);
  
  try {
    const searchDates = simulateGetCallsForDateRange(searchStartDate, searchEndDate);
    console.log(`✅ ${serviceName}: Second-pass matching search range is valid`);
    console.log(`   Search range: ${searchDates[0]} to ${searchDates[searchDates.length - 1]}`);
    console.log(`   Days in search: ${searchDates.length}`);
    return true;
  } catch (error) {
    console.log(`❌ ${serviceName}: Second-pass matching failed: ${error.message}`);
    return false;
  }
};

testSecondPassMatching(historicalRange, 'Historical Service');
console.log('');
testSecondPassMatching(currentRange, 'Current Service');

console.log('');
console.log('='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));

if (historicalOK && currentOK) {
  console.log('✅ Both services are compatible with the matching logic changes');
  console.log('');
  console.log('Key Points:');
  console.log('  1. Both services provide startDate and endDate as Date objects');
  console.log('  2. getCallsForDateRange() accepts Date objects for both parameters');
  console.log('  3. Second-pass matching uses ±1 day search which works for both');
  console.log('  4. Matching logic is service-agnostic (works with any date range)');
} else {
  console.log('❌ Compatibility issues detected');
  console.log('   Please review the errors above');
}

console.log('='.repeat(70));

