import { readFileSync } from 'node:fs';
import { fetchCloses, demoCloses, marketOf } from './data.js';
import { analyze, rank } from './strategy.js';
import { backtest } from './backtest.js';
import { buildMessage, fmtPct } from './message.js';
import { MARKETS, nextOpen, fmtKST } from './markets.js';
import { connect, listTools, sendToKakao } from './playmcp.js';

//   node src/index.js [--dry-run] [--demo] [--market kr|us]   신호 분석 (+카톡 전송)
//   node src/index.js backtest [--demo] [--market kr|us] [--range 5y]
//   node src/index.js tools                                   PlayMCP 도구 목록
//   node src/index.js next                                    다음 개장 알림 시각
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, def) => (args.includes(f) ? args[args.indexOf(f) + 1] : def);
const config = JSON.parse(readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

const market = opt('--market', null);
const watchlist = market ? config.watchlist.filter((w) => marketOf(w.symbol) === market) : config.watchlist;

async function load(range = config.history.range) {
  return Promise.all(
    watchlist.map(async (w, i) => {
      try {
        const data = has('--demo') ? demoCloses(i + 7, range === '5y' ? 1300 : 520) : await fetchCloses(w.symbol, { ...config.history, range });
        return { ...w, ...data };
      } catch (e) {
        return { ...w, error: e.message };
      }
    }),
  );
}

async function analyzeAll() {
  const results = (await load()).map((s) => (s.error ? s : { ...s, ...analyze(s.closes, config.strategy) }));
  return rank(results, config.strategy);
}

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
  if (args[0] === 'backtest') {
    const series = (await load(opt('--range', '5y'))).filter((s) => !s.error);
    if (!series.length) throw new Error('시세를 가져온 종목이 없습니다');
    const bt = backtest(series, config.strategy);
    const row = (label, s) =>
      `${label.padEnd(10)} 총수익 ${fmtPct(s.total).padStart(8)}  CAGR ${fmtPct(s.cagr).padStart(7)}  MDD ${fmtPct(s.mdd).padStart(7)}  변동성 ${fmtPct(s.vol).padStart(6)}  샤프 ${s.sharpe.toFixed(2)}`;
    console.log(`📊 백테스트 ${series.map((s) => s.name).join(', ')} · ${fmtKST(bt.dates[0]).split(' 오')[0]} ~ ${fmtKST(bt.dates.at(-1)).split(' 오')[0]} (${bt.strategy.years.toFixed(1)}년)`);
    console.log(row('듀얼모멘텀', bt.strategy));
    console.log(row('균등보유', bt.buyHold));
    console.log(`리밸런싱 ${bt.rebalances.length}회 · 평균 투자비중 ${(bt.avgExposure * 100).toFixed(0)}% · 거래비용 ${config.strategy.costBps ?? 10}bp/편도`);
    return;
  }

  const results = await analyzeAll();
  const m = market ? MARKETS[market] : null;
  const text = buildMessage(results, new Date(), m ? `${m.flag} ${m.label} 개장` : '');
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
