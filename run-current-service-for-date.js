#!/usr/bin/env node

/**
 * Run current service for a specific date
 * 
 * Usage:
 *   node run-current-service-for-date.js <date> [category]
 * 
 * Date formats:
 *   - YYYY-MM-DD: 2025-12-17
 *   - MM/DD/YYYY: 12/17/2025
 *   - DD-MM-YYYY: 17-12-2025
 * 
 * Category (optional):
 *   - STATIC (default)
 *   - API
 * 
 * Examples:
 *   node run-current-service-for-date.js 2025-12-17
 *   node run-current-service-for-date.js 12/17/2025 API
 *   node run-current-service-for-date.js 17-12-2025 STATIC
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  scrapeCurrentDayData,
  scrapeCurrentDayDataAPI
} from './src/services/elocal.scrapper.js';
import { getDateRangeDescription } from './src/utils/date-utils.js';

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
    return {
      year: parseInt(yyyyMMdd[1], 10),
      month: parseInt(yyyyMMdd[2], 10),
      day: parseInt(yyyyMMdd[3], 10)
    };
  }

  // MM/DD/YYYY format
  const mmDDyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmDDyyyy) {
    return {
      year: parseInt(mmDDyyyy[3], 10),
      month: parseInt(mmDDyyyy[1], 10),
      day: parseInt(mmDDyyyy[2], 10)
    };
  }

  // DD-MM-YYYY format
  const ddMMyyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyy) {
    return {
      year: parseInt(ddMMyyyy[3], 10),
      month: parseInt(ddMMyyyy[2], 10),
      day: parseInt(ddMMyyyy[1], 10)
    };
  }

  return null;
};

/**
 * Create date range for a specific date
 */
const createDateRangeForDate = (dateObj) => {
  const { year, month, day } = dateObj;
  
  // Create Date objects using UTC to avoid timezone issues
  const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
  
  // Format dates
  const startDateFormatted = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  const endDateFormatted = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
  const startDateURL = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const endDateURL = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  
  return {
    startDate,
    endDate,
    startDateFormatted,
    endDateFormatted,
    startDateURL,
    endDateURL
  };
};

/**
 * Show usage information
 */
const showUsage = () => {
  console.log('');
  console.log('Usage: node run-current-service-for-date.js <date> [category]');
  console.log('');
  console.log('Date formats:');
  console.log('  - YYYY-MM-DD: 2025-12-17');
  console.log('  - MM/DD/YYYY: 12/17/2025');
  console.log('  - DD-MM-YYYY: 17-12-2025');
  console.log('');
  console.log('Category (optional):');
  console.log('  - STATIC (default)');
  console.log('  - API');
  console.log('');
  console.log('Examples:');
  console.log('  node run-current-service-for-date.js 2025-12-17');
  console.log('  node run-current-service-for-date.js 12/17/2025 API');
  console.log('  node run-current-service-for-date.js 17-12-2025 STATIC');
  console.log('');
};

/**
 * Validate configuration
 */
const validateConfig = (config) => {
  const errors = [];
  
  if (!config.dbHost) {
    errors.push('Database host (DB_HOST or POSTGRES_HOST) is required');
  }
  if (!config.dbUser) {
    errors.push('Database user (DB_USER or POSTGRES_USER_NAME) is required');
  }
  if (!config.dbPassword) {
    errors.push('Database password (DB_PASSWORD or POSTGRES_PASSWORD) is required');
  }
  if (!config.dbName) {
    errors.push('Database name (DB_NAME or POSTGRES_DB_NAME) is required');
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
  
  // Parse date (first argument)
  const dateStr = args[0];
  const dateObj = parseDate(dateStr);
  
  if (!dateObj) {
    console.error(`❌ Error: Invalid date format: ${dateStr}`);
    showUsage();
    process.exit(1);
  }
  
  // Parse category (second argument, default to STATIC)
  const category = (args[1] || 'STATIC').toUpperCase();
  if (category !== 'STATIC' && category !== 'API') {
    console.error(`❌ Error: Invalid category: ${category}. Must be STATIC or API`);
    showUsage();
    process.exit(1);
  }
  
  // Build config
  const config = {
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
  
  // Validate config
  const configErrors = validateConfig(config);
  if (configErrors.length > 0) {
    console.error('❌ Configuration errors:');
    configErrors.forEach(err => console.error(`   - ${err}`));
    console.error('');
    console.error('Please set the required environment variables in your .env file.');
    process.exit(1);
  }
  
  // Create date range for the specified date
  const dateRange = createDateRangeForDate(dateObj);
  
  // Show configuration
  console.log('');
  console.log('======================================================================');
  console.log('Current Service Runner for Specific Date');
  console.log('======================================================================');
  console.log(`Database: ${config.dbHost}:${config.dbPort}/${config.dbName}`);
  console.log(`Target Date: ${dateRange.startDateFormatted}`);
  console.log(`Category: ${category}`);
  console.log(`Date Range: ${getDateRangeDescription(dateRange)}`);
  console.log('======================================================================');
  console.log('');
  
  try {
    const startTime = Date.now();
    
    let result;
    if (category === 'API') {
      result = await scrapeCurrentDayDataAPI(config, dateRange);
    } else {
      result = await scrapeCurrentDayData(config, dateRange);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('======================================================================');
    console.log(`✅ Service completed successfully in ${duration}s`);
    console.log('======================================================================');
    console.log(`Session ID: ${result.sessionId}`);
    console.log(`Date Range: ${result.dateRange}`);
    console.log(`Total Calls: ${result.summary.totalCalls}`);
    console.log(`Total Payout: $${result.summary.totalPayout.toFixed(2)}`);
    console.log(`Unique Callers: ${result.summary.uniqueCallers}`);
    console.log(`Adjustments Applied: ${result.summary.adjustmentsApplied || 0}`);
    console.log(`Calls Inserted: ${result.databaseResults.callsInserted}`);
    console.log(`Calls Updated: ${result.databaseResults.callsUpdated}`);
    console.log('======================================================================');
    
    process.exit(0);
    
  } catch (error) {
    console.error('');
    console.error('======================================================================');
    console.error('❌ Service failed');
    console.error('======================================================================');
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('======================================================================');
    
    process.exit(1);
  }
};

// Run
main();




