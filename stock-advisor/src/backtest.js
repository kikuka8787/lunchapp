import { analyze, rank, DEFAULTS } from './strategy.js';

// 듀얼 모멘텀 전략 백테스트 (월 1회 리밸런싱, 현금 수익 0, 왕복 거래비용 반영)
// series: [{ name, symbol, dates: [ms], closes: [number] }]
export const BT_DEFAULTS = { costBps: 10, rebalanceDays: 21, warmup: 260 };

// 시장마다 거래일이 달라서 날짜 합집합 위에 직전 종가로 채운다.
export function align(series) {
  const dateSet = new Set();
  for (const s of series) for (const d of s.dates) dateSet.add(d);
  const dates = [...dateSet].sort((a, b) => a - b);
  const closes = series.map((s) => {
    const map = new Map(s.dates.map((d, i) => [d, s.closes[i]]));
    let last = null;
    return dates.map((d) => (map.has(d) ? (last = map.get(d)) : last));
  });
  // 모든 종목에 데이터가 생긴 시점부터
  const start = dates.findIndex((_, i) => closes.every((c) => c[i] != null));
  return { dates: dates.slice(start), closes: closes.map((c) => c.slice(start)) };
}

export function stats(equity, dates) {
  const n = equity.length;
  const years = (dates[n - 1] - dates[0]) / (365.25 * 86400e3);
  const total = equity[n - 1] / equity[0] - 1;
  const cagr = years > 0 ? (equity[n - 1] / equity[0]) ** (1 / years) - 1 : 0;
  let peak = equity[0];
  let mdd = 0;
  const rets = [];
  for (let i = 1; i < n; i++) {
    peak = Math.max(peak, equity[i]);
    mdd = Math.min(mdd, equity[i] / peak - 1);
    rets.push(equity[i] / equity[i - 1] - 1);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1));
  return { total, cagr, mdd, vol: sd * Math.sqrt(252), sharpe: sd ? (mean / sd) * Math.sqrt(252) : 0, years };
}

export function backtest(series, opts = {}) {
  const o = { ...DEFAULTS, ...BT_DEFAULTS, ...opts };
  const { dates, closes } = align(series);
  const n = dates.length;
  if (n <= o.warmup + 1) throw new Error(`데이터가 부족합니다 (${n}일, 최소 ${o.warmup + 2}일 필요)`);

  let weights = series.map(() => 0);
  let equity = 1;
  let bench = 1;
  const curve = [];
  const benchCurve = [];
  const rebalances = [];
  let exposureSum = 0;
  const cost = o.costBps / 10000;

  for (let t = o.warmup; t < n; t++) {
    if (t > o.warmup) {
      // 전일 비중으로 하루 수익 반영
      let r = 0;
      let br = 0;
      series.forEach((_, i) => {
        const dr = closes[i][t] / closes[i][t - 1] - 1;
        r += weights[i] * dr;
        br += dr / series.length;
      });
      equity *= 1 + r;
      bench *= 1 + br;
      // 수익률 반영 후 실제 비중이 흔들리는 것(drift)은 무시하고 목표 비중을 유지한다고 가정
    }
    if ((t - o.warmup) % o.rebalanceDays === 0) {
      const results = series.map((s, i) => ({ name: s.name, ...analyze(closes[i].slice(0, t + 1), o) }));
      rank(results, o);
      const next = results.map((x) => x.weight ?? 0);
      const turnover = next.reduce((s, w, i) => s + Math.abs(w - weights[i]), 0);
      equity *= 1 - turnover * cost;
      weights = next;
      rebalances.push({ date: dates[t], weights: next.map((w, i) => ({ name: series[i].name, weight: w, action: results[i].action })) });
    }
    exposureSum += weights.reduce((a, b) => a + b, 0);
    curve.push(equity);
    benchCurve.push(bench);
  }
  const btDates = dates.slice(o.warmup);
  return {
    dates: btDates,
    equity: curve,
    benchmark: benchCurve,
    strategy: stats(curve, btDates),
    buyHold: stats(benchCurve, btDates),
    rebalances,
    avgExposure: exposureSum / curve.length,
  };
}
