import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debate, buildDebateText } from '../src/debate.js';
import { analyze, rank } from '../src/strategy.js';
import { demoCloses } from '../src/data.js';

const up = Array.from({ length: 300 }, (_, i) => 100 + i);
const down = Array.from({ length: 300 }, (_, i) => 400 - i);
const mk = (closes, extra = {}) => rank([{ name: 'A', symbol: 'A', sector: 'S', market: 'kr', currency: 'KRW', ...analyze(closes), ...extra }], { topN: 1 }, { kr: { ok: true, label: '상승 추세', detail: '' } })[0];

test('debate: 상승 종목은 승인/조건부, 하락 종목은 거절', () => {
  const good = debate(mk(up), { regime: { ok: true, label: '상승 추세', detail: '' } });
  assert.ok(['승인', '조건부 승인'].includes(good.riskTeam.verdict));
  assert.ok(good.bull.length >= 3);
  assert.ok(good.trader.target && good.trader.rr > 0);
  assert.match(good.analysts.fundamentals, /데이터 없음/);
  const bad = debate(mk(down), { regime: { ok: false, label: '약세', detail: '200일선 아래' } });
  assert.equal(bad.riskTeam.verdict, '거절');
  assert.ok(bad.bear.some((b) => /절대 모멘텀 미달/.test(b)));
  assert.ok(bad.bear.some((b) => /시장 지수 약세/.test(b)));
  assert.match(bad.manager, /^거절/);
});

test('debate: 섹터 동료 맥락 반영', () => {
  const peers = [0, 1, 2].map((i) => ({ name: `P${i}`, symbol: `P${i}`, sector: 'S', market: 'kr', ...analyze(demoCloses(i + 7).closes) }));
  const d = debate(mk(up), { peers });
  assert.ok([...d.bull, ...d.bear].some((x) => /같은 섹터\(S\) 3종목/.test(x)));
  assert.match(d.riskTeam.sectorNote, /4종목/);
});

test('buildDebateText: 모든 역할 섹션과 면책', () => {
  const text = buildDebateText(debate(mk(up)));
  for (const h of ['📊 분석가', '🐂 강세 연구원', '🐻 약세 연구원', '💼 트레이더 제안', '🛡 리스크팀', '🧑‍💼 매니저 결론']) assert.ok(text.includes(h), h);
  assert.match(text, /LLM 없음/);
  assert.match(text, /투자 권유가 아닙니다/);
  assert.match(text, /손익비 \d+\.\d/);
});
