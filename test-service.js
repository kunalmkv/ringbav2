#!/usr/bin/env node

/**
 * Test script for eLocal scraping service
 * 
 * Usage:
 *   npm run test:service [service-type] [category]
 * 
 * Service types:
 *   - historical: Past 10 days (excluding today) - STATIC category
 *   - current: Current day only - STATIC category
 *   - historical-api: Past 10 days (excluding today) - API category
 *   - current-api: Current day only - API category
 * 
 * Examples:
 *   npm run test:service historical
 *   npm run test:service current-api
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  scrapeHistoricalData,
  scrapeCurrentDayData,
  scrapeHistoricalDataAPI,
  scrapeCurrentDayDataAPI
} from './src/services/elocal.scrapper.js';
import { getCurrentDayRangeWithTimezone, getDateRangeDescription } from './src/utils/date-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Get service type from command line arguments
const serviceType = process.argv[2] || 'current';
const category = process.argv[3] || 'STATIC';

// Build config from environment variables
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

// Validate required config
const requiredVars = [
  { env: 'POSTGRES_HOST', alt: 'DB_HOST' },
  { env: 'POSTGRES_DB_NAME', alt: 'DB_NAME' },
  { env: 'POSTGRES_USER_NAME', alt: 'DB_USER' },
  { env: 'POSTGRES_PASSWORD', alt: 'DB_PASSWORD' }
];
const missingVars = requiredVars.filter(({ env, alt }) => !process.env[env] && !process.env[alt]).map(({ env }) => env);

if (missingVars.length > 0) {
  console.error('[ERROR] Missing required environment variables:');
  missingVars.forEach(varName => console.error(`  - ${varName} (or ${varName.replace('POSTGRES_', 'DB_').replace('_NAME', '').replace('_USER', '_USER')})`));
  console.error('\nPlease ensure your .env file contains all required variables.');
  console.error('Expected variables:');
  console.error('  - POSTGRES_HOST (or DB_HOST)');
  console.error('  - POSTGRES_DB_NAME (or DB_NAME)');
  console.error('  - POSTGRES_USER_NAME (or DB_USER)');
  console.error('  - POSTGRES_PASSWORD (or DB_PASSWORD)');
  process.exit(1);
}

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

// Run the appropriate service
async function runService() {
  try {
    console.log(`[INFO] Starting ${serviceType} service (${category} category)...`);
    console.log(`[INFO] Database: ${config.dbHost}:${config.dbPort}/${config.dbName}`);
    console.log('');

    let result;

    switch (serviceType) {
      case 'historical':
        result = await scrapeHistoricalData(config);
        break;
      case 'current':
        // Use timezone-aware date range for current day service
        const currentDateRange = getCurrentDayRangeWithTimezone();
        const istTime = getISTTime();
        console.log(`[INFO] Current IST Time: ${istTime}`);
        console.log(`[INFO] Date Range: ${getDateRangeDescription(currentDateRange)}`);
        console.log(`[INFO] Note: Fetching data for ${currentDateRange.startDateFormatted} (CST timezone consideration)`);
        console.log('');
        result = await scrapeCurrentDayData(config, currentDateRange);
        break;
      case 'historical-api':
        result = await scrapeHistoricalDataAPI(config);
        break;
      case 'current-api':
        // Use timezone-aware date range for current day service
        const currentApiDateRange = getCurrentDayRangeWithTimezone();
        const istTimeApi = getISTTime();
        console.log(`[INFO] Current IST Time: ${istTimeApi}`);
        console.log(`[INFO] Date Range: ${getDateRangeDescription(currentApiDateRange)}`);
        console.log(`[INFO] Note: Fetching data for ${currentApiDateRange.startDateFormatted} (CST timezone consideration)`);
        console.log('');
        result = await scrapeCurrentDayDataAPI(config, currentApiDateRange);
        break;
      default:
        console.error(`[ERROR] Unknown service type: ${serviceType}`);
        console.error('Valid service types: historical, current, historical-api, current-api');
        process.exit(1);
    }

    console.log('');
    console.log('[SUCCESS] Service completed successfully!');
    console.log('');
    console.log('Summary:');
    console.log(`  Session ID: ${result.sessionId}`);
    console.log(`  Date Range: ${result.dateRange}`);
    console.log(`  Total Calls: ${result.summary.totalCalls}`);
    console.log(`  Total Payout: $${result.summary.totalPayout.toFixed(2)}`);
    console.log(`  Unique Callers: ${result.summary.uniqueCallers}`);
    console.log(`  Adjustments Applied: ${result.summary.adjustmentsApplied || 0}`);
    console.log(`  Calls Inserted: ${result.databaseResults.callsInserted}`);
    console.log(`  Calls Updated: ${result.databaseResults.callsUpdated}`);

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('[ERROR] Service failed:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the service
runService();

