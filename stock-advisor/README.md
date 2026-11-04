# stock-advisor

관심 종목의 시세를 가져와 **듀얼 모멘텀 + 변동성 조절 + 200일선 필터** 규칙으로
**매수 관심 / 보유 / 관망 / 매도 검토** 신호와 제안 비중을 만들고, 브라우저 앱으로 보여주거나
[PlayMCP](https://playmcp.kakao.com)의 카카오톡 "나와의 채팅방"으로 보내주는 앱입니다.

> ⚠️ 참고용 신호일 뿐 투자 권유가 아닙니다. 자동 주문 기능은 없으며, 투자 판단과 손익은 본인 책임입니다.

## 실행

```bash
cd stock-advisor
npm install
npm run web       # 웹 앱: http://localhost:3000 (시세 프록시 포함)
npm run demo      # CLI: 가짜 시세로 메시지 형태만 확인 (네트워크 불필요)
npm run dry-run   # CLI: 실제 시세로 분석, 카톡은 보내지 않고 출력만
npm start         # CLI: 분석 후 카카오톡 전송 (PlayMCP 연동 필요)
npm run backtest  # CLI: 5년 백테스트 (--demo, --market kr|us, --range 2y|5y|10y, --watch-only)
npm run next      # 다음 한국장/미국장 개장 알림 시각
npm run check     # 유니버스·관심 종목 코드가 전부 조회되는지 점검 (실패 종목 목록 출력)
npm run brief     # 모닝 브리핑 (관심 종목 방향 · 핵심 가격 · 볼 것 · 어제와 비교) — 출력만
npm run review    # 5일 · 20일 전 신호 복기 (맞음 / 틀림 / 놓침 / 시장과 엇갈림)
npm run trade -- add buy 005930.KS 70000 --qty 10 --stop 64000 --reason "200일선 돌파"   # 매매 기록
npm run coach     # 매매 코칭 (반복 실수 → 다음 매매 규칙)
npm run debate -- 005930.KS   # 에이전트 토론: 분석가 → 강세/약세 → 트레이더 제안 → 리스크팀 → 매니저 (규칙 기반)
npm run schedule  # 개장 시각마다 시장별 알림 (계속 떠 있는 프로세스)
npm test
```

### 모닝 브리핑 · 복기 · 코칭 (PICK IT 가이드의 "펀드 매니저" 루틴을 앱 안에)
[트레이딩뷰 MCP 잭슨](https://github.com/LewisWJackson/tradingview-mcp-jackson)의 모닝 브리핑·세션 비교와
[클로드 트레이딩 스킬](https://github.com/tradermonty/claude-trading-skills)의 매매 기록·복기·코칭 개념을 이 앱에 맞게 넣었습니다.
트레이딩뷰 데스크톱이나 API 키 없이, 이미 받는 시세만으로 돌아갑니다.

| 하루 루틴 | 명령 / 웹 | 하는 일 |
|---|---|---|
| 장 전 | `npm run brief` · 웹 "메시지 형식: 모닝 브리핑" | 관심 종목마다 **방향**(20EMA 위 · RSI 50 이상 · MACD 위 = 상승) · **지지/저항**(20EMA, 200일선, 손절 기준, 60일·52주 고점) · **볼 것**(RSI 과열 근접, MACD 크로스 임박, 200일선 테스트, 신고가 도전, 거래량 급증) + 추천 요약 + 위험 규칙 |
| 매일 자동 | 분석할 때마다 `data/sessions.json`(웹은 브라우저)에 세션 저장 | **어제와 비교**: 액션·방향이 바뀐 종목부터, 추천 진입/이탈 |
| 매매한 날 | `npm run trade -- add buy 종목 가격 --stop 손절가 --qty 수량 --reason "이유"` · 웹 "매매 기록" | 산 이유 · 가격 · 손절가 · 수량 기록 (당시 신호도 같이 저장) |
| 며칠 뒤 | `npm run review` · 웹 "복기 실행" | 5일·20일 전 세션의 모든 신호를 지금 가격으로 채점 → 적중률, 추천/매수/관망 계열 평균 수익률 |
| 주말 | `npm run coach` · 웹 "코칭 받기" | 손절가 없이 진입 · 손절 폭 과다 · 비중 초과 · 신호 역행 매수 · 약세장 매수 · 손절 미이행 · 근거 미기록을 세어 **반복 실수**를 찾고 **다음 매매 규칙** 제안 |

위험 규칙과 코칭 기준은 `config.json`의 `rules`에서 바꿉니다 (`capital`을 넣으면 한 종목 비중 초과도 점검). 세션 저장 뒤 비교·복기가 붙으므로 **처음 며칠은 "비교할 세션 없음"이 정상**입니다. 데모 시세에서는 저장하지 않습니다.

### 에이전트 토론 (TradingAgents 구조를 규칙으로)
[TradingAgents](https://github.com/TauricResearch/TradingAgents)는 분석가·강세/약세 연구원·트레이더·리스크팀·매니저를 LLM 에이전트로 짜서 한 종목을 토론시키는 연구용 프레임워크입니다(Apache-2.0, LLM 사용료 별도).
`npm run debate -- 종목코드` 또는 웹 카드의 "에이전트 토론 보기"는 같은 역할 구조를 **LLM 없이 우리 지표만으로** 흉내 냅니다:
분석가(기술적·리스크·시장 국면, 재무/뉴스는 "데이터 없음" 명시) → 강세/약세 근거 → 트레이더 제안(진입 방식·비중·손절·1차 목표·손익비) → 리스크팀(최대 손실·손익비·변동성·과열·섹터) 승인/조건부/거절 → 매니저 결론.
무료이고 결정적이지만 뉴스·실적은 못 봅니다. 진짜 LLM 토론이 필요하면 본체를 쓰세요 — 설치·비용·면책 안내는 `.claude/skills/tradingagents/SKILL.md`(이 저장소를 Claude Code로 열고 "TradingAgents 설치 순서 알려줘").

### 가이드의 원래 도구를 Claude Code에서 쓰려면
클로드 코드에 **한 문장만 붙여넣어도** 설치됩니다 (공식 README 문장, 2026-10-30 기준):

- 트레이딩뷰 MCP 잭슨(모닝 브리핑 포함, 추천):
  `Set up TradingView MCP Jackson for me. Clone https://github.com/LewisWJackson/tradingview-mcp-jackson.git to ~/tradingview-mcp-jackson, run npm install, then add it to my MCP config at ~/.claude/.mcp.json (merge with any existing servers, don't overwrite them). The config block is: { "mcpServers": { "tradingview": { "command": "node", "args": ["/Users/YOUR_USERNAME/tradingview-mcp-jackson/src/server.js"] } } } — replace YOUR_USERNAME with my actual username. Then copy rules.example.json to rules.json and open it so I can fill in my trading rules. Finally restart and verify with tv_health_check.`
- 트레이딩뷰 MCP 원본: `Install the TradingView MCP server. Clone https://github.com/tradesdontlie/tradingview-mcp.git, run npm install, add it to my MCP config at ~/.claude/.mcp.json, and launch TradingView with the debug port. Then verify the connection with tv_health_check.`
- 트레이딩 스킬 중 **유료 데이터 API 없이 시작하는 5개**: `market-breadth-analyzer` · `uptrend-analyzer` · `position-sizer` · `trader-memory-core`(매매 일지) · `signal-postmortem`(복기). 클로드 웹에서는 저장소 Releases의 `.skill` 파일을 올리면 됩니다.
- 그다음: "Run morning_brief and give me my session bias" → 마음에 들면 "save this brief" → 다음 날 "어제 세션 가져와서 비교해줘". 매매할 때마다 "이번 매매 일지에 남겨줘", 끝나면 "이 매매 복기해줘", 쌓이면 "반복되는 실수 찾아줘".

전체 안내(설정 블록, rules.json 칸, 말하는 법, 문제 해결)는 저장소 루트의 `.claude/skills/trading-tools/SKILL.md`에 있고, 이 저장소를 Claude Code로 열면 "트레이딩뷰 MCP 설치해줘"에 그 내용으로 답합니다. 프로젝트용 MCP 설정 예시는 루트 `.mcp.json.example`.

`scripts/setup-claude-trading-tools.sh`에 가이드(2026-10-30 기준)의 설치 명령을 그대로 모았습니다 — 트레이딩뷰 MCP 잭슨 설치·`claude mcp add` 등록·트레이딩 스킬 4개 복사. 본인 컴퓨터에서 실행하고, 트레이딩뷰를 연결 모드(포트 9222)로 켠 뒤 "tv_health_check로 확인해줘"로 시작하세요. 트레이딩뷰 공식 도구가 아니라 업데이트로 멈출 수 있고, 자동매매·재배포는 금지입니다.

### 개장 알림 (한국장 09:00 KST, 미국장 09:30 ET)
`npm run schedule`을 띄워두면 한국장 개장엔 `.KS/.KQ` 종목만, 미국장 개장엔 나머지 종목만 분석해 보냅니다.
서머타임은 자동 반영되고 주말은 건너뜁니다. **공휴일은 반영하지 않아** 휴장일에도 메시지가 나갑니다.

```bash
npm run schedule -- --dry-run     # 전송 없이 콘솔로만
npm run schedule -- --brief       # 모닝 브리핑 형식으로 보내기
OFFSET_MIN=10 npm run schedule    # 개장 10분 전에
node src/index.js --market kr     # 한 번만 수동 실행
```

cron으로 돌리려면 (서머타임 땐 미국장 22:30, 아니면 23:30 KST):
```cron
0 9 * * 1-5    cd /path/to/stock-advisor && PLAYMCP_TOKEN=... node src/index.js --market kr
30 22 * * 1-5  cd /path/to/stock-advisor && PLAYMCP_TOKEN=... node src/index.js --market us
```

### 백테스트
웹 앱의 "백테스트" 버튼 또는 `npm run backtest`. 월 1회(21거래일) 리밸런싱, 현금 수익 0,
편도 거래비용 0.1%(`strategy.costBps`), 균등 매수보유와 비교. 총수익·연복리(CAGR)·최대낙폭·변동성·샤프를 보여줍니다.
한국·미국 종목을 섞으면 거래일이 달라 직전 종가로 채워 정렬합니다.
제약: 슬리피지·세금·배당 미반영, 리밸런싱 사이 비중 변동(drift) 무시, 생존편향(현재 관심 종목으로만 과거를 봄) 있음.

### 웹 앱
- 시장(전체/한국/미국) 선택 → "추천 종목 분석": 시장 국면 → 🏆 추천 TOP N(근거 체크·설명·손절가) → 📋 내 관심 종목 신호
- 관심 종목 추가/삭제 (브라우저에 저장), "데모 시세" 체크로 네트워크 없이 체험
- 백테스트: 수익곡선 차트 + 지표 표 + 최근 리밸런싱 보유 종목
- 카카오톡 메시지 미리보기 + 복사 버튼. "카카오톡으로 보내기"는 PlayMCP 연결 전까지 비활성
- ⚙️ 전략 설정에서 파라미터 조정 가능
- 유니버스 100종목을 실제 시세로 돌리면 Yahoo 요청이 100번 나가므로(동시 6개) 20~30초쯤 걸립니다

CLI 종목은 `config.json`의 `watchlist`에서 수정합니다 (코스피 `.KS`, 코스닥 `.KQ`, 예: `005930.KS`).
시세는 Yahoo Finance 비공식 API를 사용합니다(키 불필요, 지연/중단 가능).

## 전략: 왜 듀얼 모멘텀인가

GitHub에서 "최신이면서 가장 효과 좋은" 전략을 찾아봤지만, 스타 수는 인기 지표이지 수익률이 아니고
보고 수익률이 높은 저장소일수록 거래비용·표본외 검증이 빠진 경우가 많았습니다. 조사 요약:

| 후보 | 보고 성과 | 판단 |
|---|---|---|
| **듀얼 모멘텀** (Antonacci, GEM) | 절대+상대 모멘텀 결합. 모멘텀 효과는 Jegadeesh & Titman(1993) 이후 가장 널리 재현된 이상현상 | ✅ 채택. 일봉만으로 구현 가능, 규칙 단순, 하락장 방어 |
| **변동성 조절 모멘텀** (Daniel & Moskowitz 2016, KAIST 한국시장 연구) | 한국 월간 데이터(2000~2015)에서 MDD 69%→45%, 샤프 개선 | ✅ 채택. 비중 산정에 사용 |
| 일중 모멘텀 SPY (Zarattini 외 2024) | 연 19.6%, 샤프 1.33 보고 | ❌ 분봉 데이터 필요, 제3자 재현에서 성과 축소 |
| TradingAgents, FinRL 등 LLM/RL 에이전트 (GitHub 수만 스타) | 일부 런에서 30일 7% 수익, MDD 22% | ❌ API 비용, 결과 재현성 낮음. 추후 보조 분석용으로 검토 |
| je-suis-tm/quant-trading (11k 스타, MACD·RSI 등 17개) | 백테스트 수치 없음, 무마찰 가정 | 부분 채택: RSI/MACD를 단기 타이밍 보조로만 사용 |

### 규칙 (v2)
1. **시장 국면**: KOSPI(`^KS11`) / S&P500(`^GSPC`)이 12개월 수익률 > 0 이고 200일선 위면 "상승 추세". 아니면 약세로 보고 비중을 `regimeWeight`(0.5)배로 줄입니다.
2. **절대 모멘텀**: 종목 12개월 수익률(최근 1개월 제외) > 0 **그리고** 가격 > 200일선 → 후보. 아니면 `관망`(현금).
3. **상대 모멘텀**: 3·6·12개월 수익률 평균 ÷ 변동성(위험조정 모멘텀)으로 순위. 상위 `topN`(3)개 추천, 섹터당 `maxPerSector`(2)개까지.
4. **비중**: `targetVol`(15%) ÷ 최근 60일 실현 변동성, 상한 `maxWeight`(40%), 합계 100% 이내. 추천 종목에만 비중을 줍니다.
5. **단기 타이밍**: RSI 70 이상·MACD 데드크로스 등으로 점수화. 추천 후보인데 점수가 음수면 `매수 대기`(눌림목/분할 매수), −3 이하면 `매도 검토`.
6. **손절 기준**: 최근 60일 고점 대비 월간 변동성의 2배(8~20%) 또는 200일선 중 높은 쪽.

액션: 🟢 매수 관심 · 🟡 매수 대기 · 🔵 보유 · ⚪ 관망 · 🔴 매도 검토

### 추천 종목과 근거
- **후보**: `universe.json`의 한국 50종목·미국 50종목(시가총액 상위, 섹터 태그) ∪ 내 관심 종목. 손으로 고른 목록이라 최신이 아닐 수 있으니 필요하면 수정하세요.
- **근거**: 종목마다 절대 모멘텀·200일선·52주 고점 대비·변동성·거래량·단기 타이밍을 ✅/⚠️/❌로 보여주고, 왜 추천/관망인지 한 문단으로 설명합니다. 카톡 메시지엔 핵심 근거 3~4개와 손절 기준가가 들어갑니다.
- 웹 앱 "추천 후보"에서 "관심 종목만"을 고르면 유니버스 없이 내 종목끼리만 순위를 매깁니다 (CLI: `--watch-only`).

파라미터는 `config.json`의 `strategy` 또는 웹 앱 ⚙️에서 바꿀 수 있습니다.
백테스트로 과거 성과를 확인할 수 있지만 과거 성과가 미래 수익을 보장하지는 않습니다.

## PlayMCP 연동 (아직 미연결)

CLI는 MCP 클라이언트로 PlayMCP 서버에 접속해 "나와의 채팅방" 도구를 호출합니다.

| 환경변수 | 설명 |
|---|---|
| `PLAYMCP_TOKEN` | PlayMCP 접속용 Bearer 토큰 (필수) |
| `PLAYMCP_URL` | 기본값 `https://playmcp.kakao.com/mcp` — 도구함 화면에 안내된 주소가 다르면 그 값 사용 |
| `PLAYMCP_TOOL` | 카톡 전송 도구 이름. 비우면 설명에서 "나와의 채팅"을 찾아 자동 선택 |

1. PlayMCP에 카카오 계정으로 로그인하고 **카카오톡 나와의 채팅방**을 도구함에 추가합니다.
2. 토큰을 발급해 `PLAYMCP_TOKEN`으로 설정합니다.
3. `npm run tools`로 도구 목록을 확인하고, 전송 도구 이름을 `PLAYMCP_TOOL`에 지정합니다.
4. `npm start`.

개발 환경에서 PlayMCP/Yahoo에 접속할 수 없어 **실제 연동과 실제 시세 조회는 테스트하지 못했습니다**
(단위 테스트, `--demo`, 웹 앱 데모 모드만 검증). 특히 직접 만든 앱용 **토큰 발급 방식**은 공식 문서로 확인하지 못했습니다.

## 문서
- `docs/주식-스킬-정리.md` — 요구사항별로 무엇이 어디에 들어갔는지, 명령, 전략 근거, 하루 루틴, 남은 일 정리

## 구조
- `web/` 브라우저 앱 (index.html, app.js, chart.js, style.css) · `src/serve.js` 정적 서버 + 시세 프록시
- `src/data.js` 시세 조회 · `src/indicators.js` 지표 · `src/strategy.js` 전략(분석·순위·근거) · `src/screener.js` 유니버스 스크리닝 · `src/backtest.js` 백테스트
- `universe.json` 추천 후보 종목 목록 · `config.json` 관심 종목과 전략 파라미터
- `src/markets.js` 개장 시각 계산 · `src/schedule.js` 개장 알림 스케줄러
- `src/brief.js` 모닝 브리핑 · `src/sessions.js` 세션 저장/어제와 비교 · `src/review.js` 신호 복기 · `src/journal.js` 매매 기록/코칭 · `src/debate.js` 에이전트 토론
- `scripts/setup-claude-trading-tools.sh` 가이드의 트레이딩뷰 MCP·트레이딩 스킬 설치 스크립트
- `src/message.js` 카톡 메시지 · `src/playmcp.js` MCP 클라이언트 · `src/index.js` CLI
