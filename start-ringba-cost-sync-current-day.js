#!/usr/bin/env node

/**
 * Ringba Cost Sync Current Day Scheduler - Runs Ringba Cost Sync Service Daily for Same Day
 * 
 * This script starts a scheduler that runs the Ringba Cost Sync service
 * multiple times daily at:
 * - 9:10 PM IST (21:10)
 * - 12:10 AM IST (00:10 - midnight)
 * - 3:10 AM IST (03:10)
 * - 6:10 AM IST (06:10)
 * 
 * The service syncs cost changes from eLocal database to Ringba dashboard
 * for the CURRENT DAY only (IST timezone-aware, CST data aware).
 * 
 * Date Range Logic:
 * - Uses IST timezone for date calculation (independent of server location)
 * - Before 12:00 PM IST: syncs PREVIOUS day (CST is still on previous day)
 * - After 12:00 PM IST: syncs CURRENT day (CST has caught up)
 * 
 * Examples:
 * - At 12:10 AM IST on Nov 11: Syncs Nov 10 (yesterday - CST is still Nov 10)
 * - At 3:10 AM IST on Nov 11: Syncs Nov 10 (yesterday - CST is still Nov 10)
 * - At 6:10 AM IST on Nov 11: Syncs Nov 10 (yesterday - CST is still Nov 10)
 * - At 9:10 PM IST on Nov 11: Syncs Nov 11 (today - CST is Nov 11)
 * 
 * Usage:
 *   node start-ringba-cost-sync-current-day.js
 *   npm run scheduler:ringba-cost-current-day
 * 
 * To stop the scheduler, press Ctrl+C
 */

import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { syncCostToRingba } from './src/services/ringba-cost-sync.js';
import { getDateRangeDescription } from './src/utils/date-utils.js';
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

// Format date for eLocal API (MM/DD/YYYY)
const formatDateForElocal = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
};

// Get current day range in IST (same day sync with CST timezone awareness)
// If it's after 12:00 AM IST (midnight), fetch previous day's data (because CST is behind IST)
// If it's 12:00 PM IST or later, fetch current day's data
// IMPORTANT: Uses direct date component manipulation to avoid timezone issues
const getCurrentDayRangeIST = () => {
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
    // Fallback: use current date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);
    return {
      startDate: today,
      endDate,
      startDateFormatted: formatDateForElocal(today),
      endDateFormatted: formatDateForElocal(today)
    };
  }
  
  // Extract IST components
  const monthIST = parseInt(istParts[1], 10);  // MM (1-12)
  const dayIST = parseInt(istParts[2], 10);     // DD
  const yearIST = parseInt(istParts[3], 10);    // YYYY
  let hoursIST = parseInt(istParts[4], 10);     // HH (0-23)
  
  // Handle edge case where hour is 24 (should be 0 for midnight)
  if (hoursIST === 24) {
    hoursIST = 0;
  }
  
  // Determine target date based on IST time
  // Logic: If it's between 12:00 AM (00:00) and 11:59 AM IST, fetch previous day (CST is still previous day)
  //        If it's 12:00 PM (12:00) or later IST, fetch current day (CST has caught up)
  // 
  // Examples:
  // - Nov 11, 12:10 AM IST → CST is still Nov 10 → sync Nov 10 (yesterday)
  // - Nov 11, 3:10 AM IST → CST is still Nov 10 → sync Nov 10 (yesterday)
  // - Nov 11, 6:10 AM IST → CST is still Nov 10 → sync Nov 10 (yesterday)
  // - Nov 11, 9:10 PM IST → CST is Nov 11 → sync Nov 11 (today)
  
  let targetYear, targetMonth, targetDay;
  
  if (hoursIST >= 0 && hoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST, fetch previous day
    // Work directly with date components to avoid timezone issues
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
    // It's 12:00 PM (noon) or later IST, fetch current day
    targetYear = yearIST;
    targetMonth = monthIST;
    targetDay = dayIST;
  }
  
  // Create Date objects using direct date component manipulation to avoid timezone issues
  const startDate = new Date(targetYear, targetMonth - 1, targetDay, 0, 0, 0, 0);
  const endDate = new Date(targetYear, targetMonth - 1, targetDay, 23, 59, 59, 999);
  
  return {
    startDate,
    endDate,
    startDateFormatted: formatDateForElocal(startDate),
    endDateFormatted: formatDateForElocal(endDate)
  };
};

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

// Job execution wrapper with error handling
const executeCostSync = async (config, scheduleName) => {
  const startTime = Date.now();
  const istTime = getISTTime();
  
  console.log('');
  console.log('='.repeat(70));
  console.log(`[${istTime}] Starting: ${scheduleName}`);
  console.log('='.repeat(70));
  
  try {
    // Get current day range (IST timezone-aware, same day sync)
    const dateRangeObj = getCurrentDayRangeIST();
    // Convert to format expected by syncCostToRingba (Date objects)
    const dateRange = {
      startDate: dateRangeObj.startDate, // Date object
      endDate: dateRangeObj.endDate, // Date object
      startDateFormatted: dateRangeObj.startDateFormatted, // MM/DD/YYYY
      endDateFormatted: dateRangeObj.endDateFormatted // MM/DD/YYYY
    };
    console.log(`[INFO] Date Range: ${dateRange.startDateFormatted} to ${dateRange.endDateFormatted} (IST-aware, CST data)`);
    console.log(`[INFO] Date Range: ${dateRange.startDate.toISOString()} to ${dateRange.endDate.toISOString()}`);
    console.log(`[INFO] Note: Before 12 PM IST syncs previous day, after 12 PM IST syncs current day`);
    console.log('');
    
    // Execute the sync service (no category filter - syncs all)
    const result = await syncCostToRingba(config, dateRange, null);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('='.repeat(70));
    console.log(`[SUCCESS] ${scheduleName} completed in ${duration}s`);
    console.log('='.repeat(70));
    console.log(`  Date Range:            ${result.dateRange.start} to ${result.dateRange.end}`);
    console.log(`  Category:               ${result.category}`);
    console.log(`  eLocal Calls:           ${result.elocalCalls}`);
    console.log(`  Ringba Calls:           ${result.ringbaCalls}`);
    console.log(`  Changes Detected:       ${result.updates}`);
    console.log(`  Successfully Updated:   ${result.updated}`);
    console.log(`  Failed:                 ${result.failed}`);
    console.log(`  Unmatched:              ${result.unmatched}`);
    console.log('='.repeat(70));
    console.log('');
    
    return { success: true, result, duration };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.error('');
    console.error('='.repeat(70));
    console.error(`[ERROR] ${scheduleName} failed after ${duration}s`);
    console.error('='.repeat(70));
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    console.error('='.repeat(70));
    console.error('');
    
    return { success: false, error: error.message, duration };
  }
};

// Main scheduler class
class RingbaCostCurrentDayScheduler {
  constructor() {
    this.appConfig = buildConfig();
    this.tasks = new Map();
    this.jobStats = new Map();
    this.isRunning = false;
    this.logFile = null;
    this.loggingEnabled = false;
    
    // Schedule configuration - Current Day Sync
    this.schedules = [
      { name: 'Ringba Cost Sync Current Day - 9:10 PM', time: '21:10', cron: '10 21 * * *' },
      { name: 'Ringba Cost Sync Current Day - 12:10 AM', time: '00:10', cron: '10 0 * * *' },
      { name: 'Ringba Cost Sync Current Day - 3:10 AM', time: '03:10', cron: '10 3 * * *' },
      { name: 'Ringba Cost Sync Current Day - 6:10 AM', time: '06:10', cron: '10 6 * * *' }
    ];
  }
  
  // Initialize file logging
  async initializeLogging() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const logFilename = `ringba-cost-sync-current-day-${timestamp}.log`;
      this.logFile = await initFileLogger(logFilename, 'Ringba Cost Sync Current Day Scheduler');
      
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
    console.log('Ringba Cost Sync Current Day - Continuous Scheduler Service');
    console.log('='.repeat(70));
    console.log(`Timezone: Asia/Kolkata (IST)`);
    console.log(`Total Schedules: ${this.schedules.length}`);
    console.log(`Sync Type: Current Day (IST-aware, CST data aware)`);
    console.log(`Date Logic: Before 12 PM IST = Previous Day, After 12 PM IST = Current Day`);
    console.log('='.repeat(70));
    console.log('');
    
    // Initialize file logging
    await this.initializeLogging();
    
    // Validate required config
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
    );
    
    if (missingVars.length > 0) {
      console.error('[ERROR] Missing required environment variables:');
      missingVars.forEach(({ env, alt }) => 
        console.error(`  - ${env}${alt ? ` (or ${alt})` : ''}`)
      );
      process.exit(1);
    }
    
    console.log(`[INFO] Database: ${this.appConfig.dbHost}:${this.appConfig.dbPort}/${this.appConfig.dbName}`);
    console.log(`[INFO] Ringba Account: ${this.appConfig.ringbaAccountId ? 'Configured' : 'Not configured'}`);
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
    
    // Create cron task
    const task = cron.schedule(
      scheduleConfig.cron,
      async () => {
        const stats = this.jobStats.get(scheduleConfig.name);
        stats.totalRuns++;
        stats.lastRun = new Date().toISOString();
        
        const result = await executeCostSync(
          this.appConfig,
          scheduleConfig.name
        );
        
        stats.lastResult = result;
        if (result.success) {
          stats.successfulRuns++;
        } else {
          stats.failedRuns++;
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
  console.log('Ringba Cost Sync Current Day Scheduler');
  console.log('='.repeat(70));
  console.log('This scheduler runs the Ringba Cost Sync service');
  console.log('multiple times daily at:');
  console.log('  - 9:10 PM IST (21:10)');
  console.log('  - 12:10 AM IST (00:10 - midnight)');
  console.log('  - 3:10 AM IST (03:10)');
  console.log('  - 6:10 AM IST (06:10)');
  console.log('');
  console.log('The service syncs cost changes from eLocal database to Ringba');
  console.log('for the CURRENT DAY only (IST timezone-aware, CST data aware).');
  console.log('');
  console.log('Date Range Logic:');
  console.log('  - Before 12:00 PM IST: Syncs PREVIOUS day (CST is still previous day)');
  console.log('  - After 12:00 PM IST: Syncs CURRENT day (CST has caught up)');
  console.log('='.repeat(70));
  
  const scheduler = new RingbaCostCurrentDayScheduler();
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

export { RingbaCostCurrentDayScheduler };

