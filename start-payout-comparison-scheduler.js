#!/usr/bin/env node

/**
 * Payout Comparison Sync Scheduler - Runs Payout Comparison Sync Service Daily
 * 
 * This script starts a scheduler that runs the Payout Comparison Sync service
 * multiple times daily at:
 * - 9:30 PM IST (21:30)
 * - 12:30 AM IST (00:30 - midnight)
 * - 3:30 AM IST (03:30)
 * - 6:30 AM IST (06:30)
 * 
 * The service calculates and stores payout comparison data (Ringba vs eLocal)
 * in the payout_comparison_daily table for the past 15 days (IST timezone-aware).
 * 
 * IMPORTANT: The service syncs past 15 days excluding today, based on IST timezone.
 * If it runs before 12:00 PM IST, it considers "today" as the previous IST day.
 * If it runs after 12:00 PM IST, it considers "today" as the current IST day.
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
import { syncPayoutComparisonForDateRange } from './src/services/payout-comparison-sync.js';
import {
  getPast15DaysRangeForHistorical,
  getDateRangeDescription
} from './src/utils/date-utils.js';
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
 * Get date range for payout comparison sync (past 15 days, IST timezone-aware)
 * Uses getPast15DaysRangeForHistorical which:
 * - Gets past 15 days EXCLUDING the current date (ends at yesterday based on IST)
 * - Is timezone-independent (uses IST regardless of server location)
 * - Handles midnight edge case:
 *   - Before 12:00 PM IST: considers "today" as the previous IST day
 *   - After 12:00 PM IST: considers "today" as the current IST day
 * 
 * Returns object with startDate and endDate in YYYY-MM-DD format
 */
const getPayoutComparisonDateRange = () => {
  // Get past 15 days range (IST-aware, excludes today)
  const dateRangeObj = getPast15DaysRangeForHistorical();
  
  // Convert Date objects to YYYY-MM-DD format
  const startDate = dateRangeObj.startDate.getUTCFullYear() + '-' +
    String(dateRangeObj.startDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(dateRangeObj.startDate.getUTCDate()).padStart(2, '0');
  
  const endDate = dateRangeObj.endDate.getUTCFullYear() + '-' +
    String(dateRangeObj.endDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(dateRangeObj.endDate.getUTCDate()).padStart(2, '0');
  
  // Debug logging
  console.log(`[PayoutComparisonScheduler] Date Range Calculation:`);
  console.log(`  - Date Range: ${getDateRangeDescription(dateRangeObj)}`);
  console.log(`  - Start Date: ${startDate} (YYYY-MM-DD)`);
  console.log(`  - End Date: ${endDate} (YYYY-MM-DD)`);
  
  return {
    startDate,
    endDate,
    dateRangeObj // Keep original for logging
  };
};

// Run the payout comparison sync service
const runPayoutComparisonSync = async () => {
  const istTime = getISTTime();
  const dateRange = getPayoutComparisonDateRange();
  
  console.log('');
  console.log('='.repeat(70));
  console.log(`[${istTime}] Starting: Payout Comparison Sync`);
  console.log('='.repeat(70));
  console.log(`Date Range: ${getDateRangeDescription(dateRange.dateRangeObj)}`);
  console.log(`Start Date: ${dateRange.startDate} | End Date: ${dateRange.endDate}`);
  console.log('');
  
  try {
    const startTime = Date.now();
    const result = await syncPayoutComparisonForDateRange(dateRange.startDate, dateRange.endDate);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('='.repeat(70));
    console.log(`[SUCCESS] Payout Comparison Sync completed in ${duration}s`);
    console.log('='.repeat(70));
    console.log(`Date Range: ${dateRange.startDate} to ${dateRange.endDate}`);
    console.log(`Total Dates Processed: ${result.total}`);
    console.log(`Successful: ${result.successful}`);
    console.log(`Failed: ${result.failed}`);
    
    // Calculate aggregate totals from all successful results
    let totalRingbaTotal = 0;
    let totalElocalTotal = 0;
    let totalAdjustments = 0;
    let totalCalls = 0;
    let totalRpc = 0;
    let totalGoogleAdsSpend = 0;
    let totalTelco = 0;
    let totalNet = 0;
    
    result.results.forEach(r => {
      if (r.status === 'success' && r.data) {
        totalRingbaTotal += r.data.ringbaTotal || 0;
        totalElocalTotal += r.data.elocalTotal || 0;
        totalAdjustments += r.data.adjustments || 0;
        totalCalls += r.data.totalCalls || 0;
        totalRpc += r.data.rpc || 0;
        totalGoogleAdsSpend += r.data.googleAdsSpend || 0;
        totalTelco += r.data.telco || 0;
        totalNet += r.data.net || 0;
      }
    });
    
    const avgNetProfit = totalElocalTotal > 0 ? ((totalNet / totalElocalTotal) * 100) : 0;
    
    console.log('');
    console.log('Aggregate Totals (across all dates):');
    console.log(`  Ringba Total: $${totalRingbaTotal.toFixed(2)}`);
    console.log(`  eLocal Total: $${totalElocalTotal.toFixed(2)}`);
    console.log(`  Adjustments: $${totalAdjustments.toFixed(2)}`);
    console.log(`  Total Calls: ${totalCalls}`);
    console.log(`  RPC: $${totalRpc.toFixed(2)}`);
    console.log(`  Google Ads Spend: $${totalGoogleAdsSpend.toFixed(2)}`);
    console.log(`  Telco: $${totalTelco.toFixed(2)}`);
    console.log(`  Net: $${totalNet.toFixed(2)}`);
    console.log(`  Net Profit: ${avgNetProfit.toFixed(2)}%`);
    console.log('='.repeat(70));
    console.log('');
    
    return result;
  } catch (error) {
    console.error('');
    console.error('='.repeat(70));
    console.error(`[ERROR] Payout Comparison Sync failed`);
    console.error('='.repeat(70));
    console.error(`Date Range: ${dateRange.startDate} to ${dateRange.endDate}`);
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

// Main scheduler class
class PayoutComparisonScheduler {
  constructor() {
    this.tasks = new Map();
    this.jobStats = new Map();
    this.isRunning = false;
    this.logFile = null;
    this.loggingEnabled = false;
    
    // Schedule configuration - Updated times as requested
    this.schedules = [
      { name: 'Payout Comparison Sync - 9:30 PM', time: '21:30', cron: '30 21 * * *' },
      { name: 'Payout Comparison Sync - 12:30 AM', time: '00:30', cron: '30 0 * * *' },
      { name: 'Payout Comparison Sync - 3:30 AM', time: '03:30', cron: '30 3 * * *' },
      { name: 'Payout Comparison Sync - 6:30 AM', time: '06:30', cron: '30 6 * * *' }
    ];
  }
  
  // Initialize file logging
  async initializeLogging() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const logFilename = `payout-comparison-scheduler-${timestamp}.log`;
      this.logFile = await initFileLogger(logFilename, 'Payout Comparison Sync Scheduler');
      
      if (this.logFile) {
        await setupConsoleLogging();
        this.loggingEnabled = true;
        console.log(`[INFO] Logging to file: ${this.logFile}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[ERROR] Failed to initialize file logging:', error.message);
      return false;
    }
  }

  // Initialize scheduler
  async initialize() {
console.log('');
console.log('='.repeat(70));
console.log('Payout Comparison Sync Scheduler');
console.log('='.repeat(70));
    console.log(`Timezone: Asia/Kolkata (IST)`);
    console.log(`Total Schedules: ${this.schedules.length}`);
console.log('='.repeat(70));
console.log('');

    // Initialize file logging
    await this.initializeLogging();
    
    console.log(`[INFO] Current IST Time: ${getISTTime()}`);
    console.log('');
  }
  
  // Schedule a service
  scheduleService(scheduleConfig) {
    // Initialize job stats
    this.jobStats.set(scheduleConfig.name, {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRun: null,
      lastResult: null
    });
    
    // Create cron task with IST timezone
    const task = cron.schedule(
      scheduleConfig.cron,
      async () => {
        const stats = this.jobStats.get(scheduleConfig.name);
        stats.totalRuns++;
        stats.lastRun = new Date().toISOString();
        
        try {
  await runPayoutComparisonSync();
          stats.successfulRuns++;
        } catch (error) {
          stats.failedRuns++;
          console.error(`[ERROR] ${scheduleConfig.name} failed:`, error.message);
        }
      },
      {
        scheduled: false,
        timezone: 'Asia/Kolkata'
      }
    );
    
    this.tasks.set(scheduleConfig.name, task);
    
    console.log(`[SCHEDULED] ${scheduleConfig.name}`);
    console.log(`  Schedule: Daily at ${scheduleConfig.time} IST`);
    console.log(`  Cron: ${scheduleConfig.cron}`);
    console.log(`  Timezone: Asia/Kolkata`);
    console.log('');
  }
  
  // Start all scheduled services
  async start() {
    if (this.isRunning) {
      console.log('[WARN] Scheduler is already running');
      return;
    }
    
    await this.initialize();
    
    // Schedule all services
    this.schedules.forEach(schedule => {
      this.scheduleService(schedule);
    });
    
    // Start all tasks
    this.tasks.forEach((task, name) => {
      task.start();
    });
    
    this.isRunning = true;
    
    console.log('='.repeat(70));
    console.log('[SUCCESS] Scheduler started successfully!');
    console.log('='.repeat(70));
    console.log(`[INFO] All ${this.tasks.size} schedules are active and running`);
    console.log(`[INFO] Current IST time: ${getISTTime()}`);
    if (this.logFile) {
      console.log(`[INFO] Log file: ${this.logFile}`);
    }
    console.log('');
    console.log('[INFO] Scheduler is running. Press Ctrl+C to stop.');
    console.log('');
    
    // Display next run times
    this.displayNextRuns();
  }
  
  // Display next run times for all services
  displayNextRuns() {
    console.log('Scheduled runs:');
    console.log('-'.repeat(70));
    
    this.schedules.forEach(schedule => {
      const stats = this.jobStats.get(schedule.name);
      console.log(`  ${schedule.name.padEnd(50)} ${schedule.time} IST (${stats?.totalRuns || 0} runs)`);
    });
    
    console.log('-'.repeat(70));
    console.log('');
  }
  
  // Stop all scheduled services
  async stop() {
    if (!this.isRunning) {
      console.log('[WARN] Scheduler is not running');
      return;
    }
    
    this.tasks.forEach((task, name) => {
      task.stop();
    });
    
    this.isRunning = false;
    console.log('[INFO] Scheduler stopped');
    
    // Close logger if enabled
    if (this.loggingEnabled) {
      const logPath = await closeLogger();
      if (logPath) {
        console.log(`[INFO] Log file saved to: ${logPath}`);
      }
    }
  }
  
  // Get statistics
  getStats() {
    const stats = {};
    this.jobStats.forEach((jobStats, name) => {
      stats[name] = {
        ...jobStats,
        successRate: jobStats.totalRuns > 0
          ? ((jobStats.successfulRuns / jobStats.totalRuns) * 100).toFixed(2) + '%'
          : '0%'
      };
    });
    return stats;
  }
}

// Handle graceful shutdown
const setupGracefulShutdown = (scheduler) => {
  const shutdown = async () => {
    console.log('');
    console.log('[INFO] Shutting down scheduler...');
    await scheduler.stop();
    
    // Display final statistics
    console.log('');
    console.log('='.repeat(70));
    console.log('Final Statistics:');
    console.log('='.repeat(70));
    const stats = scheduler.getStats();
    Object.entries(stats).forEach(([name, stat]) => {
      console.log(`${name}:`);
      console.log(`  Total Runs: ${stat.totalRuns}`);
      console.log(`  Successful: ${stat.successfulRuns}`);
      console.log(`  Failed: ${stat.failedRuns}`);
      console.log(`  Success Rate: ${stat.successRate}`);
      console.log(`  Last Run: ${stat.lastRun || 'Never'}`);
      console.log('');
    });
    
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

// Main execution
const main = async () => {
  console.log('');
  console.log('='.repeat(70));
  console.log('Payout Comparison Sync Scheduler');
  console.log('='.repeat(70));
  console.log('This scheduler runs the Payout Comparison Sync service');
  console.log('multiple times daily at:');
  console.log('  - 9:30 PM IST (21:30)');
  console.log('  - 12:30 AM IST (00:30 - midnight)');
  console.log('  - 3:30 AM IST (03:30)');
  console.log('  - 6:30 AM IST (06:30)');
  console.log('');
  console.log('The service calculates and stores payout comparison data');
  console.log('(Ringba vs eLocal) in the payout_comparison_daily table.');
  console.log('');
  console.log('Date Range: Past 15 days (IST timezone-aware, excludes today)');
  console.log('Timezone Logic: Before 12 PM IST → previous day as "today"');
  console.log('                After 12 PM IST → current day as "today"');
  console.log('='.repeat(70));
  
  const scheduler = new PayoutComparisonScheduler();
  setupGracefulShutdown(scheduler);
  await scheduler.start();
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Scheduler Status');
  console.log('='.repeat(70));
  console.log(`Current IST Time: ${getISTTime()}`);
  if (scheduler.logFile) {
    console.log(`Log File: ${scheduler.logFile}`);
  }
  console.log('');
  console.log('Scheduled Services:');
  scheduler.schedules.forEach((schedule, index) => {
    const timeDisplay = schedule.time.length === 5 ? schedule.time : schedule.time.padStart(5, '0');
    const hour = parseInt(timeDisplay.substring(0, 2), 10);
    const minute = timeDisplay.substring(3, 5);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    const timeFormatted = `${hour12}:${minute} ${ampm}`;
    console.log(`  ${index + 1}. ${schedule.name} - Daily at ${timeFormatted} IST`);
  });
  console.log('');
  console.log('The scheduler is now running. Services will execute automatically.');
  console.log('All logs are being saved to the log file.');
  console.log('Press Ctrl+C to stop the scheduler.');
  console.log('='.repeat(70));
  console.log('');
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { PayoutComparisonScheduler };
