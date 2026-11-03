// 세션 저장소: 날짜별 신호 스냅샷. 어제와 비교(brief)와 신호 복기(review)에 쓴다.
// adapter: { read(): object|null, write(object) } — Node 는 파일, 브라우저는 localStorage
export class SessionStore {
  constructor(adapter) {
    this.adapter = adapter;
    this.data = adapter.read() ?? {};
  }

  static fromResults(results, regimes, { date = today(), market = 'all' } = {}) {
    return {
      date,
      market,
      regimes: Object.fromEntries(Object.entries(regimes).map(([k, r]) => [k, { ok: r.ok, label: r.label, detail: r.detail, price: r.price }])),
      signals: results.filter((r) => !r.error).map((r) => ({
        symbol: r.symbol, name: r.name, market: r.market, sector: r.sector, watch: !!r.watch, pick: !!r.pick, rank: r.rank,
        action: r.action, bias: r.bias, price: r.price, currency: r.currency, weight: r.weight, stopPrice: r.stopPrice,
      })),
    };
  }

  list() { return Object.keys(this.data).sort(); }
  get(date) { return this.data[date] ?? null; }

  // 같은 날 한국장/미국장을 따로 돌려도 종목별로 합쳐 하루 한 세션
  save(session) {
    const prev = this.data[session.date];
    if (!prev) this.data[session.date] = session;
    else {
      const bySymbol = new Map(prev.signals.map((s) => [s.symbol, s]));
      for (const s of session.signals) bySymbol.set(s.symbol, s);
      prev.signals = [...bySymbol.values()];
      prev.regimes = { ...prev.regimes, ...session.regimes };
      prev.market = prev.market === session.market ? prev.market : 'all';
    }
    this.adapter.write(this.data);
    return this.data[session.date];
  }

  latest() {
    const dates = this.list();
    return dates.length ? this.data[dates[dates.length - 1]] : null;
  }

  // date 이전의 가장 최근 세션
  previous(date = today()) {
    const dates = this.list().filter((d) => d < date);
    return dates.length ? this.data[dates[dates.length - 1]] : null;
  }

  // 오늘로부터 최소 days 일 전의 가장 최근 세션 (복기용)
  atLeastDaysAgo(days, date = today()) {
    const limit = addDays(date, -days);
    const dates = this.list().filter((d) => d <= limit);
    return dates.length ? this.data[dates[dates.length - 1]] : null;
  }
}

export const today = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 어제와 비교: 액션/방향이 바뀐 종목부터, 추천 진입/이탈
export function diffSessions(prev, curr) {
  if (!prev) return null;
  const before = new Map(prev.signals.map((s) => [s.symbol, s]));
  const changed = [];
  const newPicks = [];
  const droppedPicks = [];
  for (const s of curr.signals) {
    const b = before.get(s.symbol);
    if (!b) continue;
    const items = [];
    if (b.action !== s.action) items.push(`${b.action}→${s.action}`);
    if (b.bias !== s.bias) items.push(`방향 ${b.bias}→${s.bias}`);
    if (items.length) changed.push({ symbol: s.symbol, name: s.name, watch: s.watch, pick: s.pick, items, changePct: b.price ? s.price / b.price - 1 : null });
    if (s.pick && !b.pick) newPicks.push(s);
    if (!s.pick && b.pick) droppedPicks.push(s);
  }
  changed.sort((a, b) => (b.watch || b.pick) - (a.watch || a.pick));
  return { prevDate: prev.date, changed, newPicks, droppedPicks };
}
