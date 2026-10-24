---
name: google-canvas-app
description: 구글 제미나이(Gemini) 캔버스(Canvas)에서 바로 실행·미리보기·공유되는 웹앱(단일 HTML 파일)을 만드는 스킬. "캔버스 앱 만들어줘", "제미나이 캔버스용 앱", "HTML 한 파일로 앱 만들기", "퀴즈/타이머/계산기/수업 도구 앱 만들어줘"처럼 설치 없이 브라우저에서 돌아가는 작은 앱을 요청할 때 사용한다. 수업용 도구, 학급 운영 도구, 간단한 게임·퀴즈·계산기·타이머·추첨기 같은 앱에 특히 적합하다.
---

# 구글 캔버스 앱 만들기 스킬

Gemini Canvas(캔버스)는 코드를 작성하면 오른쪽 화면에서 **즉시 미리보기**가 되고, 링크로 **공유**할 수 있는 작업 공간이다.
이 스킬은 그 환경에서 **오류 없이 한 번에 실행되는 앱**을 만들기 위한 규칙과 템플릿을 정리한 것이다.

> 참고: "Canva(캔바, 디자인 도구)"용 앱이 아니라 **Google Gemini Canvas**용 웹앱을 만드는 스킬이다.

---

## 1. 기본 원칙 (반드시 지킬 것)

1. **단일 HTML 파일 하나**로 완결시킨다. (`<!DOCTYPE html>`부터 `</html>`까지)
   - CSS는 `<style>`, JS는 `<script>` 안에 인라인으로 작성한다.
   - 별도 `style.css`, `script.js`, 이미지 파일을 참조하지 않는다.
2. **빌드 도구 없이** 동작해야 한다. (npm, webpack, import map 설정, 서버 필요 ✕)
3. 외부 라이브러리는 **CDN `<script>` 태그**로만 불러온다.
   - 버전을 고정한다. (예: `chart.js@4.4.1`)
   - 허용 CDN 예: `cdnjs.cloudflare.com`, `cdn.jsdelivr.net`, `unpkg.com`, `cdn.tailwindcss.com`
4. **반응형**으로 만든다. (`<meta name="viewport" content="width=device-width, initial-scale=1">`)
   - 모바일 폭(360px)에서도 가로 스크롤이 생기지 않아야 한다.
5. UI 텍스트는 **사용자의 언어(기본: 한국어)**로 작성한다.
6. 코드를 **생략하지 않는다.** `// ... 나머지 동일` 같은 표기 금지. 항상 전체 파일을 출력한다.
7. 첫 화면에서 **바로 사용 가능**해야 한다. (로그인·설정 요구 ✕, 샘플 데이터 미리 채움 ○)

---

## 2. Canvas 미리보기 환경의 제약과 대응

미리보기는 **샌드박스 iframe** 안에서 실행된다. 아래 항목은 막히거나 불안정할 수 있다.

| 문제 | 대응 |
|---|---|
| `alert()`, `confirm()`, `prompt()` 차단 | **직접 만든 모달/토스트**로 대체 |
| `localStorage` 접근 시 예외 발생 가능 | 항상 `try/catch`로 감싸고, 실패해도 앱은 메모리 상태로 동작 |
| `window.open`, 팝업 차단 | 같은 화면 안의 패널/모달로 대체 |
| 클립보드 API(`navigator.clipboard`) 거부 | 실패 시 `<textarea>` 선택 후 `document.execCommand('copy')` 폴백 |
| 파일 다운로드 | `Blob` + `<a download>` 방식 사용 (실패 시 안내 문구 표시) |
| 카메라/마이크/위치 | 권한이 막힐 수 있으므로 **필수 기능으로 쓰지 않는다** |
| 외부 API 호출(CORS) | 가능하면 쓰지 않는다. 필요하면 CORS 허용 API만 사용하고 실패 처리를 넣는다 |

### localStorage 안전 래퍼 (그대로 복사해서 사용)

```js
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }
};
```

---

## 3. 만드는 순서 (워크플로)

### 1단계. 요구 정리 (질문은 최소화)
사용자 요청에서 아래 4가지를 추정하고, **불명확해도 합리적인 기본값으로 먼저 만든다.**
- 누가 쓰는가? (학생 / 교사 / 학부모 / 일반)
- 핵심 기능 1~3개는 무엇인가?
- 어떤 기기에서 쓰는가? (교실 TV·PC / 태블릿 / 휴대폰)
- 저장이 필요한가? (새로고침 후에도 유지 여부)

### 2단계. 화면 설계
- 화면 1개(한 페이지)로 시작한다. 기능이 많으면 **상단 탭** 또는 **하단 탭**으로 나눈다.
- 핵심 동작 버튼은 가장 눈에 띄게, 크게(최소 44px 높이) 둔다.
- 빈 상태(empty state)에는 사용법 안내 문구를 넣는다.

### 3단계. 코드 작성
- 아래 **템플릿**(5장)을 뼈대로 사용한다.
- 상태(state) 객체 하나 + `render()` 함수 하나로 화면을 갱신하는 구조를 기본으로 한다.
- 이벤트는 가능하면 **이벤트 위임**(부모에 한 번만 등록)으로 처리한다.

### 4단계. 자체 점검 (6장 체크리스트)
- 코드를 출력하기 전에 체크리스트를 머릿속으로 모두 확인한다.

### 5단계. 응답 형식
1. 한 줄 요약: 어떤 앱인지
2. **전체 코드** (코드 블록 1개, 생략 없음)
3. 사용법 3줄 이내
4. 수정 제안 2~3개 (예: "다크 모드 추가할까요?")

---

## 4. 디자인 가이드

- **색상**: 주 색 1개 + 중립색(회색 계열) + 강조색 1개 이내. CSS 변수로 정의한다.
- **글꼴**: 기본은 시스템 글꼴. 한글 웹폰트가 필요하면 Google Fonts의 `Noto Sans KR`, `Gowun Dodum` 등을 사용한다.
- **글자 크기**: 본문 16px 이상. 교실 TV용이면 24px 이상.
- **여백**: 카드 padding 16~24px, 요소 간격 8/16/24px 단위.
- **모서리**: `border-radius: 12px` 내외로 통일.
- **접근성**: 명도 대비 4.5:1 이상, 버튼에는 텍스트 또는 `aria-label`.
- **다크 모드(선택)**: `@media (prefers-color-scheme: dark)`에서 CSS 변수만 바꿔 대응.
- 이모지를 아이콘 대용으로 써도 좋다. (별도 아이콘 파일 불필요)

---

## 5. 기본 템플릿

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>앱 이름</title>
  <style>
    :root {
      --bg: #f6f7fb;
      --card: #ffffff;
      --text: #1f2430;
      --muted: #6b7280;
      --primary: #4f46e5;
      --primary-text: #ffffff;
      --accent: #f59e0b;
      --border: #e5e7eb;
      --radius: 12px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #11131a; --card: #1a1d27; --text: #eef0f6;
        --muted: #9aa1b2; --border: #2a2e3b;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 16px;
      font-family: "Noto Sans KR", system-ui, -apple-system, "Segoe UI", sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.5;
    }
    .app { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin: 0 0 16px; }
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 20px; margin-bottom: 16px;
    }
    button {
      min-height: 44px; padding: 0 18px; border: 0; border-radius: var(--radius);
      background: var(--primary); color: var(--primary-text);
      font: inherit; font-weight: 700; cursor: pointer;
    }
    button.ghost { background: transparent; color: var(--text); border: 1px solid var(--border); }
    button:active { transform: translateY(1px); }
    input, select, textarea {
      width: 100%; min-height: 44px; padding: 8px 12px; font: inherit;
      color: var(--text); background: var(--card);
      border: 1px solid var(--border); border-radius: var(--radius);
    }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .muted { color: var(--muted); font-size: .9rem; }

    /* 토스트 (alert 대체) */
    #toast {
      position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%) translateY(20px);
      background: #111827; color: #fff; padding: 10px 18px; border-radius: 999px;
      opacity: 0; pointer-events: none; transition: .25s;
    }
    #toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

    /* 모달 (confirm 대체) */
    #modal {
      position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(0,0,0,.45); padding: 16px;
    }
    #modal.show { display: flex; }
    #modal .box { background: var(--card); border-radius: var(--radius); padding: 24px; max-width: 360px; width: 100%; }
  </style>
</head>
<body>
  <main class="app">
    <h1>🧩 앱 이름</h1>

    <section class="card" id="view"></section>
  </main>

  <div id="toast" role="status" aria-live="polite"></div>
  <div id="modal" role="dialog" aria-modal="true">
    <div class="box">
      <p id="modal-msg"></p>
      <div class="row" style="justify-content:flex-end">
        <button class="ghost" id="modal-no">취소</button>
        <button id="modal-yes">확인</button>
      </div>
    </div>
  </div>

  <script>
    // ---------- 안전한 저장소 ----------
    const store = {
      get(key, fallback) {
        try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
        catch (e) { return fallback; }
      },
      set(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { return false; }
      }
    };

    // ---------- 상태 ----------
    const state = store.get('app-state', { items: [] });
    const save = () => store.set('app-state', state);

    // ---------- 유틸 ----------
    const $ = (sel) => document.querySelector(sel);
    const esc = (s) => String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    function toast(msg) {
      const t = $('#toast');
      t.textContent = msg; t.classList.add('show');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => t.classList.remove('show'), 1800);
    }

    function confirmModal(msg) {
      return new Promise(resolve => {
        $('#modal-msg').textContent = msg;
        $('#modal').classList.add('show');
        const done = (v) => { $('#modal').classList.remove('show'); resolve(v); };
        $('#modal-yes').onclick = () => done(true);
        $('#modal-no').onclick = () => done(false);
      });
    }

    // ---------- 화면 ----------
    function render() {
      $('#view').innerHTML = `
        <div class="row">
          <input id="new-item" placeholder="내용을 입력하세요" aria-label="새 항목">
          <button data-act="add">추가</button>
        </div>
        <ul>
          ${state.items.map((it, i) => `
            <li>${esc(it)} <button class="ghost" data-act="del" data-i="${i}">삭제</button></li>
          `).join('') || '<p class="muted">아직 항목이 없어요. 위에서 추가해 보세요.</p>'}
        </ul>`;
    }

    // ---------- 이벤트 (위임) ----------
    $('#view').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'add') {
        const input = $('#new-item');
        const v = input.value.trim();
        if (!v) return toast('내용을 입력해 주세요');
        state.items.push(v); save(); render(); toast('추가되었어요');
      }
      if (btn.dataset.act === 'del') {
        if (await confirmModal('삭제할까요?')) {
          state.items.splice(Number(btn.dataset.i), 1); save(); render();
        }
      }
    });

    render();
  </script>
</body>
</html>
```

---

## 6. 출력 전 체크리스트

- [ ] 파일 하나(`<!DOCTYPE html>` ~ `</html>`)로 완결되는가?
- [ ] 외부 파일(이미지·CSS·JS) 참조가 없는가? (CDN 제외)
- [ ] CDN 스크립트에 **버전**이 고정되어 있는가?
- [ ] `alert/confirm/prompt`를 쓰지 않았는가?
- [ ] `localStorage`를 `try/catch`로 감쌌는가?
- [ ] 사용자 입력을 `innerHTML`에 넣을 때 **이스케이프**했는가?
- [ ] 모바일 폭(360px)에서 가로 스크롤 없이 보이는가?
- [ ] 첫 화면에서 샘플 데이터/안내 문구가 보이는가?
- [ ] 버튼 크기가 44px 이상이고, 글자 대비가 충분한가?
- [ ] 콘솔 오류가 날 만한 오타·미정의 변수가 없는가?
- [ ] 코드를 생략하지 않고 **전체**를 출력했는가?

---

## 7. 자주 쓰는 기능 스니펫

### 7-1. 랜덤 뽑기 (공정한 셔플)
```js
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

### 7-2. 카운트다운 타이머
```js
let timerId = null;
function startTimer(seconds, onTick, onEnd) {
  clearInterval(timerId);
  let left = seconds;
  onTick(left);
  timerId = setInterval(() => {
    left--;
    onTick(left);
    if (left <= 0) { clearInterval(timerId); onEnd(); }
  }, 1000);
}
```

### 7-3. 텍스트 파일로 내보내기 (다운로드)
```js
function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
```

### 7-4. 클립보드 복사 (폴백 포함)
```js
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove();
    return ok;
  }
}
```

### 7-5. 차트 (Chart.js CDN)
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<canvas id="chart" height="200"></canvas>
<script>
  new Chart(document.getElementById('chart'), {
    type: 'bar',
    data: { labels: ['월','화','수'], datasets: [{ label: '횟수', data: [3, 5, 2] }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
</script>
```

### 7-6. 소리 효과 (외부 파일 없이)
```js
function beep(freq = 880, ms = 150) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, ms);
  } catch (e) { /* 소리 불가 환경이면 무시 */ }
}
```

---

## 8. 수정 요청이 왔을 때

- 사용자가 "여기만 바꿔줘"라고 해도 **항상 전체 코드를 다시 출력**한다. (Canvas에 그대로 붙여 넣기 위해)
- 바꾼 부분을 응답 맨 위에 **한 줄 변경 요약**으로 알려 준다.
- 기존 기능이 깨지지 않았는지 6장 체크리스트를 다시 확인한다.

---

## 9. 프롬프트 예시 (사용자가 이 스킬로 요청할 때)

```
캔버스 앱으로 만들어줘.
- 주제: 학급 모둠 자동 편성기
- 기능: 학생 이름 입력 → 모둠 수 선택 → 무작위로 모둠 나누기 → 결과 복사
- 대상: 교실 TV로 보여줄 거라 글씨 크게
- 한국어, 단일 HTML 파일, 저장은 새로고침해도 유지
```

→ 위 요청이 오면: 1장 원칙 → 5장 템플릿 → 7장 스니펫(셔플·클립보드)을 조합해 **한 번에 완성본**을 출력한다.

---

## 10. 하지 말아야 할 것

- 코드 일부만 보여주고 "나머지는 동일"이라고 쓰기
- 로컬 파일 경로(`./img/logo.png`)나 존재하지 않는 URL의 이미지 사용
- API 키·비밀번호·개인정보를 코드에 하드코딩하기
- 학생 실명·연락처 등 민감 정보를 서버로 전송하기 (저장은 기기 내부 `localStorage`까지만)
- 사용자가 요청하지 않은 대규모 기능 추가
