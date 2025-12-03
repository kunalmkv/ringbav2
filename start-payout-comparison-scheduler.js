#!/usr/bin/env node

/**
 * Payout Comparison Sync Scheduler - Runs Payout Comparison Sync Service Daily
 * 
 * This script starts a scheduler that runs the Payout Comparison Sync service
 * multiple times daily at:
 * - 9:25 PM IST (21:25)
 * - 12:25 AM IST (00:25 - midnight)
 * - 3:25 AM IST (03:25)
 * - 6:25 AM IST (06:25)
 * 
 * The service calculates and stores payout comparison data (Ringba vs eLocal)
 * in the payout_comparison_daily table.
 * 
 * IMPORTANT: If the service runs after 12:00 AM IST, it syncs the previous day's data
 * (because Ringba uses EST/CST timezone which is behind IST).
 * 
 * Usage:
 *   node start-payout-comparison-scheduler.js
 *   npm run scheduler:payout-comparison
 * 
 * To stop the scheduler, press Ctrl+C
 */

import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { syncPayoutComparisonForDate } from './src/services/payout-comparison-sync.js';
import {
  initFileLogger,
  setupConsoleLogging,
  closeLogger
} from './src/utils/file-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '.');

// Load environment variables
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

// Get IST time string
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

/**
 * Get target date for payout comparison sync based on IST timezone
 * If it's after 12 AM IST (midnight) and before 12 PM IST (noon), sync previous day
 * (because Ringba uses EST/CST which is behind IST)
 * If it's 12 PM IST (noon) or later, sync current day
 * Returns date string in YYYY-MM-DD format
 * 
 * IMPORTANT: When it's 12:25 AM IST on Dec 3, we want to sync Dec 2 (yesterday in IST)
 */
const getPayoutComparisonDate = () => {
  // Get current time in IST timezone
  const now = new Date();
  
  // Get IST date components directly
  const istDateString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse IST time string: format is "MM/DD/YYYY, HH:MM:SS"
  const istParts = istDateString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!istParts) {
    // Fallback: use current UTC date
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = String(today.getUTCMonth() + 1).padStart(2, '0');
    const day = String(today.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Extract IST components
  const monthIST = parseInt(istParts[1], 10);  // MM (1-12)
  const dayIST = parseInt(istParts[2], 10);     // DD
  const yearIST = parseInt(istParts[3], 10);    // YYYY
  let hoursIST = parseInt(istParts[4], 10);     // HH (0-23)
  const minutesIST = parseInt(istParts[5], 10); // MM
  
  // Handle edge case where hour is 24 (should be 0 for midnight)
  if (hoursIST === 24) {
    hoursIST = 0;
  }
  
  // Determine target date based on IST time
  // Logic: If it's between 12:00 AM (00:00) and 11:59 AM IST, sync previous day
  //        If it's 12:00 PM (12:00) or later IST, sync current day
  // 
  // Examples:
  // - Dec 3, 12:25 AM IST → sync Dec 2 (yesterday)
  // - Dec 3, 3:25 AM IST → sync Dec 2 (yesterday)
  // - Dec 3, 6:25 AM IST → sync Dec 2 (yesterday)
  // - Dec 3, 9:25 PM IST → sync Dec 3 (today)
  
  let targetYear, targetMonth, targetDay;
  
  if (hoursIST >= 0 && hoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST
    // We want to sync "yesterday" in IST terms
    // Work directly with the date components to avoid timezone issues
    
    // Create date components for yesterday
    if (dayIST > 1) {
      // Simple case: just subtract 1 from day
      targetYear = yearIST;
      targetMonth = monthIST;
      targetDay = dayIST - 1;
    } else {
      // Day is 1, need to go to previous month
      if (monthIST > 1) {
        // Go to previous month
        targetYear = yearIST;
        targetMonth = monthIST - 1;
        // Get last day of previous month
        const lastDayOfPrevMonth = new Date(Date.UTC(yearIST, monthIST - 1, 0)).getUTCDate();
        targetDay = lastDayOfPrevMonth;
      } else {
        // Month is January (1), go to December of previous year
        targetYear = yearIST - 1;
        targetMonth = 12;
        // Get last day of December
        const lastDayOfDec = new Date(Date.UTC(yearIST - 1, 12, 0)).getUTCDate();
        targetDay = lastDayOfDec;
      }
    }
  } else {
    // It's 12:00 PM (noon) or later IST, sync current day
    targetYear = yearIST;
    targetMonth = monthIST;
    targetDay = dayIST;
  }
  
  // Format as YYYY-MM-DD
  const year = String(targetYear);
  const month = String(targetMonth).padStart(2, '0');
  const day = String(targetDay).padStart(2, '0');
  const result = `${year}-${month}-${day}`;
  
  // Debug logging
  console.log(`[PayoutComparisonScheduler] Date Calculation:`);
  console.log(`  - Current IST Date: ${yearIST}-${String(monthIST).padStart(2, '0')}-${String(dayIST).padStart(2, '0')} ${String(hoursIST).padStart(2, '0')}:${String(minutesIST).padStart(2, '0')}`);
  console.log(`  - Target Date: ${result}`);
  
  return result;
};

// Run the payout comparison sync service
const runPayoutComparisonSync = async () => {
  const istTime = getISTTime();
  const targetDate = getPayoutComparisonDate();
  
  console.log('');
  console.log('='.repeat(70));
  console.log(`[${istTime}] Starting: Payout Comparison Sync`);
  console.log('='.repeat(70));
  console.log(`Target Date: ${targetDate}`);
  console.log('');
  
  try {
    const startTime = Date.now();
    const result = await syncPayoutComparisonForDate(targetDate);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('='.repeat(70));
    console.log(`[SUCCESS] Payout Comparison Sync - ${targetDate} completed in ${duration}s`);
    console.log('='.repeat(70));
    console.log(`Ringba Total: $${result.ringbaTotal.toFixed(2)}`);
    console.log(`eLocal Total: $${result.elocalTotal.toFixed(2)}`);
    console.log(`Adjustments: $${result.adjustments.toFixed(2)}`);
    console.log(`Total Calls: ${result.totalCalls}`);
    console.log(`RPC: $${result.rpc.toFixed(2)}`);
    console.log(`Google Ads Spend: $${result.googleAdsSpend.toFixed(2)}`);
    console.log(`Telco: $${result.telco.toFixed(2)}`);
    console.log(`Net: $${result.net.toFixed(2)}`);
    console.log(`Net Profit: ${result.netProfit.toFixed(2)}%`);
    console.log('='.repeat(70));
    console.log('');
    
    return result;
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error(`[ERROR] Payout Comparison Sync - ${targetDate} failed`);
    console.error('='.repeat(70));
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    throw error;
  }
};

// Main scheduler initialization
(async () => {
  // Initialize file logger (optional - will continue without it if it fails)
  let logger = null;
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const logFilename = `payout-comparison-scheduler-${timestamp}.log`;
    logger = await initFileLogger(logFilename, 'Payout Comparison Sync Scheduler');
    if (logger) {
      setupConsoleLogging();
      console.log(`[INFO] Logging to file: ${logger}`);
    }
  } catch (error) {
    console.warn('[WARN] File logging not available, continuing with console logging only');
  }

  // Schedule the service to run at specified times
console.log('');
console.log('='.repeat(70));
console.log('Payout Comparison Sync Scheduler');
console.log('='.repeat(70));
console.log('Scheduled times (IST):');
console.log('  - 9:25 PM (21:25)');
console.log('  - 12:25 AM (00:25)');
console.log('  - 3:25 AM (03:25)');
console.log('  - 6:25 AM (06:25)');
console.log('');
console.log('Current IST Time:', getISTTime());
console.log('='.repeat(70));
console.log('');

// Schedule cron jobs for IST timezone
// Note: node-cron uses server's local timezone
// If server is in IST, use these cron expressions directly:
// - 9:25 PM IST = '25 21 * * *'
// - 12:25 AM IST = '25 0 * * *'
// - 3:25 AM IST = '25 3 * * *'
// - 6:25 AM IST = '25 6 * * *'
//
// If server is in UTC, convert IST to UTC (IST = UTC + 5:30):
// - 9:25 PM IST (21:25) = 3:55 PM UTC (15:55) = '55 15 * * *'
// - 12:25 AM IST (00:25) = 6:55 PM UTC previous day (18:55) = '55 18 * * *'
// - 3:25 AM IST (03:25) = 9:55 PM UTC previous day (21:55) = '55 21 * * *'
// - 6:25 AM IST (06:25) = 12:55 AM UTC (00:55) = '55 0 * * *'
//
// For now, assuming server is in IST or same timezone as campaign-summary-scheduler
// Adjust the cron expressions below if your server is in a different timezone

// Schedule: 9:25 PM IST
cron.schedule('25 21 * * *', async () => {
  await runPayoutComparisonSync();
}, {
  scheduled: true
});

// Schedule: 12:25 AM IST
cron.schedule('25 0 * * *', async () => {
  await runPayoutComparisonSync();
}, {
  scheduled: true
});

// Schedule: 3:25 AM IST
cron.schedule('25 3 * * *', async () => {
  await runPayoutComparisonSync();
}, {
  scheduled: true
});

// Schedule: 6:25 AM IST
cron.schedule('25 6 * * *', async () => {
  await runPayoutComparisonSync();
}, {
  scheduled: true
});

console.log('✓ Scheduler started. Waiting for scheduled times...');
console.log('Press Ctrl+C to stop the scheduler.');
console.log('');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('');
    console.log('='.repeat(70));
    console.log('Stopping Payout Comparison Sync Scheduler...');
    console.log('='.repeat(70));
    closeLogger();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('');
    console.log('='.repeat(70));
    console.log('Stopping Payout Comparison Sync Scheduler...');
    console.log('='.repeat(70));
    closeLogger();
    process.exit(0);
  });
})();

