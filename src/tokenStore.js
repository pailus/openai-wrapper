/**
 * Persistent token store.
 * Stores tokens to a JSON file for persistence across restarts.
 */

import fs from 'fs';
import path from 'path';

const TOKEN_FILE = process.env.TOKEN_FILE || './tokens.json';

const store = new Map();

function loadStore() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      for (const [key, value] of Object.entries(data)) {
        store.set(key, value);
      }
      console.log(`[tokenStore] Loaded ${store.size} tokens from ${TOKEN_FILE}`);
    }
  } catch (err) {
    console.error('[tokenStore] Failed to load tokens:', err.message);
  }
}

function saveStore() {
  try {
    const obj = Object.fromEntries(store);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(obj, null, 2));
  } catch (err) {
    console.error('[tokenStore] Failed to save tokens:', err.message);
  }
}

loadStore();

export { store };

export function set(wrapperToken, data) {
  store.set(wrapperToken, data);
  saveStore();
}

export function get(wrapperToken) {
  return store.get(wrapperToken) ?? null;
}

export function remove(wrapperToken) {
  const result = store.delete(wrapperToken);
  if (result) saveStore();
  return result;
}

export function has(wrapperToken) {
  return store.has(wrapperToken);
}
