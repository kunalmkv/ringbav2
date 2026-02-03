#!/usr/bin/env node

/**
 * eLocal Revenue Report - Fetch from eLocal API v2
 * Calculates total revenue from eLocal API for a configurable date range
 * Includes day-by-day breakdown by category
 * Automatically saves output to a text file
 * 
 * Usage:
 *   node elocal-revenue-report.js 01-01-2026 to 31-01-2026
 *   node elocal-revenue-report.js 01-01-2026 31-01-2026
 */

import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Configuration
const ELOCAL_API_KEY = process.env.ELOCAL_API_KEY;
const ELOCAL_BASE_URL = 'https://apis.elocal.com/affiliates/v2/campaign-results';

// Campaign UUIDs mapping to categories
const CAMPAIGNS = [
    {
        name: 'STATIC',
        uuid: 'dce224a6-f813-4cab-a8c6-972c5a1520ab'
    },
    {
        name: 'API',
        uuid: '4534924c-f52b-4124-981b-9d2670b2af3e'
    }
];

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

    // Parse DD-MM-YYYY format and convert to YYYY-MM-DD for eLocal API
    const parseDate = (dateStr) => {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        const [day, month, year] = parts;
        return `${year}-${month}-${day}`;
    };

    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);

    if (!startDate || !endDate) {
        return null;
    }

    return { startDate, endDate };
}

// Format date for display (YYYY-MM-DD to DD/MM/YYYY)
function formatDate(dateStr) {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

// Get date from call start time (ISO format to DD/MM/YYYY)
function getDateFromCallTime(callStartTime) {
    const date = new Date(callStartTime);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Fetch calls from eLocal API for a specific campaign
async function fetchCampaignCalls(uuid, startDate, endDate) {
    const url = new URL(`${ELOCAL_BASE_URL}/${uuid}/calls.json`);

    // Add query parameters
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    url.searchParams.append('sortBy', 'callStartTime');
    url.searchParams.append('sortOrder', 'desc');

    const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
            'x-api-key': ELOCAL_API_KEY,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`eLocal API error ${response.status}: ${errorText}`);
    }

    return await response.json();
}

// Calculate revenue from call data
function calculateRevenue(calls) {
    let totalRevenue = 0;
    let totalPayout = 0;
    let callCount = 0;
    let paidCalls = 0;
    let zeroCalls = 0;

    calls.forEach(call => {
        callCount++;
        // eLocal API uses 'final_payout' and 'gross_call_value' fields
        const payout = parseFloat(call.final_payout || call.payout || 0);
        const revenue = parseFloat(call.gross_call_value || call.revenue || call.final_payout || 0);

        totalPayout += payout;
        totalRevenue += revenue;

        if (payout > 0) {
            paidCalls++;
        } else {
            zeroCalls++;
        }
    });

    return {
        totalRevenue,
        totalPayout,
        callCount,
        paidCalls,
        zeroCalls,
        avgRevenue: callCount > 0 ? totalRevenue / callCount : 0,
        avgPayout: callCount > 0 ? totalPayout / callCount : 0,
        avgPaidPayout: paidCalls > 0 ? totalPayout / paidCalls : 0
    };
}

// Main function
async function generateRevenueReport() {
    const args = process.argv.slice(2);

    const dateRange = parseDateRange(args);

    if (!dateRange) {
        console.error('Error: Invalid date range format');
        console.error('');
        console.error('Usage:');
        console.error('  node elocal-revenue-report.js 01-01-2026 to 31-01-2026');
        console.error('  node elocal-revenue-report.js 01-01-2026 31-01-2026');
        console.error('');
        console.error('Date format: DD-MM-YYYY');
        process.exit(1);
    }

    const { startDate, endDate } = dateRange;

    if (!ELOCAL_API_KEY) {
        console.error('Error: ELOCAL_API_KEY must be set in .env file');
        process.exit(1);
    }

    // Create output file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const startDateStr = formatDate(startDate).replace(/\//g, '-');
    const endDateStr = formatDate(endDate).replace(/\//g, '-');
    const outputFile = `elocal-revenue-report_${startDateStr}_to_${endDateStr}_${timestamp}.txt`;
    const outputStream = fs.createWriteStream(outputFile);

    // Helper function to log to both console and file
    const log = (message) => {
        console.log(message);
        outputStream.write(message + '\n');
    };

    log('======================================================================');
    log('eLocal Revenue Report (from eLocal API v2)');
    log('======================================================================');
    log(`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`);
    log('======================================================================\n');

    const categoryResults = {};
    let totalRevenue = 0;
    let totalPayout = 0;
    let totalCalls = 0;

    // Fetch calls for each campaign
    for (const campaign of CAMPAIGNS) {
        log(`Fetching Category: ${campaign.name}`);
        log(`  Campaign UUID: ${campaign.uuid}`);

        try {
            const data = await fetchCampaignCalls(campaign.uuid, startDate, endDate);

            // Extract calls array from response
            const calls = Array.isArray(data) ? data : (data.calls || data.results || []);

            log(`  ✅ Fetched ${calls.length} calls`);

            // Calculate revenue
            const stats = calculateRevenue(calls);

            log(`  Total Revenue: $${stats.totalRevenue.toFixed(2)}`);
            log(`  Total Payout: $${stats.totalPayout.toFixed(2)}`);
            log('');

            // Group calls by date
            const dailyStats = {};
            calls.forEach(call => {
                const callDate = getDateFromCallTime(call.call_date);
                if (!dailyStats[callDate]) {
                    dailyStats[callDate] = {
                        calls: 0,
                        revenue: 0,
                        payout: 0
                    };
                }
                dailyStats[callDate].calls++;
                dailyStats[callDate].revenue += parseFloat(call.gross_call_value || 0);
                dailyStats[callDate].payout += parseFloat(call.final_payout || 0);
            });

            categoryResults[campaign.name] = {
                ...stats,
                calls,
                dailyStats
            };

            totalRevenue += stats.totalRevenue;
            totalPayout += stats.totalPayout;
            totalCalls += stats.callCount;

        } catch (error) {
            console.error(`  ❌ Error: ${error.message}`);
            log(`  ❌ Error: ${error.message}`);
            log('');
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
        log(`TOTAL      | ${String(data.callCount).padEnd(5)} | $${data.totalRevenue.toFixed(2).padEnd(9)} | $${data.totalPayout.toFixed(2).padEnd(9)} | $${data.avgRevenue.toFixed(2)}`);
        log('');
    }

    // Display summary by category
    log('======================================================================');
    log('SUMMARY BY CATEGORY');
    log('======================================================================\n');

    for (const [category, stats] of Object.entries(categoryResults)) {
        log(`Category: ${category}`);
        log(`  Total Calls: ${stats.callCount.toLocaleString()}`);
        log(`  Total Revenue: $${stats.totalRevenue.toFixed(2).toLocaleString()}`);
        log(`  Total Payout: $${stats.totalPayout.toFixed(2).toLocaleString()}`);
        log(`  Average Revenue per Call: $${stats.avgRevenue.toFixed(2)}`);
        log(`  Average Payout per Call: $${stats.avgPayout.toFixed(2)}`);
        log(`  Paid Calls: ${stats.paidCalls} (${((stats.paidCalls / stats.callCount) * 100).toFixed(1)}%)`);
        log(`  Zero Payout Calls: ${stats.zeroCalls} (${((stats.zeroCalls / stats.callCount) * 100).toFixed(1)}%)`);
        log(`  Average Payout (paid calls only): $${stats.avgPaidPayout.toFixed(2)}`);
        log(`  Days with calls: ${Object.keys(stats.dailyStats).length}`);
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
    log(`Report saved to: ${outputFile}`);

    // Close the file stream
    outputStream.end();
    console.log(`\n✅ Report saved to: ${outputFile}`);
}

generateRevenueReport().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
