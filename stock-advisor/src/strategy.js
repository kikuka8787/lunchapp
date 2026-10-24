import { sma, rsi, macd } from './indicators.js';

// 규칙 기반 점수제: 각 지표가 매수(+)/매도(-) 쪽으로 점수를 준다.
// 투자 조언이 아니라 단순한 기술적 지표 요약이다.
export function analyze(closes) {
  const price = closes[closes.length - 1];
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const r = rsi(closes, 14);
  const m = macd(closes);

  let score = 0;
  const reasons = [];

  if (r != null) {
    if (r <= 30) { score += 2; reasons.push(`RSI ${r.toFixed(0)} 과매도권`); }
    else if (r >= 70) { score -= 2; reasons.push(`RSI ${r.toFixed(0)} 과매수권`); }
  }

  if (m) {
    if (m.prevHist <= 0 && m.hist > 0) { score += 2; reasons.push('MACD 골든크로스'); }
    else if (m.prevHist >= 0 && m.hist < 0) { score -= 2; reasons.push('MACD 데드크로스'); }
    else if (m.hist > 0) score += 1;
    else score -= 1;
  }

  if (ma20 != null && ma60 != null) {
    if (ma20 > ma60 && price > ma20) { score += 1; reasons.push('20일선>60일선, 상승 추세'); }
    else if (ma20 < ma60 && price < ma20) { score -= 1; reasons.push('20일선<60일선, 하락 추세'); }
  }

  let action = '관망';
  if (score >= 3) action = '매수 관심';
  else if (score <= -3) action = '매도 검토';

  const prev = closes[closes.length - 2];
  return {
    price,
    changePct: prev ? ((price - prev) / prev) * 100 : 0,
    rsi: r,
    ma20,
    ma60,
    score,
    action,
    reasons,
  };
}
