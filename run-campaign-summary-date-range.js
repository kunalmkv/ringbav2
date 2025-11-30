#!/usr/bin/env node

/**
 * Script to run Ringba Campaign Summary sync for a date range
 * 
 * Usage:
 *   node run-campaign-summary-date-range.js <campaignId> <startDate> <endDate>
 *   node run-campaign-summary-date-range.js <campaignId> <dateRange>
 * 
 * Examples:
 *   node run-campaign-summary-date-range.js CA56446512fe4e4926a05e76574a7d6963 2025-11-01 2025-11-30
 *   node run-campaign-summary-date-range.js CA56446512fe4e4926a05e76574a7d6963 2025-11-01:2025-11-30
 *   node run-campaign-summary-date-range.js CA56446512fe4e4926a05e76574a7d6963 2025-11-21
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Campaign ID constant
const CAMPAIGN_ID = 'CA56446512fe4e4926a05e76574a7d6963';

/**
 * Parse date from string
 * Supports: YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY
 */
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Try YYYY-MM-DD format
  const yyyyMMdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMMdd) {
    const year = parseInt(yyyyMMdd[1], 10);
    const month = parseInt(yyyyMMdd[2], 10) - 1;
    const day = parseInt(yyyyMMdd[3], 10);
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try MM/DD/YYYY format
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const month = parseInt(mmddyyyy[1], 10) - 1;
    const day = parseInt(mmddyyyy[2], 10);
    const year = parseInt(mmddyyyy[3], 10);
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try DD-MM-YYYY format
  const ddMMyyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyy) {
    const day = parseInt(ddMMyyyy[1], 10);
    const month = parseInt(ddMMyyyy[2], 10) - 1;
    const year = parseInt(ddMMyyyy[3], 10);
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
};

/**
 * Format date to YYYY-MM-DD string
 */
const formatDate = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Generate array of dates between start and end (inclusive)
 */
const generateDateRange = (startDate, endDate) => {
  const dates = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  
  return dates;
};

/**
 * Run campaign summary sync for a single date
 */
const runSyncForDate = (campaignId, date) => {
  const dateStr = formatDate(date);
  const command = `npm run sync:campaign-summary ${campaignId} ${dateStr}`;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Running sync for date: ${dateStr}`);
  console.log(`Command: ${command}`);
  console.log('='.repeat(70));
  
  try {
    execSync(command, {
      cwd: __dirname,
      stdio: 'inherit',
      env: process.env
    });
    return { success: true, date: dateStr };
  } catch (error) {
    console.error(`\n❌ Error running sync for ${dateStr}:`, error.message);
    return { success: false, date: dateStr, error: error.message };
  }
};

/**
 * Main function
 */
const main = () => {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let campaignId = CAMPAIGN_ID; // Default campaign ID
  let startDate = null;
  let endDate = null;
  
  // Check if first argument is a campaign ID (starts with CA)
  if (args.length > 0 && args[0].startsWith('CA')) {
    campaignId = args[0];
    args.shift(); // Remove campaign ID from args
  }
  
  if (args.length === 0) {
    console.error('❌ Error: Date range is required');
    console.log('');
    console.log('Usage:');
    console.log('  node run-campaign-summary-date-range.js [campaignId] <startDate> <endDate>');
    console.log('  node run-campaign-summary-date-range.js [campaignId] <dateRange>');
    console.log('  node run-campaign-summary-date-range.js [campaignId] <singleDate>');
    console.log('');
    console.log('Examples:');
    console.log('  node run-campaign-summary-date-range.js CA56446512fe4e4926a05e76574a7d6963 2025-11-01 2025-11-30');
    console.log('  node run-campaign-summary-date-range.js CA56446512fe4e4926a05e76574a7d6963 2025-11-01:2025-11-30');
    console.log('  node run-campaign-summary-date-range.js CA56446512fe4e4926a05e76574a7d6963 2025-11-21');
    console.log('');
    console.log('Date formats supported:');
    console.log('  - YYYY-MM-DD (e.g., 2025-11-20)');
    console.log('  - MM/DD/YYYY (e.g., 11/20/2025)');
    console.log('  - DD-MM-YYYY (e.g., 20-11-2025)');
    console.log('');
    process.exit(1);
  }
  
  // Parse date range
  if (args.length === 1) {
    // Single argument - could be single date or date range with colon
    const dateArg = args[0];
    
    if (dateArg.includes(':')) {
      // Date range with colon separator
      const [startStr, endStr] = dateArg.split(':').map(s => s.trim());
      startDate = parseDate(startStr);
      endDate = parseDate(endStr);
      
      if (!startDate) {
        console.error(`❌ Error: Invalid start date format: ${startStr}`);
        process.exit(1);
      }
      
      if (!endDate) {
        console.error(`❌ Error: Invalid end date format: ${endStr}`);
        process.exit(1);
      }
    } else {
      // Single date
      startDate = parseDate(dateArg);
      endDate = parseDate(dateArg);
      
      if (!startDate) {
        console.error(`❌ Error: Invalid date format: ${dateArg}`);
        process.exit(1);
      }
    }
  } else if (args.length === 2) {
    // Two arguments - start and end dates
    startDate = parseDate(args[0]);
    endDate = parseDate(args[1]);
    
    if (!startDate) {
      console.error(`❌ Error: Invalid start date format: ${args[0]}`);
      process.exit(1);
    }
    
    if (!endDate) {
      console.error(`❌ Error: Invalid end date format: ${args[1]}`);
      process.exit(1);
    }
  } else {
    console.error('❌ Error: Too many arguments');
    process.exit(1);
  }
  
  // Validate date range
  if (startDate > endDate) {
    console.error(`❌ Error: Start date (${formatDate(startDate)}) must be before or equal to end date (${formatDate(endDate)})`);
    process.exit(1);
  }
  
  // Generate date range
  const dates = generateDateRange(startDate, endDate);
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Ringba Campaign Summary Sync - Date Range');
  console.log('='.repeat(70));
  console.log(`Campaign ID: ${campaignId}`);
  console.log(`Start Date: ${formatDate(startDate)}`);
  console.log(`End Date: ${formatDate(endDate)}`);
  console.log(`Total Dates: ${dates.length}`);
  console.log('='.repeat(70));
  console.log('');
  
  // Confirm before proceeding
  console.log('This will run the sync for the following dates:');
  if (dates.length <= 10) {
    dates.forEach((date, index) => {
      console.log(`  ${index + 1}. ${formatDate(date)}`);
    });
  } else {
    console.log(`  ${formatDate(dates[0])} to ${formatDate(dates[dates.length - 1])}`);
    console.log(`  (${dates.length} dates total)`);
  }
  console.log('');
  
  // Run sync for each date
  const results = [];
  let successCount = 0;
  let failureCount = 0;
  
  dates.forEach((date, index) => {
    const result = runSyncForDate(campaignId, date);
    results.push(result);
    
    if (result.success) {
      successCount++;
      console.log(`\n✅ Successfully synced ${result.date} (${index + 1}/${dates.length})`);
    } else {
      failureCount++;
      console.log(`\n❌ Failed to sync ${result.date} (${index + 1}/${dates.length})`);
    }
    
    // Add a small delay between runs to avoid overwhelming the API
    if (index < dates.length - 1) {
      console.log('Waiting 2 seconds before next date...');
      const start = Date.now();
      while (Date.now() - start < 2000) {
        // Busy wait for 2 seconds
      }
    }
  });
  
  // Print summary
  console.log('');
  console.log('='.repeat(70));
  console.log('Sync Summary');
  console.log('='.repeat(70));
  console.log(`Total Dates: ${dates.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log('='.repeat(70));
  
  if (failureCount > 0) {
    console.log('\nFailed dates:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.date}`);
    });
  }
  
  console.log('');
  
  // Exit with appropriate code
  process.exit(failureCount > 0 ? 1 : 0);
};

// Run main function
main();

