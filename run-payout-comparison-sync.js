#!/usr/bin/env node

/**
 * Payout Comparison Sync Runner Script
 * 
 * Runs the payout comparison sync service for a specific date or date range.
 * 
 * Usage:
 *   node run-payout-comparison-sync.js <date> [endDate]
 *   node run-payout-comparison-sync.js <date-range>
 * 
 * Examples:
 *   node run-payout-comparison-sync.js 2025-12-02
 *   node run-payout-comparison-sync.js 2025-11-01 2025-11-30
 *   node run-payout-comparison-sync.js 2025-11-01:2025-11-30
 * 
 * Date formats supported:
 *   - YYYY-MM-DD (e.g., 2025-12-02)
 *   - MM/DD/YYYY (e.g., 12/02/2025)
 *   - DD-MM-YYYY (e.g., 02-12-2025)
 */

import { syncPayoutComparisonForDate, syncPayoutComparisonForDateRange } from './src/services/payout-comparison-sync.js';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const { Pool } = pg;

// Helper to parse date from various formats
const parseDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Handle YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Handle MM/DD/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Handle DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    const [day, month, year] = dateStr.split('-');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return null;
};

const main = async () => {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node run-payout-comparison-sync.js <date> [endDate]');
    console.error('Examples:');
    console.error('  node run-payout-comparison-sync.js 2025-11-21');
    console.error('  node run-payout-comparison-sync.js 2025-11-01 2025-11-30');
    console.error('  node run-payout-comparison-sync.js 2025-11-01:2025-11-30');
    process.exit(1);
  }
  
  let startDate, endDate;
  
  // Handle date range format: "2025-11-01:2025-11-30"
  if (args[0].includes(':')) {
    [startDate, endDate] = args[0].split(':').map(parseDate);
  } else if (args.length === 1) {
    startDate = parseDate(args[0]);
    endDate = startDate;
  } else if (args.length === 2) {
    startDate = parseDate(args[0]);
    endDate = parseDate(args[1]);
  }
  
  if (!startDate || !endDate) {
    console.error('Invalid date format. Use YYYY-MM-DD, MM/DD/YYYY, or DD-MM-YYYY.');
    process.exit(1);
  }
  
  if (startDate === endDate) {
    // Single date sync
    console.log(`\n[Sync] Syncing payout comparison for date: ${startDate}`);
    try {
      const result = await syncPayoutComparisonForDate(startDate);
      console.log('\n[Sync] ✓ Sync completed successfully!');
      console.log('[Sync] Result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('\n[Sync] ✗ Sync failed:', error.message);
      process.exit(1);
    }
  } else {
    // Date range sync
    console.log(`\n[Sync] Syncing payout comparison for date range: ${startDate} to ${endDate}`);
    try {
      const result = await syncPayoutComparisonForDateRange(startDate, endDate);
      console.log('\n[Sync] ✓ Sync completed!');
      console.log(`[Sync] Total: ${result.total}, Successful: ${result.successful}, Failed: ${result.failed}`);
      
      if (result.failed > 0) {
        console.log('\n[Sync] Failed dates:');
        result.results
          .filter(r => r.status === 'error')
          .forEach(r => console.log(`  - ${r.date}: ${r.error}`));
      }
    } catch (error) {
      console.error('\n[Sync] ✗ Sync failed:', error.message);
      process.exit(1);
    }
  }
  
  // Close database pool
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
    database: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
    user: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
    password: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  });
  
  await pool.end();
  process.exit(0);
};

main().catch((error) => {
  console.error('[Sync] Fatal error:', error);
  process.exit(1);
});

