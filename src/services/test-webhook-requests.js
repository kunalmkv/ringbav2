#!/usr/bin/env node

/**
 * Test Script for Webhook Endpoint
 * 
 * This script sends 20 test requests to the webhook endpoint with:
 * - Test data (firstName: kunal, lastName: mishra) for easy identification and deletion
 * - 1 second delay between requests
 * - Detailed debugging logs including time consumed, success/failure status
 * 
 * Usage: node src/services/test-webhook-requests.js
 */

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const WEBHOOK_URL = 'https://insidefi.co/assembly/ringba/call-recording/submit';
const TOTAL_REQUESTS = 1500; // 5 minutes @ 5 req/sec
const DELAY_BETWEEN_REQUESTS_MS = 200; // 200ms delay = 5 requests per second
const REQUEST_TIMEOUT_MS = 5000; // 5 second timeout

// Test data template - marked for easy deletion
const generateTestPayload = (requestNumber) => {
    const timestamp = new Date().toISOString();
    const testId = `TEST_${Date.now()}_${requestNumber}`;

    return {
        // Test identity markers
        caller_id: `+1555TEST${String(requestNumber).padStart(3, '0')}`, // e.g., +1555TEST001
        firstName: "kunal",
        lastName: "mishra",
        email: `test.kunal.mishra.${requestNumber}@testdata.example.com`,

        // Test campaign data
        date: timestamp,
        campaign: testId,
        adset: `TEST_ADSET_${requestNumber}`,

        // Financial test data
        revenue: "0.00",
        latestPayout: "0.00",
        ringbaCost: "0.00",
        adCost: "0.00",
        billed: "false",

        // Recording and call details
        recording: `https://test-recording-url.example.com/test_${testId}.mp3`,
        endsource: "TEST_SOURCE",
        duration: "60",
        timetoconnect: "5",
        timetocall: "2",

        // Location test data
        target: "Test Target",
        zip: "12345",
        publisher: "Test Publisher",
        locationID: `TEST_LOC_${requestNumber}`,

        // Address details
        street_number: "123",
        street_name: "Test Street",
        street_type: "Ave",
        city: "Test City",
        state: "TS",

        // UTM parameters
        utm_campaign: `test_campaign_${requestNumber}`,
        utm_adset: `test_adset_${requestNumber}`,

        // Type
        type: "Inbound"
    };
};

// Main test execution
const runTest = async () => {
    console.log('');
    console.log('='.repeat(80));
    console.log('Webhook Endpoint Test Script');
    console.log('='.repeat(80));
    console.log(`Webhook URL:           ${WEBHOOK_URL}`);
    console.log(`Total Requests:        ${TOTAL_REQUESTS}`);
    console.log(`Delay Between Requests: ${DELAY_BETWEEN_REQUESTS_MS}ms (5 requests per second)`);
    console.log(`Request Timeout:       ${REQUEST_TIMEOUT_MS}ms`);
    console.log(`Test Data Identifier:  firstName=kunal, lastName=mishra`);
    console.log(`⚠️  Test will STOP if timeout occurs`);
    console.log('='.repeat(80));
    console.log('');

    const results = {
        successful: [],
        failed: [],
        totalTime: 0,
        avgResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0
    };

    const startTime = Date.now();

    for (let i = 1; i <= TOTAL_REQUESTS; i++) {
        const payload = generateTestPayload(i);
        const requestStartTime = Date.now();

        console.log(`\n${'─'.repeat(80)}`);
        console.log(`[Request ${i}/${TOTAL_REQUESTS}] Starting...`);
        console.log(`${'─'.repeat(80)}`);
        console.log(`⏰ Timestamp:     ${new Date().toISOString()}`);
        console.log(`📞 Caller ID:     ${payload.caller_id}`);
        console.log(`👤 Name:          ${payload.firstName} ${payload.lastName}`);
        console.log(`📧 Email:         ${payload.email}`);
        console.log(`🎯 Campaign:      ${payload.campaign}`);

        try {
            console.log(`\n🚀 Sending request to: ${WEBHOOK_URL}`);
            console.log(`📦 Payload size:  ${JSON.stringify(payload).length} bytes`);
            console.log(`⏱️  Timeout set:   ${REQUEST_TIMEOUT_MS}ms`);

            // Create AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            const response = await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const requestEndTime = Date.now();
            const responseTime = requestEndTime - requestStartTime;

            // Update statistics
            results.totalTime += responseTime;
            results.minResponseTime = Math.min(results.minResponseTime, responseTime);
            results.maxResponseTime = Math.max(results.maxResponseTime, responseTime);

            console.log(`\n⏱️  Response Time:  ${responseTime}ms`);
            console.log(`📊 Status Code:   ${response.status} ${response.statusText}`);
            console.log(`📋 Content-Type:  ${response.headers.get('content-type') || 'N/A'}`);

            if (response.ok) {
                // Success
                const responseText = await response.text();
                console.log(`✅ SUCCESS!`);
                console.log(`📄 Response Body: ${responseText || '(empty)'}`);

                results.successful.push({
                    requestNumber: i,
                    callerId: payload.caller_id,
                    responseTime,
                    statusCode: response.status,
                    responseBody: responseText
                });
            } else {
                // Failure
                const errorText = await response.text();
                console.log(`❌ FAILED!`);
                console.log(`🚫 Status: ${response.status} ${response.statusText}`);
                console.log(`🚫 Error Response: ${errorText}`);
                console.log(`🔍 Debug Info:`);
                console.log(`   - Request #${i}`);
                console.log(`   - Caller ID: ${payload.caller_id}`);
                console.log(`   - Campaign: ${payload.campaign}`);
                console.log(`   - Recording: ${payload.recording}`);

                results.failed.push({
                    requestNumber: i,
                    callerId: payload.caller_id,
                    responseTime,
                    statusCode: response.status,
                    statusText: response.statusText,
                    errorBody: errorText
                });
            }

        } catch (error) {
            const requestEndTime = Date.now();
            const responseTime = requestEndTime - requestStartTime;

            console.log(`\n⏱️  Time Elapsed:   ${responseTime}ms`);

            // Check if this is a timeout error
            const isTimeout = error.name === 'AbortError' || error.message.includes('timeout');

            if (isTimeout) {
                console.log(`⏰ TIMEOUT ERROR!`);
                console.log(`🛑 Request exceeded ${REQUEST_TIMEOUT_MS}ms timeout`);
                console.log(`📍 Request Details:`);
                console.log(`   - Request #${i} of ${TOTAL_REQUESTS}`);
                console.log(`   - Caller ID: ${payload.caller_id}`);
                console.log(`   - Campaign: ${payload.campaign}`);
                console.log(`   - Started at: ${new Date(requestStartTime).toISOString()}`);
                console.log(`   - Timed out after: ${responseTime}ms`);

                results.failed.push({
                    requestNumber: i,
                    callerId: payload.caller_id,
                    responseTime,
                    errorType: 'TIMEOUT',
                    errorMessage: `Request timed out after ${REQUEST_TIMEOUT_MS}ms`,
                    exception: true
                });

                // STOP TESTING ON TIMEOUT
                console.log(`\n🛑🛑🛑 STOPPING TEST - TIMEOUT DETECTED 🛑🛑🛑`);
                console.log(`Test stopped at request ${i} of ${TOTAL_REQUESTS}`);
                console.log(`Remaining requests (${TOTAL_REQUESTS - i}) will not be sent`);
                break; // Exit the loop immediately

            } else {
                console.log(`❌ EXCEPTION THROWN!`);
                console.log(`💥 Error Type:    ${error.name}`);
                console.log(`📝 Error Message: ${error.message}`);
                console.log(`🔍 Debug Info:`);
                console.log(`   - Request #${i}`);
                console.log(`   - Caller ID: ${payload.caller_id}`);
                console.log(`   - Campaign: ${payload.campaign}`);

                if (error.stack) {
                    console.log(`\n📚 Stack Trace:`);
                    console.log(error.stack);
                }

                results.failed.push({
                    requestNumber: i,
                    callerId: payload.caller_id,
                    responseTime,
                    errorType: error.name,
                    errorMessage: error.message,
                    exception: true
                });
            }
        }

        // Delay before next request (except after the last one)
        if (i < TOTAL_REQUESTS) {
            console.log(`\n⏳ Waiting ${DELAY_BETWEEN_REQUESTS_MS}ms before next request...`);
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
        }
    }

    const endTime = Date.now();
    const totalExecutionTime = endTime - startTime;
    const totalCompleted = results.successful.length + results.failed.length;
    results.avgResponseTime = totalCompleted > 0 ? results.totalTime / totalCompleted : 0;

    // Print final summary
    console.log('\n\n');
    console.log('='.repeat(80));
    console.log('TEST SUMMARY');
    console.log('='.repeat(80));
    console.log('');

    const hasTimeout = results.failed.some(f => f.errorType === 'TIMEOUT');

    console.log('📊 OVERALL STATISTICS:');
    console.log(`   Total Requests Sent:   ${totalCompleted} of ${TOTAL_REQUESTS}`);
    console.log(`   Successful:            ${results.successful.length} (${totalCompleted > 0 ? ((results.successful.length / totalCompleted) * 100).toFixed(1) : 0}%)`);
    console.log(`   Failed:                ${results.failed.length} (${totalCompleted > 0 ? ((results.failed.length / totalCompleted) * 100).toFixed(1) : 0}%)`);
    if (hasTimeout) {
        console.log(`   ⚠️  Test stopped early due to timeout`);
    }
    console.log(`   Total Execution Time:  ${(totalExecutionTime / 1000).toFixed(2)}s`);
    console.log('');

    console.log('⏱️  RESPONSE TIME STATISTICS:');
    console.log(`   Average:   ${results.avgResponseTime.toFixed(2)}ms`);
    console.log(`   Minimum:   ${results.minResponseTime}ms`);
    console.log(`   Maximum:   ${results.maxResponseTime}ms`);
    console.log('');

    if (results.successful.length > 0) {
        console.log('✅ SUCCESSFUL REQUESTS:');
        results.successful.forEach(req => {
            console.log(`   [${req.requestNumber}] ${req.callerId} - ${req.responseTime}ms - Status ${req.statusCode}`);
        });
        console.log('');
    }

    if (results.failed.length > 0) {
        console.log('❌ FAILED REQUESTS:');
        results.failed.forEach(req => {
            if (req.exception) {
                const errorLabel = req.errorType === 'TIMEOUT' ? '⏰ TIMEOUT' : '💥 EXCEPTION';
                console.log(`   [${req.requestNumber}] ${req.callerId} - ${req.responseTime}ms - ${errorLabel}: ${req.errorMessage}`);
            } else {
                console.log(`   [${req.requestNumber}] ${req.callerId} - ${req.responseTime}ms - Status ${req.statusCode}: ${req.statusText}`);
                if (req.errorBody) {
                    console.log(`       Error: ${req.errorBody.substring(0, 100)}${req.errorBody.length > 100 ? '...' : ''}`);
                }
            }
        });
        console.log('');
    }

    console.log('🗑️  CLEANUP INFORMATION:');
    console.log(`   All test records can be identified by:`);
    console.log(`   - firstName: "kunal"`);
    console.log(`   - lastName: "mishra"`);
    console.log(`   - Caller IDs: +1555TEST001 through +1555TEST${String(TOTAL_REQUESTS).padStart(3, '0')}`);
    console.log(`   - Email pattern: test.kunal.mishra.*@testdata.example.com`);
    console.log('');

    console.log('='.repeat(80));
    console.log('');

    // Exit with appropriate code
    process.exit(results.failed.length > 0 ? 1 : 0);
};

// Run the test
runTest().catch(error => {
    console.error('\n\n');
    console.error('='.repeat(80));
    console.error('FATAL ERROR');
    console.error('='.repeat(80));
    console.error(error);
    console.error('='.repeat(80));
    process.exit(1);
});
