/**
 * OpenAI-compatible completion routes
 *
 * POST /v1/chat/completions   - Chat completion (streaming & non-streaming)
 * GET  /v1/models             - List available models
 */

import { Router } from 'express';
import { chatCompletion } from './kiloClient.js';
import * as tokenStore from './tokenStore.js';

const router = Router();

function getStoredToken() {
  for (const [_key, data] of tokenStore.store) {
    if (data.expiresAt * 1000 > Date.now()) {
      return data.kiloToken;
    }
  }
  return process.env.KILO_TOKEN || null;
}

function autoAuth(req, res, next) {
  const kiloToken = getStoredToken();
  if (!kiloToken) {
    return res.status(401).json({
      error: {
        message: 'No valid token found. Please login first via /auth/login',
        type: 'authentication_error',
        code: 'no_token',
      },
    });
  }
  req.auth = { kiloToken };
  next();
}

router.use(autoAuth);

// ─────────────────────────────────────────────
// GET /v1/models
// Returns a minimal OpenAI-format model list
// ─────────────────────────────────────────────
router.get('/models', (_req, res) => {
  res.json({
    object: 'list',
    data: [
      {
        id: 'kilo-auto/frontier',
        object: 'model',
        created: 1700000000,
        owned_by: 'kilo',
        permission: [],
        root: 'kilo-auto/frontier',
        parent: null,
      },
      {
        id: 'kilo/kilo-auto/frontier',
        object: 'model',
        created: 1700000000,
        owned_by: 'kilo',
        permission: [],
        root: 'kilo/kilo-auto/frontier',
        parent: null,
      },
    ],
  });
});

// ─────────────────────────────────────────────
// POST /v1/chat/completions
// ─────────────────────────────────────────────
router.post('/chat/completions', async (req, res) => {
  const {
    model = 'kilo-auto/frontier',
    messages,
    stream = false,
    max_tokens,
    temperature,
    top_p,
    stop,
    tools,
    tool_choice,
    ...rest
  } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({
      error: {
        message: "'messages' is required and must be an array",
        type: 'invalid_request_error',
        param: 'messages',
      },
    });
  }

  // Build Kilo-compatible body (it accepts OpenAI format natively)
  const kiloBody = {
    model,
    messages,
    stream,
    ...(max_tokens !== undefined && { max_tokens }),
    ...(temperature !== undefined && { temperature }),
    ...(top_p !== undefined && { top_p }),
    ...(stop !== undefined && { stop }),
    ...(tools !== undefined && { tools }),
    ...(tool_choice !== undefined && { tool_choice }),
    ...rest,
  };

  let kiloRes;
  try {
    kiloRes = await chatCompletion(req.auth.kiloToken, kiloBody);
  } catch (err) {
    console.error('[completions] Kilo request error:', err.message);
    return res.status(502).json({
      error: {
        message: `Upstream error: ${err.message}`,
        type: 'api_error',
      },
    });
  }

  if (!kiloRes.ok) {
    const errBody = await kiloRes.text();
    console.error(`[completions] Kilo responded ${kiloRes.status}:`, errBody);
    return res.status(kiloRes.status).json({
      error: {
        message: `Kilo API error (${kiloRes.status})`,
        type: 'api_error',
        detail: tryParseJson(errBody),
      },
    });
  }

  // ── Streaming ────────────────────────────────
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering

    // Pipe Kilo's SSE stream straight through to the client
    kiloRes.body.on('data', (chunk) => res.write(chunk));
    kiloRes.body.on('end', () => res.end());
    kiloRes.body.on('error', (err) => {
      console.error('[completions/stream] pipe error:', err.message);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => kiloRes.body.destroy());
    return;
  }

  // ── Non-streaming ────────────────────────────
  try {
    const data = await kiloRes.json();
    res.json(data);
  } catch (err) {
    console.error('[completions] JSON parse error:', err.message);
    res.status(502).json({ error: { message: 'Failed to parse upstream response', type: 'api_error' } });
  }
});

function tryParseJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}

export default router;
