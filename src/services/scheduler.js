#!/usr/bin/env node

/**
 * Continuous Scheduler Service for eLocal Scraper
 * 
 * Reads schedule configuration from schedule-config.json
 * Runs services at specified times in IST timezone
 * 
 * Usage:
 *   node src/services/scheduler.js
 *   npm run scheduler
 */

import cron from 'node-cron';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import {
  scrapeHistoricalData,
  scrapeCurrentDayData,
  scrapeHistoricalDataAPI,
  scrapeCurrentDayDataAPI
} from './elocal.scrapper.js';
import { 
  getPast10DaysRange, 
  getCurrentDayRange,
  getCurrentDayRangeWithTimezone, 
  getDateRangeDescription 
} from '../utils/date-utils.js';
import {
  initFileLogger,
  setupConsoleLogging,
  closeLogger,
  getLogFile
} from '../utils/file-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

// Load environment variables
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

// Load schedule configuration
const loadScheduleConfig = () => {
  try {
    const configPath = join(PROJECT_ROOT, 'schedule-config.json');
    const configContent = readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error('[ERROR] Failed to load schedule-config.json:', error.message);
    process.exit(1);
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

// Convert time string (HH:MM) to cron expression
const timeToCron = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return `${minutes} ${hours} * * *`;
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
const executeJob = async (serviceName, serviceType, category, config) => {
  const startTime = Date.now();
  const istTime = getISTTime();
  
  console.log('');
  console.log('='.repeat(70));
  console.log(`[${istTime}] Starting: ${serviceName}`);
  console.log(`[INFO] Type: ${serviceType}, Category: ${category}`);
  console.log('='.repeat(70));
  
  try {
    let result;
    let dateRange;
    
    if (serviceType === 'historical') {
      dateRange = getPast10DaysRange();
      console.log(`[INFO] Date Range: ${getDateRangeDescription(dateRange)}`);
      
      if (category === 'STATIC') {
        result = await scrapeHistoricalData(config);
      } else if (category === 'API') {
        result = await scrapeHistoricalDataAPI(config);
      }
    } else if (serviceType === 'current') {
      // Use timezone-aware date range for current day service
      // If it's after 12:00 AM IST, fetch previous day (because CST is behind IST)
      dateRange = getCurrentDayRangeWithTimezone();
      const istTime = getISTTime();
      console.log(`[INFO] Current IST Time: ${istTime}`);
      console.log(`[INFO] Date Range: ${getDateRangeDescription(dateRange)}`);
      console.log(`[INFO] Note: Fetching data for ${dateRange.startDateFormatted} (CST timezone consideration)`);
      
      if (category === 'STATIC') {
        result = await scrapeCurrentDayData(config, dateRange);
      } else if (category === 'API') {
        result = await scrapeCurrentDayDataAPI(config, dateRange);
      }
    } else {
      throw new Error(`Unknown service type: ${serviceType}`);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('='.repeat(70));
    console.log(`[SUCCESS] ${serviceName} completed in ${duration}s`);
    console.log('='.repeat(70));
    console.log(`  Session ID:            ${result.sessionId}`);
    console.log(`  Date Range:            ${result.dateRange}`);
    console.log(`  Total Calls:           ${result.summary.totalCalls}`);
    console.log(`  Total Payout:          $${result.summary.totalPayout.toFixed(2)}`);
    console.log(`  Unique Callers:        ${result.summary.uniqueCallers}`);
    console.log(`  Adjustments Applied:   ${result.summary.adjustmentsApplied || 0}`);
    console.log(`  Calls Inserted:       ${result.databaseResults.callsInserted}`);
    console.log(`  Calls Updated:        ${result.databaseResults.callsUpdated}`);
    console.log('='.repeat(70));
    console.log('');
    
    return { success: true, result, duration };
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.error('');
    console.error('='.repeat(70));
    console.error(`[ERROR] ${serviceName} failed after ${duration}s`);
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
class ElocalScheduler {
  constructor() {
    this.config = loadScheduleConfig();
    this.appConfig = buildConfig();
    this.tasks = new Map();
    this.jobStats = new Map();
    this.isRunning = false;
    this.logFile = null;
    this.loggingEnabled = false;
  }
  
  // Initialize file logging
  async initializeLogging() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const logFilename = `elocal-scheduler-${timestamp}.log`;
      this.logFile = await initFileLogger(logFilename, 'eLocal Scheduler');
      
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
    console.log('eLocal Scraper - Continuous Scheduler Service');
    console.log('='.repeat(70));
    console.log(`Timezone: ${this.config.timezone}`);
    console.log(`Total Services: ${this.config.services.length}`);
    console.log(`Enabled Services: ${this.config.services.filter(s => s.enabled).length}`);
    console.log('='.repeat(70));
    console.log('');
    
    // Initialize file logging
    await this.initializeLogging();
    
    // Validate required config
    const requiredVars = [
      { env: 'POSTGRES_HOST', alt: 'DB_HOST' },
      { env: 'POSTGRES_DB_NAME', alt: 'DB_NAME' },
      { env: 'POSTGRES_USER_NAME', alt: 'DB_USER' },
      { env: 'POSTGRES_PASSWORD', alt: 'DB_PASSWORD' }
    ];
    
    const missingVars = requiredVars.filter(
      ({ env, alt }) => !process.env[env] && !process.env[alt]
    );
    
    if (missingVars.length > 0) {
      console.error('[ERROR] Missing required environment variables:');
      missingVars.forEach(varName => 
        console.error(`  - ${varName.env} (or ${varName.alt})`)
      );
      process.exit(1);
    }
    
    console.log(`[INFO] Database: ${this.appConfig.dbHost}:${this.appConfig.dbPort}/${this.appConfig.dbName}`);
    console.log('');
  }
  
  // Schedule a service
  scheduleService(serviceConfig) {
    if (!serviceConfig.enabled) {
      console.log(`[SKIP] ${serviceConfig.name} is disabled`);
      return;
    }
    
    const cronExpression = timeToCron(serviceConfig.schedule.time);
    const timezone = serviceConfig.schedule.timezone || this.config.timezone;
    
    // Initialize job stats
    this.jobStats.set(serviceConfig.name, {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRun: null,
      lastResult: null
    });
    
    // Create cron task
    const task = cron.schedule(
      cronExpression,
      async () => {
        const stats = this.jobStats.get(serviceConfig.name);
        stats.totalRuns++;
        stats.lastRun = new Date().toISOString();
        
        const result = await executeJob(
          serviceConfig.name,
          serviceConfig.type,
          serviceConfig.category,
          this.appConfig
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
        timezone: timezone
      }
    );
    
    this.tasks.set(serviceConfig.name, task);
    
    console.log(`[SCHEDULED] ${serviceConfig.name}`);
    console.log(`  Schedule: ${serviceConfig.schedule.description}`);
    console.log(`  Cron: ${cronExpression}`);
    console.log(`  Timezone: ${timezone}`);
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
    this.config.services.forEach(service => {
      this.scheduleService(service);
    });
    
    // Start all tasks
    this.tasks.forEach((task, name) => {
      task.start();
    });
    
    this.isRunning = true;
    
    console.log('='.repeat(70));
    console.log('[SUCCESS] Scheduler started successfully!');
    console.log('='.repeat(70));
    console.log(`[INFO] All ${this.tasks.size} services are scheduled and running`);
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
    console.log('Next scheduled runs:');
    console.log('-'.repeat(70));
    
    this.config.services
      .filter(s => s.enabled)
      .forEach(service => {
        const [hours, minutes] = service.schedule.time.split(':');
        const stats = this.jobStats.get(service.name);
        console.log(`  ${service.name.padEnd(35)} ${service.schedule.time} IST (${stats?.totalRuns || 0} runs)`);
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
  const scheduler = new ElocalScheduler();
  setupGracefulShutdown(scheduler);
  await scheduler.start();
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { ElocalScheduler };

