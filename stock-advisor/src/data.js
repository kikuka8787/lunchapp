// Yahoo Finance 비공식 차트 API (API 키 불필요). 한국 종목은 .KS(코스피) / .KQ(코스닥).
export const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';

// endpoint: Node CLI는 Yahoo 직접, 브라우저는 CORS 때문에 serve.js 의 /api/chart 프록시를 쓴다.
export async function fetchCloses(symbol, { range = '2y', interval = '1d', endpoint = YAHOO } = {}) {
  const url = `${endpoint}/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${symbol}: 시세 조회 실패 (HTTP ${res.status})`);
  return parseChart(symbol, await res.json());
}

export function parseChart(symbol, json) {
  const result = json?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close?.filter((v) => v != null);
  if (!closes?.length) throw new Error(`${symbol}: 시세 데이터가 없습니다`);
  return { closes, currency: result.meta?.currency ?? '' };
}

// --demo 용 결정적 가짜 시세 (네트워크 없이 흐름 확인). 종목마다 추세가 다르게 나오도록 drift 를 준다.
export function demoCloses(seed) {
  let x = (seed * 2654435761) % 4294967296; // 가까운 시드끼리 비슷한 수열이 나오지 않게 섞는다
  const rand = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = 0; i < 10; i++) rand();
  const drift = (rand() - 0.4) * 0.004;
  const out = [100];
  for (let i = 1; i < 520; i++) out.push(out[i - 1] * (1 + drift + (rand() - 0.5) * 0.03));
  return { closes: out, currency: 'DEMO' };
}
