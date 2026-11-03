// 한국장/미국장 개장 시각마다 해당 시장 종목만 분석해 카톡으로 보낸다. 계속 떠 있는 프로세스.
//   npm run schedule                 # 실제 전송
//   npm run schedule -- --dry-run    # 전송 없이 콘솔 출력
//   OFFSET_MIN=10 npm run schedule   # 개장 10분 전에 보내기
import { spawn } from 'node:child_process';
import { MARKETS, nextOpen, fmtKST } from './markets.js';

const extra = process.argv.slice(2);
const offsetMin = Number(process.env.OFFSET_MIN) || 0;

function run(market) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL('./index.js', import.meta.url).pathname, '--market', market, ...extra], { stdio: 'inherit' });
    child.on('exit', resolve);
  });
}

function arm(market) {
  const at = nextOpen(market, { offsetMin });
  const m = MARKETS[market];
  console.log(`⏰ ${m.flag} ${m.label} 다음 알림: ${fmtKST(at)} (KST)`);
  // setTimeout 상한(약 24.8일)보다 작으므로 그대로 사용
  setTimeout(async () => {
    console.log(`\n▶ ${m.flag} ${m.label} 개장 알림 실행 ${fmtKST(Date.now())}`);
    await run(market);
    arm(market);
  }, at - Date.now());
}

for (const market of Object.keys(MARKETS)) arm(market);
