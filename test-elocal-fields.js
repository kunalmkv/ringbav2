#!/usr/bin/env node

import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const uuid = 'dce224a6-f813-4cab-a8c6-972c5a1520ab';
const url = new URL('https://apis.elocal.com/affiliates/v2/campaign-results/' + uuid + '/calls.json');
url.searchParams.append('start_date', '2026-01-27');
url.searchParams.append('end_date', '2026-01-28');
url.searchParams.append('sortBy', 'callStartTime');
url.searchParams.append('sortOrder', 'desc');

const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
        'x-api-key': process.env.ELOCAL_API_KEY,
        'Content-Type': 'application/json'
    }
});

const data = await response.json();
const calls = Array.isArray(data) ? data : (data.calls || data.results || []);
if (calls.length > 0) {
    console.log('Sample call fields:');
    console.log(Object.keys(calls[0]));
    console.log('\nSample call data:');
    console.log(JSON.stringify(calls[0], null, 2));
}
