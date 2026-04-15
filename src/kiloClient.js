/**
 * Kilo API client
 * Wraps all raw Kilo endpoints observed from kilo.md
 */

import fetch from 'node-fetch';

const KILO_BASE = 'https://api.kilo.ai';
const KILO_CHAT_BASE = 'https://api.kilo.ai';

const COMMON_HEADERS = {
  'Accept': '*/*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Connection': 'keep-alive',
  'User-Agent': 'kilo/7.2.0',
};

/**
 * Step 1: Request a device auth code
 * POST /api/device-auth/codes
 * Returns { code, verificationUrl, expiresIn }
 */
export async function requestDeviceCode() {
  const res = await fetch(`${KILO_BASE}/api/device-auth/codes`, {
    method: 'POST',
    headers: {
      ...COMMON_HEADERS,
      'Content-Type': 'application/json',
      'Content-Length': '0',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new KiloError(`Device code request failed: ${res.status}`, res.status, body);
  }

  return res.json();
}

/**
 * Step 2: Poll for token after user approves device auth
 * GET /api/device-auth/codes/:code
 * Returns { status, token, userId, userEmail } when approved
 */
export async function pollDeviceToken(code) {
  const res = await fetch(`${KILO_BASE}/api/device-auth/codes/${code}`, {
    method: 'GET',
    headers: COMMON_HEADERS,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new KiloError(`Token poll failed: ${res.status}`, res.status, body);
  }

  return res.json();
}

/**
 * Chat completion
 * POST /api/openrouter/chat/completions
 * Accepts OpenAI-compatible body, returns streamed or non-streamed response.
 */
export async function chatCompletion(kiloToken, body) {
  const res = await fetch(`${KILO_CHAT_BASE}/api/openrouter/chat/completions`, {
    method: 'POST',
    headers: {
      ...COMMON_HEADERS,
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${kiloToken}`,
      'HTTP-Referer': 'https://kilocode.ai',
      'User-Agent': 'opencode-kilo-provider/7.2.0',
      'X-KILOCODE-EDITORNAME': 'Kilo CLI 7.2.0',
      'X-KILOCODE-FEATURE': 'cli',
      'x-kilocode-mode': 'code',
      'X-Title': 'Kilo Code',
    },
    body: JSON.stringify(body),
  });

  return res; // Return raw response so caller can handle streaming
}

export class KiloError extends Error {
  constructor(message, statusCode, body) {
    super(message);
    this.name = 'KiloError';
    this.statusCode = statusCode;
    this.body = body;
  }
}
