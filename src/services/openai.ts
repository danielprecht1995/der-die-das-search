import type { GermanNoun } from '../types';
import { AI_PROXY_BASE_URL } from '../config';

function ensureProxyConfigured() {
  const base = AI_PROXY_BASE_URL?.trim();
  if (!base) {
    throw new Error('AI backend is not configured. Set AI_PROXY_BASE_URL in src/config.ts.');
  }
  return base.replace(/\/$/, '');
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const base = ensureProxyConfigured();
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `HTTP ${response.status}`);
  }
  return body as T;
}

export async function lookupMoreNounsWithAI(
  prefix: string
): Promise<GermanNoun[]> {
  const data = await postJson<{ nouns: GermanNoun[] }>('/lookup-more', { prefix: prefix.trim() });
  return Array.isArray(data.nouns) ? data.nouns : [];
}

export async function lookupNounWithAI(
  input: string
): Promise<GermanNoun> {
  const data = await postJson<{ noun?: GermanNoun; error?: string }>('/lookup-noun', { input: input.trim() });
  if (data.error || !data.noun) {
    throw new Error(data.error ?? 'AI backend returned incomplete data.');
  }
  return data.noun;
}
