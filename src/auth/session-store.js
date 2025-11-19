import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_FILE = path.join(__dirname, '../../src/data/auth_session.json');

// Read session from file
export const readSession = async () => {
  try {
    const data = await fs.readFile(SESSION_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

// Check if session is valid (not expired)
export const isSessionValid = (session) => {
  if (!session || !session.cookieHeader) {
    return false;
  }
  
  // Check if session has expiration
  if (session.expiresAt) {
    const expires = new Date(session.expiresAt);
    if (expires < new Date()) {
      return false;
    }
  }
  
  return true;
};

// Save session to file
export const saveSession = async (session) => {
  try {
    const dir = path.dirname(SESSION_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(SESSION_FILE, JSON.stringify(session, null, 2), 'utf-8');
  } catch (error) {
    console.error('[ERROR] Failed to save session:', error);
    throw error;
  }
};

