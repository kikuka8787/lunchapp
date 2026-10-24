export const fmtPrice = (n, cur) =>
  `${n.toLocaleString('ko-KR', { maximumFractionDigits: cur === 'KRW' ? 0 : 2 })}${cur === 'KRW' ? '원' : cur ? ` ${cur}` : ''}`;

export const fmtPct = (x, digits = 1) => {
  if (x == null || !Number.isFinite(x)) return '-';
  let v = (x * 100).toFixed(digits);
  if (Number(v) === 0) v = (0).toFixed(digits); // "-0%" 방지
  return `${Number(v) > 0 ? '+' : ''}${v}%`;
};
