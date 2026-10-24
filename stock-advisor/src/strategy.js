import { sma, rsi, macd } from './indicators.js';
import { fmtPct } from './format.js';

// 전략 v2: 듀얼 모멘텀 + 시장 국면 필터 + 위험조정 복합 모멘텀 + 변동성 비중 + 손절 규칙
//  1) 시장 국면: 지수(KOSPI/S&P500)가 12개월 수익률 > 0 이고 200일선 위면 "상승 추세", 아니면 약세 → 비중 regimeWeight 배
//  2) 절대 모멘텀: 종목 12개월(최근 1개월 제외) 수익률 > 0 이고 가격 > 200일선 → 시장 참여, 아니면 관망(현금)
//  3) 상대 모멘텀: 3·6·12개월 수익률 평균 ÷ 변동성(위험조정)으로 순위, 상위 topN 추천 (섹터당 maxPerSector)
//  4) 변동성 비중: 목표 변동성 ÷ 실현 변동성, 상한 maxWeight, 합계 100% 이내
//  5) 단기 타이밍: RSI, MACD, 20일선 → 과열이면 "매수 대기", 급락 신호면 "매도 검토"
//  6) 손절 기준: 최근 60일 고점 대비 월간 변동성의 2배(8~20%) 또는 200일선 중 높은 쪽
// 투자 조언이 아니라 규칙 기반 참고 신호다.
export const DEFAULTS = {
  lookbacks: [63, 126, 252],
  skip: 21,
  trendMA: 200,
  volWindow: 60,
  targetVol: 0.15,
  maxWeight: 0.4,
  topN: 3,
  maxPerSector: 2,
  regimeWeight: 0.5,
  costBps: 10,
};

export const ACTIONS = ['매수 관심', '매수 대기', '매도 검토', '보유', '관망'];

export function momentum(closes, lookback, skip = 0) {
  const n = closes.length;
  if (n < lookback + skip + 1) return null;
  const end = closes[n - 1 - skip];
  const start = closes[n - 1 - skip - lookback];
  return end / start - 1;
}

export function annualizedVol(closes, window = 60) {
  if (closes.length < window + 1) return null;
  const rets = [];
  for (let i = closes.length - window; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * 252);
}

// 1) 시장 국면 (지수 기준)
export function marketRegime(closes, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const price = closes[closes.length - 1];
  const mom12 = momentum(closes, 252, o.skip);
  const ma = sma(closes, o.trendMA);
  const aboveMA = ma != null ? price > ma : null;
  const ok = (mom12 == null || mom12 > 0) && aboveMA !== false;
  const detail = [mom12 != null ? `12개월 ${fmtPct(mom12, 0)}` : null, aboveMA != null ? `200일선 ${aboveMA ? '위' : '아래'}` : null].filter(Boolean).join(', ');
  return { ok, mom12, aboveMA, ma, price, label: ok ? '상승 추세' : '약세', detail };
}

export function analyze(closes, opts = {}, { volumes } = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = closes.length;
  const price = closes[n - 1];
  const prev = closes[n - 2];
  const [lb3, lb6, lb12] = o.lookbacks;
  const mom3 = momentum(closes, lb3);
  const mom6 = momentum(closes, lb6);
  const mom12 = momentum(closes, lb12, o.skip);
  const moms = [mom3, mom6, mom12].filter((x) => x != null);
  const composite = moms.length ? moms.reduce((a, b) => a + b, 0) / moms.length : null;
  const vol = annualizedVol(closes, o.volWindow);
  const riskAdj = composite == null ? null : vol ? composite / vol : composite;
  const ma200 = sma(closes, o.trendMA);
  const ma20 = sma(closes, 20);
  const high52 = Math.max(...closes.slice(-252));
  const offHigh = price / high52 - 1;
  const r = rsi(closes, 14);
  const m = macd(closes);
  let volRatio = null;
  if (volumes && volumes.length >= 20) {
    const avg = (k) => volumes.slice(-k).reduce((a, b) => a + b, 0) / k;
    volRatio = avg(20) ? avg(5) / avg(20) : null;
  }

  // 항목별 근거 (ok: true / 'warn' / false / null=데이터 부족)
  const checks = [];
  const momOk = mom12 == null ? null : mom12 > 0;
  checks.push({ key: 'abs', label: '절대 모멘텀', ok: momOk, detail: mom12 == null ? '데이터 부족' : `12개월 ${fmtPct(mom12, 0)}` });
  const trendOk = ma200 == null ? null : price > ma200;
  checks.push({ key: 'trend', label: '200일선', ok: trendOk, detail: ma200 == null ? '데이터 부족' : `${trendOk ? '위' : '아래'} ${fmtPct(price / ma200 - 1, 0)}` });
  checks.push({ key: 'high', label: '52주 고점 대비', ok: offHigh > -0.1 ? true : offHigh > -0.25 ? 'warn' : false, detail: fmtPct(offHigh, 0) });
  checks.push({ key: 'vol', label: '변동성', ok: vol == null ? null : vol < 0.35 ? true : vol < 0.6 ? 'warn' : false, detail: vol == null ? '데이터 부족' : `연 ${(vol * 100).toFixed(0)}%` });
  if (volRatio != null) checks.push({ key: 'volume', label: '거래량', ok: volRatio >= 0.8 ? true : 'warn', detail: `20일 평균 대비 ${fmtPct(volRatio - 1, 0)}` });

  // 5) 단기 타이밍
  let score = 0;
  const timing = [];
  if (r != null) {
    if (r <= 30) { score += 2; timing.push(`RSI ${r.toFixed(0)} 과매도(눌림목)`); }
    else if (r >= 70) { score -= 2; timing.push(`RSI ${r.toFixed(0)} 과열`); }
  }
  if (m) {
    if (m.prevHist <= 0 && m.hist > 0) { score += 2; timing.push('MACD 골든크로스'); }
    else if (m.prevHist >= 0 && m.hist < 0) { score -= 2; timing.push('MACD 데드크로스'); }
    else score += m.hist > 0 ? 1 : -1;
  }
  if (ma20 != null) score += price > ma20 ? 1 : -1;
  checks.push({ key: 'timing', label: '단기 타이밍', ok: score >= 2 ? true : score <= -2 ? false : 'warn', detail: timing.join(', ') || (score >= 0 ? '중립' : '약함') });

  const inMarket = momOk !== false && trendOk !== false;
  const weight = inMarket && vol ? Math.min(o.maxWeight, o.targetVol / vol) : 0;

  // 6) 손절 기준
  const stopPct = vol ? Math.min(0.2, Math.max(0.08, (2 * vol) / Math.sqrt(12))) : 0.15;
  const peak60 = Math.max(...closes.slice(-60));
  const stopPrice = Math.max(peak60 * (1 - stopPct), ma200 ?? 0);

  return {
    price,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    mom3, mom6, mom12, composite, riskAdj, vol, ma200, ma20, high52, offHigh,
    rsi: r, volRatio, score, checks, inMarket, weight, stopPrice, stopPct, peak60,
    rank: null, pick: false, action: null, reasons: [], summary: '',
  };
}

// 3) 상대 모멘텀 순위 + 섹터 제한 + 최종 액션. regimes: { kr: marketRegime(...), us: ... }
export function rank(results, opts = {}, regimes = {}) {
  const o = { ...DEFAULTS, ...opts };
  const ok = results.filter((x) => !x.error && x.riskAdj != null);
  const sorted = [...ok].sort((a, b) => b.riskAdj - a.riskAdj);
  sorted.forEach((x, i) => { x.rank = i + 1; x.total = sorted.length; });

  const sectorCount = {};
  let picked = 0;
  for (const x of sorted) {
    x.pick = false;
    x.sectorCapped = false;
    if (!x.inMarket || picked >= o.topN) continue;
    const sec = x.sector ?? '기타';
    if ((sectorCount[sec] ?? 0) >= o.maxPerSector) { x.sectorCapped = true; continue; }
    sectorCount[sec] = (sectorCount[sec] ?? 0) + 1;
    x.pick = true;
    picked++;
  }

  for (const x of results) {
    if (x.error) continue;
    const regime = x.market ? regimes[x.market] : null;
    x.regimeOk = regime ? regime.ok : null;
    if (!x.inMarket) x.action = '관망';
    else if (x.score <= -3) x.action = '매도 검토';
    else if (x.pick && x.score >= 0) x.action = '매수 관심';
    else if (x.pick) x.action = '매수 대기';
    else x.action = '보유';
    // 비중은 추천 종목(포트폴리오)에만. 약세장이면 regimeWeight 배
    if (!x.pick || x.action === '매도 검토') x.weight = 0;
    else if (regime && regime.ok === false) x.weight *= o.regimeWeight;
  }
  const total = results.reduce((s, x) => s + (x.weight ?? 0), 0);
  if (total > 1) for (const x of results) if (x.weight) x.weight /= total;

  for (const x of results) {
    if (x.error) continue;
    x.reasons = reasonsOf(x);
    x.summary = summarize(x, regimes[x.market]);
  }
  return results;
}

// 카톡용 짧은 근거
export function reasonsOf(x) {
  const out = [];
  if (x.rank) out.push(`모멘텀 ${x.rank}/${x.total}위 (3·6·12M 평균 ${fmtPct(x.composite, 0)})`);
  if (x.ma200 != null) out.push(`200일선 ${x.price > x.ma200 ? '위' : '아래'} ${fmtPct(x.price / x.ma200 - 1, 0)}`);
  if (x.mom12 != null && x.mom12 <= 0) out.push(`12개월 ${fmtPct(x.mom12, 0)} 절대 모멘텀 미달`);
  out.push(`52주 고점 대비 ${fmtPct(x.offHigh, 0)}`);
  if (x.vol != null) out.push(`변동성 ${(x.vol * 100).toFixed(0)}%`);
  if (x.volRatio != null && Math.abs(x.volRatio - 1) >= 0.3) out.push(`거래량 ${fmtPct(x.volRatio - 1, 0)}`);
  const timing = x.checks.find((c) => c.key === 'timing');
  if (x.action === '매수 대기' || x.action === '매도 검토') out.push(`단기 타이밍 ${timing.detail} (점수 ${x.score})`);
  else if (timing && timing.detail !== '중립' && timing.detail !== '약함') out.push(timing.detail);
  if (x.sectorCapped) out.push('섹터 중복으로 추천 제외');
  if (x.regimeOk === false) out.push('시장 약세로 비중 축소');
  return out;
}

// 사람이 읽는 한 문단 설명
export function summarize(x, regime) {
  const name = x.name ?? x.symbol ?? '이 종목';
  const s = [];
  if (!x.inMarket) {
    const why = [];
    if (x.mom12 != null && x.mom12 <= 0) why.push(`12개월 수익률이 ${fmtPct(x.mom12, 0)}로 절대 모멘텀 기준(0% 초과)에 미달`);
    if (x.ma200 != null && x.price <= x.ma200) why.push(`가격이 200일선 아래(${fmtPct(x.price / x.ma200 - 1, 0)})`);
    s.push(`${name}: ${why.join('하고 ') || '추세 조건 미충족'}이라 현금(관망)을 권합니다.`);
    if (x.offHigh <= -0.25) s.push(`52주 고점 대비 ${fmtPct(x.offHigh, 0)}로 하락폭이 커서 추세 반전을 확인한 뒤 접근하는 편이 안전합니다.`);
    else s.push('200일선 위로 올라오고 12개월 수익률이 플러스로 돌아서면 다시 검토하세요.');
    return s.join(' ');
  }
  s.push(`${name}: 3·6·12개월 평균 수익률 ${fmtPct(x.composite, 0)}, 변동성 ${(x.vol * 100).toFixed(0)}%로 위험조정 모멘텀 ${x.rank}/${x.total}위이고, 200일선 위(${fmtPct(x.price / x.ma200 - 1, 0)})에서 상승 추세를 유지하고 있습니다.`);
  if (x.offHigh > -0.05) s.push('52주 고점 부근이라 추세가 강합니다.');
  else if (x.offHigh <= -0.2) s.push(`다만 52주 고점 대비 ${fmtPct(x.offHigh, 0)}로 조정폭이 커서 추세 약화를 경계해야 합니다.`);
  if (x.action === '매수 관심') s.push(`제안 비중은 ${(x.weight * 100).toFixed(0)}%입니다.`);
  else if (x.action === '매수 대기') s.push(`추천 후보지만 단기 지표가 ${x.checks.find((c) => c.key === 'timing')?.detail}이라 눌림목이나 분할 매수를 기다리는 편이 낫습니다.`);
  else if (x.action === '매도 검토') s.push(`단기 지표(${x.checks.find((c) => c.key === 'timing')?.detail})가 급격히 약해져 보유 중이면 비중 축소를 검토할 만합니다.`);
  else if (x.sectorCapped) s.push('순위는 높지만 같은 섹터 종목이 이미 추천에 들어 분산을 위해 제외했습니다.');
  else s.push('추천 순위 밖이지만 추세는 살아 있어 보유 중이면 유지해도 됩니다.');
  if (regime && regime.ok === false) s.push(`시장 지수가 약세(${regime.detail})라 비중을 줄였습니다.`);
  return s.join(' ');
}
