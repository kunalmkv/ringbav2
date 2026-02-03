#!/usr/bin/env node

/**
 * eLocal vs Ringba Day-by-Day Comparison Report
 * Compares revenue data from eLocal API and Ringba API on a daily basis
 * 
 * Usage:
 *   node elocal-ringba-comparison.js 01-01-2026 to 31-01-2026
 *   node elocal-ringba-comparison.js 01-01-2026 31-01-2026
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getCallsByTargetId, TARGET_IDS, getCategoryFromTargetId } from './src/http/ringba-target-calls.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Configuration
const ELOCAL_API_KEY = process.env.ELOCAL_API_KEY;
const ELOCAL_BASE_URL = 'https://apis.elocal.com/affiliates/v2/campaign-results';
const RINGBA_ACCOUNT_ID = process.env.RINGBA_ACCOUNT_ID;
const RINGBA_API_TOKEN = process.env.RINGBA_API_TOKEN;

// Campaign UUIDs mapping to categories
const ELOCAL_CAMPAIGNS = {
    'STATIC': 'dce224a6-f813-4cab-a8c6-972c5a1520ab',
    'API': '4534924c-f52b-4124-981b-9d2670b2af3e'
};

// Parse date range from command line arguments
function parseDateRange(args) {
    if (args.length < 2) {
        return null;
    }

    let startDateStr, endDateStr;

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

// Format date for API (YYYY-MM-DD)
function formatDateForAPI(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Fetch calls from eLocal API for a specific campaign and date
async function fetchElocalCalls(uuid, date) {
    const url = new URL(`${ELOCAL_BASE_URL}/${uuid}/calls.json`);
    const startDateStr = formatDateForAPI(date);

    // eLocal API requires end_date to be extended by one day for inclusive fetch
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    const endDateStr = formatDateForAPI(endDate);

    url.searchParams.append('start_date', startDateStr);
    url.searchParams.append('end_date', endDateStr);
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

    const data = await response.json();
    return Array.isArray(data) ? data : (data.calls || data.results || []);
}

// Fetch calls from Ringba API for a specific target and date
async function fetchRingbaCalls(targetId, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const result = await getCallsByTargetId(RINGBA_ACCOUNT_ID, RINGBA_API_TOKEN)(targetId, {
        startDate: startOfDay.toISOString(),
        endDate: endOfDay.toISOString(),
        pageSize: 1000
    })();

    if (result._tag === 'Left') {
        throw new Error(result.left.message);
    }

    return result.right.calls;
}

// Calculate stats from eLocal calls
function calculateElocalStats(calls) {
    let revenue = 0;
    let payout = 0;

    calls.forEach(call => {
        revenue += parseFloat(call.gross_call_value || 0);
        payout += parseFloat(call.final_payout || 0);
    });

    return { calls: calls.length, revenue, payout };
}

// Calculate stats from Ringba calls
function calculateRingbaStats(calls) {
    let revenue = 0;
    let payout = 0;

    calls.forEach(call => {
        revenue += parseFloat(call.revenue || 0);
        payout += parseFloat(call.payout || 0);
    });

    return { calls: calls.length, revenue, payout };
}

// Generate all dates in range
function getDatesInRange(startDate, endDate) {
    const dates = [];
    const current = new Date(startDate);

    while (current <= endDate) {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

// Main function
async function generateComparisonReport() {
    const args = process.argv.slice(2);
    const dateRange = parseDateRange(args);

    if (!dateRange) {
        console.error('Error: Invalid date range format');
        console.error('');
        console.error('Usage:');
        console.error('  node elocal-ringba-comparison.js 01-01-2026 to 31-01-2026');
        console.error('  node elocal-ringba-comparison.js 01-01-2026 31-01-2026');
        console.error('');
        console.error('Date format: DD-MM-YYYY');
        process.exit(1);
    }

    const { startDate, endDate } = dateRange;

    if (!ELOCAL_API_KEY || !RINGBA_ACCOUNT_ID || !RINGBA_API_TOKEN) {
        console.error('Error: Required environment variables not set');
        process.exit(1);
    }

    console.log('======================================================================');
    console.log('eLocal vs Ringba Day-by-Day Comparison Report');
    console.log('======================================================================');
    console.log(`Date Range: ${formatDate(startDate)} to ${formatDate(endDate)}`);
    console.log('======================================================================\n');

    const dates = getDatesInRange(startDate, endDate);
    const dailyResults = [];

    const categoryTotals = {
        STATIC: { elocal: { calls: 0, revenue: 0, payout: 0 }, ringba: { calls: 0, revenue: 0, payout: 0 } },
        API: { elocal: { calls: 0, revenue: 0, payout: 0 }, ringba: { calls: 0, revenue: 0, payout: 0 } }
    };

    // Process each date
    for (const date of dates) {
        console.log(`Processing ${formatDate(date)}...`);

        const dayResult = {
            date: formatDate(date),
            STATIC: { elocal: null, ringba: null, diff: null },
            API: { elocal: null, ringba: null, diff: null }
        };

        // Process STATIC category
        try {
            console.log(`  Fetching STATIC from eLocal...`);
            const elocalCalls = await fetchElocalCalls(ELOCAL_CAMPAIGNS.STATIC, date);
            const elocalStats = calculateElocalStats(elocalCalls);
            dayResult.STATIC.elocal = elocalStats;

            categoryTotals.STATIC.elocal.calls += elocalStats.calls;
            categoryTotals.STATIC.elocal.revenue += elocalStats.revenue;
            categoryTotals.STATIC.elocal.payout += elocalStats.payout;

            console.log(`    eLocal: ${elocalStats.calls} calls, $${elocalStats.revenue.toFixed(2)} revenue`);
        } catch (error) {
            console.log(`    eLocal Error: ${error.message}`);
        }

        try {
            console.log(`  Fetching STATIC from Ringba...`);
            const ringbaTargetId = Object.keys(TARGET_IDS).find(id => getCategoryFromTargetId(id) === 'STATIC');
            const ringbaCalls = await fetchRingbaCalls(ringbaTargetId, date);
            const ringbaStats = calculateRingbaStats(ringbaCalls);
            dayResult.STATIC.ringba = ringbaStats;

            categoryTotals.STATIC.ringba.calls += ringbaStats.calls;
            categoryTotals.STATIC.ringba.revenue += ringbaStats.revenue;
            categoryTotals.STATIC.ringba.payout += ringbaStats.payout;

            console.log(`    Ringba: ${ringbaStats.calls} calls, $${ringbaStats.revenue.toFixed(2)} revenue`);

            if (dayResult.STATIC.elocal && dayResult.STATIC.ringba) {
                dayResult.STATIC.diff = {
                    calls: dayResult.STATIC.elocal.calls - dayResult.STATIC.ringba.calls,
                    revenue: dayResult.STATIC.elocal.revenue - dayResult.STATIC.ringba.revenue,
                    payout: dayResult.STATIC.elocal.payout - dayResult.STATIC.ringba.payout
                };
            }
        } catch (error) {
            console.log(`    Ringba Error: ${error.message}`);
        }

        // Process API category
        try {
            console.log(`  Fetching API from eLocal...`);
            const elocalCalls = await fetchElocalCalls(ELOCAL_CAMPAIGNS.API, date);
            const elocalStats = calculateElocalStats(elocalCalls);
            dayResult.API.elocal = elocalStats;

            categoryTotals.API.elocal.calls += elocalStats.calls;
            categoryTotals.API.elocal.revenue += elocalStats.revenue;
            categoryTotals.API.elocal.payout += elocalStats.payout;

            console.log(`    eLocal: ${elocalStats.calls} calls, $${elocalStats.revenue.toFixed(2)} revenue`);
        } catch (error) {
            console.log(`    eLocal Error: ${error.message}`);
        }

        try {
            console.log(`  Fetching API from Ringba...`);
            const ringbaTargetId = Object.keys(TARGET_IDS).find(id => getCategoryFromTargetId(id) === 'API');
            const ringbaCalls = await fetchRingbaCalls(ringbaTargetId, date);
            const ringbaStats = calculateRingbaStats(ringbaCalls);
            dayResult.API.ringba = ringbaStats;

            categoryTotals.API.ringba.calls += ringbaStats.calls;
            categoryTotals.API.ringba.revenue += ringbaStats.revenue;
            categoryTotals.API.ringba.payout += ringbaStats.payout;

            console.log(`    Ringba: ${ringbaStats.calls} calls, $${ringbaStats.revenue.toFixed(2)} revenue`);

            if (dayResult.API.elocal && dayResult.API.ringba) {
                dayResult.API.diff = {
                    calls: dayResult.API.elocal.calls - dayResult.API.ringba.calls,
                    revenue: dayResult.API.elocal.revenue - dayResult.API.ringba.revenue,
                    payout: dayResult.API.elocal.payout - dayResult.API.ringba.payout
                };
            }
        } catch (error) {
            console.log(`    Ringba Error: ${error.message}`);
        }

        dailyResults.push(dayResult);
        console.log('');

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Print summary report
    console.log('\n======================================================================');
    console.log('DAILY COMPARISON SUMMARY');
    console.log('======================================================================\n');

    console.log('Date       | Category | eLocal Calls | eLocal Revenue | Ringba Calls | Ringba Revenue | Diff Calls | Diff Revenue');
    console.log('-'.repeat(130));

    dailyResults.forEach(day => {
        ['STATIC', 'API'].forEach(category => {
            const e = day[category].elocal;
            const r = day[category].ringba;
            const d = day[category].diff;

            const elocalCalls = e ? e.calls : 'N/A';
            const elocalRev = e ? `$${e.revenue.toFixed(2)}` : 'N/A';
            const ringbaCalls = r ? r.calls : 'N/A';
            const ringbaRev = r ? `$${r.revenue.toFixed(2)}` : 'N/A';
            const diffCalls = d ? (d.calls >= 0 ? `+${d.calls}` : d.calls) : 'N/A';
            const diffRev = d ? (d.revenue >= 0 ? `+$${d.revenue.toFixed(2)}` : `-$${Math.abs(d.revenue).toFixed(2)}`) : 'N/A';

            console.log(`${day.date} | ${category.padEnd(8)} | ${String(elocalCalls).padEnd(12)} | ${elocalRev.padEnd(14)} | ${String(ringbaCalls).padEnd(12)} | ${ringbaRev.padEnd(14)} | ${String(diffCalls).padEnd(10)} | ${diffRev}`);
        });
    });

    // Print category totals
    console.log('\n======================================================================');
    console.log('CATEGORY TOTALS');
    console.log('======================================================================\n');

    ['STATIC', 'API'].forEach(category => {
        console.log(`${category} Category:`);
        console.log(`  eLocal:  ${categoryTotals[category].elocal.calls} calls, $${categoryTotals[category].elocal.revenue.toFixed(2)} revenue, $${categoryTotals[category].elocal.payout.toFixed(2)} payout`);
        console.log(`  Ringba:  ${categoryTotals[category].ringba.calls} calls, $${categoryTotals[category].ringba.revenue.toFixed(2)} revenue, $${categoryTotals[category].ringba.payout.toFixed(2)} payout`);
        console.log(`  Diff:    ${categoryTotals[category].elocal.calls - categoryTotals[category].ringba.calls} calls, $${(categoryTotals[category].elocal.revenue - categoryTotals[category].ringba.revenue).toFixed(2)} revenue`);
        console.log('');
    });

    console.log('======================================================================\n');
}

generateComparisonReport().catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
