export const ICON = { '매수 관심': '🟢', '보유': '🔵', '관망': '⚪', '매도 검토': '🔴' };
const ORDER = ['매수 관심', '매도 검토', '보유', '관망'];

export const fmtPrice = (n, cur) =>
  `${n.toLocaleString('ko-KR', { maximumFractionDigits: cur === 'KRW' ? 0 : 2 })}${cur === 'KRW' ? '원' : cur ? ` ${cur}` : ''}`;

export const fmtPct = (x, digits = 1) => (x == null ? '-' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(digits)}%`);

export function buildMessage(results, date = new Date()) {
  const d = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const lines = [`📈 ${d} 주식 신호 (듀얼 모멘텀)`];
  const ok = results.filter((r) => !r.error);
  ok.sort((a, b) => ORDER.indexOf(a.action) - ORDER.indexOf(b.action) || (a.rank ?? 99) - (b.rank ?? 99));
  for (const r of ok) {
    const chg = r.changePct >= 0 ? '+' : '';
    lines.push('', `${ICON[r.action]} ${r.name} ${r.action}${r.weight ? ` · 비중 ${(r.weight * 100).toFixed(0)}%` : ''}`,
      `  ${fmtPrice(r.price, r.currency)} (${chg}${r.changePct.toFixed(1)}%)`);
    if (r.reasons.length) lines.push(`  · ${r.reasons.join(', ')}`);
  }
  for (const r of results.filter((x) => x.error)) lines.push('', `⚠️ ${r.name}: ${r.error}`);
  lines.push('', '※ 규칙 기반 참고용이며 투자 권유가 아닙니다. 투자 판단과 손익 책임은 본인에게 있습니다.');
  return lines.join('\n');
}
