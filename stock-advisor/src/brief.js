import { fmtPrice, fmtPct } from './format.js';
import { picksOf, watchOf } from './screener.js';
import { ICON } from './message.js';

const ARROW = { '상승': '▲', '하락': '▼', '중립': '■' };
const FLAG = { kr: '🇰🇷 KOSPI', us: '🇺🇸 S&P500' };
export const DEFAULT_RISK_RULES = ['들어가기 전에 손절가부터 정한다', '한 종목 비중은 상한(기본 40%)을 넘기지 않는다', '시장 지수가 약세면 비중을 절반으로', '추천 밖 종목은 관망 — 신호 역행 매수 금지'];

// 모닝 브리핑: 관심 종목마다 방향 · 핵심 가격 · 볼 것 + 추천 요약 + 어제와 비교
export function buildBrief(results, { date = new Date(), title = '', regimes = {}, diff = null, riskRules = DEFAULT_RISK_RULES } = {}) {
  const d = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const lines = [`☀️ ${d} ${title ? `${title} ` : ''}모닝 브리핑`];
  const regimeLines = Object.entries(regimes).map(([mk, r]) => `${FLAG[mk] ?? mk} ${r.label}${r.detail ? ` (${r.detail})` : ''}`);
  if (regimeLines.length) lines.push(`시장: ${regimeLines.join(' · ')}`);

  const picks = picksOf(results);
  lines.push('', `🏆 추천 TOP ${picks.length}${picks.length ? '' : ' — 조건 충족 종목 없음, 현금 유지'}`);
  picks.forEach((r, i) => lines.push(`  ${i + 1}. ${r.name} ${ICON[r.action]} ${r.action}${r.weight ? ` · 비중 ${(r.weight * 100).toFixed(0)}%` : ''} · ${fmtPrice(r.price, r.currency)}`));

  const watch = watchOf(results).filter((r) => !r.error);
  if (watch.length) {
    lines.push('', '📋 관심 종목');
    for (const r of watch) {
      const chg = r.changePct >= 0 ? '+' : '';
      lines.push(`${ARROW[r.bias]} ${r.name} ${r.bias} · ${fmtPrice(r.price, r.currency)} (${chg}${r.changePct.toFixed(1)}%) · ${ICON[r.action]} ${r.action}`);
      lines.push(`  기준: ${r.biasDetail}`);
      const sup = r.support.slice(0, 2).map((l) => `${fmtPrice(l.price, r.currency)}(${l.label})`).join(' / ');
      const res = r.resistance.slice(0, 2).map((l) => `${fmtPrice(l.price, r.currency)}(${l.label})`).join(' / ');
      lines.push(`  지지 ${sup || '-'} · 저항 ${res || '-'}`);
      lines.push(`  볼 것: ${r.watchPoints.length ? r.watchPoints.join(', ') : '특이 신호 없음'}`);
    }
  }
  for (const r of results.filter((x) => x.error && x.watch)) lines.push(`⚠️ ${r.name}: ${r.error}`);

  if (diff) {
    lines.push('', `🔁 ${diff.prevDate} 대비`);
    const shown = diff.changed.filter((c) => c.watch || c.pick).slice(0, 8);
    for (const c of shown) lines.push(`  ${c.name}: ${c.items.join(', ')}${c.changePct != null ? ` (${fmtPct(c.changePct)})` : ''}`);
    if (diff.newPicks.length) lines.push(`  추천 진입: ${diff.newPicks.map((s) => `${s.name}(${s.rank}위)`).join(', ')}`);
    if (diff.droppedPicks.length) lines.push(`  추천 이탈: ${diff.droppedPicks.map((s) => s.name).join(', ')}`);
    if (!shown.length && !diff.newPicks.length && !diff.droppedPicks.length) lines.push('  관심·추천 종목 변화 없음');
  } else {
    lines.push('', '🔁 비교할 이전 세션이 없습니다 (내일부터 어제와 비교가 붙습니다)');
  }

  lines.push('', `🛡 위험 규칙: ${riskRules.join(' · ')}`);
  lines.push('', '※ 규칙 기반 참고용이며 투자 권유가 아닙니다. 투자 판단과 손익 책임은 본인에게 있습니다.');
  return lines.join('\n');
}
