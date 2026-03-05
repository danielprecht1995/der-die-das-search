#!/usr/bin/env node
// Expands nouns.json with ~50 nouns per category, then generates example sentences.
// Run: node scripts/expand-vocabulary.js

const fs   = require('fs');
const path = require('path');

const API_KEY = process.env.OPENAI_API_KEY || (() => {
  const configSrc = fs.readFileSync(path.join(__dirname, '../src/config.ts'), 'utf8');
  const keyMatch = configSrc.match(/OPENAI_API_KEY\s*=\s*['"]([^'"]*)['"]/);
  return keyMatch?.[1] ?? '';
})();
if (!API_KEY) {
  console.error('❌  No API key found. Set OPENAI_API_KEY in env.'); process.exit(1);
}
const NOUNS_PATH = path.join(__dirname, '../src/data/nouns.json');
const DELAY      = 400; // ms between calls

const CATEGORIES = [
  'body parts and anatomy',
  'food items and ingredients',
  'drinks and beverages',
  'kitchen utensils and appliances',
  'furniture and home decor',
  'household items and cleaning supplies',
  'clothing and accessories',
  'shoes and bags',
  'vehicles and transportation',
  'parts of a car',
  'tools and hardware',
  'garden and plants',
  'fruits and vegetables',
  'animals (pets and farm animals)',
  'wild animals and insects',
  'birds and fish',
  'nature and landscape',
  'weather and natural phenomena',
  'professions and jobs',
  'office and work supplies',
  'technology and electronics',
  'computer and internet terms',
  'sports and fitness',
  'sports equipment and venues',
  'music instruments and terms',
  'art and culture',
  'school and education',
  'science and research',
  'medicine and health',
  'emotions and personality traits (as nouns)',
  'family and relationships',
  'city and infrastructure',
  'buildings and architecture',
  'finance and business',
  'law and government',
  'travel and tourism',
  'religion and philosophy',
  'food preparation and cooking terms',
  'colors and materials (as nouns)',
  'time and calendar terms',
];

const NOUN_SYSTEM =
  'You are a German language expert. List exactly 50 common, useful German nouns for the given category. ' +
  'Include a variety of der/die/das genders. Do NOT include adjectives or verbs. ' +
  'Return ONLY a JSON array, no markdown:\n' +
  '[{"noun":"<Noun>","article":"<der|die|das>","plural":"<Plural>","english":"<short English>"}]';

const EXAMPLE_SYSTEM =
  'You are a German language teacher. For each noun, write ONE short natural example sentence ' +
  'in German (≤10 words, correct article) and its English translation. ' +
  'Return ONLY a JSON array:\n' +
  '[{"noun":"...","article":"...","example":"...","exampleEn":"..."}]';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callAI(systemPrompt, userContent) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini', temperature: 0.4,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  const raw  = (data.choices[0]?.message?.content ?? '[]').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : [];
  }
}

async function main() {
  let nouns = JSON.parse(fs.readFileSync(NOUNS_PATH, 'utf8'));
  const existingKeys = new Set(nouns.map(n => `${n.noun.toLowerCase()}::${n.article}`));
  console.log(`Starting with ${nouns.length} nouns.\n`);

  // ── Phase 1: fetch nouns per category ───────────────────────────────────
  let added = 0;
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    process.stdout.write(`[${i + 1}/${CATEGORIES.length}] ${cat} … `);
    let results;
    try {
      results = await callAI(NOUN_SYSTEM, cat);
    } catch (e) {
      console.log(`RETRY (${e.message})`);
      await sleep(3000);
      try { results = await callAI(NOUN_SYSTEM, cat); } catch { console.log('SKIP'); continue; }
    }

    let catAdded = 0;
    for (const r of results) {
      if (!r.noun || !['der','die','das'].includes(r.article) || !r.plural || !r.english) continue;
      const key = `${r.noun.toLowerCase()}::${r.article}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      nouns.push({ noun: r.noun, article: r.article, plural: r.plural, english: r.english });
      catAdded++;
      added++;
    }
    console.log(`+${catAdded} (total ${nouns.length})`);
    fs.writeFileSync(NOUNS_PATH, JSON.stringify(nouns, null, 2));
    await sleep(DELAY);
  }
  console.log(`\n✅  Phase 1 done. Added ${added} nouns. Total: ${nouns.length}\n`);

  // ── Phase 2: generate examples for new nouns ────────────────────────────
  const todo  = nouns.filter(n => !n.example);
  console.log(`Generating examples for ${todo.length} nouns…`);
  if (todo.length === 0) { console.log('Nothing to do.'); return; }

  const index  = new Map(nouns.map(n => [`${n.noun}::${n.article}`, n]));
  const BATCH  = 40;
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

  let exDone = 0, bIdx = 0;
  while (bIdx < batches.length) {
    const batch = batches[bIdx];
    process.stdout.write(`\rExamples batch ${bIdx + 1}/${batches.length}  (${exDone}/${todo.length})  `);
    try {
      const results = await callAI(EXAMPLE_SYSTEM, JSON.stringify(batch.map(n => ({ noun: n.noun, article: n.article }))));
      for (const r of results) {
        if (!r.noun || !r.example) continue;
        const art = r.article ?? batch.find(n => n.noun === r.noun)?.article;
        const entry = index.get(`${r.noun}::${art}`);
        if (entry) { entry.example = r.example; entry.exampleEn = r.exampleEn ?? ''; exDone++; }
      }
      fs.writeFileSync(NOUNS_PATH, JSON.stringify([...index.values()], null, 2));
      bIdx++;
    } catch (e) {
      process.stdout.write(`\n⚠️  ${e.message}, retry…\n`);
      await sleep(3000); continue;
    }
    await sleep(DELAY);
  }
  console.log(`\n\n✅  All done! ${nouns.length} nouns, ${exDone} new examples added.`);
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
