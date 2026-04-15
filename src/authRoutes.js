/**
 * Auth routes
 *
 * POST /auth/login          - Start device auth flow, returns code & verificationUrl
 * GET  /auth/poll/:code     - Poll until approved, returns wrapper access_token
 * POST /auth/refresh        - Exchange still-valid wrapper token for a fresh one
 * POST /auth/logout         - Revoke wrapper token
 */

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { requestDeviceCode, pollDeviceToken } from './kiloClient.js';
import * as tokenStore from './tokenStore.js';

const router = Router();

const JWT_SECRET = process.env.WRAPPER_JWT_SECRET || uuidv4();
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '3000', 10);
const POLL_TIMEOUT  = parseInt(process.env.POLL_TIMEOUT_MS  || '600000', 10);

/** Mint a short-lived wrapper JWT that embeds the Kilo token */
function mintWrapperToken(kiloToken, userId, userEmail) {
  const payload = { kiloToken, userId, userEmail, jti: uuidv4() };
  // Wrapper token lives 30 days (same ballpark as Kilo token expiry)
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
  return accessToken;
}

/** Decode & verify wrapper token – throws on invalid/expired */
export function verifyWrapperToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET); // throws if invalid
  // Also check it hasn't been explicitly logged-out
  if (!tokenStore.has(decoded.jti)) {
    throw new Error('Token has been revoked');
  }
  return decoded;
}

// ─────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const data = await requestDeviceCode();
    res.json({
      code: data.code,
      verificationUrl: data.verificationUrl,
      expiresIn: data.expiresIn,
      message: `Visit ${data.verificationUrl} to authorize, then call GET /auth/poll/${data.code}`,
    });
  } catch (err) {
    console.error('[auth/login]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /auth/poll/:code
// Polls Kilo until approved or timed-out (long-poll style)
// ─────────────────────────────────────────────
router.get('/poll/:code', async (req, res) => {
  const { code } = req.params;
  const deadline = Date.now() + POLL_TIMEOUT;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() < deadline) {
    try {
      const data = await pollDeviceToken(code);

      if (data.status === 'approved' && data.token) {
        const accessToken = mintWrapperToken(data.token, data.userId, data.userEmail);

        // Store jti so we can revoke later
        const decoded = jwt.decode(accessToken);
        tokenStore.set(decoded.jti, {
          kiloToken: data.token,
          userId: data.userId,
          userEmail: data.userEmail,
          expiresAt: decoded.exp,
        });

        return res.json({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: decoded.exp - Math.floor(Date.now() / 1000),
          user_id: data.userId,
          user_email: data.userEmail,
        });
      }

      if (data.status === 'expired') {
        return res.status(410).json({ error: 'Device code expired. Please start a new login flow.' });
      }

      // status === 'pending' – keep polling
      await sleep(POLL_INTERVAL);
    } catch (err) {
      console.error('[auth/poll]', err.message);
      return res.status(502).json({ error: err.message });
    }
  }

  res.status(408).json({ error: 'Polling timed out. Please try logging in again.' });
});

// ─────────────────────────────────────────────
// POST /auth/refresh
// Returns a brand-new wrapper token using the embedded Kilo token.
// (Kilo itself doesn't have a refresh endpoint, so we re-wrap the same Kilo token)
// ─────────────────────────────────────────────
router.post('/refresh', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  }

  try {
    const decoded = verifyWrapperToken(token);

    // Revoke old token
    tokenStore.remove(decoded.jti);

    // Issue a fresh wrapper token with the same Kilo token
    const newToken = mintWrapperToken(decoded.kiloToken, decoded.userId, decoded.userEmail);
    const newDecoded = jwt.decode(newToken);
    tokenStore.set(newDecoded.jti, {
      kiloToken: decoded.kiloToken,
      userId: decoded.userId,
      userEmail: decoded.userEmail,
      expiresAt: newDecoded.exp,
    });

    res.json({
      access_token: newToken,
      token_type: 'Bearer',
      expires_in: newDecoded.exp - Math.floor(Date.now() / 1000),
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token', detail: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /auth/logout
// ─────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization Bearer token' });
  }

  try {
    const decoded = jwt.decode(token); // decode without verifying so expired tokens can still be logged out
    if (decoded?.jti) {
      tokenStore.remove(decoded.jti);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Could not decode token', detail: err.message });
  }
});

export default router;
