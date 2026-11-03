import { analyze, rank, marketRegime } from './strategy.js';
import { marketOf, mapLimit } from './data.js';

// 후보 = 유니버스(시장별 대형주) ∪ 관심 종목. 관심 종목은 watch: true 로 표시
export function buildCandidates(watchlist, universe, market = 'all', includeUniverse = true) {
  const markets = market === 'all' ? Object.keys(universe.markets ?? { kr: 1, us: 1 }) : [market];
  const map = new Map();
  if (includeUniverse) {
    for (const mk of markets) for (const u of universe[mk] ?? []) map.set(u.symbol, { ...u, market: mk, watch: false });
  }
  for (const w of watchlist) {
    const mk = marketOf(w.symbol);
    if (!markets.includes(mk)) continue;
    const prev = map.get(w.symbol);
    map.set(w.symbol, { ...(prev ?? {}), ...w, name: w.name || prev?.name || w.symbol, sector: w.sector ?? prev?.sector ?? '기타', market: mk, watch: true });
  }
  return [...map.values()];
}

// load(symbol, market) → { closes, dates, volumes, currency }
export async function screen({ candidates, indices, strategy, load, concurrency = 6 }) {
  const markets = [...new Set(candidates.map((c) => c.market))];
  const regimes = {};
  await Promise.all(markets.map(async (mk) => {
    const symbol = indices?.[mk];
    if (!symbol) return;
    try {
      const s = await load(symbol, mk);
      regimes[mk] = { symbol, ...marketRegime(s.closes, strategy) };
    } catch (e) {
      regimes[mk] = { symbol, ok: null, label: '확인 불가', detail: e.message };
    }
  }));
  const results = await mapLimit(candidates, concurrency, async (c) => {
    try {
      const s = await load(c.symbol, c.market);
      return { ...c, currency: s.currency, ...analyze(s.closes, strategy, { volumes: s.volumes }) };
    } catch (e) {
      return { ...c, error: e.message };
    }
  });
  rank(results, strategy, regimes);
  return { results, regimes };
}

export const picksOf = (results) => results.filter((r) => r.pick).sort((a, b) => a.rank - b.rank);
export const watchOf = (results) => results.filter((r) => r.watch);
