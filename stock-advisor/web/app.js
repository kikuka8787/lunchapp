import { fetchCloses, demoCloses, marketOf, mapLimit } from '../src/data.js';
import { DEFAULTS } from '../src/strategy.js';
import { buildCandidates, screen, picksOf, watchOf } from '../src/screener.js';
import { backtest } from '../src/backtest.js';
import { buildMessage, ICON, fmtPrice, fmtPct } from '../src/message.js';
import { MARKETS, nextOpen, fmtKST } from '../src/markets.js';
import { renderEquityChart } from './chart.js';

const DEFAULT_WATCHLIST = [
    { symbol: '005930.KS', name: '삼성전자' },
    { symbol: '000660.KS', name: 'SK하이닉스' },
    { symbol: '035420.KS', name: 'NAVER' },
    { symbol: 'AAPL', name: '애플' },
    { symbol: 'NVDA', name: '엔비디아' },
];
const ACTION_CLASS = { '매수 관심': 'buy', '매수 대기': 'wait-buy', '보유': 'hold', '관망': 'wait', '매도 검토': 'sell' };
const ORDER = ['매수 관심', '매수 대기', '매도 검토', '보유', '관망'];
const CHECK_ICON = { true: '✅', warn: '⚠️', false: '❌', null: '➖' };
const INDEX_LABEL = { kr: 'KOSPI', us: 'S&P500' };
const DAYS = { '2y': 520, '5y': 1300, '10y': 2600 };

const universe = await fetch('universe.json').then((r) => r.json());

// 상태 관리
let state = {
    watchlist: JSON.parse(localStorage.getItem('watchlist')) || DEFAULT_WATCHLIST,
    strategy: { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('strategy')) || {}) },
    demo: localStorage.getItem('demoMode') === '1',
    market: localStorage.getItem('market') || 'all',
    scope: localStorage.getItem('scope') || 'universe',
    results: null,
    regimes: {},
};

// DOM 요소
const $ = (id) => document.getElementById(id);
const watchlistEl = $('watchlist');
const newSymbol = $('new-symbol');
const newName = $('new-name');
const addBtn = $('add-btn');
const analyzeBtn = $('analyze-btn');
const backtestBtn = $('backtest-btn');
const marketTabs = $('market-tabs');
const scopeSel = $('scope');
const progressEl = $('progress');
const nextOpenEl = $('next-open');
const regimeBar = $('regime-bar');
const picksSection = $('picks-section');
const picksContainer = $('picks-container');
const resultContainer = $('result-container');
const resultDate = $('result-date');
const backtestSection = $('backtest-section');
const btRange = $('bt-range');
const btMeta = $('bt-meta');
const btChart = $('bt-chart');
const btStats = $('bt-stats');
const btLast = $('bt-last');
const demoMode = $('demo-mode');
const messageSection = $('message-section');
const messagePreview = $('message-preview');
const copyBtn = $('copy-btn');
const settingsSidebar = $('settings-sidebar');
const overlay = $('overlay');
const settingsForm = $('settings-form');

function init() {
    renderWatchlist();
    renderSettings();
    renderMarketTabs();
    renderNextOpen();
    setInterval(renderNextOpen, 60_000);
    demoMode.checked = state.demo;
    scopeSel.value = state.scope;

    marketTabs.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-market]');
        if (!btn) return;
        state.market = btn.dataset.market;
        localStorage.setItem('market', state.market);
        renderMarketTabs();
        renderWatchlist();
    });
    scopeSel.addEventListener('change', () => {
        state.scope = scopeSel.value;
        localStorage.setItem('scope', state.scope);
    });
    analyzeBtn.addEventListener('click', runAnalysis);
    backtestBtn.addEventListener('click', runBacktest);
    btRange.addEventListener('change', runBacktest);
    addBtn.addEventListener('click', addSymbol);
    newSymbol.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSymbol(); });
    newName.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSymbol(); });
    demoMode.addEventListener('change', () => {
        state.demo = demoMode.checked;
        localStorage.setItem('demoMode', state.demo ? '1' : '0');
    });
    copyBtn.addEventListener('click', copyMessage);
    $('toggle-settings').addEventListener('click', openSidebar);
    $('close-settings').addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
    $('save-settings').addEventListener('click', saveSettings);
    $('reset-settings').addEventListener('click', () => { state.strategy = { ...DEFAULTS }; renderSettings(); });
}

// 시장 탭 / 다음 개장
function renderMarketTabs() {
    for (const b of marketTabs.querySelectorAll('button')) b.classList.toggle('active', b.dataset.market === state.market);
}

function renderNextOpen() {
    nextOpenEl.textContent = Object.entries(MARKETS)
        .map(([k, m]) => `${m.flag} ${m.label} 다음 개장 ${fmtKST(nextOpen(k))}`)
        .join(' · ') + ' (한국 시간)';
}

// 관심 종목
function renderWatchlist() {
    watchlistEl.innerHTML = '';
    state.watchlist.forEach((w, i) => {
        const chip = document.createElement('span');
        const inMarket = state.market === 'all' || marketOf(w.symbol) === state.market;
        chip.className = `chip${inMarket ? '' : ' dim'}`;
        chip.innerHTML = `<b>${escapeHtml(w.name)}</b> <small>${escapeHtml(w.symbol)}</small> <button title="삭제">&times;</button>`;
        chip.querySelector('button').addEventListener('click', () => {
            state.watchlist.splice(i, 1);
            saveWatchlist();
        });
        watchlistEl.appendChild(chip);
    });
    if (!state.watchlist.length) watchlistEl.innerHTML = '<span class="muted">종목을 추가하세요.</span>';
}

function addSymbol() {
    const symbol = newSymbol.value.trim().toUpperCase();
    if (!symbol) return;
    if (state.watchlist.some((w) => w.symbol === symbol)) { alert('이미 있는 종목입니다.'); return; }
    const known = [...universe.kr, ...universe.us].find((u) => u.symbol === symbol);
    state.watchlist.push({ symbol, name: newName.value.trim() || known?.name || symbol });
    newSymbol.value = '';
    newName.value = '';
    saveWatchlist();
}

function saveWatchlist() {
    localStorage.setItem('watchlist', JSON.stringify(state.watchlist));
    renderWatchlist();
}

// 시세 로더 (데모/실제) + 진행률
function makeLoader(range, total) {
    let done = 0;
    return async (symbol) => {
        const data = state.demo
            ? demoCloses(symbol, DAYS[range] ?? 520)
            : await fetchCloses(symbol, { range, endpoint: '/api/chart' });
        done++;
        progressEl.textContent = `시세 조회 ${done}/${total}`;
        return data;
    };
}

function candidates() {
    return buildCandidates(state.watchlist, universe, state.market, state.scope === 'universe');
}

// 분석
async function runAnalysis() {
    const cands = candidates();
    if (!cands.length) { alert('분석할 종목이 없습니다.'); return; }
    analyzeBtn.disabled = true;
    picksSection.classList.remove('hidden');
    picksContainer.innerHTML = '<div class="loader"></div>';
    resultContainer.innerHTML = '<div class="loader"></div>';

    const markets = [...new Set(cands.map((c) => c.market))];
    const { results, regimes } = await screen({
        candidates: cands,
        indices: universe.indices,
        strategy: state.strategy,
        load: makeLoader('2y', cands.length + markets.length),
    });
    state.results = results;
    state.regimes = regimes;
    progressEl.textContent = '';

    renderRegime();
    renderPicks();
    renderWatch();
    const m = MARKETS[state.market];
    messagePreview.textContent = buildMessage(results, { title: m ? `${m.flag} ${m.label}` : '', regimes });
    messageSection.classList.remove('hidden');
    resultDate.textContent = new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
        + (state.demo ? ' · 데모' : '') + ` · 후보 ${cands.length}종목`;
    analyzeBtn.disabled = false;
}

function renderRegime() {
    const entries = Object.entries(state.regimes);
    regimeBar.classList.toggle('hidden', !entries.length);
    regimeBar.innerHTML = entries.map(([mk, r]) => `
        <div class="regime ${r.ok === true ? 'ok' : r.ok === false ? 'bad' : ''}">
            <span class="regime-name">${MARKETS[mk].flag} ${INDEX_LABEL[mk]}</span>
            <span class="regime-label">${escapeHtml(r.label)}</span>
            <span class="regime-detail">${escapeHtml(r.detail ?? '')}</span>
        </div>`).join('');
}

function checksHtml(r) {
    return `<div class="checks">${r.checks.map((c) =>
        `<span class="chk ${c.ok === true ? 'ok' : c.ok === false ? 'bad' : c.ok === 'warn' ? 'warn' : 'na'}">${CHECK_ICON[c.ok]} ${escapeHtml(c.label)} <small>${escapeHtml(c.detail)}</small></span>`).join('')}</div>`;
}

function priceRow(r) {
    const chg = r.changePct >= 0 ? 'up' : 'down';
    return `<div class="price-row">
        <span class="price">${fmtPrice(r.price, r.currency)}</span>
        <span class="change ${chg}">${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%</span>
        ${r.weight ? `<span class="weight">제안 비중 ${(r.weight * 100).toFixed(0)}%</span>` : ''}
    </div>`;
}

function renderPicks() {
    const picks = picksOf(state.results);
    picksContainer.innerHTML = '';
    if (!picks.length) {
        picksContainer.innerHTML = '<div class="empty-state"><p>조건(12개월 수익률 &gt; 0, 200일선 위)을 충족하는 종목이 없습니다. 현금 비중을 유지하세요.</p></div>';
        return;
    }
    picks.forEach((r, i) => {
        const card = document.createElement('div');
        card.className = `signal-card pick ${ACTION_CLASS[r.action]}`;
        card.innerHTML = `
            <div class="signal-head">
                <div><span class="pick-no">${i + 1}</span><span class="name">${escapeHtml(r.name)}</span>
                    <span class="symbol">${escapeHtml(r.symbol)} · ${escapeHtml(r.sector ?? '')}${r.watch ? ' · ⭐관심' : ''}</span></div>
                <span class="action">${ICON[r.action]} ${r.action}</span>
            </div>
            ${priceRow(r)}
            ${checksHtml(r)}
            <p class="summary">${escapeHtml(r.summary)}</p>
            <p class="stop">🛡 손절 기준 <b>${fmtPrice(r.stopPrice, r.currency)}</b> (현재가 대비 ${fmtPct(r.stopPrice / r.price - 1, 0)}, 또는 200일선 이탈)</p>
        `;
        picksContainer.appendChild(card);
    });
}

function renderWatch() {
    const watch = watchOf(state.results);
    resultContainer.innerHTML = '';
    if (!watch.length) {
        resultContainer.innerHTML = '<div class="empty-state"><p>이 시장에 관심 종목이 없습니다.</p></div>';
        return;
    }
    watch.sort((a, b) => {
        if (a.error || b.error) return a.error ? 1 : -1;
        return ORDER.indexOf(a.action) - ORDER.indexOf(b.action) || (a.rank ?? 99) - (b.rank ?? 99);
    });
    for (const r of watch) {
        const card = document.createElement('div');
        if (r.error) {
            card.className = 'signal-card error';
            card.innerHTML = `<div class="signal-head"><span class="name">${escapeHtml(r.name)}</span><span class="action">⚠️ 오류</span></div><p class="reasons">${escapeHtml(r.error)}</p>`;
            resultContainer.appendChild(card);
            continue;
        }
        card.className = `signal-card ${ACTION_CLASS[r.action]}`;
        card.innerHTML = `
            <div class="signal-head">
                <div><span class="name">${escapeHtml(r.name)}</span>
                    <span class="symbol">${escapeHtml(r.symbol)}${r.rank ? ` · 모멘텀 ${r.rank}/${r.total}위` : ''}${r.pick ? ' · 🏆추천' : ''}</span></div>
                <span class="action">${ICON[r.action]} ${r.action}</span>
            </div>
            ${priceRow(r)}
            ${checksHtml(r)}
            <details class="more"><summary>근거 자세히</summary><p class="summary">${escapeHtml(r.summary)}</p>
                ${r.action !== '관망' ? `<p class="stop">🛡 손절 기준 <b>${fmtPrice(r.stopPrice, r.currency)}</b> (현재가 대비 ${fmtPct(r.stopPrice / r.price - 1, 0)})</p>` : ''}</details>
        `;
        resultContainer.appendChild(card);
    }
}

// 백테스트
async function runBacktest() {
    const cands = candidates();
    if (!cands.length) { alert('분석할 종목이 없습니다.'); return; }
    backtestBtn.disabled = true;
    backtestSection.classList.remove('hidden');
    btChart.innerHTML = '<div class="loader"></div>';
    btStats.innerHTML = '';
    btMeta.textContent = '';
    btLast.textContent = '';
    try {
        const markets = [...new Set(cands.map((c) => c.market))];
        const load = makeLoader(btRange.value, cands.length + markets.length);
        const series = (await mapLimit(cands, 6, async (c) => {
            try { return { ...c, ...(await load(c.symbol)) }; } catch { return null; }
        })).filter(Boolean);
        if (!series.length) throw new Error('시세를 가져온 종목이 없습니다.');
        const indexSeries = {};
        for (const mk of markets) {
            try { indexSeries[mk] = await load(universe.indices[mk]); } catch { /* 지수 없으면 국면 필터 생략 */ }
        }
        progressEl.textContent = '';
        const bt = backtest(series, state.strategy, indexSeries);
        const fmtD = (ms) => new Date(ms).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' });
        btMeta.textContent = `${series.length}종목 · ${fmtD(bt.dates[0])} ~ ${fmtD(bt.dates.at(-1))} (${bt.strategy.years.toFixed(1)}년)`
            + ` · 리밸런싱 ${bt.rebalances.length}회 · 평균 투자비중 ${(bt.avgExposure * 100).toFixed(0)}%${state.demo ? ' · 데모 시세' : ''}`;
        renderEquityChart(btChart, bt, [
            { label: '전략', values: bt.equity, color: '#2563eb' },
            { label: '균등 보유', values: bt.benchmark, color: '#d97706' },
        ]);
        const row = (cls, label, s) => `<tr class="${cls}"><td>${label}</td><td>${fmtPct(s.total)}</td><td>${fmtPct(s.cagr)}</td><td>${fmtPct(s.mdd)}</td><td>${fmtPct(s.vol, 0)}</td><td>${s.sharpe.toFixed(2)}</td></tr>`;
        btStats.innerHTML = `<thead><tr><th></th><th>총수익</th><th>연복리</th><th>최대낙폭</th><th>변동성</th><th>샤프</th></tr></thead><tbody>`
            + row('strategy', '전략', bt.strategy) + row('bench', '균등 보유', bt.buyHold) + '</tbody>';
        const last = bt.rebalances.at(-1);
        btLast.textContent = `최근 리밸런싱(${fmtD(last.date)}) 보유: ${last.picks.map((p) => `${p.name} ${(p.weight * 100).toFixed(0)}%`).join(', ') || '현금'}`;
    } catch (e) {
        btChart.innerHTML = `<div class="empty-state"><p>${escapeHtml(e.message)}</p></div>`;
    }
    backtestBtn.disabled = false;
}

async function copyMessage() {
    try {
        await navigator.clipboard.writeText(messagePreview.textContent);
        copyBtn.textContent = '복사됨!';
        setTimeout(() => { copyBtn.textContent = '복사'; }, 1500);
    } catch {
        alert('복사에 실패했습니다. 직접 드래그해서 복사하세요.');
    }
}

// 전략 설정
function renderSettings() {
    for (const input of settingsForm.querySelectorAll('input')) input.value = state.strategy[input.name];
}

function saveSettings() {
    for (const input of settingsForm.querySelectorAll('input')) {
        const v = Number(input.value);
        if (Number.isFinite(v)) state.strategy[input.name] = v;
    }
    localStorage.setItem('strategy', JSON.stringify(state.strategy));
    closeSidebar();
    if (state.results) runAnalysis();
}

function openSidebar() {
    settingsSidebar.classList.add('active');
    overlay.classList.remove('hidden');
}

function closeSidebar() {
    settingsSidebar.classList.remove('active');
    overlay.classList.add('hidden');
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 실행
init();
