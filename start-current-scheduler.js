#!/usr/bin/env node

/**
 * Current Day Data Scheduler - Runs eLocal Current Day Service Daily
 * 
 * This script starts the scheduler that runs the current day eLocal scraping service
 * for both API and STATIC categories multiple times daily.
 * 
 * The current day service scrapes data for today and yesterday.
 * 
 * Usage:
 *   node start-current-scheduler.js
 *   npm run scheduler:current
 * 
 * The scheduler will:
 * 1. Run Current STATIC service at scheduled times (9 PM, 12 PM, 3 AM, 6 AM IST)
 * 2. Run Current API service at scheduled times (9 PM, 12 PM, 3 AM, 6 AM IST)
 * 
 * Both services will scrape data for today and yesterday.
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

// Verify current services are configured
const verifyCurrentServices = (config) => {
  const currentServices = config.services.filter(
    s => s.type === 'current' && s.enabled
  );
  
  const apiServices = currentServices.filter(s => s.category === 'API');
  const staticServices = currentServices.filter(s => s.category === 'STATIC');
  
  console.log('');
  console.log('='.repeat(70));
  console.log('Current Day Service Configuration Verification');
  console.log('='.repeat(70));
  
  if (apiServices.length > 0) {
    console.log(`✅ Current API Services: ${apiServices.length} ENABLED`);
    apiServices.forEach(service => {
      console.log(`   - ${service.name}: ${service.schedule.description}`);
    });
  } else {
    console.log(`❌ Current API Services: NOT FOUND or DISABLED`);
  }
  
  if (staticServices.length > 0) {
    console.log(`✅ Current STATIC Services: ${staticServices.length} ENABLED`);
    staticServices.forEach(service => {
      console.log(`   - ${service.name}: ${service.schedule.description}`);
    });
  } else {
    console.log(`❌ Current STATIC Services: NOT FOUND or DISABLED`);
  }
  
  console.log('='.repeat(70));
  console.log('');
  
  if (apiServices.length === 0 || staticServices.length === 0) {
    console.error('[ERROR] Both Current API and STATIC services must be enabled!');
    console.error('[ERROR] Please check schedule-config.json');
    process.exit(1);
  }
  
  return { apiServices, staticServices };
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
  console.log('eLocal Current Day Data Scheduler');
  console.log('='.repeat(70));
  console.log('This scheduler runs the current day eLocal scraping service');
  console.log('for both API and STATIC categories multiple times daily.');
  console.log('');
  console.log('The current day service scrapes data for today and yesterday.');
  console.log('='.repeat(70));
  
  // Load and verify configuration
  const config = loadScheduleConfig();
  const { apiServices, staticServices } = verifyCurrentServices(config);
  
  // Create scheduler
  const scheduler = new ElocalScheduler();
  
  // Override the config to only include current services
  // This must be done before calling start() which calls initialize()
  scheduler.config = {
    ...config,
    services: config.services.filter(s => s.type === 'current' && s.enabled)
  };
  
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
      if (name.includes('Current')) {
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
  staticServices.forEach((service, index) => {
    console.log(`  ${index + 1}. ${service.name} - ${service.schedule.description}`);
  });
  apiServices.forEach((service, index) => {
    console.log(`  ${staticServices.length + index + 1}. ${service.name} - ${service.schedule.description}`);
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

export { main as startCurrentScheduler };

