#!/usr/bin/env node
// Expands nouns.json until it reaches TARGET nouns, then adds examples.
// Run: node scripts/expand-to-5000.js

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
const TARGET = 5200;
const ADD_BATCH_SIZE = 80;
const EXAMPLE_BATCH_SIZE = 40;
const DELAY_MS = 300;

const TOPICS = [
  'astronomy terms',
  'geology and minerals',
  'oceanography',
  'meteorology',
  'physics laboratory equipment',
  'chemistry laboratory equipment',
  'biology and botany',
  'genetics and microbiology',
  'medical specialties',
  'hospital departments',
  'dental and orthodontics',
  'pharmacy terms',
  'psychology and psychiatry',
  'surgery instruments',
  'emergency medicine',
  'anatomy detailed terms',
  'legal procedure terms',
  'courtroom terminology',
  'tax and accounting terms',
  'banking and credit terms',
  'insurance terminology',
  'stock market and trading',
  'supply chain and logistics',
  'manufacturing processes',
  'quality management',
  'project management',
  'software engineering nouns',
  'cybersecurity terms',
  'networking hardware',
  'database terminology',
  'cloud computing nouns',
  'machine learning nouns',
  'electronics components',
  'robotics terms',
  'automotive engineering',
  'aviation and aerospace',
  'railway transport',
  'shipping and maritime',
  'construction site terms',
  'architecture interior terms',
  'urban planning',
  'renewable energy',
  'oil and gas industry',
  'agriculture machinery',
  'forestry terms',
  'fishing industry',
  'textile industry',
  'printing and publishing',
  'photography equipment',
  'film production terms',
  'audio engineering',
  'music theory nouns',
  'theater and stage terms',
  'dance terminology',
  'fine arts materials',
  'museum terminology',
  'archaeology terms',
  'history and historiography',
  'philosophy concepts',
  'linguistics nouns',
  'grammar terminology',
  'literary analysis nouns',
  'education administration',
  'university life',
  'classroom objects advanced',
  'sports medicine',
  'winter sports terms',
  'water sports terms',
  'martial arts nouns',
  'fitness equipment advanced',
  'outdoor and camping gear',
  'mountaineering terms',
  'hunting terms',
  'gardening advanced terms',
  'indoor plants and care',
  'cooking techniques nouns',
  'baking nouns advanced',
  'wine and viticulture',
  'coffee culture terms',
  'beer brewing terms',
  'restaurant management',
  'hotel management',
  'travel documentation',
  'airport and customs',
  'public administration',
  'election and politics',
  'military terms',
  'police and investigation',
  'firefighting terms',
  'religion detailed nouns',
  'mythology nouns',
  'climate change terms',
  'waste management',
  'recycling and sustainability',
  'furniture design',
  'home renovation',
  'plumbing terminology',
  'electrical installation',
  'HVAC terminology',
  'tools advanced terms',
  'materials engineering',
  'ceramics and pottery',
  'woodworking nouns',
  'metalworking nouns',
  'jewelry making',
  'fashion design terms',
  'cosmetics and skincare',
  'hairdressing nouns',
  'childcare and parenting',
  'wedding and events',
  'social media nouns',
  'telecommunications nouns',
  'office bureaucracy terms',
  'human resources',
  'sales and marketing nouns',
  'customer support terms',
  'entrepreneurship nouns',
  'startup and venture terms',
  'ethics and values nouns',
  'abstract academic nouns',
];

const NOUN_SYSTEM_PROMPT =
  'You are a German language lexicon expert. ' +
  `Return EXACTLY ${ADD_BATCH_SIZE} useful German nouns for the requested topic. ` +
  'Prioritize nouns that are less basic and more topic-specific to reduce overlap with common beginner lists. ' +
  'Do not include adjectives, verbs, abbreviations, or proper names. ' +
  'Use a mix of der/die/das. ' +
  'Return ONLY valid JSON array, no markdown:\n' +
  '[{"noun":"<Noun>","article":"<der|die|das>","plural":"<Plural>","english":"<short English>"}]';

const EXAMPLE_SYSTEM_PROMPT =
  'You are a German teacher. For each noun, write one short natural example sentence in German ' +
  '(max 10 words, with correct definite article) and its English translation. ' +
  'Return ONLY a JSON array:\n' +
  '[{"noun":"...","article":"...","example":"...","exampleEn":"..."}]';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonArray(raw) {
  const cleaned = (raw ?? '')
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

async function callChat(messages) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '[]';
}

async function fetchTopicNouns(topic, pass) {
  const userPrompt = `Topic: ${topic}. Pass ${pass}.`;
  const raw = await callChat([
    { role: 'system', content: NOUN_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);
  const parsed = parseJsonArray(raw);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(
      (x) =>
        x &&
        typeof x.noun === 'string' &&
        typeof x.article === 'string' &&
        ['der', 'die', 'das'].includes(x.article) &&
        typeof x.plural === 'string' &&
        typeof x.english === 'string'
    )
    .map((x) => ({
      noun: x.noun.trim(),
      article: x.article.trim(),
      plural: x.plural.trim(),
      english: x.english.trim(),
    }))
    .filter((x) => x.noun && x.plural && x.english);
}

async function addExamples(nouns) {
  const todo = nouns.filter((n) => !n.example);
  if (todo.length === 0) {
    console.log('No missing examples to generate.');
    return nouns;
  }

  console.log(`Generating examples for ${todo.length} nouns...`);
  const index = new Map(nouns.map((n) => [`${n.noun}::${n.article}`, n]));
  const batches = [];
  for (let i = 0; i < todo.length; i += EXAMPLE_BATCH_SIZE) {
    batches.push(todo.slice(i, i + EXAMPLE_BATCH_SIZE));
  }

  let done = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`\rExamples ${i + 1}/${batches.length} (${done}/${todo.length})`);

    try {
      const raw = await callChat([
        { role: 'system', content: EXAMPLE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: JSON.stringify(batch.map((n) => ({ noun: n.noun, article: n.article }))),
        },
      ]);
      const parsed = parseJsonArray(raw);
      if (Array.isArray(parsed)) {
        for (const r of parsed) {
          if (!r || !r.noun || !r.example) continue;
          const art = r.article ?? batch.find((n) => n.noun === r.noun)?.article;
          const entry = index.get(`${r.noun}::${art}`);
          if (!entry) continue;
          entry.example = String(r.example).trim();
          entry.exampleEn = String(r.exampleEn ?? '').trim();
          done++;
        }
      }
      fs.writeFileSync(NOUNS_PATH, JSON.stringify([...index.values()], null, 2));
    } catch (e) {
      process.stdout.write(`\nExample batch ${i + 1} failed: ${e.message}. Retrying...\n`);
      i--;
      await sleep(2000);
      continue;
    }

    await sleep(DELAY_MS);
  }

  process.stdout.write('\n');
  return [...index.values()];
}

async function main() {
  let nouns = JSON.parse(fs.readFileSync(NOUNS_PATH, 'utf8'));
  const seen = new Set(nouns.map((n) => `${n.noun.toLowerCase()}::${n.article}`));
  console.log(`Starting nouns: ${nouns.length}`);

  let pass = 1;
  let topicIndex = 0;
  let stagnation = 0;

  while (nouns.length < TARGET) {
    const topic = TOPICS[topicIndex % TOPICS.length];
    process.stdout.write(
      `[Add] topic ${topicIndex + 1} (${topic}) pass ${pass} ... `
    );

    let list = [];
    try {
      list = await fetchTopicNouns(topic, pass);
    } catch (e) {
      console.log(`error: ${e.message}`);
      await sleep(1500);
      topicIndex++;
      if (topicIndex % TOPICS.length === 0) pass++;
      continue;
    }

    let added = 0;
    for (const item of list) {
      const key = `${item.noun.toLowerCase()}::${item.article}`;
      if (seen.has(key)) continue;
      seen.add(key);
      nouns.push(item);
      added++;
    }

    fs.writeFileSync(NOUNS_PATH, JSON.stringify(nouns, null, 2));
    console.log(`+${added} -> ${nouns.length}`);

    if (added === 0) stagnation++;
    else stagnation = 0;

    if (stagnation >= 25) {
      console.log('Stopping early due to repeated zero-add batches.');
      break;
    }

    topicIndex++;
    if (topicIndex % TOPICS.length === 0) pass++;
    await sleep(DELAY_MS);
  }

  nouns = await addExamples(nouns);
  fs.writeFileSync(NOUNS_PATH, JSON.stringify(nouns, null, 2));

  const finalSeen = new Set();
  let dupes = 0;
  for (const n of nouns) {
    const key = `${n.noun.toLowerCase()}::${n.article}`;
    if (finalSeen.has(key)) dupes++;
    else finalSeen.add(key);
  }

  console.log(`Done. Total nouns: ${nouns.length}. Unique noun::article keys: ${finalSeen.size}. Duplicates: ${dupes}`);
  if (nouns.length < TARGET) {
    console.log(`Target not reached (${TARGET}). Consider adding more topics and rerunning.`);
  }
}

main().catch((e) => {
  console.error('\nFatal:', e.message);
  process.exit(1);
});
