#!/usr/bin/env bash
# PICK IT 가이드(2026-10-30 기준)의 설치 명령을 그대로 모은 스크립트. 본인 컴퓨터(맥/리눅스)에서 실행하세요.
#  ① 트레이딩뷰 MCP 잭슨: 클로드 코드가 트레이딩뷰 데스크톱 차트를 다룸 (추세선, 지표, 모닝 브리핑)
#  ② 클로드 트레이딩 스킬 4개: 차트 분석 · 매매 기록 · 복기 · 코칭
# 준비물: 클로드 코드(유료 요금제), 트레이딩뷰 데스크톱 앱, Node.js 18+, git
# 주의: 트레이딩뷰 공식 도구가 아니며 비공개 기능을 써서 업데이트로 멈출 수 있습니다. 저장소 README 를 먼저 확인하세요.
set -euo pipefail

echo "▶ ① 트레이딩뷰 MCP 잭슨 설치"
if [ ! -d ~/tradingview-mcp-jackson ]; then
  git clone https://github.com/LewisWJackson/tradingview-mcp-jackson.git ~/tradingview-mcp-jackson
fi
(cd ~/tradingview-mcp-jackson && npm install && [ -f rules.json ] || cp rules.example.json rules.json)

echo "▶ 클로드 코드에 MCP 등록"
claude mcp add --transport stdio --scope user tradingview -- node ~/tradingview-mcp-jackson/src/server.js || echo "  (이미 등록돼 있으면 무시)"

echo "▶ ② 클로드 트레이딩 스킬 4개 설치"
if [ ! -d ~/claude-trading-skills ]; then
  git clone https://github.com/tradermonty/claude-trading-skills.git ~/claude-trading-skills
fi
mkdir -p ~/.claude/skills
(cd ~/claude-trading-skills/skills && cp -R technical-analyst trader-memory-core signal-postmortem trade-performance-coach ~/.claude/skills/)

echo "▶ ③ TradingAgents (선택) — 멀티 에이전트 LLM 프레임워크. LLM 사용료가 들고 Python 3.11+ 가 필요합니다."
if [ "${WITH_TRADINGAGENTS:-0}" = "1" ]; then
  [ -d ~/TradingAgents ] || git clone https://github.com/TauricResearch/TradingAgents.git ~/TradingAgents
  echo "  → cd ~/TradingAgents 후 가상환경(conda/uv)을 만들고 'pip install .' (또는 'uv pip install .'), 실행은 'tradingagents'"
  echo "  → API 키는 .env 파일에. LLM 제공사에서 사용료 상한을 먼저 걸고, 가장 얕은 깊이로 한 번만 돌려 보세요."
else
  echo "  (건너뜀 — 받으려면 WITH_TRADINGAGENTS=1 로 다시 실행. 공식: git clone https://github.com/TauricResearch/TradingAgents.git)"
fi

cat <<'MSG'

✅ 설치 끝. 다음 순서:
 1. 트레이딩뷰를 완전히 끈 뒤 연결 모드로 켜기:  ~/tradingview-mcp-jackson/scripts/launch_tv_debug_mac.sh  (윈도우: scripts\launch_tv_debug.bat)
 2. ~/tradingview-mcp-jackson/rules.json 에 관심 종목 · 방향 기준 · 위험 규칙 적기
 3. 클로드 코드를 다시 열고 "tv_health_check로 트레이딩뷰 연결됐는지 확인해줘"
 4. "추세선 그어줘" · "모닝 브리핑 해줘" · "이번 매매 복기해줘"
 74개 스킬 전부: cp -R ~/claude-trading-skills/skills/* ~/.claude/skills/
 TradingAgents 안내: 이 저장소를 클로드 코드로 열고 "TradingAgents 설치 순서 알려줘" (.claude/skills/tradingagents)
MSG
