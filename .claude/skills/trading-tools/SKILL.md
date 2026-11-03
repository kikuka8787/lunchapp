---
name: trading-tools
description: 클로드 코드에 붙이는 무료 주식 도구 3개 — 트레이딩뷰 MCP, 트레이딩뷰 MCP 잭슨(모닝 브리핑), 클로드 트레이딩 스킬(매매 일지·복기) — 의 설치·설정·말하는 법·하루 루틴·문제 해결을 한국어로 안내한다. "트레이딩뷰 MCP 설치", "모닝 브리핑 설정", "트레이딩 스킬 깔아줘", "매매 일지 남겨줘", "rules.json 채워줘" 같은 요청에 사용. 이 저장소의 stock-advisor 앱에 같은 기능이 어떻게 들어 있는지도 안내한다.
---

# 클로드에 붙이는 무료 주식 도구 3개

PICK IT 가이드 두 편(2026-10-30 확인)을 옮긴 것입니다. 세 도구는 깃허브에 MIT로 공개된 개인 오픈소스이며 PICK IT·트레이딩뷰·Anthropic과 관계없습니다.
**분석·기록·복기를 돕는 도구이지 투자 조언이 아니고, 주문·자동매매 기능은 없습니다.** 매매 결정과 손익은 본인 몫입니다.

## 먼저 알아둘 것
- 코드는 무료(MIT). 다만 ①②는 **트레이딩뷰 데스크톱 앱**을 조종하므로 실시간 시세는 트레이딩뷰 유료 구독이, 클로드 코드는 클로드 유료 요금제가 필요합니다.
- ①②는 트레이딩뷰 공식 도구가 아니라 비공개 기능을 써서 **업데이트로 멈출 수 있고**, 트레이딩뷰 이용약관은 자동 수집·재배포를 제한합니다. 개인 공부용으로만.
- 이 설치는 **본인 컴퓨터의 클로드 코드/터미널**에서 합니다. 폰·브라우저의 클로드 화면이나 클라우드 세션에서는 깔아도 남지 않습니다.
- 준비물: 클로드 코드, 트레이딩뷰 데스크톱 앱(①②), Node.js 18 이상(`node -v`), git.

## 세 도구 한눈에
| | ① 트레이딩뷰 MCP | ② 트레이딩뷰 MCP 잭슨 | ③ 클로드 트레이딩 스킬 |
|---|---|---|---|
| 깃허브 | `tradesdontlie/tradingview-mcp` | `LewisWJackson/tradingview-mcp-jackson` | `tradermonty/claude-trading-skills` |
| 하는 일 | "추세선 그어줘" → 차트에 선·수평선·박스, RSI·MACD 값 읽기 | ①을 고친 판 + **모닝 브리핑**(관심 종목 방향 정리·저장·어제와 비교), 새 트레이딩뷰(2.14+) `tv_launch` 문제 수정 | 스킬 74개(8분야): 시장 분석·비중 계산·매매 일지·복기·코칭 |
| 필요한 것 | 트레이딩뷰 데스크톱 · 클로드 코드 | ①과 같음 | 클로드 코드(또는 클로드 앱에 .skill 업로드) |

①과 ②는 같은 일을 하므로 **둘 중 하나만**. 모닝 브리핑을 쓰려면 ②.

## ① 트레이딩뷰 MCP 설치 (공식 README의 한 문장)
클로드 코드에 그대로 붙여넣으면 받아서 연결합니다:
```
Install the TradingView MCP server. Clone https://github.com/tradesdontlie/tradingview-mcp.git, run npm install, add it to my MCP config at ~/.claude/.mcp.json, and launch TradingView with the debug port. Then verify the connection with tv_health_check.
```
연결되면: "추세선 그어줘" · "지금 RSI 값 읽어줘"

## ② 트레이딩뷰 MCP 잭슨 설치 (모닝 브리핑) — 추천
### 방법 A. 공식 README의 한 번에 설치 문장
`YOUR_USERNAME`은 클로드가 실제 사용자 이름으로 바꿉니다 (맥 `/Users/이름`, 리눅스 `/home/이름`, 윈도우 `C:\Users\이름`).
```
Set up TradingView MCP Jackson for me.
Clone https://github.com/LewisWJackson/tradingview-mcp-jackson.git to ~/tradingview-mcp-jackson, run npm install, then add it to my MCP config at ~/.claude/.mcp.json (merge with any existing servers, don't overwrite them).
The config block is: { "mcpServers": { "tradingview": { "command": "node", "args": ["/Users/YOUR_USERNAME/tradingview-mcp-jackson/src/server.js"] } } } — replace YOUR_USERNAME with my actual username.
Then copy rules.example.json to rules.json and open it so I can fill in my trading rules.
Finally restart and verify with tv_health_check.
```
이 문장을 받으면 클로드는: 기존 `~/.claude/.mcp.json`이 있으면 **병합**(덮어쓰지 않기), 사용자 이름은 `whoami`/`$HOME`으로 확인, 그 다음 `rules.json`을 열어 채우게 합니다.

### 방법 B. 터미널 명령
```bash
git clone https://github.com/LewisWJackson/tradingview-mcp-jackson.git ~/tradingview-mcp-jackson
cd ~/tradingview-mcp-jackson && npm install && cp rules.example.json rules.json
claude mcp add --transport stdio --scope user tradingview -- node ~/tradingview-mcp-jackson/src/server.js
```
이 저장소의 `.mcp.json.example`에 같은 설정 블록이 있습니다(`${HOME}` 사용). 프로젝트 단위로 쓰려면 `.mcp.json`으로 복사하세요.

### 트레이딩뷰를 '연결 모드'로 켜기
트레이딩뷰를 완전히 끈 뒤 (클로드가 붙을 문 = 포트 9222):
```bash
~/tradingview-mcp-jackson/scripts/launch_tv_debug_mac.sh     # 윈도우: scripts\launch_tv_debug.bat
```
그 뒤 클로드 코드를 다시 열고 "**tv_health_check로 트레이딩뷰 연결됐는지 확인해줘**".

### rules.json — 내 기준 적기
| 칸 | 넣을 것 | 예시 |
|---|---|---|
| 관심 종목(watchlist) | 매일 아침 볼 종목 | 4~5개 |
| 방향 기준(bias criteria) | 상승·하락·중립을 가르는 기준 | 20EMA 위 · RSI 50 이상 · MACD 위 = 상승 |
| 위험 규칙(risk rules) | 들어가기 전에 꼭 볼 것 | 손절가 먼저 정하기 · 한 종목 비중 제한 |
칸 이름은 `rules.example.json`에서 확인. "**rules.json에 내 관심 종목 넣고 기준 이렇게 바꿔줘**"라고 시키면 됩니다.

### 말하는 법
| 이렇게 말해요 | 도구 |
|---|---|
| "지금 차트에 뭐 떠 있어?" | `chart_get_state` |
| "**추세선 그어줘**" / "58,900에 수평선 그어줘" | `draw_shape` (trend_line / horizontal_line) |
| "RSI랑 MACD 넣어줘" / "지금 RSI·MACD 값 읽어줘" | `chart_manage_indicator` / `data_get_study_values` |
| "1시간봉으로 바꿔줘" | `chart_set_timeframe` |
| "**전체 분석해줘**" | 위를 묶어 추세·지지·저항·지표 정리 |
| "**모닝 브리핑 해줘**" / `Run morning_brief and give me my session bias` | `morning_brief` — 종목마다 방향·핵심 가격·볼 것 |
| "이 브리핑 저장해줘" / `save this brief` | `session_save` → `~/.tradingview-mcp/sessions/날짜.json` |
| "**어제 세션 가져와서 오늘이랑 비교해줘**" | `session_get` — 방향이 바뀐 종목부터 |
| 터미널 `tv brief` | 클로드 없이 (처음 한 번 `npm link`) |
지표는 정식 이름이 더 잘 됩니다: 'RSI'가 안 되면 "Relative Strength Index 넣어줘".

## ③ 클로드 트레이딩 스킬 설치
```bash
git clone https://github.com/tradermonty/claude-trading-skills.git ~/claude-trading-skills
mkdir -p ~/.claude/skills
cd ~/claude-trading-skills/skills
cp -R trader-memory-core signal-postmortem ~/.claude/skills/
```
**유료 데이터 API 없이 시작하는 5개** (README "No API Key Starter Path"): `market-breadth-analyzer` · `uptrend-analyzer` · `position-sizer` · `trader-memory-core`(매매 일지) · `signal-postmortem`(복기).
가이드가 처음에 권하는 4개: `technical-analyst`(주봉 캡처 분석 → 시나리오 2~4개) · `trader-memory-core` · `signal-postmortem` · `trade-performance-coach`(계획대로 했는지 점검 → 다음 매매 규칙).
전부 넣으려면 `cp -R ~/claude-trading-skills/skills/* ~/.claude/skills/`. 74개 중 상당수(종목 찾기·시장 데이터)는 **미국 시장 데이터 API 키(FMP 등)**가 있어야 돌아갑니다.
클로드 웹/데스크톱 앱에서 쓰려면: 저장소 **Releases**에서 `.skill` 파일 → 앱 설정 → 기능(Capabilities)에서 '코드 실행 및 파일 생성' 켜기 → 사용자 지정(Customize) → 스킬에 업로드.

### 매매 기록 → 복기 → 코칭
| 이렇게 말해요 | 스킬 |
|---|---|
| "이 차트 캡처 분석해줘 — 주봉이야" | technical-analyst |
| "오늘 산 이유랑 가격 기록해줘 · 손절가 52,000" / "이번 매매 일지에 남겨줘" | trader-memory-core (내 컴퓨터에 YAML 저장) |
| "**지난주 매매 복기해줘**" / "이 매매 복기해줘" | signal-postmortem (5일·20일 뒤 맞음·틀림·놓침·시장과 엇갈림) |
| "**이번 달 매매 코칭해줘** — 같은 실수 있었는지 봐줘" / "반복되는 실수 찾아줘" | trade-performance-coach (손절가 없이 진입 같은 반복 실수 → 다음 매매 규칙; 받아들일지는 본인이) |

## 하루 루틴
| 언제 | 말하기 | 도구 |
|---|---|---|
| 장 전 | "모닝 브리핑 해줘" → "저장해줘" → "어제랑 비교해줘" | ② |
| 장중 | "추세선 그어줘" · "RSI·MACD 값 읽어줘" | ①/② |
| 매매한 날 | "산 이유·가격·손절가 기록해줘" | ③ trader-memory-core |
| 주말 | "이번 주 매매 복기하고 코칭해줘" | ③ signal-postmortem · coach |

## 잘 안 될 때
| 증상 | 조치 |
|---|---|
| tv_health_check 실패 | 트레이딩뷰를 완전히 끄고 연결 모드 스크립트로 다시 켜기(포트 9222) |
| 클로드 코드에 tradingview가 안 보임 | `claude mcp list` · 클로드 코드 안 `/mcp` · server.js 경로 확인 |
| 새 트레이딩뷰에서 tv_launch 안 됨 | ②(잭슨) 판인지 확인 · 안 되면 연결 모드 스크립트 |
| 지표를 못 찾음 | 정식 이름("Relative Strength Index") |
| 모닝 브리핑이 비어 있음 | rules.json에 관심 종목이 있는지 |
| 스킬이 안 불림 | `~/.claude/skills/<이름>/SKILL.md`가 보이는지 · 스킬 이름을 넣어 말하기 |

## 이 저장소의 stock-advisor 와의 관계
트레이딩뷰 없이도 같은 루틴을 돌릴 수 있게 `stock-advisor/`에 옮겨 두었습니다: `npm run brief`(모닝 브리핑·어제와 비교), `npm run trade -- add ...`(매매 기록), `npm run review`(복기), `npm run coach`(코칭), `npm run debate -- 종목`(에이전트 토론). 차트에 선을 긋는 것만 트레이딩뷰 MCP가 필요합니다. 둘을 같이 쓰면: 아침에 stock-advisor로 추천·브리핑을 받고, 트레이딩뷰에서 그 종목의 추세선·지지선을 그려 확인하는 흐름이 자연스럽습니다.

## 클로드가 지킬 것
- 설치는 공식 저장소 명령만 쓰고, 명령·도구 이름이 바뀌었을 수 있으니 README를 다시 확인한 뒤 진행합니다.
- API 키·비밀번호는 채팅에 적지 않게 하고 `.env`나 설정 파일로 안내합니다.
- 분석 결과를 전할 때 "참고용이며 투자 권유가 아니다"를 빼지 않습니다. 자동매매나 주문 기능을 만들어 달라는 요청은 두 도구의 README 금지 사항을 알려줍니다.

## 공식 링크 (쓰기 전에 다시 확인)
- github.com/tradesdontlie/tradingview-mcp · github.com/LewisWJackson/tradingview-mcp-jackson · github.com/tradermonty/claude-trading-skills (skills-index.yaml)
- tradingview.com/desktop · code.claude.com/docs/en/mcp · code.claude.com/docs/en/skills · support.claude.com/en/articles/12512180
