#!/usr/bin/env node

/**
 * Runner script for Ringba Cost Sync service
 * Syncs cost changes from eLocal database to Ringba dashboard
 * 
 * Usage:
 *   node run-ringba-cost-sync.js <date-range> [category]
 * 
 * Examples:
 *   node run-ringba-cost-sync.js past10days
 *   node run-ringba-cost-sync.js past10days API
 *   node run-ringba-cost-sync.js past10days STATIC
 *   node run-ringba-cost-sync.js 18-11-2025
 *   node run-ringba-cost-sync.js 18-11-2025 to 19-11-2025
 *   node run-ringba-cost-sync.js 18-11-2025 to 19-11-2025 API
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { syncCostToRingba } from './src/services/ringba-cost-sync.js';
import { getPast10DaysRange, getCurrentDayRange, getDateRangeDescription } from './src/utils/date-utils.js';
import { initFileLogger, setupConsoleLogging, closeLogger, getLogFile } from './src/utils/file-logger.js';

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
  const ddMMyyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyy) {
    const day = parseInt(ddMMyyyy[1], 10);
    const month = parseInt(ddMMyyyy[2], 10) - 1;
    const year = parseInt(ddMMyyyy[3], 10);
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

  return null;
};

// Create date range object
const createDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Set time to start/end of day
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    startDateFormatted: formatDateForElocal(start),
    endDateFormatted: formatDateForElocal(end),
    description: getDateRangeDescription(start, end)
  };
};

// Parse date range from command line arguments
const parseDateRange = (args) => {
  if (args.length === 0) {
    return null;
  }

  const firstArg = args[0].toLowerCase();

  // Handle special keywords
  if (firstArg === 'past10days' || firstArg === 'historical') {
    return getPast10DaysRange();
  }

  if (firstArg === 'current' || firstArg === 'today') {
    return getCurrentDayRange();
  }

  // Try to parse as date range
  if (args.length === 1) {
    // Single date
    const date = parseDate(args[0]);
    if (date) {
      return createDateRange(date, date);
    }
  } else if (args.length >= 3 && args[1].toLowerCase() === 'to') {
    // Date range: "DD-MM-YYYY to DD-MM-YYYY"
    const startDate = parseDate(args[0]);
    const endDate = parseDate(args[2]);
    if (startDate && endDate) {
      return createDateRange(startDate, endDate);
    }
  }

  return null;
};

// Build config from environment variables
const buildConfig = () => {
  return {
    dbHost: process.env.DB_HOST || process.env.POSTGRES_HOST,
    dbPort: parseInt(process.env.DB_PORT || process.env.POSTGRES_PORT || '5432'),
    dbName: process.env.DB_NAME || process.env.POSTGRES_DB_NAME,
    dbUser: process.env.DB_USER || process.env.POSTGRES_USER_NAME,
    dbPassword: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
    dbSsl: process.env.DB_SSL === 'true',
    ringbaAccountId: process.env.RINGBA_ACCOUNT_ID,
    ringbaApiToken: process.env.RINGBA_API_TOKEN
  };
};

// Validate config
const validateConfig = (config) => {
  const errors = [];

  if (!config.ringbaAccountId) {
    errors.push('RINGBA_ACCOUNT_ID is required');
  }

  if (!config.ringbaApiToken) {
    errors.push('RINGBA_API_TOKEN is required');
  }

  if (!config.dbHost) {
    errors.push('DB_HOST is required');
  }

  if (!config.dbName) {
    errors.push('DB_NAME is required');
  }

  if (!config.dbUser) {
    errors.push('DB_USER is required');
  }

  if (!config.dbPassword) {
    errors.push('DB_PASSWORD is required');
  }

  return errors;
};

// Main function
const main = async () => {
  let logFilePath = null;
  
  try {
    // Initialize file logger
    logFilePath = await initFileLogger();
    if (logFilePath) {
      console.log(`[INFO] Logging to file: ${logFilePath}`);
      await setupConsoleLogging();
    }
    
    // Parse arguments
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.error('Usage: node run-ringba-cost-sync.js <date-range> [category]');
      console.error('');
      console.error('Examples:');
      console.error('  node run-ringba-cost-sync.js past10days');
      console.error('  node run-ringba-cost-sync.js past10days API');
      console.error('  node run-ringba-cost-sync.js past10days STATIC');
      console.error('  node run-ringba-cost-sync.js 18-11-2025');
      console.error('  node run-ringba-cost-sync.js 18-11-2025 to 19-11-2025');
      console.error('  node run-ringba-cost-sync.js 18-11-2025 to 19-11-2025 API');
      await closeLogger();
      process.exit(1);
    }

    // Parse date range
    const dateRange = parseDateRange(args);
    if (!dateRange) {
      console.error('Error: Invalid date range format');
      console.error('Supported formats:');
      console.error('  - past10days or historical (past 10 days)');
      console.error('  - current or today (today only)');
      console.error('  - DD-MM-YYYY (single date)');
      console.error('  - DD-MM-YYYY to DD-MM-YYYY (date range)');
      process.exit(1);
    }

    // Parse category (optional)
    let category = null;
    if (args.length === 2) {
      category = args[1].toUpperCase();
      if (category !== 'API' && category !== 'STATIC') {
        console.error(`Error: Invalid category "${category}". Must be "API" or "STATIC"`);
        process.exit(1);
      }
    } else if (args.length === 4 && args[3]) {
      category = args[3].toUpperCase();
      if (category !== 'API' && category !== 'STATIC') {
        console.error(`Error: Invalid category "${category}". Must be "API" or "STATIC"`);
        process.exit(1);
      }
    }

    // Build and validate config
    const config = buildConfig();
    const errors = validateConfig(config);

    if (errors.length > 0) {
      console.error('Error: Missing required configuration:');
      errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }

    // Run sync
    await syncCostToRingba(config, dateRange, category);

    console.log('[SUCCESS] Sync completed successfully!');
    if (logFilePath) {
      console.log(`[INFO] Log file saved to: ${logFilePath}`);
    }
    
    await closeLogger();
    process.exit(0);
  } catch (error) {
    console.error('[ERROR] Sync failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    if (logFilePath) {
      console.error(`[INFO] Error log saved to: ${logFilePath}`);
    }
    await closeLogger();
    process.exit(1);
  }
};

main();

