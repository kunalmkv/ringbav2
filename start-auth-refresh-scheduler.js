#!/usr/bin/env node

/**
 * Auth Refresh Scheduler - Runs Auth Refresh Service Every 3 Days
 * 
 * This script starts a scheduler that runs the Auth Refresh service
 * every 3 days at 8:00 PM IST (20:00).
 * 
 * The service refreshes eLocal authentication cookies using Puppeteer
 * and saves them to the PostgreSQL database.
 * 
 * Usage:
 *   node start-auth-refresh-scheduler.js
 *   npm run scheduler:auth-refresh
 * 
 * To stop the scheduler, press Ctrl+C
 */

import cron from 'node-cron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import * as TE from 'fp-ts/lib/TaskEither.js';
import { refreshAuthSession } from './src/services/auth-refresh.js';
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
    elocalBaseUrl: process.env.ELOCAL_BASE_URL || 'https://elocal.com',
    elocalUsername: process.env.ELOCAL_USERNAME,
    elocalPassword: process.env.ELOCAL_PASSWORD,
    dbHost: process.env.POSTGRES_HOST || process.env.DB_HOST,
    dbPort: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
    dbName: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
    dbUser: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
    dbPassword: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
    dbSsl: process.env.DB_SSL === 'true',
    timeoutMs: parseInt(process.env.AUTH_REFRESH_TIMEOUT_MS || '30000')
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

// Get last successful session creation time from database
const getLastSuccessfulSessionTime = async (config) => {
  try {
    const pg = await import('pg');
    const { Pool } = pg;
    
    const pool = new Pool({
      host: config.dbHost || process.env.DB_HOST,
      port: config.dbPort || process.env.DB_PORT || 5432,
      database: config.dbName || process.env.DB_NAME,
      user: config.dbUser || process.env.DB_USER,
      password: config.dbPassword || process.env.DB_PASSWORD,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : false
    });
    
    const client = await pool.connect();
    try {
      // Get the most recent working session (even if expired)
      const query = `
        SELECT created_at, expires_at
        FROM auth_sessions
        WHERE is_working = TRUE
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      const result = await client.query(query);
      
      if (result.rows.length === 0) {
        return null; // No previous session found
      }
      
      return {
        createdAt: new Date(result.rows[0].created_at),
        expiresAt: new Date(result.rows[0].expires_at)
      };
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('[Scheduler] Error getting last session from database:', error.message);
    return null;
  }
};

// Check if we should run the refresh
// Returns: { shouldRun: boolean, reason: string, daysSinceLastRun?: number }
const shouldRun = async (config) => {
  const lastSession = await getLastSuccessfulSessionTime(config);
  
  if (!lastSession) {
    return { shouldRun: true, reason: 'No previous session found - first run' };
  }
  
  const now = new Date();
  const daysSinceLastRun = Math.floor((now - lastSession.createdAt) / (1000 * 60 * 60 * 24));
  const hoursUntilExpiry = (lastSession.expiresAt - now) / (1000 * 60 * 60);
  
  // Check if session is expired or about to expire (within 6 hours)
  if (hoursUntilExpiry <= 6) {
    return { 
      shouldRun: true, 
      reason: `Session expires in ${hoursUntilExpiry.toFixed(1)} hours - refreshing proactively`,
      daysSinceLastRun,
      hoursUntilExpiry: hoursUntilExpiry.toFixed(1)
    };
  }
  
  // Check if 3 days have passed since last refresh
  if (daysSinceLastRun >= 3) {
    return { 
      shouldRun: true, 
      reason: `${daysSinceLastRun} days since last refresh - scheduled refresh`,
      daysSinceLastRun
    };
  }
  
  return { 
    shouldRun: false, 
    reason: `Only ${daysSinceLastRun} days since last refresh (need 3 days)`,
    daysSinceLastRun,
    hoursUntilExpiry: hoursUntilExpiry.toFixed(1)
  };
};

// Job execution wrapper with error handling
const executeAuthRefresh = async (config, scheduleName) => {
  const startTime = Date.now();
  const istTime = getISTTime();
  
  console.log('');
  console.log('='.repeat(70));
  console.log(`[${istTime}] Starting: ${scheduleName}`);
  console.log('='.repeat(70));
  
  // Check if we should run (every 3 days or if session is about to expire)
  const runCheck = await shouldRun(config);
  if (!runCheck.shouldRun) {
    console.log(`[INFO] Skipping run - ${runCheck.reason}`);
    if (runCheck.hoursUntilExpiry) {
      console.log(`[INFO] Current session expires in ${runCheck.hoursUntilExpiry} hours`);
    }
    if (runCheck.daysSinceLastRun !== undefined) {
      console.log(`[INFO] Next run will be in ${3 - runCheck.daysSinceLastRun} days`);
    }
    console.log('='.repeat(70));
    console.log('');
    return { success: true, skipped: true, reason: runCheck.reason };
  }
  
  console.log(`[INFO] Running refresh - ${runCheck.reason}`);
  if (runCheck.hoursUntilExpiry) {
    console.log(`[INFO] Current session expires in ${runCheck.hoursUntilExpiry} hours`);
  }
  console.log('');
  
  try {
    console.log('[INFO] Executing auth refresh service...');
    console.log('');
    
    // Execute the auth refresh service
    const resultEither = await refreshAuthSession(config)();
    
    if (resultEither._tag === 'Left') {
      const error = resultEither.left;
      throw new Error(error.message || String(error));
    }
    
    const result = resultEither.right;
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Get the new session info for next run calculation
    const newSession = await getLastSuccessfulSessionTime(config);
    const nextRunDate = newSession 
      ? new Date(newSession.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    
    console.log('');
    console.log('='.repeat(70));
    console.log(`[SUCCESS] ${scheduleName} completed in ${duration}s`);
    console.log('='.repeat(70));
    console.log(`  Session ID:            ${result.sessionId || 'N/A'}`);
    console.log(`  Expires At:            ${result.expiresAtISO || 'N/A'}`);
    console.log(`  Next Run:              In 3 days (${nextRunDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })})`);
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
class AuthRefreshScheduler {
  constructor() {
    this.appConfig = buildConfig();
    this.tasks = new Map();
    this.jobStats = new Map();
    this.isRunning = false;
    this.logFile = null;
    this.loggingEnabled = false;
    
    // Schedule configuration - Every day at 8:00 PM IST, but only runs if 3 days have passed
    this.schedules = [
      { 
        name: 'Auth Refresh - Every 3 Days at 8:00 PM', 
        time: '20:00', 
        cron: '0 20 * * *' // Daily at 8 PM IST, but logic checks for 3-day interval
      }
    ];
  }
  
  // Initialize file logging
  async initializeLogging() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const logFilename = `auth-refresh-scheduler-${timestamp}.log`;
      this.logFile = await initFileLogger(logFilename, 'Auth Refresh Scheduler');
      
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
    console.log('Auth Refresh - Continuous Scheduler Service');
    console.log('='.repeat(70));
    console.log(`Timezone: Asia/Kolkata (IST)`);
    console.log(`Schedule: Every 3 days at 8:00 PM IST`);
    console.log(`Total Schedules: ${this.schedules.length}`);
    console.log('='.repeat(70));
    console.log('');
    
    // Initialize file logging
    await this.initializeLogging();
    
    // Validate required config
    const requiredVars = [
      { env: 'ELOCAL_USERNAME' },
      { env: 'ELOCAL_PASSWORD' },
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
      missingVars.forEach(({ env, alt }) => 
        console.error(`  - ${env}${alt ? ` (or ${alt})` : ''}`)
      );
      process.exit(1);
    }
    
    console.log(`[INFO] eLocal Base URL: ${this.appConfig.elocalBaseUrl}`);
    console.log(`[INFO] Database: ${this.appConfig.dbHost}:${this.appConfig.dbPort}/${this.appConfig.dbName}`);
    console.log(`[INFO] Username: ${this.appConfig.elocalUsername ? '***' : 'Not set'}`);
    console.log('');
  }
  
  // Schedule a service
  scheduleService(scheduleConfig) {
    // Initialize job stats
    this.jobStats.set(scheduleConfig.name, {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      skippedRuns: 0,
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
        
        const result = await executeAuthRefresh(
          this.appConfig,
          scheduleConfig.name
        );
        
        stats.lastResult = result;
        if (result.success) {
          if (result.skipped) {
            stats.skippedRuns++;
          } else {
            stats.successfulRuns++;
          }
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
    console.log(`  Schedule: Daily at ${scheduleConfig.time} IST (runs every 3 days)`);
    console.log(`  Cron: ${scheduleConfig.cron}`);
    console.log(`  Timezone: Asia/Kolkata`);
    console.log(`  Logic: Checks if 3 days have passed since last successful run`);
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
    await this.displayNextRuns();
  }
  
  // Display next run times for all services
  async displayNextRuns() {
    console.log('Scheduled runs:');
    console.log('-'.repeat(70));
    
    for (const schedule of this.schedules) {
      const stats = this.jobStats.get(schedule.name);
      const lastSession = await getLastSuccessfulSessionTime(this.appConfig);
      const nextRunInfo = lastSession 
        ? `Next run: ${new Date(lastSession.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })}`
        : 'Next run: Will execute on first scheduled time';
      console.log(`  ${schedule.name.padEnd(45)} ${schedule.time} IST`);
      console.log(`    ${nextRunInfo}`);
      if (lastSession) {
        const hoursUntilExpiry = (lastSession.expiresAt - new Date()) / (1000 * 60 * 60);
        console.log(`    Current session expires in: ${hoursUntilExpiry.toFixed(1)} hours`);
      }
      console.log(`    Stats: ${stats?.totalRuns || 0} checks, ${stats?.successfulRuns || 0} successful, ${stats?.skippedRuns || 0} skipped, ${stats?.failedRuns || 0} failed`);
    }
    
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
          : '0%',
        skipRate: jobStats.totalRuns > 0
          ? ((jobStats.skippedRuns / jobStats.totalRuns) * 100).toFixed(2) + '%'
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
      console.log(`  Total Checks: ${stat.totalRuns}`);
      console.log(`  Successful: ${stat.successfulRuns}`);
      console.log(`  Skipped: ${stat.skippedRuns}`);
      console.log(`  Failed: ${stat.failedRuns}`);
      console.log(`  Success Rate: ${stat.successRate}`);
      console.log(`  Skip Rate: ${stat.skipRate}`);
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
  console.log('Auth Refresh Scheduler');
  console.log('='.repeat(70));
  console.log('This scheduler runs the Auth Refresh service');
  console.log('every 3 days at 8:00 PM IST (20:00).');
  console.log('');
  console.log('The service refreshes eLocal authentication cookies');
  console.log('using Puppeteer and saves them to PostgreSQL database.');
  console.log('');
  console.log('Note: The scheduler checks daily at 8 PM IST, but only');
  console.log('executes the refresh if 3 days have passed since the');
  console.log('last successful run.');
  console.log('='.repeat(70));
  
  const scheduler = new AuthRefreshScheduler();
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
    console.log(`  ${index + 1}. ${schedule.name} - Daily check at ${timeFormatted} IST`);
    console.log(`     (Executes every 3 days)`);
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

export { AuthRefreshScheduler };

