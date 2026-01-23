#!/usr/bin/env node

/**
 * Ringba Zero-Payout Fix Scheduler - Runs Daily to Fix Converted Zero-Payout Calls
 * 
 * This script starts the scheduler that runs the Ringba zero-payout fix service
 * daily to automatically fix calls with zero payout/revenue but marked as converted.
 * 
 * The service uses a two-step update process per Ringba support recommendation:
 *   Step 1: Set payout/revenue to $2.22 (non-zero value)
 *   Step 2: Set payout/revenue back to $0.00
 * This automatically clears the hasConverted status.
 * 
 * Usage:
 *   node start-ringba-zero-payout-scheduler.js
 *   npm run scheduler:ringba-zero-payout
 * 
 * The scheduler will:
 * 1. Run daily at 6:30 AM IST
 * 2. Process calls from the last 10 days
 * 3. Fix all converted zero-payout calls
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

// Verify Ringba zero-payout service is configured
const verifyZeroPayoutService = (config) => {
    const zeroPayoutServices = config.services.filter(
        s => s.type === 'ringba-zero-payout' && s.enabled
    );

    console.log('');
    console.log('='.repeat(70));
    console.log('Ringba Zero-Payout Fix Service Configuration Verification');
    console.log('='.repeat(70));

    if (zeroPayoutServices.length > 0) {
        console.log(`✅ Ringba Zero-Payout Fix Service: ENABLED`);
        zeroPayoutServices.forEach(service => {
            console.log(`   Name: ${service.name}`);
            console.log(`   Schedule: ${service.schedule.description}`);
            console.log(`   Time: ${service.schedule.time} ${service.schedule.timezone}`);
            console.log(`   Days Back: ${service.daysBack || 10}`);
        });
    } else {
        console.log(`❌ Ringba Zero-Payout Fix Service: NOT FOUND or DISABLED`);
    }

    console.log('='.repeat(70));
    console.log('');

    if (zeroPayoutServices.length === 0) {
        console.error('[ERROR] Ringba Zero-Payout Fix service must be enabled!');
        console.error('[ERROR] Please check schedule-config.json');
        process.exit(1);
    }

    return zeroPayoutServices[0];
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
    console.log('Ringba Zero-Payout Fix Scheduler');
    console.log('='.repeat(70));
    console.log('This scheduler runs the Ringba zero-payout fix service daily');
    console.log('to automatically fix calls with zero payout/revenue but marked');
    console.log('as converted.');
    console.log('');
    console.log('Two-Step Update Process:');
    console.log('  Step 1: Set payout/revenue to $2.22');
    console.log('  Step 2: Set payout/revenue back to $0.00');
    console.log('  Result: hasConverted status automatically cleared');
    console.log('='.repeat(70));

    // Load and verify configuration
    const config = loadScheduleConfig();
    const service = verifyZeroPayoutService(config);

    // Create and start scheduler
    const scheduler = new ElocalScheduler();

    // Override the config to only include Ringba zero-payout services
    scheduler.config = {
        ...config,
        services: config.services.filter(s => s.type === 'ringba-zero-payout' && s.enabled)
    };

    console.log(`[INFO] Filtered to ${scheduler.config.services.length} Ringba zero-payout service(s)`);
    console.log('');

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
            if (name.includes('Zero-Payout')) {
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
    console.log('Scheduled Service:');
    console.log(`  1. ${service.name} - ${service.schedule.description}`);
    console.log(`     Days Back: ${service.daysBack || 10} days`);
    console.log('');
    console.log('The scheduler is now running. Service will execute automatically.');
    console.log('All logs are being saved to the log file.');
    console.log('Press Ctrl+C to stop the scheduler.');
    console.log('='.repeat(70));
    console.log('');
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { main as startRingbaZeroPayoutScheduler };
