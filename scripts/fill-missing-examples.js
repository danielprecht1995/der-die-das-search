#!/usr/bin/env node
// Fills nouns missing either example or exampleEn.

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.OPENAI_API_KEY || (() => {
  const configSrc = fs.readFileSync(path.join(__dirname, '../src/config.ts'), 'utf8');
  const keyMatch = configSrc.match(/OPENAI_API_KEY\s*=\s*['"]([^'"]*)['"]/);
  return keyMatch?.[1] ?? '';
})();
if (!API_KEY) {
  console.error('No API key found. Set OPENAI_API_KEY in env.');
  process.exit(1);
}
const NOUNS_PATH = path.join(__dirname, '../src/data/nouns.json');

const SYSTEM_PROMPT =
  'You are a German teacher. For each noun, write one short natural German example sentence ' +
  '(max 10 words, with correct definite article) and its English translation. Return ONLY JSON array:\n' +
  '[{"noun":"...","article":"...","example":"...","exampleEn":"..."}]';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArray(raw) {
  const cleaned = (raw ?? '').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  }
}

async function batchCall(batch) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(batch.map((n) => ({ noun: n.noun, article: n.article }))) },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return parseArray(data.choices?.[0]?.message?.content ?? '[]');
}

async function main() {
  const nouns = JSON.parse(fs.readFileSync(NOUNS_PATH, 'utf8'));
  const needs = nouns.filter((n) => !n.example || !n.exampleEn);
  console.log(`Need fill: ${needs.length}`);
  if (needs.length === 0) return;

  const byKey = new Map(nouns.map((n) => [`${n.noun}::${n.article}`, n]));
  const BATCH = 20;
  for (let i = 0; i < needs.length; i += BATCH) {
    const batch = needs.slice(i, i + BATCH);
    process.stdout.write(`\rBatch ${Math.floor(i / BATCH) + 1}/${Math.ceil(needs.length / BATCH)}   `);
    let out = [];
    try {
      out = await batchCall(batch);
    } catch (e) {
      process.stdout.write(`\nFailed batch: ${e.message}\n`);
      await sleep(2000);
      i -= BATCH;
      continue;
    }
    for (const r of out) {
      if (!r || !r.noun || !r.example || !r.exampleEn) continue;
      const key = `${r.noun}::${r.article}`;
      const entry = byKey.get(key);
      if (!entry) continue;
      entry.example = String(r.example).trim();
      entry.exampleEn = String(r.exampleEn).trim();
    }
    fs.writeFileSync(NOUNS_PATH, JSON.stringify([...byKey.values()], null, 2));
    await sleep(300);
  }
  process.stdout.write('\n');
}

main().catch((e) => {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
