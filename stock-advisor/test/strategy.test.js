import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rsi, sma, macd } from '../src/indicators.js';
import { analyze } from '../src/strategy.js';
import { buildMessage } from '../src/message.js';
import { buildArgs, pickSelfChatTool } from '../src/playmcp.js';

const up = Array.from({ length: 100 }, (_, i) => 100 + i);
const down = Array.from({ length: 100 }, (_, i) => 200 - i);

test('sma', () => assert.equal(sma([1, 2, 3, 4], 2), 3.5));
test('rsi: 계속 오르면 100, 계속 내리면 0', () => {
  assert.equal(rsi(up), 100);
  assert.equal(rsi(down), 0);
});
test('macd: 데이터 부족하면 null', () => assert.equal(macd([1, 2, 3]), null));

test('analyze: 급락 후 반등 구간은 점수 계산이 동작', () => {
  const r = analyze([...down, ...Array.from({ length: 5 }, (_, i) => 100 + i * 3)]);
  assert.ok(Number.isFinite(r.score));
  assert.ok(['매수 관심', '관망', '매도 검토'].includes(r.action));
});

test('buildMessage: 면책 문구와 오류 종목 포함', () => {
  const msg = buildMessage([{ name: 'A', error: '실패' }]);
  assert.match(msg, /투자 권유가 아닙니다/);
  assert.match(msg, /⚠️ A: 실패/);
});

test('buildArgs: 스키마에서 본문 파라미터 선택', () => {
  const tool = { name: 't', inputSchema: { properties: { message: { type: 'string' } } } };
  assert.deepEqual(buildArgs(tool, 'hi'), { message: 'hi' });
});

test('pickSelfChatTool: 후보가 애매하면 에러', () => {
  assert.throws(() => pickSelfChatTool([{ name: 'a', description: '지도' }], undefined), /자동으로 고르지 못/);
  assert.equal(pickSelfChatTool([{ name: 'x', description: '카카오톡 나와의 채팅방에 전송' }], undefined).name, 'x');
});
