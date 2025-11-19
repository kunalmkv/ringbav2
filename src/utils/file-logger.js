// File logger utility that writes to both console and file
import fs from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logs directory if it doesn't exist
const LOGS_DIR = join(__dirname, '../../logs');

// Initialize logger
let logFile = null;
let serviceName = 'Service';
let writeQueue = [];
let isWriting = false;
let originalLog = null;
let originalError = null;
let originalWarn = null;

/**
 * Process write queue
 */
const processWriteQueue = async () => {
  if (isWriting || writeQueue.length === 0 || !logFile) {
    return;
  }
  
  isWriting = true;
  
  while (writeQueue.length > 0) {
    const batch = writeQueue.splice(0, 100); // Process up to 100 messages at a time
    const content = batch.join('');
    
    try {
      await fs.appendFile(logFile, content);
    } catch (error) {
      // Don't throw, just log to console (but avoid infinite loop)
      if (!error.message.includes('Logger') && originalError) {
        originalError('[Logger] Failed to write to log file:', error.message);
      }
    }
  }
  
  isWriting = false;
};

/**
 * Initialize file logger
 * @param {string} filename - Log filename (optional, defaults to timestamp-based name)
 * @param {string} serviceName - Service name for log header (optional, defaults to "Service")
 * @returns {Promise<string|null>}
 */
export const initFileLogger = async (filename = null, serviceNameParam = 'Service') => {
  try {
    // Store service name for footer
    serviceName = serviceNameParam;
    
    // Create logs directory
    await fs.mkdir(LOGS_DIR, { recursive: true });
    
    // Generate log filename with timestamp if not provided
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const servicePrefix = serviceName.toLowerCase().replace(/\s+/g, '-');
      filename = `${servicePrefix}-${timestamp}.log`;
    }
    
    logFile = join(LOGS_DIR, filename);
    
    // Write header
    const header = `\n${'='.repeat(80)}\n`;
    const timestamp = new Date().toISOString();
    const headerContent = `${header}${serviceName} Log - Started at: ${timestamp}${header}\n`;
    await fs.appendFile(logFile, headerContent);
    
    return logFile;
  } catch (error) {
    console.error('[Logger] Failed to initialize file logger:', error.message);
    return null;
  }
};

/**
 * Write message to file only (console output is handled by overridden console methods)
 * @param {string} message - Message to log
 * @param {boolean} isError - Whether this is an error message (not used, but kept for compatibility)
 */
export const writeLog = async (message, isError = false) => {
  // Only write to file - console output is already handled by overridden console methods
  if (logFile) {
    try {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] ${message}\n`;
      writeQueue.push(logMessage);
      // Process queue asynchronously
      processWriteQueue().catch(() => {});
    } catch (error) {
      // Don't throw, just log to console (but avoid infinite loop)
      if (!error.message.includes('Logger') && originalError) {
        originalError('[Logger] Failed to queue log message:', error.message);
      }
    }
  }
};

/**
 * Override console methods to also write to file
 */
export const setupConsoleLogging = async () => {
  // Store original console methods
  originalLog = console.log;
  originalError = console.error;
  originalWarn = console.warn;
  
  console.log = (...args) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    originalLog(...args);
    // Write to file asynchronously (fire and forget)
    writeLog(message, false).catch(() => {});
  };
  
  console.error = (...args) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    originalError(...args);
    // Write to file asynchronously (fire and forget)
    writeLog(message, true).catch(() => {});
  };
  
  console.warn = (...args) => {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    originalWarn(...args);
    // Write to file asynchronously (fire and forget)
    writeLog(message, false).catch(() => {});
  };
};

/**
 * Close log file
 */
export const closeLogger = async () => {
  if (logFile) {
    try {
      // Wait for queue to finish
      while (writeQueue.length > 0 || isWriting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Write footer
      const footer = `\n${'='.repeat(80)}\n`;
      const timestamp = new Date().toISOString();
      const footerContent = `${footer}${serviceName} Log - Ended at: ${timestamp}${footer}\n\n`;
      await fs.appendFile(logFile, footerContent);
      
      const filePath = logFile;
      logFile = null;
      return filePath;
    } catch (error) {
      console.error('[Logger] Failed to close log file:', error.message);
      return null;
    }
  }
  return null;
};

/**
 * Get the current log file path
 */
export const getLogFile = () => logFile;

