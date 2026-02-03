#!/usr/bin/env node

/**
 * Ringba Revenue Report - Fetch from Ringba API
 * Fetches all Ringba calls directly from API and calculates total revenue by category (STATIC and API)
 * Includes day-by-day breakdown
 * Automatically saves output to a text file
 * 
 * Usage:
 *   node ringba-api-revenue-report.js 01-01-2026 to 31-01-2026
 *   node ringba-api-revenue-report.js 01-01-2026 31-01-2026
 */

import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getCallsByTargetId, TARGET_IDS, getCategoryFromTargetId } from './src/http/ringba-target-calls.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Parse date range from command line arguments
function parseDateRange(args) {
    if (args.length < 2) {
        return null;
    }

    let startDateStr, endDateStr;

    // Support both "DD-MM-YYYY to DD-MM-YYYY" and "DD-MM-YYYY DD-MM-YYYY"
    if (args.includes('to')) {
        const toIndex = args.indexOf('to');
        startDateStr = args[toIndex - 1];
        endDateStr = args[toIndex + 1];
    } else {
        startDateStr = args[0];
        endDateStr = args[1];
    }

    if (!startDateStr || !endDateStr) {
        return null;
    }

    // Parse DD-MM-YYYY format
    const parseDate = (dateStr) => {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        const [day, month, year] = parts;
        return new Date(year, month - 1, day);
    };

    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);

    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return null;
    }

    // Set time to start and end of day
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
}

// Format date for display
function formatDate(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Get date string from call date (format: MM/DD/YYYY HH:MM:SS AM/PM)
function getDateFromCallDate(callDateStr) {
    const date = new Date(callDateStr);
    return formatDate(date);
}

// Main function
async function generateRevenueReport() {
    const args = process.argv.slice(2);

    const dateRange = parseDateRange(args);

    if (!dateRange) {
        console.error('Error: Invalid date range format');
        console.error('');
        console.error('Usage:');
        console.error('  node ringba-api-revenue-report.js 01-01-2026 to 31-01-2026');
        console.error('  node ringba-api-revenue-report.js 01-01-2026 31-01-2026');
        console.error('');
        console.error('Date format: DD-MM-YYYY');
        process.exit(1);
    }

    const { startDate, endDate } = dateRange;

    const accountId = process.env.RINGBA_ACCOUNT_ID;
    const apiToken = process.env.RINGBA_API_TOKEN;

    if (!accountId || !apiToken) {
        console.error('Error: RINGBA_ACCOUNT_ID and RINGBA_API_TOKEN must be set in .env file');
        process.exit(1);
    }

    // Create output file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const startDateStr = formatDate(startDate).replace(/\//g, '-');
    const endDateStr = formatDate(endDate).replace(/\//g, '-');
    const outputFile = `ringba-revenue-report_${startDateStr}_to_${endDateStr}_${timestamp}.txt`;
    const outputStream = fs.createWriteStream(outputFile);

    // Helper function to log to both console and file
    const log = (message) => {
        console.log(message);
        outputStream.write(message + '\n');
    };

    log('======================================================================');
    log('Ringba Revenue Report - Appliance Repair (from Ringba API)');
    log('======================================================================');
    log(`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`);
    log('======================================================================\n');

    const categoryResults = {};
    let totalCalls = 0;
    let totalRevenue = 0;
    let totalPayout = 0;

    // Fetch calls for each target ID
    for (const [targetId, targetName] of Object.entries(TARGET_IDS)) {
        const category = getCategoryFromTargetId(targetId);

        log(`Fetching calls for: ${targetName} (${category})...`);

        try {
            const result = await getCallsByTargetId(accountId, apiToken)(targetId, {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                pageSize: 1000
            })();

            if (result._tag === 'Left') {
                console.error(`  ❌ Error fetching calls: ${result.left.message}`);
                continue;
            }

            const { calls, summary } = result.right;

            log(`  ✅ Fetched ${calls.length} calls`);
            log(`  Revenue: $${summary.totalRevenue.toFixed(2)}`);
            log(`  Payout: $${summary.totalPayout.toFixed(2)}`);
            log('');

            // Aggregate by category
            if (!categoryResults[category]) {
                categoryResults[category] = {
                    calls: [],
                    totalCalls: 0,
                    totalRevenue: 0,
                    totalPayout: 0,
                    targets: [],
                    dailyStats: {}
                };
            }

            categoryResults[category].calls.push(...calls);
            categoryResults[category].totalCalls += calls.length;
            categoryResults[category].totalRevenue += summary.totalRevenue;
            categoryResults[category].totalPayout += summary.totalPayout;
            categoryResults[category].targets.push({
                targetId,
                targetName,
                calls: calls.length,
                revenue: summary.totalRevenue,
                payout: summary.totalPayout
            });

            // Group calls by date
            calls.forEach(call => {
                const callDate = getDateFromCallDate(call.callDate);
                if (!categoryResults[category].dailyStats[callDate]) {
                    categoryResults[category].dailyStats[callDate] = {
                        calls: 0,
                        revenue: 0,
                        payout: 0
                    };
                }
                categoryResults[category].dailyStats[callDate].calls++;
                categoryResults[category].dailyStats[callDate].revenue += parseFloat(call.revenue || 0);
                categoryResults[category].dailyStats[callDate].payout += parseFloat(call.payout || 0);
            });

            totalCalls += calls.length;
            totalRevenue += summary.totalRevenue;
            totalPayout += summary.totalPayout;

        } catch (error) {
            console.error(`  ❌ Error: ${error.message}`);
        }
    }

    // Display day-by-day breakdown
    log('======================================================================');
    log('DAY-BY-DAY BREAKDOWN');
    log('======================================================================\n');

    for (const [category, data] of Object.entries(categoryResults)) {
        log(`Category: ${category}`);
        log('-'.repeat(70));
        log('Date       | Calls | Revenue    | Payout     | Avg Revenue/Call');
        log('-'.repeat(70));

        // Sort dates
        const sortedDates = Object.keys(data.dailyStats).sort((a, b) => {
            const [dayA, monthA, yearA] = a.split('/');
            const [dayB, monthB, yearB] = b.split('/');
            return new Date(yearA, monthA - 1, dayA) - new Date(yearB, monthB - 1, dayB);
        });

        for (const date of sortedDates) {
            const stats = data.dailyStats[date];
            const avgRev = stats.calls > 0 ? stats.revenue / stats.calls : 0;
            log(`${date} | ${String(stats.calls).padEnd(5)} | $${stats.revenue.toFixed(2).padEnd(9)} | $${stats.payout.toFixed(2).padEnd(9)} | $${avgRev.toFixed(2)}`);
        }

        log('-'.repeat(70));
        log(`TOTAL      | ${String(data.totalCalls).padEnd(5)} | $${data.totalRevenue.toFixed(2).padEnd(9)} | $${data.totalPayout.toFixed(2).padEnd(9)} | $${(data.totalRevenue / data.totalCalls).toFixed(2)}`);
        log('');
    }

    // Display results by category
    log('======================================================================');
    log('SUMMARY BY CATEGORY');
    log('======================================================================\n');

    for (const [category, data] of Object.entries(categoryResults)) {
        log(`Category: ${category}`);
        log(`  Total Calls: ${data.totalCalls.toLocaleString()}`);
        log(`  Total Revenue: $${data.totalRevenue.toFixed(2).toLocaleString()}`);
        log(`  Total Payout: $${data.totalPayout.toFixed(2).toLocaleString()}`);
        log(`  Average Revenue per Call: $${(data.totalRevenue / data.totalCalls).toFixed(2)}`);
        log(`  Average Payout per Call: $${(data.totalPayout / data.totalCalls).toFixed(2)}`);

        if (data.targets.length > 1) {
            log(`  Targets:`);
            data.targets.forEach(target => {
                log(`    - ${target.targetName}`);
                log(`      Calls: ${target.calls}, Revenue: $${target.revenue.toFixed(2)}, Payout: $${target.payout.toFixed(2)}`);
            });
        }
        log('');
    }

    // Display totals
    log('======================================================================');
    log('TOTALS (All Categories)');
    log('======================================================================');
    log(`Total Calls: ${totalCalls.toLocaleString()}`);
    log(`Total Revenue: $${totalRevenue.toFixed(2).toLocaleString()}`);
    log(`Total Payout: $${totalPayout.toFixed(2).toLocaleString()}`);
    log(`Average Revenue per Call: $${(totalRevenue / totalCalls).toFixed(2)}`);
    log(`Average Payout per Call: $${(totalPayout / totalCalls).toFixed(2)}`);
    log('======================================================================\n');

    // Additional statistics
    log('Additional Statistics:');
    log('======================================================================');

    for (const [category, data] of Object.entries(categoryResults)) {
        const paidCalls = data.calls.filter(call => call.payout > 0).length;
        const zeroCalls = data.calls.filter(call => call.payout === 0).length;
        const avgPaidPayout = paidCalls > 0
            ? data.calls.filter(call => call.payout > 0).reduce((sum, call) => sum + call.payout, 0) / paidCalls
            : 0;

        log(`${category}:`);
        log(`  Calls with Payout > $0: ${paidCalls}`);
        log(`  Calls with $0 Payout: ${zeroCalls}`);
        log(`  Average Payout (paid calls only): $${avgPaidPayout.toFixed(2)}`);
        log(`  Days with calls: ${Object.keys(data.dailyStats).length}`);
        log('');
    }

    log('======================================================================\n');
    log(`Report saved to: ${outputFile}`);

    // Close the file stream
    outputStream.end();
    console.log(`\n✅ Report saved to: ${outputFile}`);
}

generateRevenueReport().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
