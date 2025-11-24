// Service to refresh auth cookies using Puppeteer login and save to PostgreSQL
// Similar to elocal's auth-refresh.js but saves sessions to PostgreSQL database

import * as TE from 'fp-ts/lib/TaskEither.js';
import puppeteer from 'puppeteer';
import { saveSession, createSessionFromCookies } from '../auth/session-store-postgres.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Login to eLocal website using Puppeteer
 */
const loginToElocal = async (page, config) => {
  try {
    console.log('[Auth Refresh] Navigating to login page...');
    
    // Navigate to the login page
    await page.goto(`${config.elocalBaseUrl}/partner_users/login`, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    console.log('[Auth Refresh] Waiting for login form...');
    
    // Wait for login form to load
    await page.waitForSelector('input[name="partner_user[username]"]', { timeout: 10000 });
    
    // Fill username
    const usernameField = await page.$('input[name="partner_user[username]"]');
    if (!usernameField) {
      throw new Error('Could not find username field');
    }
    
    console.log('[Auth Refresh] Filling username...');
    await usernameField.type(config.elocalUsername);
    
    // Fill password
    const passwordField = await page.$('input[name="partner_user[password]"]');
    if (!passwordField) {
      throw new Error('Could not find password field');
    }
    
    console.log('[Auth Refresh] Filling password...');
    await passwordField.type(config.elocalPassword);
    
    // Find and click submit button
    const submitButton = await page.$('button[type="submit"]');
    if (!submitButton) {
      throw new Error('Could not find submit button');
    }
    
    console.log('[Auth Refresh] Submitting login form...');
    await submitButton.click();
    
    // Wait for navigation to dashboard (URL change)
    const startUrl = page.url();
    console.log('[Auth Refresh] Waiting for login to complete...');
    
    await new Promise((resolve, reject) => {
      const checkUrl = setInterval(() => {
        const currentUrl = page.url();
        if (currentUrl !== startUrl && !currentUrl.includes('login')) {
          clearInterval(checkUrl);
          resolve();
        }
      }, 100);
      
      setTimeout(() => {
        clearInterval(checkUrl);
        // Check if we're still on login page
        if (page.url().includes('login')) {
          reject(new Error('Login failed - still on login page after timeout'));
        } else {
          resolve();
        }
      }, 15000);
    });
    
    // Additional wait for page to stabilize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Verify we're logged in by checking URL
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      throw new Error('Login failed - redirected back to login page');
    }
    
    console.log('[Auth Refresh] ✅ Login successful!');
    console.log(`[Auth Refresh] Current URL: ${currentUrl}`);
    
    return true;
  } catch (error) {
    console.error(`[Auth Refresh] Login error: ${error.message}`);
    throw error;
  }
};

/**
 * Refresh auth session using Puppeteer login
 */
export const refreshAuthSession = (config) =>
  TE.tryCatch(
    async () => {
      console.log('[Auth Refresh] ========================================');
      console.log('[Auth Refresh] Starting auth session refresh...');
      console.log('[Auth Refresh] ========================================');
      
      // Launch browser in headless mode
      // Try to use system Chromium first, fallback to Puppeteer's bundled Chromium
      const fs = await import('fs');
      const possiblePaths = [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/snap/bin/chromium',
        // macOS paths
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium'
      ];
      
      let executablePath = undefined;
      for (const path of possiblePaths) {
        try {
          if (fs.existsSync(path)) {
            executablePath = path;
            console.log(`[Auth Refresh] Using system browser: ${path}`);
            break;
          }
        } catch (e) {
          // Continue to next path
        }
      }
      
      if (!executablePath) {
        console.log('[Auth Refresh] Using Puppeteer bundled Chromium (system browser not found)');
      }
      
      const launchOptions = {
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      };
      
      // Only set executablePath if system browser found
      if (executablePath) {
        launchOptions.executablePath = executablePath;
      }
      
      console.log('[Auth Refresh] Launching browser...');
      const browser = await puppeteer.launch(launchOptions);
      
      try {
        const page = await browser.newPage();
        
        // Configure page
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setDefaultTimeout(config.timeoutMs || 30000);
        
        console.log('[Auth Refresh] Browser configured');
        
        // Login to eLocal
        await loginToElocal(page, config);
        
        console.log('[Auth Refresh] Login successful, capturing cookies...');
        
        // After login, capture cookies
        const cookies = await page.cookies();
        console.log(`[Auth Refresh] Captured ${cookies.length} cookies`);
        
        // Create session from cookies
        const session = createSessionFromCookies(cookies, THREE_DAYS_MS);
        
        // Save session to PostgreSQL database
        console.log('[Auth Refresh] Saving session to database...');
        const savedSession = await saveSession(config, session, true, null);
        
        console.log('[Auth Refresh] ========================================');
        console.log(`[Auth Refresh] ✅ Session saved successfully!`);
        console.log(`[Auth Refresh] Session ID: ${savedSession.id}`);
        console.log(`[Auth Refresh] Expires at: ${new Date(session.expiresAt).toISOString()}`);
        console.log(`[Auth Refresh] Is working: true`);
        console.log(`[Auth Refresh] ========================================`);
        
        return { 
          success: true, 
          sessionId: savedSession.id,
          expiresAt: session.expiresAt,
          expiresAtISO: new Date(session.expiresAt).toISOString()
        };
      } catch (error) {
        console.error(`[Auth Refresh] Error during login process: ${error.message}`);
        console.error(`[Auth Refresh] Stack: ${error.stack}`);
        
        // Try to save error to database if we have partial session data
        try {
          if (error.cookies) {
            const session = createSessionFromCookies(error.cookies, THREE_DAYS_MS);
            await saveSession(config, session, false, error.message);
          }
        } catch (saveError) {
          console.error(`[Auth Refresh] Failed to save error session: ${saveError.message}`);
        }
        
        throw error;
      } finally {
        await browser.close();
        console.log('[Auth Refresh] Browser closed');
      }
    },
    (error) => {
      const errorMsg = `Auth session refresh failed: ${error.message}`;
      console.error(`[Auth Refresh] ❌ ${errorMsg}`);
      if (error.stack) {
        console.error(`[Auth Refresh] Stack trace: ${error.stack}`);
      }
      return new Error(errorMsg);
    }
  );

