/**
 * Middleware: authenticate wrapper JWT and attach kiloToken to req
 */

import { verifyWrapperToken } from './authRoutes.js';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      error: {
        message: 'Missing Authorization Bearer token',
        type: 'authentication_error',
        code: 'missing_token',
      },
    });
  }

  try {
    const decoded = verifyWrapperToken(token);
    req.auth = decoded; // { kiloToken, userId, userEmail, jti }
    next();
  } catch (err) {
    return res.status(401).json({
      error: {
        message: 'Invalid or expired token',
        type: 'authentication_error',
        code: 'invalid_token',
        detail: err.message,
      },
    });
  }
}
