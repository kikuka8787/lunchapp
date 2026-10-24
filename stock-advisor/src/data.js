// Yahoo Finance 비공식 차트 API (API 키 불필요). 한국 종목은 .KS(코스피) / .KQ(코스닥).
export async function fetchCloses(symbol, { range = '1y', interval = '1d' } = {}) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${symbol}: 시세 조회 실패 (HTTP ${res.status})`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close?.filter((v) => v != null);
  if (!closes?.length) throw new Error(`${symbol}: 시세 데이터가 없습니다`);
  return { closes, currency: result.meta?.currency ?? '' };
}

// --demo 용 결정적 가짜 시세 (네트워크 없이 흐름 확인)
export function demoCloses(seed) {
  let x = seed;
  const rand = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const out = [100];
  for (let i = 1; i < 250; i++) out.push(out[i - 1] * (1 + (rand() - 0.48) * 0.03));
  return { closes: out, currency: 'DEMO' };
}
