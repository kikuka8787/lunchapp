import { test } from 'node:test';
import assert from 'node:assert/strict';
import { align, backtest, stats } from '../src/backtest.js';
import { demoCloses, marketOf } from '../src/data.js';
import { nextOpen, zonedTime, MARKETS } from '../src/markets.js';

test('align: 날짜 합집합 위에 직전 종가로 채우고 공통 시작점부터', () => {
  const a = { dates: [1, 2, 3], closes: [10, 11, 12] };
  const b = { dates: [2, 4], closes: [20, 21] };
  const r = align([a, b]);
  assert.deepEqual(r.dates, [2, 3, 4]);
  assert.deepEqual(r.closes, [[11, 12, 12], [20, 20, 21]]);
});

test('stats: 2배가 되면 총수익 100%, 낙폭 계산', () => {
  const day = 86400e3;
  const s = stats([1, 1.5, 1.2, 2], [0, 100 * day, 200 * day, 365.25 * day]);
  assert.ok(Math.abs(s.total - 1) < 1e-9);
  assert.ok(Math.abs(s.cagr - 1) < 1e-6);
  assert.ok(Math.abs(s.mdd - (1.2 / 1.5 - 1)) < 1e-9);
});

test('backtest: 데모 시세로 끝까지 돌고 지표가 유한', () => {
  const series = [0, 1, 2].map((i) => ({ name: `S${i}`, ...demoCloses(i + 7, 700) }));
  const bt = backtest(series);
  assert.equal(bt.equity.length, bt.dates.length);
  assert.equal(bt.equity.length, bt.benchmark.length);
  for (const k of ['total', 'cagr', 'mdd', 'vol', 'sharpe']) assert.ok(Number.isFinite(bt.strategy[k]), k);
  assert.ok(bt.rebalances.length > 10);
  assert.ok(bt.avgExposure >= 0 && bt.avgExposure <= 1);
  assert.throws(() => backtest([{ name: 'x', ...demoCloses(1, 100) }]), /데이터가 부족/);
});

test('backtest: 거래비용이 클수록 수익이 낮아진다', () => {
  const series = [0, 1].map((i) => ({ name: `S${i}`, ...demoCloses(i + 3, 700) }));
  assert.ok(backtest(series, { costBps: 0 }).strategy.total > backtest(series, { costBps: 200 }).strategy.total);
});

test('marketOf', () => {
  assert.equal(marketOf('005930.KS'), 'kr');
  assert.equal(marketOf('035720.kq'), 'kr');
  assert.equal(marketOf('AAPL'), 'us');
});

test('zonedTime: KST 09:00 = UTC 00:00, 뉴욕 서머타임/표준시', () => {
  assert.equal(zonedTime(2026, 10, 26, '09:00', 'Asia/Seoul'), Date.UTC(2026, 9, 26, 0, 0));
  assert.equal(zonedTime(2026, 7, 1, '09:30', 'America/New_York'), Date.UTC(2026, 6, 1, 13, 30)); // EDT
  assert.equal(zonedTime(2026, 12, 1, '09:30', 'America/New_York'), Date.UTC(2026, 11, 1, 14, 30)); // EST
});

test('nextOpen: 주말은 건너뛰고 이미 지난 시각이면 다음 날', () => {
  // 2026-10-24 토요일 12:00 KST
  const sat = Date.UTC(2026, 9, 24, 3, 0);
  assert.equal(nextOpen('kr', { now: sat }), Date.UTC(2026, 9, 26, 0, 0)); // 월요일 09:00 KST
  // 월요일 09:30 KST 는 이미 개장 후 → 화요일
  assert.equal(nextOpen('kr', { now: Date.UTC(2026, 9, 26, 0, 30) }), Date.UTC(2026, 9, 27, 0, 0));
  // 10분 전 알림
  assert.equal(nextOpen('kr', { now: sat, offsetMin: 10 }), Date.UTC(2026, 9, 25, 23, 50));
  assert.ok(Object.keys(MARKETS).includes('us'));
});
