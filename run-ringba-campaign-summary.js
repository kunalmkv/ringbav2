#!/usr/bin/env node

// Script to run Ringba Campaign Summary sync service
// Fetches and saves campaign summary data (RPC, total calls, etc.) for a specific date

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { syncCampaignSummary, syncCampaignSummaryByCampaignId } from './src/services/ringba-campaign-summary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Parse date from command line arguments
// Returns the date string for YYYY-MM-DD format (to avoid timezone issues)
// Returns Date object for other formats
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Try YYYY-MM-DD format - return as string to avoid timezone shifts
  const yyyyMMdd = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyyMMdd) {
    // Return the string directly - service will parse it in UTC
    return dateStr;
  }
  
  // Try MM/DD/YYYY format - create in UTC
  const mmddyyyy = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const month = parseInt(mmddyyyy[1], 10) - 1;
    const day = parseInt(mmddyyyy[2], 10);
    const year = parseInt(mmddyyyy[3], 10);
    // Create in UTC to avoid timezone shifts
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try DD-MM-YYYY format - create in UTC
  const ddMMyyyy = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddMMyyyy) {
    const day = parseInt(ddMMyyyy[1], 10);
    const month = parseInt(ddMMyyyy[2], 10) - 1;
    const year = parseInt(ddMMyyyy[3], 10);
    // Create in UTC to avoid timezone shifts
    const date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try special keywords
  if (dateStr.toLowerCase() === 'today' || dateStr.toLowerCase() === 'current') {
    // Return today in UTC
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  }
  
  if (dateStr.toLowerCase() === 'yesterday') {
    // Return yesterday in UTC
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate() - 1;
    return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
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
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    
    // Check if first argument is a campaign ID (starts with CA)
    const isCampaignId = args[0] && args[0].startsWith('CA');
    
    if (isCampaignId) {
      // Fetch by campaign ID
      const campaignId = args[0];
      const dateStr = args[1] || 'today';
      
      // Parse date
      const date = parseDate(dateStr);
      if (!date) {
        console.error(`❌ Error: Invalid date format: ${dateStr}`);
        console.log('');
        console.log('Usage: node run-ringba-campaign-summary.js <campaignId> [date]');
        console.log('');
        console.log('Date formats supported:');
        console.log('  - YYYY-MM-DD (e.g., 2025-11-20)');
        console.log('  - MM/DD/YYYY (e.g., 11/20/2025)');
        console.log('  - DD-MM-YYYY (e.g., 20-11-2025)');
        console.log('  - today, current (default)');
        console.log('  - yesterday');
        console.log('');
        process.exit(1);
      }
      
      // Build and validate config
      const config = buildConfig();
      const errors = validateConfig(config);
      
      if (errors.length > 0) {
        console.error('❌ Configuration errors:');
        errors.forEach(err => console.error(`  - ${err}`));
        console.log('');
        console.log('Please set the required environment variables in your .env file.');
        process.exit(1);
      }
      
      // Run the sync by campaign ID
      const result = await syncCampaignSummaryByCampaignId(config, campaignId, date);
      
      console.log(`\n✅ Successfully synced campaign summary for ${result.campaignId}`);
      process.exit(0);
    } else {
      // Fetch by target IDs (original behavior)
      const dateStr = args[0] || 'today';
      
      // Parse date
      const date = parseDate(dateStr);
      if (!date) {
        console.error(`❌ Error: Invalid date format: ${dateStr}`);
        console.log('');
        console.log('Usage: node run-ringba-campaign-summary.js [date]');
        console.log('   or: node run-ringba-campaign-summary.js <campaignId> [date]');
        console.log('');
        console.log('Date formats supported:');
        console.log('  - YYYY-MM-DD (e.g., 2025-11-20)');
        console.log('  - MM/DD/YYYY (e.g., 11/20/2025)');
        console.log('  - DD-MM-YYYY (e.g., 20-11-2025)');
        console.log('  - today, current (default)');
        console.log('  - yesterday');
        console.log('');
        process.exit(1);
      }
      
      // Build and validate config
      const config = buildConfig();
      const errors = validateConfig(config);
      
      if (errors.length > 0) {
        console.error('❌ Configuration errors:');
        errors.forEach(err => console.error(`  - ${err}`));
        console.log('');
        console.log('Please set the required environment variables in your .env file.');
        process.exit(1);
      }
      
      // Run the sync
      const result = await syncCampaignSummary(config, date);
      
      if (result.failed > 0) {
        console.error(`\n⚠️  Completed with ${result.failed} error(s)`);
        process.exit(1);
      } else {
        console.log(`\n✅ Successfully synced campaign summary for ${result.date}`);
        process.exit(0);
      }
    }
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

// Run main function
main();

