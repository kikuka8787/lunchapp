// 수익곡선 라인 차트 (SVG, 외부 라이브러리 없음). 2개 시리즈 + 크로스헤어 툴팁 + 직접 라벨.
const W = 600;
const H = 260;
const PAD = { top: 16, right: 70, bottom: 28, left: 44 };

export function renderEquityChart(container, bt, series) {
    const { dates } = bt;
    const n = dates.length;
    const all = series.flatMap((s) => s.values);
    const minY = Math.min(...all);
    const maxY = Math.max(...all);
    const x = (i) => PAD.left + (i / (n - 1)) * (W - PAD.left - PAD.right);
    const y = (v) => PAD.top + (1 - (v - minY) / (maxY - minY || 1)) * (H - PAD.top - PAD.bottom);
    const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const fmtDate = (ms) => new Date(ms).toLocaleDateString('ko-KR', { year: '2-digit', month: 'short' });

    // 눈금: y 4개, x 5개
    const yTicks = [0, 1, 2, 3].map((k) => minY + ((maxY - minY) * k) / 3);
    const xTicks = [0, 1, 2, 3, 4].map((k) => Math.round(((n - 1) * k) / 4));

    container.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" class="equity-chart" role="img" aria-label="전략과 균등보유 수익곡선">
            ${yTicks.map((v) => `<line class="grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/>
                <text class="tick" x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 1 ? '+' : ''}${((v - 1) * 100).toFixed(0)}%</text>`).join('')}
            ${xTicks.map((i) => `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${fmtDate(dates[i])}</text>`).join('')}
            ${series.map((s) => `<path class="line" d="${path(s.values)}" stroke="${s.color}"/>
                <text class="direct-label" x="${W - PAD.right + 6}" y="${y(s.values[n - 1]) + 4}" fill="${s.color}">${s.label}</text>`).join('')}
            <g class="hover" style="display:none">
                <line class="crosshair" y1="${PAD.top}" y2="${H - PAD.bottom}"/>
                ${series.map((s) => `<circle r="4" fill="${s.color}" stroke="white" stroke-width="2"/>`).join('')}
            </g>
            <rect class="hit" x="${PAD.left}" y="0" width="${W - PAD.left - PAD.right}" height="${H}" fill="transparent"/>
        </svg>
        <div class="chart-tooltip" style="display:none"></div>
        <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>
    `;

    const svg = container.querySelector('svg');
    const hover = svg.querySelector('.hover');
    const cross = hover.querySelector('line');
    const dots = hover.querySelectorAll('circle');
    const tip = container.querySelector('.chart-tooltip');
    const hit = svg.querySelector('.hit');

    hit.addEventListener('mousemove', (e) => {
        const rect = svg.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (n - 1))));
        cross.setAttribute('x1', x(i));
        cross.setAttribute('x2', x(i));
        series.forEach((s, k) => { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(s.values[i])); });
        hover.style.display = '';
        tip.style.display = '';
        tip.innerHTML = `<b>${new Date(dates[i]).toLocaleDateString('ko-KR')}</b>` +
            series.map((s) => `<div><i style="background:${s.color}"></i>${s.label} <b>${((s.values[i] - 1) * 100).toFixed(1)}%</b></div>`).join('');
        const left = (e.clientX - rect.left) / rect.width;
        tip.style.left = `${Math.min(left * 100, 60)}%`;
    });
    hit.addEventListener('mouseleave', () => { hover.style.display = 'none'; tip.style.display = 'none'; });
}
