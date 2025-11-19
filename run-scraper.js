#!/usr/bin/env node

/**
 * Custom scraping script that accepts Category and Date Range parameters
 * 
 * Usage:
 *   node run-scraper.js <category> <date-range>
 * 
 * Parameters:
 *   category: STATIC or API
 *   date-range: 
 *     - Special keywords: "historical" or "past10days" (past 10 days excluding today)
 *     - Single date: "2025-11-19", "11/19/2025", or "19-11-2025"
 *     - Date range: "2025-11-19:2025-11-20", "11/19/2025:11/20/2025", or "18-11-2025:19-11-2025"
 * 
 * Examples:
 *   node run-scraper.js STATIC historical
 *   node run-scraper.js API past10days
 *   node run-scraper.js STATIC 2025-11-19
 *   node run-scraper.js API 11/19/2025
 *   node run-scraper.js STATIC 19-11-2025
 *   node run-scraper.js STATIC 2025-11-19:2025-11-20
 *   node run-scraper.js API 11/19/2025:11/20/2025
 *   node run-scraper.js STATIC 18-11-2025:19-11-2025
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scrapeElocalDataWithDateRange } from './src/services/elocal.scrapper.js';
import { getDateRangeDescription, getPast10DaysRange } from './src/utils/date-utils.js';

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
// Supports: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, DD-MM-YYYY
const parseDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  // Try YYYY-MM-DD format first
  const yyyyMMdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMMdd) {
    const year = parseInt(yyyyMMdd[1], 10);
    const month = parseInt(yyyyMMdd[2], 10) - 1; // Month is 0-indexed
    const day = parseInt(yyyyMMdd[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime()) && 
        date.getFullYear() === year && 
        date.getMonth() === month && 
        date.getDate() === day) {
      return date;
    }
  }

  // Try DD-MM-YYYY format (with dashes)
  const ddMMyyyyDash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyyDash) {
    const day = parseInt(ddMMyyyyDash[1], 10);
    const month = parseInt(ddMMyyyyDash[2], 10) - 1; // Month is 0-indexed
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
    const month = parseInt(mmddyyyy[1], 10) - 1; // Month is 0-indexed
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

  // Try DD/MM/YYYY format (with slashes)
  const ddmmyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const day = parseInt(ddmmyyyy[1], 10);
    const month = parseInt(ddmmyyyy[2], 10) - 1; // Month is 0-indexed
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

// Create date range object from parsed dates
const createDateRange = (startDate, endDate) => {
  // Set time to start of day for startDate
  startDate.setHours(0, 0, 0, 0);
  
  // Set time to end of day for endDate
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
// Supports: "2025-11-19" or "2025-11-19:2025-11-20" or "11/19/2025:11/20/2025"
const parseDateRange = (dateRangeStr) => {
  if (!dateRangeStr) {
    throw new Error('Date range is required');
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
      throw new Error(`Invalid start date format: ${startStr}. Use YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY`);
    }

    if (!endDate) {
      throw new Error(`Invalid end date format: ${endStr}. Use YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY`);
    }

    if (startDate > endDate) {
      throw new Error(`Start date (${startStr}) must be before or equal to end date (${endStr})`);
    }

    return createDateRange(startDate, endDate);
  } else {
    // Single date
    const date = parseDate(dateRangeStr);
    
    if (!date) {
      throw new Error(`Invalid date format: ${dateRangeStr}. Use YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY`);
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
    { env: 'POSTGRES_PASSWORD', alt: 'DB_PASSWORD' }
  ];
  
  const missingVars = requiredVars.filter(
    ({ env, alt }) => !process.env[env] && !process.env[alt]
  ).map(({ env }) => env);

  if (missingVars.length > 0) {
    console.error('[ERROR] Missing required environment variables:');
    missingVars.forEach(varName => 
      console.error(`  - ${varName} (or ${varName.replace('POSTGRES_', 'DB_').replace('_NAME', '').replace('_USER', '_USER')})`)
    );
    console.error('\nPlease ensure your .env file contains all required variables.');
    process.exit(1);
  }
};

// Print usage information
const printUsage = () => {
  console.log('');
  console.log('Usage: node run-scraper.js <category> <date-range>');
  console.log('');
  console.log('Parameters:');
  console.log('  category:    STATIC or API');
  console.log('  date-range: Special keywords, single date, or date range');
  console.log('             - Special: "historical" or "past10days" (past 10 days excluding today)');
  console.log('             - Single date: "2025-11-19", "11/19/2025", or "19-11-2025"');
  console.log('             - Date range:  "2025-11-19:2025-11-20", "11/19/2025:11/20/2025", or "18-11-2025:19-11-2025"');
  console.log('');
  console.log('Examples:');
  console.log('  node run-scraper.js STATIC historical');
  console.log('  node run-scraper.js API past10days');
  console.log('  node run-scraper.js STATIC 2025-11-19');
  console.log('  node run-scraper.js API 11/19/2025');
  console.log('  node run-scraper.js STATIC 19-11-2025');
  console.log('  node run-scraper.js STATIC 2025-11-19:2025-11-20');
  console.log('  node run-scraper.js API 11/19/2025:11/20/2025');
  console.log('  node run-scraper.js STATIC 18-11-2025:19-11-2025');
  console.log('');
};

// Main execution function
async function runScraper() {
  try {
    // Get command line arguments
    const category = process.argv[2];
    const dateRangeStr = process.argv[3];

    // Validate arguments
    if (!category || !dateRangeStr) {
      console.error('[ERROR] Missing required parameters');
      printUsage();
      process.exit(1);
    }

    // Validate category
    const validCategories = ['STATIC', 'API'];
    if (!validCategories.includes(category.toUpperCase())) {
      console.error(`[ERROR] Invalid category: ${category}`);
      console.error(`Valid categories: ${validCategories.join(', ')}`);
      printUsage();
      process.exit(1);
    }

    const normalizedCategory = category.toUpperCase();

    // Build and validate config
    const config = buildConfig();
    validateConfig(config);

    // Parse date range - check for special keywords first
    let dateRange;
    try {
      // Check for special keywords
      const dateRangeLower = dateRangeStr.toLowerCase();
      if (dateRangeLower === 'historical' || dateRangeLower === 'past10days') {
        console.log('[INFO] Using historical date range (past 10 days excluding today)...');
        dateRange = getPast10DaysRange();
      } else {
        // Parse as regular date range
        dateRange = parseDateRange(dateRangeStr);
      }
    } catch (error) {
      console.error(`[ERROR] ${error.message}`);
      printUsage();
      process.exit(1);
    }

    // Display configuration
    console.log('');
    console.log('='.repeat(60));
    console.log('eLocal Scraper - Custom Date Range');
    console.log('='.repeat(60));
    console.log(`Category:     ${normalizedCategory}`);
    console.log(`Date Range:   ${getDateRangeDescription(dateRange)}`);
    console.log(`Database:     ${config.dbHost}:${config.dbPort}/${config.dbName}`);
    console.log('='.repeat(60));
    console.log('');

    // Run the scraping service
    console.log(`[INFO] Starting scraping for ${normalizedCategory} category...`);
    console.log(`[INFO] Date range: ${getDateRangeDescription(dateRange)}`);
    console.log('');

    const result = await scrapeElocalDataWithDateRange(config)(dateRange)('custom')(normalizedCategory);

    // Display results
    console.log('');
    console.log('='.repeat(60));
    console.log('[SUCCESS] Scraping completed successfully!');
    console.log('='.repeat(60));
    console.log('');
    console.log('Summary:');
    console.log(`  Session ID:            ${result.sessionId}`);
    console.log(`  Date Range:             ${result.dateRange}`);
    console.log(`  Category:               ${normalizedCategory}`);
    console.log(`  Total Calls:            ${result.summary.totalCalls}`);
    console.log(`  Total Payout:           $${result.summary.totalPayout.toFixed(2)}`);
    console.log(`  Unique Callers:         ${result.summary.uniqueCallers}`);
    console.log(`  Adjustments Applied:    ${result.summary.adjustmentsApplied || 0}`);
    console.log(`  Calls Inserted:         ${result.databaseResults.callsInserted}`);
    console.log(`  Calls Updated:          ${result.databaseResults.callsUpdated}`);
    console.log('');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('[ERROR] Scraping failed');
    console.error('='.repeat(60));
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

// Run the scraper
runScraper();

