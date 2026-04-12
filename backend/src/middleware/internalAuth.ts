import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

function secureCompare(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function extractApiKey(req: Request): string | null {
  const explicitKey = req.header('x-internal-api-key');
  if (explicitKey) {
    return explicitKey;
  }

  const authHeader = req.header('authorization');
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) {
    return token;
  }

  return null;
}

export function requireInternalApiKey(req: Request, res: Response, next: NextFunction) {
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    return res.status(503).json({
      error: 'ConfigurationError',
      message: 'INTERNAL_API_KEY is not configured on the server'
    });
  }

  const providedKey = extractApiKey(req);
  if (!providedKey || !secureCompare(expectedKey, providedKey)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid internal API key'
    });
  }

  return next();
}
