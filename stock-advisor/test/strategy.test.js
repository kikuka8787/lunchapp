import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rsi, sma, macd } from '../src/indicators.js';
import { analyze, rank, momentum, annualizedVol, marketRegime, ACTIONS } from '../src/strategy.js';
import { buildMessage } from '../src/message.js';
import { demoCloses, parseChart, hashSeed } from '../src/data.js';
import { buildArgs, pickSelfChatTool } from '../src/playmcp.js';

const up = Array.from({ length: 300 }, (_, i) => 100 + i);
const down = Array.from({ length: 300 }, (_, i) => 400 - i);

test('sma', () => assert.equal(sma([1, 2, 3, 4], 2), 3.5));
test('rsi: 계속 오르면 100, 계속 내리면 0', () => {
  assert.equal(rsi(up), 100);
  assert.equal(rsi(down), 0);
});
test('macd: 데이터 부족하면 null', () => assert.equal(macd([1, 2, 3]), null));

test('momentum: 12개월(마지막 1개월 제외) 수익률', () => {
  assert.ok(Math.abs(momentum([100, 110, 120, 130], 2, 1) - 0.2) < 1e-9);
  assert.equal(momentum([1, 2], 5), null);
});

test('annualizedVol: 변동 없으면 0', () => assert.equal(annualizedVol(Array(70).fill(10)), 0));

test('marketRegime: 상승 지수는 ok, 하락 지수는 약세', () => {
  assert.equal(marketRegime(up).ok, true);
  const r = marketRegime(down);
  assert.equal(r.ok, false);
  assert.equal(r.label, '약세');
  assert.match(r.detail, /200일선 아래/);
});

test('analyze: 상승 추세는 시장 참여 + 손절가, 하락 추세는 관망', () => {
  const u = analyze(up, {}, { volumes: Array(300).fill(1000) });
  assert.equal(u.inMarket, true);
  assert.ok(u.weight > 0);
  assert.ok(u.stopPrice < u.price && u.stopPrice >= u.ma200);
  assert.ok(u.checks.find((c) => c.key === 'volume'));
  assert.ok(u.composite > 0 && u.riskAdj > 0);
  const d = analyze(down);
  assert.equal(d.inMarket, false);
  assert.equal(d.weight, 0);
  assert.equal(d.checks.find((c) => c.key === 'abs').ok, false);
  assert.equal(d.checks.find((c) => c.key === 'trend').ok, false);
});

function demoResults(n = 8, sector = (i) => `S${i % 3}`) {
  return Array.from({ length: n }, (_, i) => ({ name: `종목${i}`, symbol: `T${i}`, sector: sector(i), market: 'kr', currency: 'KRW', ...analyze(demoCloses(i + 7).closes) }));
}

test('rank: 추천은 topN 이하, 시장 참여 종목만, 비중은 추천에만, 합 100% 이하', () => {
  const results = rank(demoResults(), { topN: 3 });
  const picks = results.filter((r) => r.pick);
  assert.ok(picks.length > 0 && picks.length <= 3);
  for (const r of results) {
    assert.ok(ACTIONS.includes(r.action), r.action);
    if (!r.inMarket) assert.equal(r.action, '관망');
    if (!r.pick) assert.equal(r.weight, 0);
    assert.ok(r.summary.length > 20);
    assert.ok(r.reasons.length > 0);
  }
  // 추천은 시장 참여 종목 중 위험조정 모멘텀 상위 (섹터 제한 제외)
  const maxPickRank = Math.max(...picks.map((r) => r.rank));
  for (const r of results) if (r.inMarket && !r.pick && !r.sectorCapped) assert.ok(r.rank > maxPickRank, `${r.name} ${r.rank}`);
  assert.ok(results.reduce((s, r) => s + r.weight, 0) <= 1.0001);
});

test('rank: 섹터당 최대 종목 수 제한', () => {
  const results = rank(demoResults(8, () => '반도체'), { topN: 3, maxPerSector: 1 });
  assert.equal(results.filter((r) => r.pick).length, 1);
  assert.ok(results.some((r) => r.sectorCapped));
});

test('rank: 시장 약세면 비중이 regimeWeight 배', () => {
  const strong = rank(demoResults(), { topN: 2 }, { kr: { ok: true } });
  const weak = rank(demoResults(), { topN: 2, regimeWeight: 0.5 }, { kr: { ok: false, detail: '200일선 아래' } });
  const ws = strong.reduce((s, r) => s + r.weight, 0);
  const ww = weak.reduce((s, r) => s + r.weight, 0);
  assert.ok(ww > 0 && ww < ws);
  assert.ok(weak.find((r) => r.pick).summary.includes('약세'));
});

test('buildMessage: 시장 국면, 추천 TOP, 관심 종목, 면책 문구', () => {
  const results = rank(demoResults(), { topN: 2 });
  results[0].watch = true;
  results.push({ name: '오류', symbol: 'ERR', watch: true, error: '실패' });
  const msg = buildMessage(results, { title: '🇰🇷 한국장', regimes: { kr: { ok: true, label: '상승 추세', detail: '12개월 +10%' } } });
  assert.match(msg, /🇰🇷 한국장 주식 신호/);
  assert.match(msg, /시장: 🇰🇷 KOSPI 상승 추세/);
  assert.match(msg, /🏆 추천 TOP 2/);
  assert.match(msg, /🛡 손절/);
  assert.match(msg, /투자 권유가 아닙니다/);
  assert.match(msg, /⚠️ 오류: 실패/);
});

test('parseChart: null 가격 제거, 거래량 포함', () => {
  const day = 86400;
  const json = { chart: { result: [{ meta: { currency: 'KRW' }, timestamp: [day + 100, 2 * day, 3 * day + 5], indicators: { quote: [{ close: [1, null, 2], volume: [10, 20, 30] }] } }] } };
  assert.deepEqual(parseChart('X', json), { closes: [1, 2], dates: [day * 1000, 3 * day * 1000], volumes: [10, 30], currency: 'KRW' });
  assert.throws(() => parseChart('X', {}), /시세 데이터가 없습니다/);
});

test('hashSeed / demoCloses: 심볼 문자열로도 결정적', () => {
  assert.equal(hashSeed('AAPL'), hashSeed('AAPL'));
  assert.notEqual(hashSeed('AAPL'), hashSeed('MSFT'));
  assert.deepEqual(demoCloses('AAPL').closes, demoCloses('AAPL').closes);
});

test('buildArgs: 스키마에서 본문 파라미터 선택', () => {
  const tool = { name: 't', inputSchema: { properties: { message: { type: 'string' } } } };
  assert.deepEqual(buildArgs(tool, 'hi'), { message: 'hi' });
});

test('pickSelfChatTool: 후보가 애매하면 에러', () => {
  assert.throws(() => pickSelfChatTool([{ name: 'a', description: '지도' }], undefined), /자동으로 고르지 못/);
  assert.equal(pickSelfChatTool([{ name: 'x', description: '카카오톡 나와의 채팅방에 전송' }], undefined).name, 'x');
});
