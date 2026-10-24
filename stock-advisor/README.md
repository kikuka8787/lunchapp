# stock-advisor

관심 종목의 시세를 가져와 기술적 지표(RSI, MACD, 20/60일 이동평균)로 **매수 관심 / 관망 / 매도 검토** 신호를 만들고,
[PlayMCP](https://playmcp.kakao.com)의 카카오톡 "나와의 채팅방" 도구로 메시지를 보내주는 Node.js 앱입니다.

> ⚠️ 참고용 신호일 뿐 투자 권유가 아닙니다. 자동 주문 기능은 없으며, 투자 판단과 손익은 본인 책임입니다.

## 실행

```bash
cd stock-advisor
npm install
npm run demo      # 가짜 시세로 메시지 형태만 확인 (네트워크 불필요)
npm run dry-run   # 실제 시세로 분석, 카톡은 보내지 않고 출력만
npm start         # 분석 후 카카오톡 전송
npm test
```

종목은 `config.json`의 `watchlist`에서 수정합니다 (한국 종목: 코스피 `.KS`, 코스닥 `.KQ`, 예: `005930.KS`).
시세는 Yahoo Finance 비공식 API를 사용합니다(키 불필요, 지연/중단 가능).

## PlayMCP 연동

앱은 MCP 클라이언트로 PlayMCP 서버에 접속해 도구 목록을 조회하고, "나와의 채팅방" 도구를 호출합니다.

| 환경변수 | 설명 |
|---|---|
| `PLAYMCP_TOKEN` | PlayMCP 접속용 Bearer 토큰 (필수) |
| `PLAYMCP_URL` | 기본값 `https://playmcp.kakao.com/mcp` — PlayMCP 도구함 화면에 안내된 주소가 다르면 그 값 사용 |
| `PLAYMCP_TOOL` | 카톡 전송 도구 이름. 비우면 설명에서 "나와의 채팅"을 찾아 자동 선택 |

1. PlayMCP에 카카오 계정으로 로그인하고 **카카오톡 나와의 채팅방**을 도구함에 추가합니다.
2. 토큰을 발급해 `PLAYMCP_TOKEN`으로 설정합니다.
3. `npm run tools`로 도구 목록을 확인하고, 전송 도구 이름을 `PLAYMCP_TOOL`에 지정합니다.
4. `npm start`.

### 확인이 필요한 부분 (솔직한 한계)
개발 환경에서 PlayMCP/Yahoo에 접속할 수 없어 **실제 연동은 테스트하지 못했습니다** (단위 테스트와 `--demo`만 검증).
특히 다음은 실제 환경에서 확인해야 합니다.
- PlayMCP는 원래 Claude/ChatGPT 같은 AI 클라이언트에 연결하는 용도로 안내되며, 직접 만든 앱이 쓸 수 있는 **토큰 발급 방식**(OAuth 또는 원타임 토큰 등)은 공식 문서로 확인하지 못했습니다. 토큰이 짧게 만료되는 방식이라면 매번 갱신이 필요합니다.
- 도구 이름과 파라미터는 추정이므로, 위 3단계로 확인하세요(`npm run tools`).

## 매일 자동 실행 (예시)
```cron
30 8 * * 1-5  cd /path/to/stock-advisor && PLAYMCP_TOKEN=... npm start
```

## 구조
- `src/data.js` 시세 조회 · `src/indicators.js` 지표 · `src/strategy.js` 점수제 신호
- `src/message.js` 카톡 메시지 · `src/playmcp.js` MCP 클라이언트 · `src/index.js` CLI
