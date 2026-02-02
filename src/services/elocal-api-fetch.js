import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const ELOCAL_API_KEY = process.env.ELOCAL_API_KEY;
const ELOCAL_BASE_URL = 'https://apis.elocal.com/affiliates/v2/campaign-results';

// Campaign UUIDs mapping to categories
const CAMPAIGNS = [
    {
        name: 'STATIC', // Appliance Repair / Final Expense
        uuid: 'dce224a6-f813-4cab-a8c6-972c5a1520ab'
    },
    {
        name: 'API',    // API Campaigns
        uuid: '4534924c-f52b-4124-981b-9d2670b2af3e'
    }
];

/**
 * Fetch calls from eLocal API for a specific campaign
 * @param {string} uuid - Campaign UUID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} API response
 */
const fetchCampaignCalls = async (uuid, startDate, endDate) => {
    const url = new URL(`${ELOCAL_BASE_URL}/${uuid}/calls.json`);

    // Add query parameters
    url.searchParams.append('start_date', startDate);
    url.searchParams.append('end_date', endDate);
    url.searchParams.append('sortBy', 'callStartTime');
    url.searchParams.append('sortOrder', 'desc');

    console.log(`[eLocal] Fetching: ${url.toString()}`);

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
};

/**
 * Print usage information
 */
const printUsage = () => {
    console.log('Usage: node src/services/elocal-api-fetch.js [category] [startDate] [endDate]');
    console.log('Parameters:');
    console.log('  category   : STATIC, API, or ALL (default: ALL)');
    console.log('  startDate  : YYYY-MM-DD (default: today)');
    console.log('  endDate    : YYYY-MM-DD (default: startDate)');
    console.log('\nExamples:');
    console.log('  node src/services/elocal-api-fetch.js STATIC 2026-01-27 2026-01-27');
    console.log('  node src/services/elocal-api-fetch.js API 2026-01-31');
    console.log('  node src/services/elocal-api-fetch.js ALL 2026-01-01 2026-01-31');
};

/**
 * Main function to fetch and save eLocal data
 */
const run = async () => {
    console.log('');
    console.log('='.repeat(70));
    console.log('eLocal API Fetch Service');
    console.log('='.repeat(70));

    // Parse CLI arguments: node elocal-api-fetch.js [category] [startDate] [endDate]
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        printUsage();
        return;
    }

    let categoryArg = (args[0] || 'ALL').toUpperCase();
    let startDate = args[1];
    let endDate = args[2];

    // Default to today if no dates provided
    if (!startDate) {
        const today = new Date();
        startDate = today.toISOString().split('T')[0];
        endDate = startDate;
    }
    if (!endDate) {
        const endDateArr = startDate.split('-');
        let d = new Date(Date.UTC(parseInt(endDateArr[0]), parseInt(endDateArr[1]) - 1, parseInt(endDateArr[2])));
        d.setUTCDate(d.getUTCDate() + 1);
        endDate = d.toISOString().split('T')[0];
        console.log(`[INFO] Single date provided. Extending end_date to ${endDate} for inclusive fetch.`);
    } else if (startDate === endDate) {
        const endDateArr = startDate.split('-');
        let d = new Date(Date.UTC(parseInt(endDateArr[0]), parseInt(endDateArr[1]) - 1, parseInt(endDateArr[2])));
        d.setUTCDate(d.getUTCDate() + 1);
        endDate = d.toISOString().split('T')[0];
        console.log(`[INFO] Start and end dates are same. Extending end_date to ${endDate} for inclusive fetch.`);
    }

    // Filter campaigns based on category argument
    const campaignsToFetch = categoryArg === 'ALL'
        ? CAMPAIGNS
        : CAMPAIGNS.filter(c => c.name === categoryArg);

    if (campaignsToFetch.length === 0) {
        console.error(`[ERROR] Invalid category: ${categoryArg}`);
        printUsage();
        return;
    }

    console.log(`Category   : ${categoryArg}`);
    console.log(`Date Range : ${startDate} to ${endDate}`);
    console.log(`Campaigns  : ${campaignsToFetch.length}`);
    console.log('='.repeat(70));
    console.log('');

    const allResults = {};
    const timestamp = new Date().getTime();

    for (const campaign of campaignsToFetch) {
        console.log(`[${campaign.name}] Fetching UUID: ${campaign.uuid}`);

        try {
            const data = await fetchCampaignCalls(campaign.uuid, startDate, endDate);

            allResults[campaign.name] = {
                uuid: campaign.uuid,
                startDate,
                endDate,
                fetchedAt: new Date().toISOString(),
                data: data
            };

            // Count calls if available
            const calls = Array.isArray(data) ? data : (data.calls || data.results || []);
            const callCount = calls.length;

            console.log(`[${campaign.name}] ✓ Fetched ${callCount} calls`);

            // Save individual campaign file
            const campaignFilename = `elocal_${campaign.name.toLowerCase()}_${startDate}_to_${endDate}_${timestamp}.txt`;
            const campaignPath = path.join(process.cwd(), campaignFilename);
            fs.writeFileSync(campaignPath, JSON.stringify(data, null, 2));
            console.log(`[${campaign.name}] ✓ Saved to ${campaignFilename}`);

        } catch (error) {
            console.error(`[${campaign.name}] ✗ Error: ${error.message}`);
            allResults[campaign.name] = {
                uuid: campaign.uuid,
                error: error.message
            };
        }

        console.log('');
    }

    // Save combined results if fetching multiple
    if (campaignsToFetch.length > 1) {
        const combinedFilename = `elocal_combined_${startDate}_to_${endDate}_${timestamp}.txt`;
        const combinedPath = path.join(process.cwd(), combinedFilename);
        fs.writeFileSync(combinedPath, JSON.stringify(allResults, null, 2));
        console.log(`Combined results saved to: ${combinedFilename}`);
    }

    console.log('='.repeat(70));
    console.log('Fetch operation complete');
    console.log('='.repeat(70));
    console.log('');
};

// Execute
run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
