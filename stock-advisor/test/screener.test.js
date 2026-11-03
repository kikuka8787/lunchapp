import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCandidates, screen, picksOf, watchOf } from '../src/screener.js';
import { demoCloses } from '../src/data.js';

const universe = JSON.parse(readFileSync(new URL('../universe.json', import.meta.url), 'utf8'));
const watchlist = [{ symbol: '005930.KS', name: '삼성전자' }, { symbol: 'ZZZZ', name: '내종목' }];

test('universe.json: 심볼 중복 없고 시장별 섹터 태그 있음', () => {
  for (const mk of ['kr', 'us']) {
    const syms = universe[mk].map((u) => u.symbol);
    assert.equal(new Set(syms).size, syms.length, `${mk} 중복`);
    assert.ok(universe[mk].every((u) => u.name && u.sector));
  }
  assert.equal(universe.indices.kr, '^KS11');
});

test('buildCandidates: 유니버스 ∪ 관심 종목, 관심 종목은 watch, 시장 필터', () => {
  const all = buildCandidates(watchlist, universe, 'all');
  assert.equal(all.length, universe.kr.length + universe.us.length + 1); // 삼성전자는 유니버스와 겹침
  const samsung = all.find((c) => c.symbol === '005930.KS');
  assert.equal(samsung.watch, true);
  assert.equal(samsung.sector, '반도체'); // 유니버스 섹터 유지
  assert.equal(all.find((c) => c.symbol === 'ZZZZ').sector, '기타');
  const kr = buildCandidates(watchlist, universe, 'kr');
  assert.ok(kr.every((c) => c.market === 'kr'));
  const watchOnly = buildCandidates(watchlist, universe, 'all', false);
  assert.equal(watchOnly.length, 2);
});

test('screen: 데모 로더로 국면 + 추천 + 관심 종목', async () => {
  const candidates = buildCandidates(watchlist, universe, 'kr');
  const load = async (symbol) => {
    if (symbol === 'BAD') throw new Error('실패');
    return demoCloses(symbol);
  };
  candidates.push({ symbol: 'BAD', name: '실패종목', market: 'kr', watch: true });
  const { results, regimes } = await screen({ candidates, indices: universe.indices, strategy: { topN: 3 }, load });
  assert.equal(typeof regimes.kr.ok, 'boolean');
  assert.equal(regimes.kr.symbol, '^KS11');
  const picks = picksOf(results);
  assert.ok(picks.length > 0 && picks.length <= 3);
  assert.ok(picks.every((p) => p.inMarket && p.summary));
  assert.ok(watchOf(results).some((r) => r.symbol === '005930.KS'));
  assert.equal(results.find((r) => r.symbol === 'BAD').error, '실패');
});
