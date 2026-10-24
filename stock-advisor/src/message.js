const ICON = { '매수 관심': '🟢', '매도 검토': '🔴', '관망': '⚪' };

const fmt = (n, cur) =>
  `${n.toLocaleString('ko-KR', { maximumFractionDigits: cur === 'KRW' ? 0 : 2 })}${cur === 'KRW' ? '원' : cur ? ` ${cur}` : ''}`;

export function buildMessage(results, date = new Date()) {
  const d = date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const lines = [`📈 ${d} 주식 신호`];
  const ok = results.filter((r) => !r.error);
  // 신호가 강한 종목을 위로
  ok.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  for (const r of ok) {
    const sign = r.changePct >= 0 ? '+' : '';
    lines.push('', `${ICON[r.action]} ${r.name} ${r.action}`,
      `  ${fmt(r.price, r.currency)} (${sign}${r.changePct.toFixed(1)}%)`);
    if (r.reasons.length) lines.push(`  · ${r.reasons.join(', ')}`);
  }
  for (const r of results.filter((x) => x.error)) lines.push('', `⚠️ ${r.name}: ${r.error}`);
  lines.push('', '※ 기술적 지표 기반 참고용이며 투자 권유가 아닙니다. 투자 판단과 손익 책임은 본인에게 있습니다.');
  return lines.join('\n');
}
