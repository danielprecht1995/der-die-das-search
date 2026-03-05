#!/usr/bin/env node
// One-time script: adds example + exampleEn to every noun in nouns.json
// Run with: node scripts/generate-examples.js

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.OPENAI_API_KEY || (() => {
  const configPath = path.join(__dirname, '../src/config.ts');
  const configSrc = fs.readFileSync(configPath, 'utf8');
  const keyMatch = configSrc.match(/OPENAI_API_KEY\s*=\s*['"]([^'"]*)['"]/);
  return keyMatch?.[1] ?? '';
})();
if (!API_KEY) {
  console.error('❌  No API key found. Set OPENAI_API_KEY in env before running this script.');
  process.exit(1);
}

const NOUNS_PATH = path.join(__dirname, '../src/data/nouns.json');
const BATCH_SIZE = 40;
const DELAY_MS  = 350;

const SYSTEM_PROMPT =
  'You are a German language teacher. ' +
  'For each noun given, write ONE short, natural example sentence in German ' +
  '(≤10 words, using the correct definite article) and its English translation. ' +
  'Return ONLY a JSON array, no markdown:\n' +
  '[{"noun":"...","article":"...","example":"...","exampleEn":"..."}]';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processBatch(batch) {
  const input = batch.map(n => ({ noun: n.noun, article: n.article }));
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: JSON.stringify(input) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices[0]?.message?.content?.trim() ?? '[]';

  // Tolerate the model wrapping in a code-fence
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : [];
  }
}

async function main() {
  const nouns = JSON.parse(fs.readFileSync(NOUNS_PATH, 'utf8'));

  const todo = nouns.filter(n => !n.example);
  console.log(`Nouns total: ${nouns.length}  |  already done: ${nouns.length - todo.length}  |  to do: ${todo.length}`);

  if (todo.length === 0) {
    console.log('✅  Nothing to do!');
    return;
  }

  // Index by "noun::article" for fast updates
  const index = new Map(nouns.map(n => [`${n.noun}::${n.article}`, n]));

  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) batches.push(todo.slice(i, i + BATCH_SIZE));

  let done = 0;
  let batchIdx = 0;

  while (batchIdx < batches.length) {
    const batch = batches[batchIdx];
    process.stdout.write(`\rBatch ${batchIdx + 1}/${batches.length}  (${done}/${todo.length} nouns done)  `);

    try {
      const results = await processBatch(batch);

      for (const r of results) {
        if (!r.noun || !r.example) continue;
        // Match by noun+article when the AI echoes it, else fall back to noun name within batch
        const article = r.article ?? batch.find(n => n.noun === r.noun)?.article;
        const key = `${r.noun}::${article}`;
        const entry = index.get(key);
        if (entry) {
          entry.example   = r.example;
          entry.exampleEn = r.exampleEn ?? '';
          done++;
        }
      }

      // Save progress after every batch
      fs.writeFileSync(NOUNS_PATH, JSON.stringify([...index.values()], null, 2));
      batchIdx++;
    } catch (err) {
      process.stdout.write(`\n⚠️  Batch ${batchIdx + 1} failed (${err.message}), retrying in 3 s…\n`);
      await sleep(3000);
      continue;
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n\n✅  Done! ${done} example sentences added.`);
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
