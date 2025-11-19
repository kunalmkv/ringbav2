#!/usr/bin/env node

/**
 * Ringba Cost Sync Scheduler - Runs Ringba Cost Sync Service Daily
 * 
 * This script starts a scheduler that runs the Ringba Cost Sync service
 * multiple times daily at:
 * - 9:08 PM IST (21:08)
 * - 12:08 AM IST (00:08 - midnight)
 * - 3:08 AM IST (03:08)
 * - 6:08 AM IST (06:08)
 * 
 * The service syncs cost changes from eLocal database to Ringba dashboard
 * for the past 10 days.
 * 
 * Usage:
 *   node start-ringba-cost-scheduler.js
 *   npm run scheduler:ringba-cost
 * 
 * To stop the scheduler, press Ctrl+C
 */

import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { syncCostToRingba } from './src/services/ringba-cost-sync.js';
import { getPast10DaysRange, getDateRangeDescription } from './src/utils/date-utils.js';
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
    // Get date range (past 10 days)
    const dateRangeObj = getPast10DaysRange();
    // Convert to format expected by syncCostToRingba (Date objects)
    const dateRange = {
      startDate: dateRangeObj.startDate, // Date object
      endDate: dateRangeObj.endDate, // Date object
      startDateFormatted: dateRangeObj.startDateFormatted, // MM/DD/YYYY
      endDateFormatted: dateRangeObj.endDateFormatted // MM/DD/YYYY
    };
    console.log(`[INFO] Date Range: ${getDateRangeDescription(dateRangeObj)}`);
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
class RingbaCostScheduler {
  constructor() {
    this.appConfig = buildConfig();
    this.tasks = new Map();
    this.jobStats = new Map();
    this.isRunning = false;
    this.logFile = null;
    this.loggingEnabled = false;
    
    // Schedule configuration
    this.schedules = [
      { name: 'Ringba Cost Sync - 9:08 PM', time: '21:08', cron: '8 21 * * *' },
      { name: 'Ringba Cost Sync - 12:08 AM', time: '00:08', cron: '8 0 * * *' },
      { name: 'Ringba Cost Sync - 3:08 AM', time: '03:08', cron: '8 3 * * *' },
      { name: 'Ringba Cost Sync - 6:08 AM', time: '06:08', cron: '8 6 * * *' }
    ];
  }
  
  // Initialize file logging
  async initializeLogging() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const logFilename = `ringba-cost-scheduler-${timestamp}.log`;
      this.logFile = await initFileLogger(logFilename, 'Ringba Cost Sync Scheduler');
      
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
    console.log('Ringba Cost Sync - Continuous Scheduler Service');
    console.log('='.repeat(70));
    console.log(`Timezone: Asia/Kolkata (IST)`);
    console.log(`Total Schedules: ${this.schedules.length}`);
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
      console.log(`  ${schedule.name.padEnd(45)} ${schedule.time} IST (${stats?.totalRuns || 0} runs)`);
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
  console.log('Ringba Cost Sync Scheduler');
  console.log('='.repeat(70));
  console.log('This scheduler runs the Ringba Cost Sync service');
  console.log('multiple times daily at:');
  console.log('  - 9:08 PM IST (21:08)');
  console.log('  - 12:08 AM IST (00:08 - midnight)');
  console.log('  - 3:08 AM IST (03:08)');
  console.log('  - 6:08 AM IST (06:08)');
  console.log('');
  console.log('The service syncs cost changes from eLocal database to Ringba');
  console.log('for the past 10 days.');
  console.log('='.repeat(70));
  
  const scheduler = new RingbaCostScheduler();
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

export { RingbaCostScheduler };

