// 시장별 개장 시각. 휴장일(공휴일)은 반영하지 않으므로 그날은 메시지가 "휴장" 없이 그냥 나간다.
export const MARKETS = {
  kr: { label: '한국장', flag: '🇰🇷', tz: 'Asia/Seoul', open: '09:00' },
  us: { label: '미국장', flag: '🇺🇸', tz: 'America/New_York', open: '09:30' },
};

// tz 기준 특정 날짜의 HH:MM 이 UTC 로 언제인지 (서머타임 자동 반영)
export function zonedTime(y, m, d, hhmm, tz) {
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const offset = tzOffsetMs(guess, tz);
  const t = guess - offset;
  // 서머타임 경계에서 오프셋이 바뀌면 한 번 더 보정
  return t + (offset - tzOffsetMs(t, tz));
}

function tzOffsetMs(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ms));
  const g = (type) => Number(parts.find((p) => p.type === type).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ms;
}

// 다음 개장 시각 (UTC ms). offsetMin 만큼 앞당겨 알릴 수 있다. 주말은 건너뛴다.
export function nextOpen(market, { now = Date.now(), offsetMin = 0 } = {}) {
  const m = MARKETS[market];
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: m.tz, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now));
  const g = (type) => Number(parts.find((p) => p.type === type).value);
  let y = g('year'); let mo = g('month'); let d = g('day');
  for (let i = 0; i < 10; i++) {
    const t = zonedTime(y, mo, d, m.open, m.tz) - offsetMin * 60e3;
    const dow = new Date(t + tzOffsetMs(t, m.tz)).getUTCDay();
    if (t > now && dow !== 0 && dow !== 6) return t;
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    y = next.getUTCFullYear(); mo = next.getUTCMonth() + 1; d = next.getUTCDate();
  }
  throw new Error('다음 개장 시각을 찾지 못했습니다');
}

export const fmtKST = (ms) => new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
