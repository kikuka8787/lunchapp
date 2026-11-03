import { fmtPrice, fmtPct } from './format.js';

// TradingAgents(분석가 → 강세/약세 연구원 → 트레이더 → 리스크팀 → 매니저) 흐름을 규칙 기반으로 흉내 낸 "에이전트 토론".
// LLM 없이 이 앱이 가진 시세 지표만 쓴다. 재무제표·뉴스·감성 데이터는 없으므로 그 자리는 "데이터 없음"으로 남긴다.
const BULLISH = new Set(['매수 관심', '매수 대기', '보유']);

export function debate(r, { regime = null, peers = [] } = {}) {
  const cur = r.currency;
  const P = (n) => fmtPrice(n, cur);
  const check = (key) => r.checks.find((c) => c.key === key);
  const sectorPeers = peers.filter((p) => !p.error && p.sector === r.sector && p.symbol !== r.symbol);
  const sectorInMarket = sectorPeers.filter((p) => p.inMarket).length;

  // 📊 분석가
  const analysts = {
    market: `3·6·12개월 평균 ${fmtPct(r.composite, 0)}${r.rank ? ` (위험조정 모멘텀 ${r.rank}/${r.total}위)` : ''}, 200일선 ${r.ma200 != null ? `${r.price > r.ma200 ? '위' : '아래'} ${fmtPct(r.price / r.ma200 - 1, 0)}` : '-'}, 방향 ${r.bias}(${r.biasDetail}), 52주 고점 대비 ${fmtPct(r.offHigh, 0)}`,
    risk: `연 변동성 ${r.vol != null ? (r.vol * 100).toFixed(0) + '%' : '-'}, 손절 기준 ${P(r.stopPrice)}(${fmtPct(r.stopPrice / r.price - 1, 0)}), 60일 고점 ${P(r.peak60)}${r.volRatio != null ? `, 거래량 20일 평균 대비 ${fmtPct(r.volRatio - 1, 0)}` : ''}`,
    fundamentals: '데이터 없음 — 이 앱은 재무제표·실적을 받지 않습니다. PER·이익 성장·부채는 직접 확인하세요.',
    news: '데이터 없음 — 뉴스·감성·공시를 받지 않습니다. 실적 발표일과 최근 공시를 확인하세요.',
    regime: regime ? `${regime.label}${regime.detail ? ` (${regime.detail})` : ''}` : '지수 정보 없음',
  };

  // 🐂 강세 / 🐻 약세
  const bull = [];
  const bear = [];
  if (r.mom12 != null) (r.mom12 > 0 ? bull : bear).push(`12개월 수익률 ${fmtPct(r.mom12, 0)} — 절대 모멘텀 ${r.mom12 > 0 ? '충족' : '미달'}`);
  if (r.ma200 != null) (r.price > r.ma200 ? bull : bear).push(`200일선 ${r.price > r.ma200 ? '위에서 추세 유지' : '아래 — 장기 추세 꺾임'}`);
  if (r.rank && r.total) (r.rank <= Math.max(3, Math.ceil(r.total * 0.2)) ? bull : bear).push(`후보 ${r.total}개 중 위험조정 모멘텀 ${r.rank}위${r.rank <= 3 ? ' — 상위권' : ''}`);
  if (r.offHigh > -0.05) bull.push('52주 고점 부근 — 매물 저항이 적은 구간');
  else if (r.offHigh <= -0.2) bear.push(`52주 고점 대비 ${fmtPct(r.offHigh, 0)} — 조정폭이 커 추세 약화 가능`);
  if (r.bias === '상승') bull.push(`단기 방향 상승 (${r.biasDetail})`);
  if (r.bias === '하락') bear.push(`단기 방향 하락 (${r.biasDetail})`);
  if (r.rsi != null && r.rsi >= 70) bear.push(`RSI ${r.rsi.toFixed(0)} 과열 — 추격 매수 시 단기 되돌림 위험`);
  if (r.rsi != null && r.rsi <= 30 && r.inMarket) bull.push(`RSI ${r.rsi.toFixed(0)} 과매도 — 상승 추세 속 눌림목 가능`);
  if (r.volRatio != null && r.volRatio >= 1.3) bull.push(`거래량 ${fmtPct(r.volRatio - 1, 0)} 증가 — 수급 동반`);
  if (r.volRatio != null && r.volRatio < 0.7) bear.push(`거래량 ${fmtPct(r.volRatio - 1, 0)} — 관심 감소`);
  if (r.vol != null && r.vol >= 0.5) bear.push(`변동성 ${(r.vol * 100).toFixed(0)}% — 손절이 자주 걸릴 수 있음`);
  if (regime && regime.ok === false) bear.push(`시장 지수 약세(${regime.detail}) — 개별 종목 모멘텀이 시장에 끌려 내려갈 수 있음`);
  if (regime && regime.ok === true) bull.push('시장 지수 상승 추세 — 순풍');
  if (sectorPeers.length) (sectorInMarket >= sectorPeers.length / 2 ? bull : bear).push(`같은 섹터(${r.sector}) ${sectorPeers.length}종목 중 ${sectorInMarket}개가 상승 추세 — 섹터 ${sectorInMarket >= sectorPeers.length / 2 ? '순환매 유리' : '전반 약세'}`);
  if (r.sectorCapped) bear.push('같은 섹터 종목이 이미 추천에 포함 — 분산 측면에서 후순위');
  bear.push('재무·뉴스 데이터 없이 가격만 본 판단 — 실적 쇼크·공시 리스크는 반영 안 됨');

  // 💼 트레이더 제안
  const riskPct = r.price > 0 ? (r.price - r.stopPrice) / r.price : null;
  const res = r.resistance.find((l) => l.price >= r.price * 1.02);
  const target = res ? { price: res.price, label: res.label } : riskPct ? { price: r.price * (1 + 2 * riskPct), label: '2R' } : null;
  const rr = target && riskPct > 0 ? (target.price / r.price - 1) / riskPct : null;
  const entry = {
    '매수 관심': '현재가 부근 분할 진입 (2~3회 나눠서)',
    '매수 대기': `눌림목 대기 — ${r.ema20 != null ? `20EMA ${P(r.ema20)} 부근` : '단기 과열 해소'} 또는 RSI 60 이하 회복 후`,
    '보유': '신규 진입 없음 — 보유분 유지, 추천 순위 진입 시 비중 조정',
    '관망': '진입 없음 — 200일선 회복·12개월 수익률 플러스 전환 확인 후 재검토',
    '매도 검토': '보유 중이면 비중 축소, 신규 진입 금지',
  }[r.action] ?? '진입 없음';
  const trader = {
    action: r.action, entry, price: r.price, weight: r.weight, stop: r.stopPrice, riskPct, target, rr,
    holding: '월 1회 리밸런싱 점검 · 200일선 이탈 또는 손절가 도달 시 청산',
  };

  // 🛡 리스크팀
  const issues = [];
  if (!r.inMarket) issues.push('추세 조건 미충족');
  if (r.action === '매도 검토') issues.push('단기 급락 신호');
  if (rr != null && rr < 1) issues.push(`손익비 ${rr.toFixed(1)} — 1 미만`);
  else if (rr != null && rr < 1.5) issues.push(`손익비 ${rr.toFixed(1)} — 1.5 미만`);
  if (r.vol != null && r.vol >= 0.6) issues.push('변동성 과다');
  if (regime && regime.ok === false) issues.push('시장 약세 — 비중 절반 적용');
  if (r.rsi != null && r.rsi >= 70 && BULLISH.has(r.action)) issues.push('과열 구간 진입');
  const maxLoss = r.weight && riskPct ? r.weight * riskPct : null;
  let verdict;
  if (!r.inMarket || r.action === '매도 검토') verdict = '거절';
  else if (issues.length === 0 || (issues.length === 1 && issues[0].startsWith('시장 약세'))) verdict = '승인';
  else verdict = '조건부 승인';
  const riskTeam = { verdict, issues, maxLoss, sectorNote: sectorPeers.length ? `섹터 ${r.sector} 내 ${sectorPeers.length + 1}종목 중 하나` : null };

  // 🧑‍💼 매니저 결론
  let manager;
  if (verdict === '거절') manager = `거절 — ${issues.join(', ')}. ${r.action === '매도 검토' ? '보유 중이면 비중 축소를 검토하세요.' : '현금 유지, 추세가 돌아서면 다시 봅니다.'}`;
  else if (verdict === '승인') manager = `승인 — ${r.action}${r.weight ? `, 비중 ${(r.weight * 100).toFixed(0)}%` : ''}. 손절 ${P(r.stopPrice)} 먼저 걸고 ${entry.split(' — ')[0]}.`;
  else manager = `조건부 승인 — ${issues.join(', ')}. ${rr != null && rr < 1.5 ? '목표를 더 높게 보거나 진입을 눌림목에서 하면 손익비가 좋아집니다. ' : ''}${r.rsi != null && r.rsi >= 70 ? '과열이 식을 때까지 기다리세요. ' : ''}비중은 제안의 절반 이하로 시작.`;

  return { symbol: r.symbol, name: r.name, sector: r.sector, currency: cur, analysts, bull, bear, trader, riskTeam, manager };
}

export function buildDebateText(d, date = new Date()) {
  const P = (n) => fmtPrice(n, d.currency);
  const L = [`🏛 에이전트 토론 — ${d.name} (${d.symbol}${d.sector ? ` · ${d.sector}` : ''}) · ${date.toLocaleDateString('ko-KR')}`];
  L.push('TradingAgents 구조(분석가→강세/약세 연구원→트레이더→리스크팀→매니저)를 규칙으로 흉내 낸 것입니다. LLM 없음 · 재무/뉴스 데이터 없음 · 투자 조언 아님.');
  L.push('', '📊 분석가');
  L.push(`  · 시장(기술적): ${d.analysts.market}`);
  L.push(`  · 리스크 지표: ${d.analysts.risk}`);
  L.push(`  · 시장 국면: ${d.analysts.regime}`);
  L.push(`  · 펀더멘털: ${d.analysts.fundamentals}`);
  L.push(`  · 뉴스/감성: ${d.analysts.news}`);
  L.push('', '🐂 강세 연구원');
  L.push(...(d.bull.length ? d.bull.map((b) => `  · ${b}`) : ['  · 강세 근거 없음']));
  L.push('', '🐻 약세 연구원');
  L.push(...d.bear.map((b) => `  · ${b}`));
  const t = d.trader;
  L.push('', '💼 트레이더 제안');
  L.push(`  · 액션: ${t.action} · 진입: ${t.entry}`);
  L.push(`  · 비중 ${t.weight ? (t.weight * 100).toFixed(0) + '%' : '0% (진입 없음)'} · 손절 ${P(t.stop)} (${fmtPct(-t.riskPct, 0)})${t.target ? ` · 1차 목표 ${P(t.target.price)} (${fmtPct(t.target.price / t.price - 1, 0)}, ${t.target.label})` : ''}${t.rr != null ? ` · 손익비 ${t.rr.toFixed(1)}` : ''}`);
  L.push(`  · 보유: ${t.holding}`);
  const rt = d.riskTeam;
  L.push('', '🛡 리스크팀');
  L.push(`  · ${rt.maxLoss != null ? `포트폴리오 최대 손실 ${(rt.maxLoss * 100).toFixed(1)}%(비중×손절폭)` : '비중 없음'}${rt.sectorNote ? ` · ${rt.sectorNote}` : ''}`);
  L.push(`  · 지적: ${rt.issues.length ? rt.issues.join(', ') : '없음'}`);
  L.push(`  → ${rt.verdict}`);
  L.push('', '🧑‍💼 매니저 결론');
  L.push(`  → ${d.manager}`);
  L.push('', '※ 규칙 기반 참고용이며 투자 권유가 아닙니다. 결정과 손익 책임은 본인에게 있습니다.');
  return L.join('\n');
}
