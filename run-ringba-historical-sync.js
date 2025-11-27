#!/usr/bin/env node

/**
 * Runner script for Ringba Historical Sync service
 * 
 * Fetches historical call data from Ringba API and saves it to call_processing_queue table.
 * 
 * Usage:
 *   node run-ringba-historical-sync.js <date-range> [options]
 * 
 * Date Range Formats:
 *   - Single date: 2025-11-25 or 11/25/2025 or 25-11-2025
 *   - Date range: 2025-11-20:2025-11-25 or 11/20/2025:11/25/2025
 *   - Keywords: today, yesterday, past7days, past15days, past30days
 * 
 * Options:
 *   --target=<targetId>     Filter by target ID
 *   --campaign=<campaignId> Filter by campaign ID
 * 
 * Examples:
 *   node run-ringba-historical-sync.js 2025-11-25
 *   node run-ringba-historical-sync.js 2025-11-20:2025-11-25
 *   node run-ringba-historical-sync.js past15days
 *   node run-ringba-historical-sync.js past30days --target=TA48aa3e3f5a0544af8549703f76a24faa
 *   node run-ringba-historical-sync.js 2025-11-01:2025-11-30 --campaign=CA56446512fe4e4926a05e76574a7d6963
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { syncHistoricalRingbaData, buildConfig } from './src/services/ringba-historical-sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

/**
 * Parse date from various formats
 */
const parseDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  // YYYY-MM-DD format
  const yyyyMMdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMMdd) {
    return new Date(Date.UTC(
      parseInt(yyyyMMdd[1], 10),
      parseInt(yyyyMMdd[2], 10) - 1,
      parseInt(yyyyMMdd[3], 10),
      0, 0, 0, 0
    ));
  }

  // MM/DD/YYYY format
  const mmDDyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmDDyyyy) {
    return new Date(Date.UTC(
      parseInt(mmDDyyyy[3], 10),
      parseInt(mmDDyyyy[1], 10) - 1,
      parseInt(mmDDyyyy[2], 10),
      0, 0, 0, 0
    ));
  }

  // DD-MM-YYYY format
  const ddMMyyyyDash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyyDash) {
    return new Date(Date.UTC(
      parseInt(ddMMyyyyDash[3], 10),
      parseInt(ddMMyyyyDash[2], 10) - 1,
      parseInt(ddMMyyyyDash[1], 10),
      0, 0, 0, 0
    ));
  }

  return null;
};

/**
 * Get IST date (for calculating "today" in IST)
 */
const getISTDate = () => {
  const now = new Date();
  const istString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = istString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (parts) {
    return {
      year: parseInt(parts[3], 10),
      month: parseInt(parts[1], 10),
      day: parseInt(parts[2], 10)
    };
  }
  
  // Fallback
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  };
};

/**
 * Parse date range from string
 */
const parseDateRange = (dateRangeStr) => {
  const lower = dateRangeStr.toLowerCase();
  const istDate = getISTDate();
  
  // Handle keywords
  if (lower === 'today') {
    const startDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day, 23, 59, 59, 999));
    return { startDate, endDate };
  }
  
  if (lower === 'yesterday') {
    const yesterday = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day - 1, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day - 1, 23, 59, 59, 999));
    return { startDate: yesterday, endDate };
  }
  
  if (lower === 'past7days') {
    const endDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day, 23, 59, 59, 999));
    const startDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day - 6, 0, 0, 0, 0));
    return { startDate, endDate };
  }
  
  if (lower === 'past15days') {
    const endDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day, 23, 59, 59, 999));
    const startDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day - 14, 0, 0, 0, 0));
    return { startDate, endDate };
  }
  
  if (lower === 'past30days') {
    const endDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day, 23, 59, 59, 999));
    const startDate = new Date(Date.UTC(istDate.year, istDate.month - 1, istDate.day - 29, 0, 0, 0, 0));
    return { startDate, endDate };
  }
  
  // Check if it's a range (contains :)
  if (dateRangeStr.includes(':')) {
    const [startStr, endStr] = dateRangeStr.split(':');
    const startDate = parseDate(startStr.trim());
    const endDate = parseDate(endStr.trim());
    
    if (startDate && endDate) {
      // Set end date to end of day
      endDate.setUTCHours(23, 59, 59, 999);
      return { startDate, endDate };
    }
  }
  
  // Single date
  const singleDate = parseDate(dateRangeStr);
  if (singleDate) {
    const endDate = new Date(singleDate.getTime());
    endDate.setUTCHours(23, 59, 59, 999);
    return { startDate: singleDate, endDate };
  }
  
  return null;
};

/**
 * Parse command line options
 */
const parseOptions = (args) => {
  const options = {};
  
  for (const arg of args) {
    if (arg.startsWith('--target=')) {
      options.targetId = arg.replace('--target=', '');
    } else if (arg.startsWith('--campaign=')) {
      options.campaignId = arg.replace('--campaign=', '');
    }
  }
  
  return options;
};

/**
 * Show usage information
 */
const showUsage = () => {
  console.log('');
  console.log('Usage: node run-ringba-historical-sync.js <date-range> [options]');
  console.log('');
  console.log('Date Range Formats:');
  console.log('  - Single date: 2025-11-25 or 11/25/2025 or 25-11-2025');
  console.log('  - Date range: 2025-11-20:2025-11-25 or 11/20/2025:11/25/2025');
  console.log('  - Keywords: today, yesterday, past7days, past15days, past30days');
  console.log('');
  console.log('Options:');
  console.log('  --target=<targetId>     Filter by target ID');
  console.log('  --campaign=<campaignId> Filter by campaign ID');
  console.log('');
  console.log('Examples:');
  console.log('  node run-ringba-historical-sync.js 2025-11-25');
  console.log('  node run-ringba-historical-sync.js 2025-11-20:2025-11-25');
  console.log('  node run-ringba-historical-sync.js past15days');
  console.log('  node run-ringba-historical-sync.js past30days --target=TA48aa3e3f5a0544af8549703f76a24faa');
  console.log('');
};

/**
 * Validate configuration
 */
const validateConfig = (config) => {
  const errors = [];
  
  if (!config.ringbaAccountId) {
    errors.push('RINGBA_ACCOUNT_ID is required');
  }
  if (!config.ringbaApiToken) {
    errors.push('RINGBA_API_TOKEN is required');
  }
  if (!config.dbHost) {
    errors.push('Database host (DB_HOST or POSTGRES_HOST) is required');
  }
  if (!config.dbUser) {
    errors.push('Database user (DB_USER or POSTGRES_USER_NAME) is required');
  }
  if (!config.dbPassword) {
    errors.push('Database password (DB_PASSWORD or POSTGRES_PASSWORD) is required');
  }
  
  return errors;
};

/**
 * Main function
 */
const main = async () => {
  const args = process.argv.slice(2);
  
  // Check for help flag
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showUsage();
    process.exit(0);
  }
  
  // Parse date range (first non-option argument)
  const dateRangeArg = args.find(arg => !arg.startsWith('--'));
  if (!dateRangeArg) {
    console.error('❌ Error: Date range is required');
    showUsage();
    process.exit(1);
  }
  
  const dateRange = parseDateRange(dateRangeArg);
  if (!dateRange) {
    console.error(`❌ Error: Invalid date range format: ${dateRangeArg}`);
    showUsage();
    process.exit(1);
  }
  
  // Parse options
  const options = parseOptions(args);
  
  // Build config
  const config = buildConfig();
  
  // Validate config
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    console.error('❌ Configuration errors:');
    configErrors.forEach(err => console.error(`   - ${err}`));
    console.error('');
    console.error('Please set the required environment variables in your .env file.');
    process.exit(1);
  }
  
  // Show configuration
  console.log('');
  console.log('======================================================================');
  console.log('Ringba Historical Sync Runner');
  console.log('======================================================================');
  console.log(`Database: ${config.dbHost}:${config.dbPort}/${config.dbName}`);
  console.log(`Ringba Account: ${config.ringbaAccountId}`);
  console.log(`Date Range: ${dateRange.startDate.toISOString()} to ${dateRange.endDate.toISOString()}`);
  if (options.targetId) console.log(`Target ID: ${options.targetId}`);
  if (options.campaignId) console.log(`Campaign ID: ${options.campaignId}`);
  console.log('======================================================================');
  console.log('');
  
  try {
    const startTime = Date.now();
    
    const result = await syncHistoricalRingbaData(config, dateRange, options);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('======================================================================');
    console.log(`✅ Sync completed successfully in ${duration}s`);
    console.log('======================================================================');
    console.log(`Calls Fetched: ${result.callsFetched}`);
    console.log(`Inserted: ${result.inserted}`);
    console.log(`Updated: ${result.updated}`);
    console.log(`Skipped: ${result.skipped}`);
    console.log(`Errors: ${result.errors}`);
    console.log('======================================================================');
    
    process.exit(0);
    
  } catch (error) {
    console.error('');
    console.error('======================================================================');
    console.error('❌ Sync failed');
    console.error('======================================================================');
    console.error(`Error: ${error.message}`);
    console.error('======================================================================');
    
    process.exit(1);
  }
};

// Run
main();

