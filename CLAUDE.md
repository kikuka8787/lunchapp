# lunchapp 저장소 안내 (Claude Code 용)

두 개의 독립된 앱이 있습니다.
- 루트 `index.html / script.js / style.css`: **선생님과 함께하는 오늘의 급식** — 나이스(NEIS) API로 학교 급식·알러지를 보여주는 정적 웹앱. 빌드 없이 파일을 열면 됩니다.
- `stock-advisor/`: **오늘의 주식 신호** — 대형주 유니버스를 듀얼 모멘텀 규칙으로 스크리닝해 추천·근거·손절가를 보여주고, 모닝 브리핑·복기·매매 코칭·에이전트 토론까지 하는 Node.js 앱(웹 + CLI). 카카오톡 전송은 PlayMCP 연동 전까지 비활성.

## stock-advisor 자주 쓰는 명령 (`cd stock-advisor && npm install` 후)
| 명령 | 하는 일 |
|---|---|
| `npm run web` | 웹 앱 http://localhost:3000 (시세 프록시 포함). "데모 시세"를 끄면 실제 Yahoo 시세 |
| `npm run check` | 유니버스·관심 종목 코드가 전부 조회되는지 점검 — **실제 시세로 처음 돌릴 때 먼저** |
| `npm run dry-run` / `npm run brief` | 추천 + 관심 종목 신호 / 모닝 브리핑(방향·지지저항·볼 것·어제와 비교). 전송 없이 출력 |
| `npm run backtest -- --market kr` | 5년 백테스트 (CAGR·MDD·샤프 vs 균등보유) |
| `npm run debate -- 005930.KS` | 에이전트 토론 (분석가→강세/약세→트레이더→리스크팀→매니저, 규칙 기반) |
| `npm run trade -- add buy 005930.KS 70000 --stop 64000 --qty 10 --reason "..."` | 매매 기록 |
| `npm run review` / `npm run coach` | 5일·20일 전 신호 복기 / 반복 실수 → 다음 매매 규칙 |
| `npm run schedule -- --dry-run --brief` | 한국장 09:00·미국장 09:30(ET) 개장마다 시장별 알림 |
| `npm test` | 단위 테스트 (node --test) |

설정: `stock-advisor/config.json`(관심 종목·전략 파라미터·위험 규칙), `stock-advisor/universe.json`(추천 후보 100종목, 손으로 고른 목록이라 코드 오류 가능). 세션·매매 기록은 `stock-advisor/data/`(git 제외)와 브라우저 localStorage에 저장.

## 규칙
- 모든 메시지·화면에 "규칙 기반 참고용이며 투자 권유가 아닙니다" 면책을 유지한다. 자동 주문·자동매매 기능은 만들지 않는다.
- 전략 변경은 `src/strategy.js` 한 곳에서, 테스트(`npm test`)를 같이 고친다. 데모 시세(`--demo`)로 나온 수익률은 의미 없으니 결과를 보고할 때 "데모"라고 밝힌다.
- 외부 API 키는 채팅에 적지 말고 환경변수/`.env`로.

## 이 저장소의 Claude Code 스킬 (`.claude/skills/`)
- `trading-tools`: 트레이딩뷰 MCP·잭슨(모닝 브리핑)·클로드 트레이딩 스킬 설치와 사용법 (한국어)
- `tradingagents`: TradingAgents 멀티 에이전트 LLM 프레임워크 설치·비용·면책 안내
- 트레이딩뷰 MCP를 이 프로젝트에 붙이려면 `.mcp.json.example` → `.mcp.json`
- 설치 스크립트: `stock-advisor/scripts/setup-claude-trading-tools.sh` (본인 컴퓨터에서)
