import { scrapeElocalDataWithDateRange } from "./src/services/elocal.scrapper.js";
import dotenv from "dotenv";

dotenv.config();

const config = {
    elocalApiKey: process.env.ELOCAL_API_KEY,
    dbHost: process.env.POSTGRES_HOST,
    dbPort: process.env.POSTGRES_PORT,
    dbUser: process.env.POSTGRES_USER_NAME,
    dbPassword: process.env.POSTGRES_PASSWORD,
    dbName: process.env.POSTGRES_DB_NAME
};

const dateRange = {
    startDate: new Date('2026-01-01T00:00:00'),
    endDate: new Date('2026-01-31T23:59:59'),
    startDateFormatted: '01/01/2026',
    endDateFormatted: '01/31/2026',
    startDateURL: '2026-01-01',
    endDateURL: '2026-01-31'
};

async function run() {
    console.log('Starting eLocal Scraper for January 2026 (Jan 1 - Jan 31)...');

    try {
        // Run STATIC category
        console.log('\n--- Running STATIC category ---');
        const resultStatic = await scrapeElocalDataWithDateRange(config)(dateRange)('manual')('STATIC');
        console.log('STATIC result:', JSON.stringify(resultStatic.summary, null, 2));

        // Run API category
        console.log('\n--- Running API category ---');
        const resultApi = await scrapeElocalDataWithDateRange(config)(dateRange)('manual')('API');
        console.log('API result:', JSON.stringify(resultApi.summary, null, 2));

        console.log('\nExecution complete for January 2026!');
    } catch (error) {
        console.error('Execution failed:');
        console.error(error.message);
        process.exit(1);
    }
}

run();
