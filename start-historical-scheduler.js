#!/usr/bin/env node

/**
 * Historical Data Scheduler - Runs eLocal Historical Service Daily
 * 
 * This script starts the scheduler that runs the historical eLocal scraping service
 * for both API and STATIC categories every day at 11:58 PM IST.
 * 
 * The historical service scrapes data for the past 10 days (excluding today).
 * 
 * Usage:
 *   node start-historical-scheduler.js
 *   npm run scheduler
 * 
 * The scheduler will:
 * 1. Run Historical STATIC service at 11:58 PM IST daily
 * 2. Run Historical API service at 11:58 PM IST daily
 * 
 * Both services will scrape data for the past 10 days.
 * 
 * To stop the scheduler, press Ctrl+C
 */

import { ElocalScheduler } from './src/services/scheduler.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '.');

// Load and verify schedule configuration
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

// Verify historical services are configured
const verifyHistoricalServices = (config) => {
  const historicalServices = config.services.filter(
    s => s.type === 'historical' && s.enabled
  );
  
  const apiService = historicalServices.find(s => s.category === 'API');
  const staticService = historicalServices.find(s => s.category === 'STATIC');
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Historical Service Configuration Verification');
  console.log('='.repeat(70));
  
  if (apiService) {
    console.log(`✅ Historical API Service: ENABLED`);
    console.log(`   Schedule: ${apiService.schedule.description}`);
    console.log(`   Time: ${apiService.schedule.time} ${apiService.schedule.timezone}`);
  } else {
    console.log(`❌ Historical API Service: NOT FOUND or DISABLED`);
  }
  
  if (staticService) {
    console.log(`✅ Historical STATIC Service: ENABLED`);
    console.log(`   Schedule: ${staticService.schedule.description}`);
    console.log(`   Time: ${staticService.schedule.time} ${staticService.schedule.timezone}`);
  } else {
    console.log(`❌ Historical STATIC Service: NOT FOUND or DISABLED`);
  }
  
  console.log('='.repeat(70));
  console.log('');
  
  if (!apiService || !staticService) {
    console.error('[ERROR] Both Historical API and STATIC services must be enabled!');
    console.error('[ERROR] Please check schedule-config.json');
    process.exit(1);
  }
  
  // Verify they're scheduled for 11:58 PM IST
  const targetTime = '23:58';
  if (apiService.schedule.time !== targetTime || staticService.schedule.time !== targetTime) {
    console.warn('[WARN] Services are not scheduled for 11:58 PM IST');
    console.warn(`[WARN] API: ${apiService.schedule.time}, STATIC: ${staticService.schedule.time}`);
  }
  
  return { apiService, staticService };
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

// Main execution
const main = async () => {
  console.log('');
  console.log('='.repeat(70));
  console.log('eLocal Historical Data Scheduler');
  console.log('='.repeat(70));
  console.log('This scheduler runs the historical eLocal scraping service');
  console.log('for both API and STATIC categories every day at 11:58 PM IST.');
  console.log('');
  console.log('The historical service scrapes data for the past 10 days.');
  console.log('='.repeat(70));
  
  // Load and verify configuration
  const config = loadScheduleConfig();
  const { apiService, staticService } = verifyHistoricalServices(config);
  
  // Create and start scheduler
  const scheduler = new ElocalScheduler();
  
  // Setup graceful shutdown
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
      if (name.includes('Historical')) {
        console.log(`${name}:`);
        console.log(`  Total Runs: ${stat.totalRuns}`);
        console.log(`  Successful: ${stat.successfulRuns}`);
        console.log(`  Failed: ${stat.failedRuns}`);
        console.log(`  Success Rate: ${stat.successRate}`);
        console.log(`  Last Run: ${stat.lastRun || 'Never'}`);
        console.log('');
      }
    });
    
    process.exit(0);
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Start the scheduler
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
  console.log(`  1. Historical STATIC - ${staticService.schedule.description}`);
  console.log(`  2. Historical API - ${apiService.schedule.description}`);
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

export { main as startHistoricalScheduler };

