import express from 'express';

const router = express.Router();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const TIMEOUT_MS = 120_000;

async function proxyToAiService(
  aiPath: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const options: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    };

    if (method === 'POST' && body !== undefined) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${AI_SERVICE_URL}${aiPath}`, options);
    const json = (await response.json()) as Record<string, unknown>;

    return { status: response.status, data: json.data ?? json };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'AI service unavailable';
    return { status: 503, data: { error: message } };
  } finally {
    clearTimeout(timer);
  }
}

// ── Chat endpoint ────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { status, data } = await proxyToAiService('/ai/chat', 'POST', req.body);
  return res.status(status).json({ data });
});

// ── Insight endpoints ────────────────────────────────────────────
router.post('/insights/fleet', async (req, res) => {
  const { status, data } = await proxyToAiService('/ai/insights/fleet', 'POST', req.body);
  return res.status(status).json({ data });
});

router.post('/insights/shipment', async (req, res) => {
  const { status, data } = await proxyToAiService('/ai/insights/shipment', 'POST', req.body);
  return res.status(status).json({ data });
});

router.post('/insights/disruption', async (req, res) => {
  const { status, data } = await proxyToAiService('/ai/insights/disruption', 'POST', req.body);
  return res.status(status).json({ data });
});

router.post('/insights/briefing', async (req, res) => {
  const { status, data } = await proxyToAiService('/ai/insights/briefing', 'POST', req.body);
  return res.status(status).json({ data });
});

// ── Agent endpoints ──────────────────────────────────────────────
router.post('/agent/run', async (req, res) => {
  const { status, data } = await proxyToAiService('/ai/agent/run', 'POST', req.body);
  return res.status(status).json({ data });
});

router.get('/agent/history', async (req, res) => {
  const limit = req.query.limit || '10';
  const { status, data } = await proxyToAiService(`/ai/agent/history?limit=${limit}`, 'GET');
  return res.status(status).json({ data });
});

export default router;
