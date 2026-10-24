import { readFileSync } from 'node:fs';
import { fetchCloses, demoCloses } from './data.js';
import { analyze, rank } from './strategy.js';
import { buildMessage } from './message.js';
import { connect, listTools, sendToKakao } from './playmcp.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

async function analyzeAll() {
  const results = await Promise.all(
    config.watchlist.map(async (w, i) => {
      try {
        const { closes, currency } = has('--demo') ? demoCloses(i + 7) : await fetchCloses(w.symbol, config.history);
        return { name: w.name, symbol: w.symbol, currency, ...analyze(closes, config.strategy) };
      } catch (e) {
        return { name: w.name, symbol: w.symbol, error: e.message };
      }
    }),
  );
  return rank(results, config.strategy);
}

async function main() {
  if (args[0] === 'tools') {
    const client = await connect();
    for (const t of await listTools(client)) console.log(`- ${t.name}: ${t.description ?? ''}`);
    await client.close();
    return;
  }

  const text = buildMessage(await analyzeAll());
  console.log(text);
  if (has('--dry-run')) return;

  const client = await connect();
  try {
    await sendToKakao(client, text);
    console.log('\n✅ 카카오톡으로 전송했습니다.');
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exit(1);
});
