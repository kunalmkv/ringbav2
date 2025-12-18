#!/usr/bin/env node

/**
 * Test script to show what date range the historical scheduler would use
 * 
 * Usage:
 *   node test-historical-date-range.js
 * 
 * This script simulates the date range calculation that the historical scheduler
 * uses when it runs at 11:58 PM IST daily.
 */

import { getPast15DaysRangeForHistorical } from './src/utils/date-utils.js';

// Get current IST time
const getISTTime = () => {
  const now = new Date();
  return now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// Main function
const main = () => {
  console.log('');
  console.log('='.repeat(70));
  console.log('Historical Scheduler Date Range Test');
  console.log('='.repeat(70));
  console.log('');
  
  const istTime = getISTTime();
  console.log(`Current IST Time: ${istTime}`);
  console.log('');
  
  // Get the date range
  const dateRange = getPast15DaysRangeForHistorical();
  
  console.log('='.repeat(70));
  console.log('Date Range Calculation Result:');
  console.log('='.repeat(70));
  console.log(`Start Date: ${dateRange.startDateFormatted} (${dateRange.startDateURL})`);
  console.log(`End Date:   ${dateRange.endDateFormatted} (${dateRange.endDateURL})`);
  console.log('');
  console.log(`ISO Format:`);
  console.log(`  Start: ${dateRange.startDate.toISOString()}`);
  console.log(`  End:   ${dateRange.endDate.toISOString()}`);
  console.log('');
  
  // Calculate number of days (inclusive of both start and end dates)
  const daysDiff = Math.floor((dateRange.endDate - dateRange.startDate) / (1000 * 60 * 60 * 24)) + 1;
  console.log(`Total Days: ${daysDiff} days (inclusive)`);
  console.log('');
  
  // Show what dates would be processed
  console.log('='.repeat(70));
  console.log('Dates that would be processed:');
  console.log('='.repeat(70));
  
  const dates = [];
  const current = new Date(dateRange.startDate);
  while (current <= dateRange.endDate) {
    const year = current.getUTCFullYear();
    const month = String(current.getUTCMonth() + 1).padStart(2, '0');
    const day = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  // Display dates in rows of 5
  for (let i = 0; i < dates.length; i += 5) {
    const row = dates.slice(i, i + 5);
    console.log(row.map(d => d.padEnd(12)).join(' '));
  }
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Note: This is the date range that would be used if the scheduler');
  console.log('      runs right now. The actual scheduler runs at 11:58 PM IST daily.');
  console.log('='.repeat(70));
  console.log('');
};

// Run
main();

