import { fetchCloses, demoCloses } from '../src/data.js';
import { analyze, rank, DEFAULTS } from '../src/strategy.js';
import { buildMessage, ICON, fmtPrice, fmtPct } from '../src/message.js';

const DEFAULT_WATCHLIST = [
    { symbol: '005930.KS', name: '삼성전자' },
    { symbol: '000660.KS', name: 'SK하이닉스' },
    { symbol: '035420.KS', name: 'NAVER' },
    { symbol: 'AAPL', name: '애플' },
    { symbol: 'NVDA', name: '엔비디아' },
];
const ACTION_CLASS = { '매수 관심': 'buy', '보유': 'hold', '관망': 'wait', '매도 검토': 'sell' };

// 상태 관리
let state = {
    watchlist: JSON.parse(localStorage.getItem('watchlist')) || DEFAULT_WATCHLIST,
    strategy: { ...DEFAULTS, ...(JSON.parse(localStorage.getItem('strategy')) || {}) },
    demo: localStorage.getItem('demoMode') === '1',
    results: null,
};

// DOM 요소
const watchlistEl = document.getElementById('watchlist');
const newSymbol = document.getElementById('new-symbol');
const newName = document.getElementById('new-name');
const addBtn = document.getElementById('add-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const demoMode = document.getElementById('demo-mode');
const resultContainer = document.getElementById('result-container');
const resultDate = document.getElementById('result-date');
const messageSection = document.getElementById('message-section');
const messagePreview = document.getElementById('message-preview');
const copyBtn = document.getElementById('copy-btn');
const toggleSettingsBtn = document.getElementById('toggle-settings');
const settingsSidebar = document.getElementById('settings-sidebar');
const closeSettingsBtn = document.getElementById('close-settings');
const overlay = document.getElementById('overlay');
const settingsForm = document.getElementById('settings-form');
const saveSettingsBtn = document.getElementById('save-settings');
const resetSettingsBtn = document.getElementById('reset-settings');

function init() {
    renderWatchlist();
    renderSettings();
    demoMode.checked = state.demo;

    addBtn.addEventListener('click', addSymbol);
    newSymbol.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSymbol(); });
    newName.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSymbol(); });
    analyzeBtn.addEventListener('click', runAnalysis);
    demoMode.addEventListener('change', () => {
        state.demo = demoMode.checked;
        localStorage.setItem('demoMode', state.demo ? '1' : '0');
    });
    copyBtn.addEventListener('click', copyMessage);
    toggleSettingsBtn.addEventListener('click', openSidebar);
    closeSettingsBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
    saveSettingsBtn.addEventListener('click', saveSettings);
    resetSettingsBtn.addEventListener('click', () => { state.strategy = { ...DEFAULTS }; renderSettings(); });
}

// 관심 종목
function renderWatchlist() {
    watchlistEl.innerHTML = '';
    state.watchlist.forEach((w, i) => {
        const chip = document.createElement('span');
        chip.className = 'chip';
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
    state.watchlist.push({ symbol, name: newName.value.trim() || symbol });
    newSymbol.value = '';
    newName.value = '';
    saveWatchlist();
}

function saveWatchlist() {
    localStorage.setItem('watchlist', JSON.stringify(state.watchlist));
    renderWatchlist();
}

// 분석
async function runAnalysis() {
    if (!state.watchlist.length) { alert('관심 종목을 먼저 추가하세요.'); return; }
    analyzeBtn.disabled = true;
    resultContainer.innerHTML = '<div class="loader"></div>';

    const results = await Promise.all(state.watchlist.map(async (w, i) => {
        try {
            const { closes, currency } = state.demo
                ? demoCloses(i + 7)
                : await fetchCloses(w.symbol, { range: '2y', endpoint: '/api/chart' });
            return { ...w, currency, ...analyze(closes, state.strategy) };
        } catch (e) {
            return { ...w, error: e.message };
        }
    }));
    state.results = rank(results, state.strategy);

    renderResults();
    messagePreview.textContent = buildMessage(state.results);
    messageSection.classList.remove('hidden');
    resultDate.textContent = new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
        + (state.demo ? ' · 데모' : '');
    analyzeBtn.disabled = false;
}

function renderResults() {
    resultContainer.innerHTML = '';
    const order = ['매수 관심', '매도 검토', '보유', '관망'];
    const sorted = [...state.results].sort((a, b) => {
        if (a.error || b.error) return a.error ? 1 : -1;
        return order.indexOf(a.action) - order.indexOf(b.action) || (a.rank ?? 99) - (b.rank ?? 99);
    });

    sorted.forEach((r) => {
        const card = document.createElement('div');
        if (r.error) {
            card.className = 'signal-card error';
            card.innerHTML = `<div class="signal-head"><span class="name">${escapeHtml(r.name)}</span><span class="action">⚠️ 오류</span></div><p class="reasons">${escapeHtml(r.error)}</p>`;
            resultContainer.appendChild(card);
            return;
        }
        const chg = r.changePct >= 0 ? 'up' : 'down';
        card.className = `signal-card ${ACTION_CLASS[r.action]}`;
        card.innerHTML = `
            <div class="signal-head">
                <div>
                    <span class="name">${escapeHtml(r.name)}</span>
                    <span class="symbol">${escapeHtml(r.symbol)}</span>
                </div>
                <span class="action">${ICON[r.action]} ${r.action}</span>
            </div>
            <div class="price-row">
                <span class="price">${fmtPrice(r.price, r.currency)}</span>
                <span class="change ${chg}">${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%</span>
                ${r.weight ? `<span class="weight">제안 비중 ${(r.weight * 100).toFixed(0)}%</span>` : ''}
            </div>
            <div class="metrics">
                <span>12M ${fmtPct(r.mom12, 0)}</span>
                <span>6M ${fmtPct(r.mom6, 0)}</span>
                <span>변동성 ${r.vol != null ? (r.vol * 100).toFixed(0) + '%' : '-'}</span>
                <span>RSI ${r.rsi != null ? r.rsi.toFixed(0) : '-'}</span>
                <span>200일선 ${r.ma200 != null ? (r.price > r.ma200 ? '위' : '아래') : '-'}</span>
            </div>
            ${r.reasons.length ? `<p class="reasons">${r.reasons.map(escapeHtml).join(' · ')}</p>` : ''}
        `;
        resultContainer.appendChild(card);
    });
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
