# kilo-openai-wrapper

OpenAI-compatible REST API wrapper for **Kilo Code** — exposes device-auth OAuth flow and a `/v1/chat/completions` endpoint that any OpenAI client can connect to.

---

## Quick Start

```bash
npm install
cp .env.example .env      # edit if needed
npm start
```

Server runs on `http://localhost:3000` by default.

---

## Auth Flow

Kilo uses a **device authorization** pattern (similar to OAuth 2.0 Device Flow).

### 1. Start Login

```http
POST /auth/login
```

Response:
```json
{
  "code": "YYH5-SMMZ",
  "verificationUrl": "https://app.kilo.ai/device-auth?code=YYH5-SMMZ",
  "expiresIn": 599,
  "message": "Visit https://app.kilo.ai/device-auth?code=YYH5-SMMZ to authorize, then call GET /auth/poll/YYH5-SMMZ"
}
```

Open `verificationUrl` in a browser and approve the request.

---

### 2. Poll for Token

```http
GET /auth/poll/:code
```

This is a **long-poll** — the server polls Kilo every 3 seconds until approved or timed out.

Response on success:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 2592000,
  "user_id": "aa0fd5c7-...",
  "user_email": "you@example.com"
}
```

---

### 3. Use the Token

Pass the `access_token` as a Bearer token in all subsequent requests:

```http
Authorization: Bearer eyJ...
```

---

### 4. Refresh Token

```http
POST /auth/refresh
Authorization: Bearer eyJ...
```

Response: same shape as the poll response. The old token is revoked.

---

### 5. Logout

```http
POST /auth/logout
Authorization: Bearer eyJ...
```

Response:
```json
{ "message": "Logged out successfully" }
```

---

## Chat Completions

Standard OpenAI format — works with any OpenAI-compatible client.

```http
POST /v1/chat/completions
Authorization: Bearer eyJ...
Content-Type: application/json
```

```json
{
  "model": "kilo-auto/frontier",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": false,
  "max_tokens": 1024
}
```

### Streaming

Set `"stream": true` — the server pipes Kilo's SSE stream directly to the client.

```json
{
  "model": "kilo-auto/frontier",
  "messages": [{ "role": "user", "content": "Write a haiku" }],
  "stream": true
}
```

---

## Models

```http
GET /v1/models
Authorization: Bearer eyJ...
```

---

## Using with OpenAI SDK

```js
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'YOUR_WRAPPER_ACCESS_TOKEN',
});

const response = await client.chat.completions.create({
  model: 'kilo-auto/frontier',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(response.choices[0].message.content);
```

---

## Environment Variables

| Variable            | Default     | Description                                 |
|---------------------|-------------|---------------------------------------------|
| `PORT`              | `3000`      | HTTP port                                   |
| `WRAPPER_JWT_SECRET`| random UUID | Secret for signing wrapper JWTs             |
| `POLL_INTERVAL_MS`  | `3000`      | How often to poll Kilo during device auth   |
| `POLL_TIMEOUT_MS`   | `600000`    | Max wait time for device auth (10 min)      |

---

## Project Structure

```
src/
  index.js           – Express app entry point
  authRoutes.js      – /auth/* endpoints
  completionRoutes.js– /v1/* endpoints
  kiloClient.js      – Raw Kilo API calls
  middleware.js      – JWT auth middleware
  tokenStore.js      – In-memory token store
```
# openai-wrapper
