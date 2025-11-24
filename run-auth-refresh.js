#!/usr/bin/env node

// Script to run auth refresh service
// Refreshes eLocal auth session using Puppeteer and saves to PostgreSQL

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import * as TE from 'fp-ts/lib/TaskEither.js';
import * as T from 'fp-ts/lib/Task.js';
import { refreshAuthSession } from './src/services/auth-refresh.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

// Build config from environment variables
const buildConfig = () => {
  return {
    elocalBaseUrl: process.env.ELOCAL_BASE_URL || 'https://elocal.com',
    elocalUsername: process.env.ELOCAL_USERNAME,
    elocalPassword: process.env.ELOCAL_PASSWORD,
    dbHost: process.env.POSTGRES_HOST || process.env.DB_HOST,
    dbPort: parseInt(process.env.POSTGRES_PORT || process.env.DB_PORT || '5432'),
    dbName: process.env.POSTGRES_DB_NAME || process.env.DB_NAME,
    dbUser: process.env.POSTGRES_USER_NAME || process.env.DB_USER,
    dbPassword: process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD,
    dbSsl: process.env.DB_SSL === 'true',
    timeoutMs: parseInt(process.env.AUTH_REFRESH_TIMEOUT_MS || '30000')
  };
};

// Validate config
const validateConfig = (config) => {
  const errors = [];
  
  if (!config.elocalUsername) {
    errors.push('ELOCAL_USERNAME is required');
  }
  
  if (!config.elocalPassword) {
    errors.push('ELOCAL_PASSWORD is required');
  }
  
  if (!config.dbHost) {
    errors.push('POSTGRES_HOST (or DB_HOST) is required');
  }
  
  if (!config.dbName) {
    errors.push('POSTGRES_DB_NAME (or DB_NAME) is required');
  }
  
  if (!config.dbUser) {
    errors.push('POSTGRES_USER_NAME (or DB_USER) is required');
  }
  
  if (!config.dbPassword) {
    errors.push('POSTGRES_PASSWORD (or DB_PASSWORD) is required');
  }
  
  return errors;
};

// Main function
const main = async () => {
  try {
    console.log('');
    console.log('='.repeat(70));
    console.log('eLocal Auth Session Refresh');
    console.log('='.repeat(70));
    console.log('');
    
    // Build and validate config
    const config = buildConfig();
    const errors = validateConfig(config);
    
    if (errors.length > 0) {
      console.error('❌ Configuration errors:');
      errors.forEach(err => console.error(`  - ${err}`));
      console.log('');
      console.log('Please set the required environment variables in your .env file.');
      process.exit(1);
    }
    
    console.log('[Config] eLocal Base URL:', config.elocalBaseUrl);
    console.log('[Config] Database:', `${config.dbHost}:${config.dbPort}/${config.dbName}`);
    console.log('[Config] Username:', config.elocalUsername ? '***' : 'NOT SET');
    console.log('');
    
    // Run auth refresh
    const resultEither = await refreshAuthSession(config)();
    
    if (resultEither._tag === 'Left') {
      const error = resultEither.left;
      console.error('');
      console.error('❌ Auth refresh failed:', error.message);
      process.exit(1);
    }
    
    const result = resultEither.right;
    console.log('');
    console.log('✅ Auth refresh completed successfully!');
    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Fatal error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
};

// Run main function
main();

