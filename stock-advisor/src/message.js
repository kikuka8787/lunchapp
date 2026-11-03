import { fmtPrice, fmtPct } from './format.js';
import { picksOf, watchOf } from './screener.js';

export { fmtPrice, fmtPct };
export const ICON = { '매수 관심': '🟢', '매수 대기': '🟡', '보유': '🔵', '관망': '⚪', '매도 검토': '🔴' };
const ORDER = ['매수 관심', '매수 대기', '매도 검토', '보유', '관망'];
const FLAG = { kr: '🇰🇷 KOSPI', us: '🇺🇸 S&P500' };

export function buildMessage(results, { date = new Date(), title = '', regimes = {} } = {}) {
  const d = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const lines = [`📈 ${d} ${title ? `${title} ` : ''}주식 신호`];

  const regimeLines = Object.entries(regimes).map(([mk, r]) => `${FLAG[mk] ?? mk} ${r.label}${r.detail ? ` (${r.detail})` : ''}`);
  if (regimeLines.length) lines.push(`시장: ${regimeLines.join(' · ')}`);

  const picks = picksOf(results);
  lines.push('', `🏆 추천 TOP ${picks.length}`);
  if (!picks.length) lines.push('  조건을 충족하는 종목이 없습니다. 현금 비중을 유지하세요.');
  picks.forEach((r, i) => {
    const chg = r.changePct >= 0 ? '+' : '';
    lines.push(`${ICON[r.action]} ${i + 1}. ${r.name} ${r.action}${r.weight ? ` · 비중 ${(r.weight * 100).toFixed(0)}%` : ''}`,
      `  ${fmtPrice(r.price, r.currency)} (${chg}${r.changePct.toFixed(1)}%) · ${r.sector ?? ''}`,
      `  · ${r.reasons.slice(0, 4).join(', ')}`,
      `  🛡 손절 ${fmtPrice(r.stopPrice, r.currency)} (${fmtPct(r.stopPrice / r.price - 1, 0)})`);
  });

  const watch = watchOf(results).filter((r) => !r.error && !r.pick);
  if (watch.length) {
    watch.sort((a, b) => ORDER.indexOf(a.action) - ORDER.indexOf(b.action) || (a.rank ?? 99) - (b.rank ?? 99));
    lines.push('', '📋 내 관심 종목');
    for (const r of watch) {
      const chg = r.changePct >= 0 ? '+' : '';
      lines.push(`${ICON[r.action]} ${r.name} ${r.action} · ${fmtPrice(r.price, r.currency)} (${chg}${r.changePct.toFixed(1)}%)`,
        `  · ${r.reasons.slice(0, 3).join(', ')}`);
    }
  }

  const errors = results.filter((x) => x.error && x.watch);
  const failed = results.filter((x) => x.error && !x.watch).length;
  for (const r of errors) lines.push('', `⚠️ ${r.name}: ${r.error}`);
  if (failed) lines.push('', `⚠️ 후보 ${failed}종목은 시세 조회에 실패해 제외했습니다.`);

  lines.push('', '※ 규칙 기반 참고용이며 투자 권유가 아닙니다. 투자 판단과 손익 책임은 본인에게 있습니다.');
  return lines.join('\n');
}
