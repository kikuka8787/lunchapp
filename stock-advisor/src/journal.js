import { fmtPrice, fmtPct } from './format.js';

// 매매 기록(trader-memory-core) + 코칭(trade-performance-coach)
// adapter: { read(): array|null, write(array) }
export class TradeJournal {
  constructor(adapter) {
    this.adapter = adapter;
    this.trades = adapter.read() ?? [];
  }

  add(trade) {
    const t = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, date: new Date().toISOString().slice(0, 10), ...trade };
    if (!t.symbol || !t.side || !(t.price > 0)) throw new Error('symbol, side(buy|sell), price 는 필수입니다');
    this.trades.push(t);
    this.adapter.write(this.trades);
    return t;
  }

  remove(id) {
    this.trades = this.trades.filter((t) => t.id !== id);
    this.adapter.write(this.trades);
  }

  list() { return [...this.trades].sort((a, b) => a.date.localeCompare(b.date)); }
}

// 매수-매도 FIFO 로 묶어 완료된 매매 만들기
export function pairTrades(trades) {
  const open = {};
  const closed = [];
  for (const t of [...trades].sort((a, b) => a.date.localeCompare(b.date))) {
    if (t.side === 'buy') (open[t.symbol] ??= []).push({ ...t, remaining: t.qty ?? 1 });
    else if (t.side === 'sell') {
      let qty = t.qty ?? 1;
      while (qty > 0 && open[t.symbol]?.length) {
        const b = open[t.symbol][0];
        const q = Math.min(qty, b.remaining);
        closed.push({ symbol: t.symbol, name: b.name ?? t.name ?? t.symbol, buy: b, sell: t, qty: q, pnlPct: t.price / b.price - 1, stop: b.stop, currency: b.currency });
        b.remaining -= q;
        qty -= q;
        if (b.remaining <= 0) open[t.symbol].shift();
      }
    }
  }
  const openList = Object.values(open).flat().filter((b) => b.remaining > 0);
  return { closed, open: openList };
}

export const MISTAKES = {
  noStop: { label: '손절가 없이 진입', rule: '매수 주문 전에 손절가를 먼저 적는다 (없으면 매수하지 않는다)' },
  wideStop: { label: '손절 폭 과다(20% 초과)', rule: '손절 폭은 고점 대비 변동성 2배 이내(최대 20%)로 둔다' },
  overWeight: { label: '한 종목 비중 초과', rule: '한 종목은 자본의 상한(기본 40%) 이하로만 산다' },
  againstSignal: { label: '신호 역행 매수(관망·매도 검토 종목)', rule: '관망·매도 검토 신호인 종목은 추세가 돌아설 때까지 사지 않는다' },
  weakMarket: { label: '약세장에서 매수', rule: '시장 지수가 약세일 때는 비중을 절반 이하로' },
  stopNotHonored: { label: '손절 미이행(손절가 아래에서 더 버팀)', rule: '손절가에 닿으면 이유 불문 비중을 줄인다' },
  noReason: { label: '진입 근거 미기록', rule: '산 이유를 한 줄이라도 적는다 — 근거 없는 매수는 복기가 안 된다' },
};

// signals: { symbol: { action, regimeOk } } 매수 당시(또는 최근) 신호, rules: { maxWeight, capital, maxStopPct }
export function coach(trades, { signals = {}, rules = {} } = {}) {
  const maxWeight = rules.maxWeight ?? 0.4;
  const maxStopPct = rules.maxStopPct ?? 0.2;
  const findings = [];
  const buys = trades.filter((t) => t.side === 'buy');
  for (const t of buys) {
    const f = (key) => findings.push({ key, trade: t, ...MISTAKES[key] });
    if (!(t.stop > 0)) f('noStop');
    else if ((t.price - t.stop) / t.price > maxStopPct) f('wideStop');
    if (rules.capital && t.qty && (t.qty * t.price) / rules.capital > maxWeight) f('overWeight');
    const sig = signals[t.symbol];
    if (sig && ['관망', '매도 검토'].includes(sig.action)) f('againstSignal');
    if (sig && sig.regimeOk === false) f('weakMarket');
    if (!t.reason) f('noReason');
  }
  const { closed, open } = pairTrades(trades);
  for (const c of closed) {
    if (c.stop > 0 && c.sell.price < c.stop * 0.97) findings.push({ key: 'stopNotHonored', trade: c.sell, ...MISTAKES.stopNotHonored });
  }
  const counts = {};
  for (const f of findings) counts[f.key] = (counts[f.key] ?? 0) + 1;
  const repeated = Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
  const wins = closed.filter((c) => c.pnlPct > 0).length;
  const avgPnl = closed.length ? closed.reduce((a, c) => a + c.pnlPct, 0) / closed.length : null;
  const nextRules = (repeated.length ? repeated : Object.entries(counts)).slice(0, 3).map(([k]) => MISTAKES[k].rule);
  const questions = [];
  if (closed.some((c) => c.pnlPct < -0.15)) questions.push('-15% 넘게 잃은 매매에서 손절가를 지키지 못한 이유는?');
  if (buys.length && buys.every((t) => !t.reason)) questions.push('산 이유를 적지 않은 매매는 어떤 기준으로 들어갔나요?');
  if (open.length > 3) questions.push(`보유 ${open.length}종목 — 지금도 추세가 살아 있는 종목만 남길 수 있나요?`);
  return { buys: buys.length, closed, open, wins, avgPnl, findings, counts, repeated, nextRules, questions };
}

export function buildCoachText(report) {
  const lines = ['🎯 매매 코칭'];
  if (!report.buys) {
    lines.push('  기록된 매수가 없습니다. `trade add buy 종목 가격 --stop 손절가 --qty 수량 --reason "이유"` 로 기록하세요.');
    return lines.join('\n');
  }
  lines.push(`  매수 ${report.buys}건 · 완료 ${report.closed.length}건 (승 ${report.wins}) · 보유 중 ${report.open.length}건${report.avgPnl != null ? ` · 평균 손익 ${fmtPct(report.avgPnl)}` : ''}`);
  if (report.closed.length) {
    lines.push('', '📒 완료된 매매');
    for (const c of report.closed.slice(-6)) lines.push(`  ${c.pnlPct >= 0 ? '🟢' : '🔴'} ${c.name} ${fmtPrice(c.buy.price, c.currency)} → ${fmtPrice(c.sell.price, c.currency)} (${fmtPct(c.pnlPct)})${c.buy.reason ? ` · ${c.buy.reason}` : ''}`);
  }
  lines.push('', report.findings.length ? '⚠️ 점검 결과' : '✅ 점검 결과: 규칙 위반 없음');
  for (const [k, n] of Object.entries(report.counts)) lines.push(`  ${MISTAKES[k].label} ×${n}${report.repeated.some(([rk]) => rk === k) ? ' ← 반복' : ''}`);
  if (report.nextRules.length) {
    lines.push('', '📌 다음 매매 규칙 (받아들일지는 본인이 정합니다)');
    report.nextRules.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
  }
  if (report.questions.length) {
    lines.push('', '❓ 스스로에게 물어볼 것');
    for (const q of report.questions) lines.push(`  · ${q}`);
  }
  return lines.join('\n');
}
