/**
 * kilo-openai-wrapper
 * OpenAI-compatible REST API wrapper for Kilo Code
 */

import 'dotenv/config';
import express from 'express';
import authRoutes from './authRoutes.js';
import completionRoutes from './completionRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ──────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/v1', completionRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// OpenAI root (some clients hit this)
app.get('/', (_req, res) => res.json({
  name: 'kilo-openai-wrapper',
  version: '1.0.0',
  description: 'OpenAI-compatible API wrapper for Kilo Code',
}));

// 404 catch-all
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[uncaught]', err);
  res.status(500).json({ error: { message: 'Internal server error', type: 'server_error' } });
});

// ── Start ───────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀  kilo-openai-wrapper running on http://0.0.0.0:${PORT}`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /auth/login          – Start device auth flow`);
  console.log(`  GET  /auth/poll/:code     – Poll until approved (long-poll)`);
  console.log(`  POST /auth/refresh        – Refresh wrapper token`);
  console.log(`  POST /auth/logout         – Logout`);
  console.log(`  GET  /v1/models           – List models  [requires token]`);
  console.log(`  POST /v1/chat/completions – Chat completion [requires token]\n`);
});
