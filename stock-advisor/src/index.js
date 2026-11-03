import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fetchCloses, demoCloses, mapLimit } from './data.js';
import { buildCandidates, screen } from './screener.js';
import { backtest } from './backtest.js';
import { buildMessage, fmtPct, fmtPrice } from './message.js';
import { buildBrief, DEFAULT_RISK_RULES } from './brief.js';
import { SessionStore, diffSessions, today } from './sessions.js';
import { postmortem, buildReviewText } from './review.js';
import { TradeJournal, coach, buildCoachText } from './journal.js';
import { MARKETS, nextOpen, fmtKST } from './markets.js';
import { connect, listTools, sendToKakao } from './playmcp.js';

//   node src/index.js [--dry-run] [--demo] [--market kr|us] [--watch-only] [--top 3] [--brief]
//                     추천 + 관심 종목 신호 (+카톡 전송). --brief 면 모닝 브리핑 형식(방향·핵심 가격·볼 것·어제와 비교)
//   node src/index.js backtest [--demo] [--market kr|us] [--range 5y] [--watch-only]
//   node src/index.js review [--demo]                        5일·20일 전 신호 복기 (맞음/틀림/놓침/시장과 엇갈림)
//   node src/index.js trade add buy|sell 종목 가격 [--qty 10] [--stop 64000] [--reason "..."]   매매 기록
//   node src/index.js trade list | trade remove <id>
//   node src/index.js coach                                   매매 코칭 (반복 실수 → 다음 규칙)
//   node src/index.js check [--market kr|us]                  종목코드 조회 점검
//   node src/index.js tools                                   PlayMCP 도구 목록
//   node src/index.js next                                    다음 개장 알림 시각
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, def) => (args.includes(f) ? args[args.indexOf(f) + 1] : def);
const root = (f) => new URL(`../${f}`, import.meta.url);
const read = (f) => JSON.parse(readFileSync(root(f), 'utf8'));
const config = read('config.json');
const universe = read('universe.json');

// data/ 에 세션·매매 기록 저장 (git 제외)
const DATA_DIR = root('data/').pathname;
const fileAdapter = (name) => ({
  read: () => (existsSync(`${DATA_DIR}${name}`) ? JSON.parse(readFileSync(`${DATA_DIR}${name}`, 'utf8')) : null),
  write: (obj) => { mkdirSync(DATA_DIR, { recursive: true }); writeFileSync(`${DATA_DIR}${name}`, JSON.stringify(obj, null, 1)); },
});
const sessions = new SessionStore(fileAdapter('sessions.json'));
const journal = new TradeJournal(fileAdapter('trades.json'));

const market = opt('--market', 'all');
const includeUniverse = !has('--watch-only') && config.includeUniverse !== false;
const strategy = { ...config.strategy, topN: Number(opt('--top', config.strategy.topN)) };
const rules = { riskRules: DEFAULT_RISK_RULES, maxWeight: strategy.maxWeight, ...config.rules };
const demo = has('--demo');
const DAYS = { '2y': 520, '5y': 1300, '10y': 2600 };
const loader = (range) => (symbol) => (demo ? Promise.resolve(demoCloses(symbol, DAYS[range] ?? 520)) : fetchCloses(symbol, { ...config.history, range }));
const candidates = buildCandidates(config.watchlist, universe, market, includeUniverse);
const nameOf = (symbol) => [...universe.kr, ...universe.us, ...config.watchlist].find((u) => u.symbol === symbol)?.name ?? symbol;

async function runScreen() {
  if (!candidates.length) throw new Error('분석할 종목이 없습니다 (config.json watchlist / universe.json 확인)');
  return screen({ candidates, indices: universe.indices, strategy, load: loader(config.history.range) });
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

  if (args[0] === 'trade') {
    const sub = args[1];
    if (sub === 'add') {
      const [, , side, symbol, price] = args;
      const t = journal.add({
        side, symbol: symbol?.toUpperCase(), name: nameOf(symbol?.toUpperCase()), price: Number(price),
        qty: Number(opt('--qty', 1)), stop: opt('--stop') ? Number(opt('--stop')) : null, reason: opt('--reason', ''),
        signal: sessions.latest()?.signals.find((s) => s.symbol === symbol?.toUpperCase())?.action ?? null,
      });
      console.log(`📝 기록: ${t.date} ${t.side} ${t.name} ${t.price} ×${t.qty}${t.stop ? ` 손절 ${t.stop}` : ' (손절가 없음!)'}${t.reason ? ` · ${t.reason}` : ''} [${t.id}]`);
      return;
    }
    if (sub === 'remove') { journal.remove(args[2]); console.log('삭제했습니다'); return; }
    for (const t of journal.list()) console.log(`${t.date} ${t.side.padEnd(4)} ${t.name} ${t.price} ×${t.qty}${t.stop ? ` 손절 ${t.stop}` : ''}${t.reason ? ` · ${t.reason}` : ''} [${t.id}]`);
    if (!journal.list().length) console.log('기록 없음');
    return;
  }

  if (args[0] === 'coach') {
    const latest = sessions.latest();
    const signals = Object.fromEntries((latest?.signals ?? []).map((s) => [s.symbol, { action: s.action, regimeOk: latest.regimes?.[s.market]?.ok }]));
    console.log(buildCoachText(coach(journal.list(), { signals, rules })));
    return;
  }

  if (args[0] === 'review') {
    const windows = [5, 20];
    const past = windows.map((w) => sessions.atLeastDaysAgo(Math.round(w * 1.4)));
    const targets = [...new Set(past.filter(Boolean).flatMap((s) => s.signals.map((x) => x.symbol)))];
    if (!targets.length) { console.log(buildReviewText([])); return; }
    const load = loader('2y');
    const prices = {};
    await mapLimit(targets, 6, async (sym) => { try { prices[sym] = (await load(sym)).closes.at(-1); } catch { /* 제외 */ } });
    const indexPrices = {};
    for (const [mk, sym] of Object.entries(universe.indices)) { try { indexPrices[mk] = (await load(sym)).closes.at(-1); } catch { /* 제외 */ } }
    const reports = [];
    const used = [];
    past.forEach((s, i) => { if (s && !used.includes(s.date)) { used.push(s.date); reports.push(postmortem(s, prices, indexPrices)); } else if (s) reports.push(null); });
    console.log(buildReviewText(reports.filter(Boolean), { windows: windows.filter((_, i) => reports[i]) }));
    return;
  }

  if (args[0] === 'check') {
    const load = (symbol) => (demo ? Promise.resolve(demoCloses(symbol, 5)) : fetchCloses(symbol, { ...config.history, range: '5d' }));
    const targets = [...Object.values(universe.indices).map((symbol) => ({ symbol, name: '지수', market: '-' })), ...candidates];
    const bad = [];
    await mapLimit(targets, 6, async (c) => {
      try {
        const s = await load(c.symbol);
        console.log(`✅ ${c.symbol.padEnd(10)} ${c.name} (${s.currency}, 최근 ${s.closes.at(-1)})`);
      } catch (e) {
        bad.push(c);
        console.log(`❌ ${c.symbol.padEnd(10)} ${c.name} — ${e.message}`);
      }
    });
    console.log(`\n${targets.length - bad.length}/${targets.length} 조회 성공${bad.length ? ` · 실패: ${bad.map((b) => `${b.name}(${b.symbol})`).join(', ')}` : ''}`);
    if (bad.length) process.exit(2);
    return;
  }

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

  // 기본: 신호 분석 → 세션 저장 → 메시지 (--brief 면 모닝 브리핑 형식)
  const { results, regimes } = await runScreen();
  const m = MARKETS[market];
  const session = SessionStore.fromResults(results, regimes, { market });
  const prev = sessions.previous(session.date);
  if (!demo) sessions.save(session);
  const title = m ? `${m.flag} ${m.label} 개장` : '';
  const text = has('--brief')
    ? buildBrief(results, { title, regimes, diff: diffSessions(prev, session), riskRules: rules.riskRules })
    : buildMessage(results, { title, regimes });
  console.log(text);
  if (demo) console.log('\n(데모 시세라 세션은 저장하지 않았습니다)');
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
