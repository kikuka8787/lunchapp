import { readFileSync } from 'node:fs';
import { fetchCloses, demoCloses, mapLimit } from './data.js';
import { buildCandidates, screen } from './screener.js';
import { backtest } from './backtest.js';
import { buildMessage, fmtPct } from './message.js';
import { MARKETS, nextOpen, fmtKST } from './markets.js';
import { connect, listTools, sendToKakao } from './playmcp.js';

//   node src/index.js [--dry-run] [--demo] [--market kr|us] [--watch-only] [--top 3]   추천 + 관심 종목 신호 (+카톡 전송)
//   node src/index.js backtest [--demo] [--market kr|us] [--range 5y] [--watch-only]
//   node src/index.js tools                                   PlayMCP 도구 목록
//   node src/index.js next                                    다음 개장 알림 시각
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, def) => (args.includes(f) ? args[args.indexOf(f) + 1] : def);
const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const config = read('config.json');
const universe = read('universe.json');

const market = opt('--market', 'all');
const includeUniverse = !has('--watch-only') && config.includeUniverse !== false;
const strategy = { ...config.strategy, topN: Number(opt('--top', config.strategy.topN)) };
const demo = has('--demo');
const DAYS = { '2y': 520, '5y': 1300, '10y': 2600 };
const loader = (range) => (symbol) => (demo ? Promise.resolve(demoCloses(symbol, DAYS[range] ?? 520)) : fetchCloses(symbol, { ...config.history, range }));
const candidates = buildCandidates(config.watchlist, universe, market, includeUniverse);

async function main() {
  if (args[0] === 'tools') {
    const client = await connect();
    for (const t of await listTools(client)) console.log(`- ${t.name}: ${t.description ?? ''}`);
    await client.close();
    return;
  }
  if (args[0] === 'next') {
    for (const [k, m] of Object.entries(MARKETS)) console.log(`${m.flag} ${m.label}: ${fmtKST(nextOpen(k))} (KST)`);
    return;
  }
  if (!candidates.length) throw new Error('분석할 종목이 없습니다 (config.json watchlist / universe.json 확인)');

  if (args[0] === 'backtest') {
    const range = opt('--range', '5y');
    const load = loader(range);
    const series = (await mapLimit(candidates, 6, async (c) => {
      try { return { ...c, ...(await load(c.symbol)) }; } catch (e) { console.error(`  (제외) ${e.message}`); return null; }
    })).filter(Boolean);
    if (!series.length) throw new Error('시세를 가져온 종목이 없습니다');
    const indexSeries = {};
    for (const mk of new Set(series.map((s) => s.market))) {
      try { indexSeries[mk] = await load(universe.indices[mk]); } catch (e) { console.error(`  (지수 제외) ${e.message}`); }
    }
    const bt = backtest(series, strategy, indexSeries);
    const day = (ms) => new Date(ms).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short' });
    const row = (label, s) =>
      `${label.padEnd(10)} 총수익 ${fmtPct(s.total).padStart(8)}  CAGR ${fmtPct(s.cagr).padStart(7)}  MDD ${fmtPct(s.mdd).padStart(7)}  변동성 ${fmtPct(s.vol, 0).padStart(5)}  샤프 ${s.sharpe.toFixed(2)}`;
    console.log(`📊 백테스트 ${series.length}종목 (${market === 'all' ? '전체' : MARKETS[market].label}${includeUniverse ? ' 유니버스+관심' : ' 관심 종목만'}) · ${day(bt.dates[0])} ~ ${day(bt.dates.at(-1))} (${bt.strategy.years.toFixed(1)}년)${demo ? ' · 데모 시세' : ''}`);
    console.log(row('전략', bt.strategy));
    console.log(row('균등보유', bt.buyHold));
    console.log(`리밸런싱 ${bt.rebalances.length}회 · 평균 투자비중 ${(bt.avgExposure * 100).toFixed(0)}% · 거래비용 ${strategy.costBps ?? 10}bp/편도`);
    const last = bt.rebalances.at(-1);
    console.log(`최근 리밸런싱(${day(last.date)}) 보유: ${last.picks.map((p) => `${p.name} ${(p.weight * 100).toFixed(0)}%`).join(', ') || '현금'}`);
    return;
  }

  const { results, regimes } = await screen({ candidates, indices: universe.indices, strategy, load: loader(config.history.range) });
  const m = MARKETS[market];
  const text = buildMessage(results, { title: m ? `${m.flag} ${m.label} 개장` : '', regimes });
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
