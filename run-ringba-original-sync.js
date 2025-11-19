#!/usr/bin/env node

/**
 * Ringba Original Payout/Revenue Sync Script
 * 
 * Fetches all calls from Ringba for a date range and matches them with database calls.
 * Updates matched records with original_payout and original_revenue from Ringba.
 * 
 * Usage:
 *   node run-ringba-original-sync.js <date-range> [category]
 * 
 * Parameters:
 *   date-range: 
 *     - Special keywords: 
 *       - "current" or "today" (current day only, with timezone logic - default for scheduler)
 *       - "historical" or "past10days" (past 10 days excluding today)
 *     - Single date: "2025-11-19", "11/19/2025", or "19-11-2025"
 *     - Date range: "2025-11-19:2025-11-20", "11/19/2025:11/20/2025", or "18-11-2025:19-11-2025"
 *   category (optional):
 *     - "API" - Only sync API category calls
 *     - "STATIC" - Only sync STATIC category calls
 *     - If omitted, syncs all categories
 * 
 * Examples:
 *   node run-ringba-original-sync.js current
 *   node run-ringba-original-sync.js today
 *   node run-ringba-original-sync.js historical
 *   node run-ringba-original-sync.js past10days API
 *   node run-ringba-original-sync.js 18-11-2025:19-11-2025 STATIC
 *   node run-ringba-original-sync.js 2025-11-19
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { syncRingbaOriginalPayout } from './src/services/ringba-original-sync.js';
import { getPast10DaysRange, getRingbaSyncDateRange, getDateRangeDescription } from './src/utils/date-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Format date for eLocal API (MM/DD/YYYY)
const formatDateForElocal = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

// Format date for URL (YYYY-MM-DD)
const formatDateForURL = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Parse date from various formats
const parseDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  // Try YYYY-MM-DD format first
  const yyyyMMdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMMdd) {
    const year = parseInt(yyyyMMdd[1], 10);
    const month = parseInt(yyyyMMdd[2], 10) - 1;
    const day = parseInt(yyyyMMdd[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && 
        date.getFullYear() === year && 
        date.getMonth() === month && 
        date.getDate() === day) {
      return date;
    }
  }

  // Try DD-MM-YYYY format
  const ddMMyyyyDash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyyDash) {
    const day = parseInt(ddMMyyyyDash[1], 10);
    const month = parseInt(ddMMyyyyDash[2], 10) - 1;
    const year = parseInt(ddMMyyyyDash[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && 
        date.getFullYear() === year && 
        date.getMonth() === month && 
        date.getDate() === day) {
      return date;
    }
  }

  // Try MM/DD/YYYY format
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const month = parseInt(mmddyyyy[1], 10) - 1;
    const day = parseInt(mmddyyyy[2], 10);
    const year = parseInt(mmddyyyy[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && 
        date.getFullYear() === year && 
        date.getMonth() === month && 
        date.getDate() === day) {
      return date;
    }
  }

  // Try DD/MM/YYYY format
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10);
    const month = parseInt(ddmmyyyy[2], 10) - 1;
    const year = parseInt(ddmmyyyy[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && 
        date.getFullYear() === year && 
        date.getMonth() === month && 
        date.getDate() === day) {
      return date;
    }
  }

  return null;
};

// Create date range object
const createDateRange = (startDate, endDate) => {
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  
  return {
    startDate,
    endDate,
    startDateFormatted: formatDateForElocal(startDate),
    endDateFormatted: formatDateForElocal(endDate),
    startDateURL: formatDateForURL(startDate),
    endDateURL: formatDateForURL(endDate)
  };
};

// Parse date range from command line argument
const parseDateRange = (dateRangeStr) => {
  if (!dateRangeStr) {
    // Default to current day with timezone logic (for scheduler use)
    return getRingbaSyncDateRange();
  }

  // Check for special keywords
  const dateRangeLower = dateRangeStr.toLowerCase();
  if (dateRangeLower === 'current' || dateRangeLower === 'today') {
    // Current day only with timezone logic (same as scheduler uses)
    return getRingbaSyncDateRange();
  }
  if (dateRangeLower === 'historical' || dateRangeLower === 'past10days') {
    return getPast10DaysRange();
  }

  // Check if it's a range (contains colon)
  if (dateRangeStr.includes(':')) {
    const [startStr, endStr] = dateRangeStr.split(':').map(s => s.trim());
    
    if (!startStr || !endStr) {
      throw new Error('Invalid date range format. Use: YYYY-MM-DD:YYYY-MM-DD or MM/DD/YYYY:MM/DD/YYYY');
    }

    const startDate = parseDate(startStr);
    const endDate = parseDate(endStr);

    if (!startDate) {
      throw new Error(`Invalid start date format: ${startStr}`);
    }

    if (!endDate) {
      throw new Error(`Invalid end date format: ${endStr}`);
    }

    if (startDate > endDate) {
      throw new Error(`Start date (${startStr}) must be before or equal to end date (${endStr})`);
    }

    return createDateRange(startDate, endDate);
  } else {
    // Single date
    const date = parseDate(dateRangeStr);
    
    if (!date) {
      throw new Error(`Invalid date format: ${dateRangeStr}`);
    }

    return createDateRange(date, new Date(date));
  }
};

// Build config from environment variables
const buildConfig = () => {
  return {
    elocalBaseUrl: process.env.ELOCAL_BASE_URL || 'https://elocal.com',
    dbHost: process.env.POSTGRES_HOST || process.env.DB_HOST,
    dbPort: process.env.POSTGRES_PORT || process.env.DB_PORT || 5432,
    dbName: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
    dbUser: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
    dbPassword: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
    dbSsl: process.env.DB_SSL === 'true',
    ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
    ringbaApiToken: process.env.RINGBA_API_TOKEN
  };
};

// Validate required config
const validateConfig = (config) => {
  const requiredVars = [
    { env: 'POSTGRES_HOST', alt: 'DB_HOST' },
    { env: 'POSTGRES_DB_NAME', alt: 'DB_NAME' },
    { env: 'POSTGRES_USER_NAME', alt: 'DB_USER' },
    { env: 'POSTGRES_PASSWORD', alt: 'DB_PASSWORD' },
    { env: 'RINGBA_ACCOUNT_ID' },
    { env: 'RINGBA_API_TOKEN' }
  ];
  
  const missingVars = requiredVars.filter(
    ({ env, alt }) => !process.env[env] && !process.env[alt]
  ).map(({ env }) => env);

  if (missingVars.length > 0) {
    console.error('[ERROR] Missing required environment variables:');
    missingVars.forEach(varName => 
      console.error(`  - ${varName}`)
    );
    process.exit(1);
  }
};

// Print usage information
const printUsage = () => {
  console.log('');
  console.log('Usage: node run-ringba-original-sync.js <date-range> [category]');
  console.log('');
  console.log('Parameters:');
  console.log('  date-range: Special keywords, single date, or date range');
  console.log('             - Special: "current" or "today" (current day only, with timezone logic - default)');
  console.log('             - Special: "historical" or "past10days" (past 10 days excluding today)');
  console.log('             - Single date: "2025-11-19", "11/19/2025", or "19-11-2025"');
  console.log('             - Date range:  "2025-11-19:2025-11-20", "11/19/2025:11/20/2025", or "18-11-2025:19-11-2025"');
  console.log('             - If omitted, defaults to "current" (current day with timezone logic)');
  console.log('  category (optional): "API" or "STATIC" - filter by category');
  console.log('                      If omitted, syncs all categories');
  console.log('');
  console.log('Examples:');
  console.log('  node run-ringba-original-sync.js current');
  console.log('  node run-ringba-original-sync.js today');
  console.log('  node run-ringba-original-sync.js historical');
  console.log('  node run-ringba-original-sync.js past10days API');
  console.log('  node run-ringba-original-sync.js 18-11-2025:19-11-2025 STATIC');
  console.log('  node run-ringba-original-sync.js 2025-11-19');
  console.log('');
};

// Main execution function
async function runSync() {
  try {
    // Get command line arguments
    // Default to "current" if no date range provided (for scheduler compatibility)
    const dateRangeStr = process.argv[2] || 'current';
    const category = process.argv[3] || null; // Optional category filter
    
    // Validate category if provided
    if (category && category !== 'API' && category !== 'STATIC') {
      console.error(`[ERROR] Invalid category: ${category}. Must be 'API' or 'STATIC'`);
      printUsage();
      process.exit(1);
    }

    // Build and validate config
    const config = buildConfig();
    validateConfig(config);

    // Parse date range
    let dateRange;
    try {
      dateRange = parseDateRange(dateRangeStr);
    } catch (error) {
      console.error(`[ERROR] ${error.message}`);
      printUsage();
      process.exit(1);
    }

    // Log timezone information if using current day logic
    const isCurrentDay = dateRangeStr.toLowerCase() === 'current' || 
                         dateRangeStr.toLowerCase() === 'today' || 
                         !process.argv[2];
    if (isCurrentDay) {
      const istTime = new Date().toLocaleString('en-US', { 
        timeZone: 'Asia/Kolkata',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      console.log(`[INFO] Current IST Time: ${istTime}`);
      console.log(`[INFO] Fetching data for: ${dateRange.startDateFormatted} (Ringba CST timezone)`);
      console.log('');
    }

    // Display configuration
    const categoryLabel = category ? ` (${category} category)` : '';
    console.log('');
    console.log('='.repeat(70));
    console.log('Ringba Original Payout/Revenue Sync');
    console.log('='.repeat(70));
    console.log(`Date Range:   ${getDateRangeDescription(dateRange)}${categoryLabel}`);
    console.log(`Database:     ${config.dbHost}:${config.dbPort}/${config.dbName}`);
    console.log(`Ringba Account: ${config.ringbaAccountId ? 'Configured' : 'Not configured'}`);
    console.log('='.repeat(70));
    console.log('');

    // Run the sync
    const summary = await syncRingbaOriginalPayout(config, dateRange, category);

    console.log('');
    console.log('='.repeat(70));
    console.log('[SUCCESS] Sync completed successfully!');
    console.log('='.repeat(70));
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error('[ERROR] Sync failed');
    console.error('='.repeat(70));
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('');
    process.exit(1);
  }
}

// Run the sync
runSync();

