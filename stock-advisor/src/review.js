import { fmtPct } from './format.js';

// 신호 복기 (signal-postmortem): N일 전 세션의 신호를 지금 가격으로 채점
//   매수 계열(매수 관심·매수 대기·보유): 올랐으면 맞음, 내렸으면 틀림
//   관망·매도 검토: 내렸으면 맞음(피함), 많이 올랐으면 놓침
//   틀렸지만 시장 지수가 같은 방향으로 비슷하게 움직였으면 "시장과 엇갈림"(시장 탓)
export const OUTCOMES = ['맞음', '틀림', '놓침', '시장과 엇갈림', '보합'];
const BULLISH = new Set(['매수 관심', '매수 대기', '보유']);

export function gradeSignal(signal, nowPrice, indexRet = null, { flat = 0.01, missed = 0.03, marketBand = 0.02 } = {}) {
  const ret = nowPrice / signal.price - 1;
  const bullish = BULLISH.has(signal.action);
  let outcome;
  if (bullish) {
    if (ret > flat) outcome = '맞음';
    else if (ret < -flat) outcome = indexRet != null && indexRet < -flat && Math.abs(ret - indexRet) < marketBand ? '시장과 엇갈림' : '틀림';
    else outcome = '보합';
  } else {
    if (ret < -flat) outcome = '맞음';
    else if (ret > missed) outcome = indexRet != null && indexRet > missed && Math.abs(ret - indexRet) < marketBand ? '시장과 엇갈림' : '놓침';
    else outcome = '보합';
  }
  return { ...signal, ret, indexRet, outcome };
}

// session: 과거 세션, prices: { symbol: 현재가 }, indexPrices: { kr: 현재 지수, us: ... }
export function postmortem(session, prices, indexPrices = {}, opts = {}) {
  const indexRets = Object.fromEntries(Object.entries(session.regimes ?? {}).map(([mk, r]) => [mk, r.price && indexPrices[mk] ? indexPrices[mk] / r.price - 1 : null]));
  const graded = session.signals.filter((s) => prices[s.symbol] != null).map((s) => gradeSignal(s, prices[s.symbol], indexRets[s.market] ?? null, opts));
  const by = (pred) => graded.filter(pred);
  const avg = (arr) => (arr.length ? arr.reduce((a, s) => a + s.ret, 0) / arr.length : null);
  const bull = by((s) => BULLISH.has(s.action));
  const bear = by((s) => !BULLISH.has(s.action));
  const picks = by((s) => s.pick);
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, graded.filter((s) => s.outcome === o).length]));
  return {
    date: session.date,
    n: graded.length,
    counts,
    hitRate: graded.length ? counts['맞음'] / graded.length : null,
    avgRet: { picks: avg(picks), bullish: avg(bull), bearish: avg(bear), all: avg(graded) },
    indexRets,
    graded,
  };
}

export function buildReviewText(reports, { windows = [] } = {}) {
  const lines = ['🔍 신호 복기'];
  if (!reports.length) {
    lines.push('  채점할 과거 세션이 없습니다. 신호를 며칠 쌓은 뒤(최소 5거래일) 다시 실행하세요.');
    return lines.join('\n');
  }
  reports.forEach((rep, i) => {
    const w = windows[i] ? `${windows[i]}일 전` : '';
    lines.push('', `📅 ${rep.date} 세션 ${w ? `(${w})` : ''} · ${rep.n}개 신호`);
    const idx = Object.entries(rep.indexRets).filter(([, v]) => v != null).map(([k, v]) => `${k.toUpperCase()} ${fmtPct(v)}`).join(' · ');
    if (idx) lines.push(`  지수: ${idx}`);
    lines.push(`  맞음 ${rep.counts['맞음']} · 틀림 ${rep.counts['틀림']} · 놓침 ${rep.counts['놓침']} · 시장과 엇갈림 ${rep.counts['시장과 엇갈림']} · 보합 ${rep.counts['보합']} → 적중률 ${rep.hitRate != null ? (rep.hitRate * 100).toFixed(0) + '%' : '-'}`);
    lines.push(`  평균 수익률: 추천 ${fmtPct(rep.avgRet.picks)} · 매수 계열 ${fmtPct(rep.avgRet.bullish)} · 관망 계열 ${fmtPct(rep.avgRet.bearish)}`);
    const notable = rep.graded.filter((s) => s.pick || s.watch).sort((a, b) => Math.abs(b.ret) - Math.abs(a.ret)).slice(0, 6);
    for (const s of notable) lines.push(`  ${s.outcome === '맞음' ? '✅' : s.outcome === '보합' ? '➖' : '❌'} ${s.name} ${s.action} → ${fmtPct(s.ret)} (${s.outcome})`);
  });
  lines.push('', '→ 틀림·놓침이 반복되는 종목/패턴이 있으면 전략 설정(topN, 변동성 상한, 단기 타이밍)을 점검하세요.');
  return lines.join('\n');
}
