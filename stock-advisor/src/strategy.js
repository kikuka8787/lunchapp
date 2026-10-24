import { sma, rsi, macd } from './indicators.js';

// 전략: 듀얼 모멘텀(Antonacci) + 변동성 조절(Daniel & Moskowitz) + 200일선 추세 필터(Faber)
//  1) 절대 모멘텀: 최근 12개월(마지막 1개월 제외) 수익률 > 0 이고 가격 > 200일선이면 "시장 참여", 아니면 현금/관망
//  2) 상대 모멘텀: 관심 종목 중 12개월 수익률 상위 topN 종목만 "매수 관심" 후보
//  3) 변동성 조절: 목표 변동성 / 실현 변동성 으로 비중 제안 (상한 maxWeight)
//  4) 단기 타이밍: RSI, MACD로 진입/이탈 시점 보조
// 투자 조언이 아니라 규칙 기반 참고 신호다.
export const DEFAULTS = {
  lookback: 252, // 12개월
  skip: 21, // 마지막 1개월 제외 (단기 반전 회피)
  trendMA: 200,
  volWindow: 60,
  targetVol: 0.15, // 연 15%
  maxWeight: 0.4,
  topN: 3,
};

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

export function analyze(closes, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const price = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const mom12 = momentum(closes, o.lookback, o.skip);
  const mom6 = momentum(closes, 126);
  const ma200 = sma(closes, o.trendMA);
  const ma20 = sma(closes, 20);
  const vol = annualizedVol(closes, o.volWindow);
  const r = rsi(closes, 14);
  const m = macd(closes);

  const reasons = [];
  // 1) 절대 모멘텀 + 추세 필터
  const momOk = mom12 != null ? mom12 > 0 : null;
  const trendOk = ma200 != null ? price > ma200 : null;
  if (momOk === true) reasons.push(`12개월 수익률 ${(mom12 * 100).toFixed(0)}%`);
  else if (momOk === false) reasons.push(`12개월 수익률 ${(mom12 * 100).toFixed(0)}% (절대 모멘텀 미달)`);
  if (trendOk === false) reasons.push('200일선 아래');
  const inMarket = momOk !== false && trendOk !== false;

  // 4) 단기 타이밍 점수
  let score = 0;
  if (r != null) {
    if (r <= 30) { score += 2; reasons.push(`RSI ${r.toFixed(0)} 과매도`); }
    else if (r >= 70) { score -= 2; reasons.push(`RSI ${r.toFixed(0)} 과매수`); }
  }
  if (m) {
    if (m.prevHist <= 0 && m.hist > 0) { score += 2; reasons.push('MACD 골든크로스'); }
    else if (m.prevHist >= 0 && m.hist < 0) { score -= 2; reasons.push('MACD 데드크로스'); }
    else score += m.hist > 0 ? 1 : -1;
  }
  if (ma20 != null) score += price > ma20 ? 1 : -1;

  // 3) 변동성 조절 비중
  const weight = inMarket && vol ? Math.min(o.maxWeight, o.targetVol / vol) : 0;

  return {
    price,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    mom12,
    mom6,
    ma200,
    vol,
    rsi: r,
    score,
    inMarket,
    weight,
    reasons,
    action: null, // rank() 에서 상대 모멘텀까지 반영해 확정
  };
}

// 상대 모멘텀: 관심 종목 전체를 보고 최종 액션을 정한다.
export function rank(results, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const ok = results.filter((x) => !x.error && x.mom12 != null);
  const sorted = [...ok].sort((a, b) => b.mom12 - a.mom12);
  sorted.forEach((x, i) => { x.rank = i + 1; });

  for (const x of results) {
    if (x.error) continue;
    const top = x.rank != null && x.rank <= o.topN;
    if (!x.inMarket) x.action = '관망';
    else if (x.score <= -3) x.action = '매도 검토';
    else if (top && x.score >= 0) x.action = '매수 관심';
    else x.action = '보유';
    if (top && x.inMarket) x.reasons.unshift(`모멘텀 ${x.rank}위`);
    if (x.action === '관망') x.weight = 0;
  }
  // 비중 합이 100%를 넘지 않게 정규화
  const total = results.reduce((s, x) => s + (x.weight ?? 0), 0);
  if (total > 1) for (const x of results) if (x.weight) x.weight /= total;
  return results;
}
