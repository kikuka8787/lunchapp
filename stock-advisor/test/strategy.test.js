import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rsi, sma, macd } from '../src/indicators.js';
import { analyze, rank, momentum, annualizedVol } from '../src/strategy.js';
import { buildMessage } from '../src/message.js';
import { demoCloses, parseChart } from '../src/data.js';
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

test('analyze: 상승 추세는 시장 참여, 하락 추세는 관망', () => {
  assert.equal(analyze(up).inMarket, true);
  assert.ok(analyze(up).weight > 0);
  const d = analyze(down);
  assert.equal(d.inMarket, false);
  assert.equal(d.weight, 0);
  assert.match(d.reasons.join(), /절대 모멘텀 미달/);
});

test('rank: 상대 모멘텀 순위와 액션, 비중 합 100% 이하', () => {
  const results = [0, 1, 2, 3, 4].map((i) => ({ name: `S${i}`, ...analyze(demoCloses(i + 7).closes) }));
  rank(results, { topN: 2 });
  // 데모 시세는 상승/하락 종목이 섞여 있어야 액션 분기가 모두 검증된다
  assert.ok(results.some((r) => r.inMarket) && results.some((r) => !r.inMarket));
  const ranks = results.filter((r) => r.rank).map((r) => r.rank);
  assert.deepEqual([...ranks].sort(), [1, 2, 3, 4, 5]);
  for (const r of results) {
    assert.ok(['매수 관심', '보유', '관망', '매도 검토'].includes(r.action), r.action);
    if (!r.inMarket) assert.equal(r.action, '관망');
  }
  assert.ok(results.reduce((s, r) => s + r.weight, 0) <= 1.0001);
});

test('buildMessage: 면책 문구, 비중, 오류 종목 포함', () => {
  const ok = { name: 'A', currency: 'KRW', price: 1000, changePct: 1, action: '매수 관심', weight: 0.25, reasons: ['모멘텀 1위'] };
  const msg = buildMessage([ok, { name: 'B', error: '실패' }]);
  assert.match(msg, /🟢 A 매수 관심 · 비중 25%/);
  assert.match(msg, /투자 권유가 아닙니다/);
  assert.match(msg, /⚠️ B: 실패/);
});

test('parseChart: null 가격 제거', () => {
  const json = { chart: { result: [{ meta: { currency: 'KRW' }, indicators: { quote: [{ close: [1, null, 2] }] } }] } };
  assert.deepEqual(parseChart('X', json), { closes: [1, 2], currency: 'KRW' });
  assert.throws(() => parseChart('X', {}), /시세 데이터가 없습니다/);
});

test('buildArgs: 스키마에서 본문 파라미터 선택', () => {
  const tool = { name: 't', inputSchema: { properties: { message: { type: 'string' } } } };
  assert.deepEqual(buildArgs(tool, 'hi'), { message: 'hi' });
});

test('pickSelfChatTool: 후보가 애매하면 에러', () => {
  assert.throws(() => pickSelfChatTool([{ name: 'a', description: '지도' }], undefined), /자동으로 고르지 못/);
  assert.equal(pickSelfChatTool([{ name: 'x', description: '카카오톡 나와의 채팅방에 전송' }], undefined).name, 'x');
});
