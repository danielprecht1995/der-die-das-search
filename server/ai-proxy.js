const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const AI_PROXY_TOKEN = process.env.AI_PROXY_TOKEN || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-nano';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 25000);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 60);
const rateLimitMap = new Map();

const SYSTEM_PROMPT = `You are a German grammar expert. When given a German noun, respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{"noun":"<noun with correct capitalisation>","article":"<der|die|das>","plural":"<plural form>","english":"<short English translation>","example":"<one short example sentence in German using this noun with its article>","exampleEn":"<English translation of the example sentence>"}
If the input is not a valid German noun, respond with: {"error":"not a noun"}`;

const MORE_SYSTEM_PROMPT = `You are a German grammar expert. List up to 3 common German nouns that START WITH the given prefix (case-insensitive). Return ONLY a JSON array (no markdown, no explanation):
[{"noun":"<capitalised noun>","article":"<der|die|das>","plural":"<plural>","english":"<short English translation>","example":"<one short example sentence in German using this noun with its article>","exampleEn":"<English translation of the example sentence>"}]
If no nouns start with this prefix, return an empty array: []`;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-ai-proxy-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  });
  res.end(body);
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return req.socket?.remoteAddress || 'unknown';
}

function isRateLimited(key) {
  const now = Date.now();
  const current = rateLimitMap.get(key);
  if (!current || now - current.start >= RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { count: 1, start: now });
    return false;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) return true;
  current.count += 1;
  return false;
}

function isAuthorized(req) {
  if (!AI_PROXY_TOKEN) return true;
  const incoming = String(req.headers['x-ai-proxy-token'] || '').trim();
  return incoming && incoming === AI_PROXY_TOKEN;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 200_000) {
        reject(new Error('Payload too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeNoun(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.error) return { error: 'That does not appear to be a valid German noun.' };

  const article = payload.article;
  if (!payload.noun || !['der', 'die', 'das'].includes(article) || !payload.plural || !payload.english) {
    return { error: 'AI returned incomplete noun data.' };
  }

  return {
    noun: {
      noun: payload.noun,
      article,
      plural: payload.plural,
      english: payload.english,
      example: payload.example,
      exampleEn: payload.exampleEn,
    },
  };
}

function normalizeNounList(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .filter((item) =>
      item && item.noun && ['der', 'die', 'das'].includes(item.article) && item.plural && item.english
    )
    .map((item) => ({
      noun: item.noun,
      article: item.article,
      plural: item.plural,
      english: item.english,
      example: item.example,
      exampleEn: item.exampleEn,
    }))
    .slice(0, 3);
}

async function callOpenAI(messages) {
  if (!OPENAI_API_KEY) {
    throw new Error('Server is missing OPENAI_API_KEY.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error('OpenAI request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `OpenAI HTTP ${response.status}`;
    throw new Error(message);
  }

  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty AI response.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('AI returned non-JSON content.');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
    sendJson(res, 200, { ok: true, service: 'ai-proxy' });
    return;
  }

  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: 'Unauthorized.' });
      return;
    }
    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
      sendJson(res, 429, { error: 'Too many requests. Please try again shortly.' });
      return;
    }

    const body = await parseBody(req);

    if (url.pathname === '/api/lookup-noun') {
      const input = String(body.input || '').trim();
      if (!input) {
        sendJson(res, 400, { error: 'Missing input.' });
        return;
      }

      const parsed = await callOpenAI([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ]);
      const normalized = normalizeNoun(parsed);
      if (!normalized || normalized.error) {
        sendJson(res, 400, { error: normalized?.error || 'Invalid noun response.' });
        return;
      }
      sendJson(res, 200, normalized);
      return;
    }

    if (url.pathname === '/api/lookup-more') {
      const prefix = String(body.prefix || '').trim();
      if (!prefix) {
        sendJson(res, 400, { error: 'Missing prefix.' });
        return;
      }

      const parsed = await callOpenAI([
        { role: 'system', content: MORE_SYSTEM_PROMPT },
        { role: 'user', content: prefix },
      ]);
      sendJson(res, 200, { nouns: normalizeNounList(parsed) });
      return;
    }

    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`[ai-proxy] Listening on http://localhost:${PORT}`);
});
