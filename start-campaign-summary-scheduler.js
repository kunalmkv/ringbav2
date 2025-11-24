#!/usr/bin/env node

/**
 * Ringba Campaign Summary Scheduler - Runs Campaign Summary Service Daily
 * 
 * This script starts a scheduler that runs the Ringba Campaign Summary service
 * multiple times daily at:
 * - 9:05 PM IST (21:05)
 * - 12:05 AM IST (00:05 - midnight)
 * - 3:05 AM IST (03:05)
 * - 6:05 AM IST (06:05)
 * 
 * The service fetches campaign summary data (RPC, total calls, revenue, payout, etc.)
 * from Ringba API and saves it to the ringba_campaign_summary table.
 * 
 * IMPORTANT: If the service runs after 12:00 AM IST, it fetches the previous day's data
 * (because Ringba uses EST/CST timezone which is behind IST).
 * 
 * Usage:
 *   node start-campaign-summary-scheduler.js
 *   npm run scheduler:campaign-summary
 * 
 * To stop the scheduler, press Ctrl+C
 */

import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { syncCampaignSummary } from './src/services/ringba-campaign-summary.js';
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
    dbHost: process.env.POSTGRES_HOST || process.env.DB_HOST,
    dbPort: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
    dbName: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
    dbUser: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
    dbPassword: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
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

/**
 * Get target date for campaign summary based on IST timezone
 * If it's after 12 AM IST (midnight) and before 12 PM IST (noon), fetch previous day
 * (because Ringba uses EST/CST which is behind IST)
 * If it's 12 PM IST (noon) or later, fetch current day
 * Returns date string in YYYY-MM-DD format
 */
const getCampaignSummaryDate = () => {
  // Get current time in IST timezone
  const now = new Date();
  const istTimeString = now.toLocaleString('en-US', { 
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse IST time to get hours
  const istParts = istTimeString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
  if (!istParts) {
    // Fallback: use current date
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = String(today.getUTCMonth() + 1).padStart(2, '0');
    const day = String(today.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  let hoursIST = parseInt(istParts[4], 10);
  const dayIST = parseInt(istParts[2], 10);
  const monthIST = parseInt(istParts[1], 10);
  const yearIST = parseInt(istParts[3], 10);
  
  // Handle edge case where hour is 24 (should be 0 for midnight)
  if (hoursIST === 24) {
    hoursIST = 0;
  }
  
  // Get the date to fetch based on IST time
  // If it's after 12 AM IST (00:00) and before 12 PM IST (12:00), fetch previous day
  // because EST/CST is behind IST by ~10-11 hours
  // If it's 12 PM IST (12:00) or later, fetch current day
  let targetDate;
  if (hoursIST >= 0 && hoursIST < 12) {
    // It's between 12:00 AM (midnight) and 11:59 AM IST, fetch previous day
    // (because in EST/CST it's still the previous day)
    targetDate = new Date(yearIST, monthIST - 1, dayIST);
    targetDate.setDate(targetDate.getDate() - 1);
  } else {
    // It's 12:00 PM (noon) or later IST, fetch current day
    targetDate = new Date(yearIST, monthIST - 1, dayIST);
  }
  
  // Format as YYYY-MM-DD
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Job execution wrapper with error handling
const executeCampaignSummary = async (config, scheduleName) => {
  const startTime = Date.now();
  const istTime = getISTTime();
  
  console.log('');
  console.log('='.repeat(70));
  console.log(`[${istTime}] Starting: ${scheduleName}`);
  console.log('='.repeat(70));
  
  try {
    // Get target date based on IST timezone logic
    const targetDateStr = getCampaignSummaryDate();
    const istTime = getISTTime();
    console.log(`[INFO] Current IST Time: ${istTime}`);
    console.log(`[INFO] Target Date: ${targetDateStr} (Ringba EST/CST timezone)`);
    console.log(`[INFO] Note: If time is after 12:00 AM IST, fetching previous day's data`);
    console.log('');
    
    // Execute the campaign summary sync service
    // Pass date as string (YYYY-MM-DD) to avoid timezone issues
    const result = await syncCampaignSummary(config, targetDateStr);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('');
    console.log('='.repeat(70));
    console.log(`[SUCCESS] ${scheduleName} completed in ${duration}s`);
    console.log('='.repeat(70));
    console.log(`  Date:                   ${result.date}`);
    console.log(`  Successful Syncs:       ${result.successful}`);
    console.log(`  Failed Syncs:           ${result.failed}`);
    if (result.results && result.results.length > 0) {
      console.log(`  Total Campaigns:        ${result.results.length}`);
      result.results.forEach(r => {
        if (r.targetId === 'COMBINED') {
          console.log(`    - ${r.targetName}: ${r.summary.totalCalls} calls, RPC: $${r.summary.rpc}, Revenue: $${r.summary.revenue}`);
        } else {
          console.log(`    - ${r.targetName}: ${r.summary.totalCalls} calls, RPC: $${r.summary.rpc}`);
        }
      });
    }
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
class CampaignSummaryScheduler {
  constructor() {
    this.appConfig = buildConfig();
    this.tasks = new Map();
    this.jobStats = new Map();
    this.isRunning = false;
    this.logFile = null;
    this.loggingEnabled = false;
    
    // Schedule configuration - Multiple times daily: 9:05 PM, 12:05 AM, 3:05 AM, 6:05 AM IST
    this.schedules = [
      { name: 'Campaign Summary - 9:05 PM', time: '21:05', cron: '5 21 * * *' },
      { name: 'Campaign Summary - 12:05 AM', time: '00:05', cron: '5 0 * * *' },
      { name: 'Campaign Summary - 3:05 AM', time: '03:05', cron: '5 3 * * *' },
      { name: 'Campaign Summary - 6:05 AM', time: '06:05', cron: '5 6 * * *' }
    ];
  }
  
  // Initialize file logging
  async initializeLogging() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const logFilename = `campaign-summary-scheduler-${timestamp}.log`;
      this.logFile = await initFileLogger(logFilename, 'Campaign Summary Scheduler');
      
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
    console.log('Ringba Campaign Summary - Continuous Scheduler Service');
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
        
        const result = await executeCampaignSummary(
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
    console.log(`  Timezone Logic: If after 12:00 AM IST, fetches previous day (Ringba EST/CST)`);
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
  console.log('Ringba Campaign Summary Scheduler');
  console.log('='.repeat(70));
  console.log('This scheduler runs the Ringba Campaign Summary service');
  console.log('multiple times daily at:');
  console.log('  - 9:05 PM IST (21:05)');
  console.log('  - 12:05 AM IST (00:05 - midnight)');
  console.log('  - 3:05 AM IST (03:05)');
  console.log('  - 6:05 AM IST (06:05)');
  console.log('');
  console.log('The service fetches campaign summary data (RPC, total calls,');
  console.log('revenue, payout, etc.) from Ringba API and saves it to the');
  console.log('ringba_campaign_summary table.');
  console.log('');
  console.log('Timezone Logic: If the service runs after 12:00 AM IST,');
  console.log('it fetches the previous day\'s data (because Ringba uses');
  console.log('EST/CST timezone which is behind IST).');
  console.log('='.repeat(70));
  
  const scheduler = new CampaignSummaryScheduler();
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

export { CampaignSummaryScheduler };

