import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore, diffSessions, addDays } from '../src/sessions.js';
import { buildBrief } from '../src/brief.js';
import { gradeSignal, postmortem, buildReviewText } from '../src/review.js';
import { TradeJournal, pairTrades, coach, buildCoachText } from '../src/journal.js';
import { analyze, rank } from '../src/strategy.js';
import { demoCloses } from '../src/data.js';

const mem = () => { let d = null; return { read: () => d, write: (x) => { d = JSON.parse(JSON.stringify(x)); } }; };
const demoResults = () => rank(Array.from({ length: 6 }, (_, i) => ({ name: `종목${i}`, symbol: `T${i}`, sector: `S${i % 3}`, market: 'kr', currency: 'KRW', watch: i < 2, ...analyze(demoCloses(i + 7).closes) })), { topN: 2 }, { kr: { ok: true } });

test('analyze: 방향(bias)·지지/저항·볼 것', () => {
  const r = analyze(Array.from({ length: 300 }, (_, i) => 100 + i));
  assert.equal(r.bias, '상승');
  assert.match(r.biasDetail, /20EMA 위/);
  assert.ok(r.support.every((l) => l.price < r.price) && r.resistance.every((l) => l.price >= r.price));
  assert.equal(analyze(Array.from({ length: 300 }, (_, i) => 400 - i)).bias, '하락');
});

test('SessionStore: 저장·병합·이전 세션·N일 전', () => {
  const store = new SessionStore(mem());
  const results = demoResults();
  store.save(SessionStore.fromResults(results, { kr: { ok: true, label: '상승 추세', price: 100 } }, { date: '2026-11-01', market: 'kr' }));
  store.save({ date: '2026-11-01', market: 'us', regimes: { us: { ok: false, price: 50 } }, signals: [{ symbol: 'AAPL', name: '애플', action: '관망', bias: '중립', price: 10 }] });
  const s = store.get('2026-11-01');
  assert.equal(s.market, 'all');
  assert.ok(s.signals.some((x) => x.symbol === 'AAPL') && s.signals.some((x) => x.symbol === 'T0'));
  assert.ok(s.regimes.kr && s.regimes.us);
  store.save({ date: '2026-11-10', market: 'kr', regimes: {}, signals: [] });
  assert.equal(store.previous('2026-11-10').date, '2026-11-01');
  assert.equal(store.atLeastDaysAgo(7, '2026-11-10').date, '2026-11-01');
  assert.equal(store.atLeastDaysAgo(30, '2026-11-10'), null);
  assert.equal(addDays('2026-11-01', -7), '2026-10-25');
});

test('diffSessions: 액션/방향 변화와 추천 진입·이탈', () => {
  const prev = { date: '2026-11-01', signals: [{ symbol: 'A', name: 'A', action: '관망', bias: '중립', price: 100, pick: false, watch: true }, { symbol: 'B', name: 'B', action: '매수 관심', bias: '상승', price: 50, pick: true }] };
  const curr = { date: '2026-11-02', signals: [{ symbol: 'A', name: 'A', action: '매수 관심', bias: '상승', price: 110, pick: true, watch: true }, { symbol: 'B', name: 'B', action: '보유', bias: '상승', price: 49, pick: false }] };
  const d = diffSessions(prev, curr);
  assert.equal(d.changed.length, 2);
  assert.deepEqual(d.changed[0].items, ['관망→매수 관심', '방향 중립→상승']);
  assert.equal(d.newPicks[0].symbol, 'A');
  assert.equal(d.droppedPicks[0].symbol, 'B');
  assert.equal(diffSessions(null, curr), null);
});

test('buildBrief: 방향·지지/저항·볼 것·어제와 비교·위험 규칙', () => {
  const results = demoResults();
  const session = SessionStore.fromResults(results, {}, { date: '2026-11-02' });
  const prev = { date: '2026-11-01', signals: session.signals.map((s) => ({ ...s, action: '관망', bias: '중립' })) };
  const text = buildBrief(results, { title: '🇰🇷 한국장', regimes: { kr: { ok: true, label: '상승 추세', detail: '' } }, diff: diffSessions(prev, session) });
  assert.match(text, /모닝 브리핑/);
  assert.match(text, /📋 관심 종목/);
  assert.match(text, /지지 .* · 저항/);
  assert.match(text, /볼 것:/);
  assert.match(text, /🔁 2026-11-01 대비/);
  assert.match(text, /🛡 위험 규칙/);
  assert.match(buildBrief(results, {}), /비교할 이전 세션이 없습니다/);
});

test('gradeSignal: 맞음/틀림/놓침/시장과 엇갈림/보합', () => {
  assert.equal(gradeSignal({ action: '매수 관심', price: 100 }, 105).outcome, '맞음');
  assert.equal(gradeSignal({ action: '매수 관심', price: 100 }, 95).outcome, '틀림');
  assert.equal(gradeSignal({ action: '매수 관심', price: 100 }, 95, -0.06).outcome, '시장과 엇갈림');
  assert.equal(gradeSignal({ action: '관망', price: 100 }, 96).outcome, '맞음');
  assert.equal(gradeSignal({ action: '관망', price: 100 }, 105).outcome, '놓침');
  assert.equal(gradeSignal({ action: '관망', price: 100 }, 100.5).outcome, '보합');
});

test('postmortem + buildReviewText', () => {
  const session = { date: '2026-10-20', regimes: { kr: { price: 100 } }, signals: [
    { symbol: 'A', name: 'A', market: 'kr', action: '매수 관심', price: 100, pick: true },
    { symbol: 'B', name: 'B', market: 'kr', action: '관망', price: 100, watch: true },
    { symbol: 'C', name: 'C', market: 'kr', action: '보유', price: 100 },
  ] };
  const rep = postmortem(session, { A: 110, B: 90, C: 100 }, { kr: 102 });
  assert.equal(rep.n, 3);
  assert.equal(rep.counts['맞음'], 2);
  assert.equal(rep.counts['보합'], 1);
  assert.ok(Math.abs(rep.avgRet.picks - 0.1) < 1e-9);
  assert.ok(Math.abs(rep.indexRets.kr - 0.02) < 1e-9);
  const text = buildReviewText([rep], { windows: [5] });
  assert.match(text, /적중률 67%/);
  assert.match(text, /✅ A 매수 관심 → \+10.0%/);
  assert.match(buildReviewText([]), /채점할 과거 세션이 없습니다/);
});

test('TradeJournal + pairTrades + coach', () => {
  const j = new TradeJournal(mem());
  j.add({ side: 'buy', symbol: 'A', name: 'A', price: 100, qty: 10, stop: 90, reason: '추세', date: '2026-10-01' });
  j.add({ side: 'buy', symbol: 'B', name: 'B', price: 100, qty: 100, date: '2026-10-02' });
  j.add({ side: 'sell', symbol: 'A', name: 'A', price: 120, qty: 10, date: '2026-10-15' });
  j.add({ side: 'sell', symbol: 'B', name: 'B', price: 70, qty: 100, date: '2026-10-20' });
  assert.throws(() => j.add({ side: 'buy' }), /필수/);
  const { closed, open } = pairTrades(j.list());
  assert.equal(closed.length, 2);
  assert.equal(open.length, 0);
  assert.ok(Math.abs(closed[0].pnlPct - 0.2) < 1e-9);
  const rep = coach(j.list(), { signals: { B: { action: '관망', regimeOk: false } }, rules: { capital: 5000, maxWeight: 0.4 } });
  assert.equal(rep.closed.length, 2);
  assert.equal(rep.wins, 1);
  for (const k of ['noStop', 'noReason', 'againstSignal', 'weakMarket', 'overWeight']) assert.equal(rep.counts[k], 1, k);
  assert.equal(rep.counts.stopNotHonored, undefined); // B 는 손절가 자체가 없음
  assert.ok(rep.nextRules.length >= 1);
  const text = buildCoachText(rep);
  assert.match(text, /매수 2건 · 완료 2건 \(승 1\)/);
  assert.match(text, /다음 매매 규칙/);
  assert.match(buildCoachText(coach([])), /기록된 매수가 없습니다/);
});
