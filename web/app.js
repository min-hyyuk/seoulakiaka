// ============================================================
// 상수
// ============================================================
const PROCESSES = ['분류','면표시','문서스캔','도면스캔','보정','색인','재편철','공개구분'];
const PROCESS_COLORS = {
  '분류':'#FF6B6B','면표시':'#FFA94D','문서스캔':'#FFD43B',
  '도면스캔':'#A9E34B','보정':'#69DB7C','색인':'#38D9A9',
  '재편철':'#4DABF7','공개구분':'#9775FA'
};
const PROCESS_UNITS = {
  '분류':{p:'권',s:'건'},'면표시':{p:'권',s:'면'},'문서스캔':{p:'권',s:'면'},
  '도면스캔':{p:'권',s:'면'},'보정':{p:'권',s:'면'},'색인':{p:'권',s:'건'},
  '재편철':{p:'권',s:'건'},'공개구분':{p:'권',s:'건'}
};
const AUTO_PROCS = ['재편철','공개구분'];
const ERROR_TYPES = ['누락','순서오류','이미지불량','색인오류','파일명오류','기타'];
const STORAGE_KEY = 'kiro_dash_v2';

// ============================================================
// 데이터 관리
// ============================================================
function loadData() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const d = JSON.parse(s);
      if (!d.labels) d.labels = {};
      if (!d.label_registry) d.label_registry = {};
      if (!d.error_labels) d.error_labels = [];
      if (!d.sampling_logs) d.sampling_logs = [];
      if (!d.daily_logs) d.daily_logs = [];
      if (!d.transfer_records) d.transfer_records = [];
      return d;
    }
  } catch(e) {}
  return getDefaultData();
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getDefaultData() {
  return {
    project: { name:'2026년 중요기록물 정리사업', start_date:'2026-03-16', end_date:'2026-12-16', total_kwon:12000, total_myun:1250000 },
    targets: { target_kwon:12000, target_myun:1250000 },
    workers: [],
    label_registry: {},
    labels: {},
    daily_logs: [],
    sampling_logs: [],
    error_labels: [],
    transfer_records: []
  };
}

// ============================================================
// 유틸리티
// ============================================================
function getLabelStage(ld) {
  let last = '미작업';
  for (const p of PROCESSES) if (p in ld) last = p;
  return last === '공개구분' ? '완료' : last;
}

function calcCumulative(data) {
  const labels = data.labels || {};
  const tkwon = (data.targets||{}).target_kwon || 0;
  const tmyun = (data.targets||{}).target_myun || 0;
  const res = {};
  for (const proc of PROCESSES) {
    let cp = 0, cs = 0;
    for (const [, ld] of Object.entries(labels)) {
      if (!(proc in ld)) continue;
      const e = ld[proc];
      const b = ld['분류'] || {};
      const kwon = b.kwon || 1;
      const gun  = b.gun  || 0;
      if (proc === '분류') { cp += e.kwon||0; cs += e.gun||0; }
      else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) { cp += kwon; cs += e.myun||0; }
      else if (proc === '색인') { cp += kwon; cs += e.gun||0; }
      else { cp += kwon; cs += gun; }
    }
    const rp = tkwon > 0 ? Math.round(cp/tkwon*1000)/10 : 0;
    res[proc] = { cp, cs, tkwon, tmyun, rp,
      rs: tmyun > 0 ? Math.round(cs/tmyun*1000)/10 : 0,
      remP: Math.max(0, tkwon-cp), remS: Math.max(0, tmyun-cs) };
  }
  return res;
}

function getTimeInfo(data) {
  const p = data.project;
  const start = new Date(p.start_date), end = new Date(p.end_date);
  const today = new Date(); today.setHours(0,0,0,0);
  const total = Math.round((end-start)/864e5);
  const elapsed = Math.max(0, Math.min(Math.round((today-start)/864e5), total));
  const remain = Math.max(0, Math.round((end-today)/864e5));
  const rate = total > 0 ? Math.round(elapsed/total*1000)/10 : 0;
  return { total, elapsed, remain, rate };
}

function getDailyAgg(data) {
  // returns { date: { proc: qty } }
  const labels = data.labels || {};
  const daily = {};
  for (const [, ld] of Object.entries(labels)) {
    const b = ld['분류'] || {};
    const kwon = b.kwon || 1;
    const gun  = b.gun  || 0;
    for (const proc of PROCESSES) {
      if (!(proc in ld)) continue;
      const e = ld[proc];
      const d = e.date; if (!d) continue;
      if (!daily[d]) daily[d] = {};
      if (!daily[d][proc]) daily[d][proc] = 0;
      if (proc === '분류') daily[d][proc] += e.kwon||0;
      else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) daily[d][proc] += e.myun||0;
      else if (proc === '색인') daily[d][proc] += e.gun||0;
      else daily[d][proc] += kwon;
    }
  }
  return daily;
}

function fmt(n) { return typeof n === 'number' ? n.toLocaleString('ko-KR') : (n ?? ''); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ============================================================
// Toast / Confirm
// ============================================================
function showToast(msg, type='success') {
  const colors = { success:'#38a169', error:'#e53e3e', info:'#2b6cb0', warning:'#c77600' };
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.background = colors[type] || colors.success;
  el.textContent = msg;
  document.getElementById('toast-area').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

let _confirmCb = null;
function showConfirm(msg, cb) {
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-overlay').classList.remove('hidden');
  _confirmCb = cb;
}
function confirmOk() {
  document.getElementById('confirm-overlay').classList.add('hidden');
  if (_confirmCb) _confirmCb();
  _confirmCb = null;
}
function confirmCancel() {
  document.getElementById('confirm-overlay').classList.add('hidden');
  _confirmCb = null;
}

function openEditModal(html) {
  document.getElementById('edit-modal-content').innerHTML = html;
  document.getElementById('edit-overlay').classList.remove('hidden');
}
function closeEditModal() {
  document.getElementById('edit-overlay').classList.add('hidden');
}

// ============================================================
// 라우터 / 상태
// ============================================================
const state = { page:'대시보드', sub:null, tab:0 };
const charts = {};

function destroyCharts() {
  Object.values(charts).forEach(c => { try { c.destroy(); } catch(e){} });
  Object.keys(charts).forEach(k => delete charts[k]);
}

function navigate(page, sub) {
  state.page = page;
  state.sub  = sub || null;
  state.tab  = 0;
  renderSidebar();
  renderContent();
}

function renderSidebar() {
  const data = loadData();
  document.getElementById('sb-proj-name').textContent = data.project.name;
  document.getElementById('sb-proj-dates').textContent =
    '📅 ' + data.project.start_date + ' ~ ' + data.project.end_date;

  const pages = [
    { icon:'📈', name:'대시보드', sep:true },
    { icon:'📦', name:'반입반출 현황', sep:true },
    { icon:'📅', name:'일별 총괄표' },
    { icon:'📋', name:'공정진행표' },
    { icon:'👥', name:'작업자별 현황', sep:true },
    { icon:'🔍', name:'품질검사', sep:true },
    { icon:'⚙️', name:'설정' },
  ];

  let html = '';
  for (const p of pages) {
    const a = state.page === p.name ? 'active' : '';
    html += `<div class="nav-item ${a}" onclick="navigate('${p.name}')">${p.icon} ${p.name}</div>`;
    if (p.sep) html += '<div class="nav-divider"></div>';
    if (p.name === '공정진행표' && state.page === '공정진행표') {
      html += '<div class="nav-sub">';
      for (const sub of ['전체 현황',...PROCESSES]) {
        const sa = state.sub === sub ? 'active' : '';
        html += `<div class="nav-item ${sa}" onclick="navigate('공정진행표','${sub}')">${sub}</div>`;
      }
      html += '</div>';
    }
  }
  document.getElementById('sb-nav').innerHTML = html;
}

function renderContent() {
  destroyCharts();
  const data = loadData();
  const c = document.getElementById('main-content');
  switch (state.page) {
    case '대시보드':       renderDashboard(data, c); break;
    case '공정진행표':
      if (!state.sub) { state.sub = '전체 현황'; renderSidebar(); }
      if (state.sub === '전체 현황') renderProgressOverview(data, c);
      else                           renderProcessSheet(data, c, state.sub);
      break;
    case '일별 총괄표': renderDailySummary(data, c); break;
    case '작업자별 현황': renderWorkerStats(data, c); break;
    case '반입반출 현황': renderTransferPage(data, c); break;
    case '품질검사':      renderQuality(data, c); break;
    case '설정':          renderSettings(data, c); break;
    default: c.innerHTML = '<div class="empty-state">페이지를 찾을 수 없습니다.</div>';
  }
}

// ============================================================
// Gauge (Chart.js doughnut)
// ============================================================
function makeGauge(canvasId, value, color) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  const v = Math.min(Math.max(value, 0), 100);
  charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [v, 100-v, 100],
        backgroundColor: [color, '#e2e8f0', 'transparent'],
        borderWidth: 0
      }]
    },
    options: {
      circumference: 180, rotation: -90, cutout: '68%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      events: []
    }
  });
}

// ============================================================
// 📈 대시보드
// ============================================================
function renderDashboard(data, c) {
  const cum = calcCumulative(data);
  const ti  = getTimeInfo(data);
  const labels = data.labels || {};
  const totalLabels = Object.keys(labels).length;

  const allDates = new Set();
  for (const ld of Object.values(labels))
    for (const proc of PROCESSES) if (ld[proc]?.date) allDates.add(ld[proc].date);
  const workDays = allDates.size;

  // Scan combined stats (스캔합계 = 문서스캔 + 도면스캔)
  const scanTK = cum['문서스캔'].tkwon;
  const scanCP = cum['문서스캔'].cp + cum['도면스캔'].cp;
  const scanCS = cum['문서스캔'].cs + cum['도면스캔'].cs;
  const scanRemS = Math.max(0, (cum['문서스캔'].tmyun || 0) - scanCS);

  // 공정별 실적 세부 (권호수·건·면) — 일별 총괄표 누적합계와 동일 로직
  const cumDetail = {};
  for (const proc of PROCESSES) cumDetail[proc] = { labels:0, kwon:0, gun:0, myun:0 };
  // 스캔합계 건수 (이중집계 방지: 문서 or 도면이 있는 레이블 기준)
  let scanGun = 0;
  for (const [, ld] of Object.entries(labels)) {
    const b = ld['분류'] || {};
    const bKwon = b.kwon || 1;
    const bGun  = b.gun  || 0;
    // 색인·재편철·공개구분의 면: 동일 레이블의 면표시·스캔 데이터에서 파생
    const assocMyun = (ld['보정']?.myun || ld['면표시']?.myun ||
      (ld['문서스캔']?.myun||0) + (ld['도면스캔']?.myun||0));
    if ('문서스캔' in ld || '도면스캔' in ld) scanGun += bGun;
    for (const proc of PROCESSES) {
      if (!(proc in ld)) continue;
      const e  = ld[proc];
      const pd = cumDetail[proc];
      pd.labels += 1;
      if (proc === '분류') { pd.kwon += e.kwon||0; pd.gun += e.gun||0; }
      else {
        pd.kwon += bKwon; pd.gun += bGun;
        if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) pd.myun += e.myun||0;
        else pd.myun += assocMyun; // 색인·재편철·공개구분
      }
    }
  }
  const scanRP = scanTK > 0 ? Math.round(scanCP / scanTK * 1000) / 10 : 0;
  const scanRemP = Math.max(0, scanTK - scanCP);

  // 전날 대비 delta — 가장 최근 작업일 이전 누적 공정율 계산
  const sortedDates = [...allDates].sort();
  const latestDate = sortedDates[sortedDates.length - 1] || '';
  const cumPrev = (() => {
    const tkwon = (data.targets||{}).target_kwon || 0;
    const tmyun = (data.targets||{}).target_myun || 0;
    const res = {};
    for (const proc of PROCESSES) {
      let cp = 0, cs = 0;
      for (const [, ld] of Object.entries(labels)) {
        if (!(proc in ld)) continue;
        const e = ld[proc];
        if (latestDate && e.date === latestDate) continue;
        const b = ld['분류'] || {};
        const kwon = b.kwon || 1; const gun = b.gun || 0;
        if (proc === '분류') { cp += e.kwon||0; cs += e.gun||0; }
        else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) { cp += kwon; cs += e.myun||0; }
        else if (proc === '색인') { cp += kwon; cs += e.gun||0; }
        else { cp += kwon; cs += gun; }
      }
      res[proc] = {
        rp: tkwon > 0 ? Math.round(cp/tkwon*1000)/10 : 0,
        rs: tmyun > 0 ? Math.round(cs/tmyun*1000)/10 : 0
      };
    }
    return res;
  })();
  const scanCPPrev = (() => {
    let cp = 0;
    for (const sub of ['문서스캔','도면스캔']) {
      for (const [, ld] of Object.entries(labels)) {
        if (!(sub in ld)) continue;
        const e = ld[sub];
        if (latestDate && e.date === latestDate) continue;
        cp += (ld['분류']?.kwon || 1);
      }
    }
    return cp;
  })();
  const scanRPPrev = scanTK > 0 ? Math.round(scanCPPrev / scanTK * 1000) / 10 : 0;

  // avgRate uses 7 logical units (스캔합계 replaces 문서스캔+도면스캔)
  const rates = [...PROCESSES.filter(p => p !== '문서스캔' && p !== '도면스캔').map(p => cum[p].rp), scanRP];
  const avgRate = rates.reduce((a,b) => a+b, 0) / rates.length;

  let alertHtml = '';
  if (avgRate < ti.rate - 10)
    alertHtml = `<div class="alert alert-warning">⚠️ 공정율(${avgRate.toFixed(1)}%)이 기간진행률(${ti.rate}%)보다 낮습니다. 일정 지연 위험!</div>`;
  else if (avgRate >= ti.rate)
    alertHtml = `<div class="alert alert-success">✅ 공정율(${avgRate.toFixed(1)}%)이 기간진행률(${ti.rate}%) 이상입니다.</div>`;

  // Gauges — order: 분류, 면표시, 스캔합계(+sub), 보정, 색인, 재편철, 공개구분
  const SCAN_COLOR = '#805ad5';
  const GAUGE_ORDER = ['분류','면표시','__scan__','보정','색인','재편철','공개구분'];
  let gaugeHtml = '';
  for (const proc of GAUGE_ORDER) {
    if (proc === '__scan__') {
      const ms = cum['문서스캔'], ds = cum['도면스캔'];
      const scanDelta = (scanRP - scanRPPrev).toFixed(1);
      const scanDColor = Number(scanDelta) > 0 ? '#38a169' : Number(scanDelta) < 0 ? '#e53e3e' : '#888';
      gaugeHtml += `
      <div class="gauge-card gauge-card-scan">
        <div class="gauge-name" style="color:${SCAN_COLOR}">스캔합계</div>
        <div class="gauge-canvas-wrap">
          <canvas id="g-스캔합계" style="max-height:90px"></canvas>
          <div class="gauge-overlay">
            <span class="gauge-pct">${scanRP}%</span>
            <span class="gauge-delta-txt" style="color:${scanDColor}">&nbsp;${Number(scanDelta)>=0?'+':''}${scanDelta}%p</span>
          </div>
        </div>
        <div class="gauge-caption">${fmt(scanCP)}권 / ${fmt(scanCS)}면<br>잔여: ${fmt(scanRemS)}면</div>
        <div class="scan-sub-row">
          <span class="scan-sub-item"><span class="scan-sub-label">문서</span>${fmt(ms.cs)}면 ${ms.rs}%</span>
          <span class="scan-sub-item"><span class="scan-sub-label">도면</span>${fmt(ds.cs)}면 ${ds.rs}%</span>
        </div>
      </div>`;
    } else {
      const cv = cum[proc];
      const up = PROCESS_UNITS[proc];
      const delta = (cv.rp - (cumPrev[proc]?.rp ?? 0)).toFixed(1);
      const dColor = Number(delta) > 0 ? '#38a169' : Number(delta) < 0 ? '#e53e3e' : '#888';
      gaugeHtml += `
      <div class="gauge-card">
        <div class="gauge-name" style="color:${PROCESS_COLORS[proc]}">${proc}</div>
        <div class="gauge-canvas-wrap">
          <canvas id="g-${proc}" style="max-height:90px"></canvas>
          <div class="gauge-overlay">
            <span class="gauge-pct">${cv.rp}%</span>
            <span class="gauge-delta-txt" style="color:${dColor}">&nbsp;${Number(delta)>=0?'+':''}${delta}%p</span>
          </div>
        </div>
        <div class="gauge-caption">${fmt(cv.cp)}${up.p} / ${fmt(cv.cs)}${up.s}<br>잔여: ${['면표시','보정'].includes(proc) ? fmt(cv.remS)+'면' : fmt(cv.remP)+'권'}</div>
      </div>`;
    }
  }

  // 잔여량 단위 헬퍼
  const REM_MYUN_PROCS = new Set(['면표시','보정']); // 스캔합계·자식은 별도처리
  function remCell(proc, cv) {
    if (REM_MYUN_PROCS.has(proc)) return `${fmt(cv.remS)}면`;
    return `${fmt(cv.remP)}권`;
  }
  // 실적세부 칩 헬퍼
  function detailChips(proc) {
    const d = cumDetail[proc];
    let chips = [];
    if (proc === '분류') {
      chips = [`${fmt(d.labels)}권`, `${fmt(d.kwon)}권호수`, `${fmt(d.gun)}건`];
    } else if (['면표시','보정'].includes(proc)) {
      chips = [`${fmt(d.kwon)}권호수`, `${fmt(d.gun)}건`, `${fmt(d.myun)}면`];
    } else if (['문서스캔','도면스캔'].includes(proc)) {
      chips = [`${fmt(d.kwon)}권호수`, `${fmt(d.gun)}건`, `${fmt(d.myun)}면`];
    } else {
      // 색인·재편철·공개구분
      chips = [`${fmt(d.kwon)}권호수`, `${fmt(d.gun)}건`, `${fmt(d.myun)}면`];
    }
    return chips.map(t => `<span class="detail-chip">${t}</span>`).join('');
  }

  // Detail table rows — 스캔합계 as parent, 문서스캔/도면스캔 as indented children
  const TABLE_ORDER = ['분류','면표시','__scan__','보정','색인','재편철','공개구분'];
  let tRows = '';
  for (const proc of TABLE_ORDER) {
    if (proc === '__scan__') {
      const scanRemSFmt = `${fmt(scanRemS)}면`;
      const scanDetailChips = detailChips('문서스캔').replace(/권호수|면/g, s=>s) && `<span class="detail-chip">${fmt(scanCP)}권호수</span><span class="detail-chip">${fmt(scanCS)}면</span>`;
      // Parent: 스캔합계 (클릭 시 자식 행 토글)
      tRows += `<tr class="scan-parent-row" onclick="toggleScanChildren(this)" style="cursor:pointer">
        <td><span style="color:${SCAN_COLOR};font-weight:700">스캔합계 <span class="scan-toggle-icon">▾</span></span></td>
        <td>${fmt(cum['문서스캔'].tmyun)}면</td>
        <td><div class="dt-bar-wrap"><div class="dt-bar-bg"><div class="dt-bar-fill" style="width:${Math.min(scanRP,100)}%;background:${SCAN_COLOR}"></div></div><span class="dt-bar-pct">${scanRP}%</span></div></td>
        <td>${scanRemSFmt}</td>
        <td><span class="detail-chip">${fmt(scanCP)}권호수</span><span class="detail-chip">${fmt(scanGun)}건</span><span class="detail-chip">${fmt(scanCS)}면</span></td>
      </tr>`;
      // Children: 실적만, 공정율·잔여 없음
      for (const sub of ['문서스캔','도면스캔']) {
        tRows += `<tr class="scan-child-row">
          <td><span style="color:${PROCESS_COLORS[sub]};padding-left:14px">${sub}</span></td>
          <td></td>
          <td></td>
          <td style="text-align:center">—</td>
          <td>${detailChips(sub)}</td>
        </tr>`;
      }
    } else {
      const cv = cum[proc];
      tRows += `<tr>
        <td><span style="color:${PROCESS_COLORS[proc]};font-weight:600">${proc}</span></td>
        <td>${['면표시','보정'].includes(proc) ? fmt(cv.tmyun)+'면' : fmt(cv.tkwon)+'권'}</td>
        <td><div class="dt-bar-wrap"><div class="dt-bar-bg"><div class="dt-bar-fill" style="width:${Math.min(cv.rp,100)}%;background:${PROCESS_COLORS[proc]}"></div></div><span class="dt-bar-pct">${cv.rp}%</span></div></td>
        <td>${remCell(proc, cv)}</td>
        <td>${detailChips(proc)}</td>
      </tr>`;
    }
  }

  const hasData = allDates.size > 0;

  c.innerHTML = `
    <div class="page-title">📈 공정 현황 대시보드</div>
    ${alertHtml}
    <div class="section-header">전체 진행 현황</div>
    <div class="metrics-grid" style="grid-template-columns:repeat(5,1fr)">
      ${[['평균 공정율',avgRate.toFixed(1)+'%'],['기간 진행률',ti.rate+'%'],['잔여일',fmt(ti.remain)+'일'],['작업일수',workDays+'일'],['등록 레이블',fmt(totalLabels)+'건']].map(([l,v])=>`
      <div class="metric-card"><div class="metric-label">${l}</div><div class="metric-value">${v}</div></div>`).join('')}
    </div>
    <hr class="divider">
    <div class="section-header">공정별 진행률</div>
    <div class="gauge-grid">${gaugeHtml}</div>
    <hr class="divider">
    <div class="section-header">공정별 상세 현황</div>
    <div class="card"><div class="table-wrap"><table class="detail-tbl">
      <colgroup>
        <col style="width:11%">
        <col style="width:10%">
        <col style="width:38%">
        <col style="width:15%">
        <col style="width:26%">
      </colgroup>
      <thead><tr><th>공정</th><th>목표(권/면)</th><th>공정율</th><th>잔여량</th><th>실적 세부</th></tr></thead>
      <tbody>${tRows}</tbody>
    </table></div></div>
  `;

  for (const proc of GAUGE_ORDER) {
    if (proc === '__scan__') makeGauge('g-스캔합계', scanRP, SCAN_COLOR);
    else makeGauge(`g-${proc}`, cum[proc].rp, PROCESS_COLORS[proc]);
  }
}

function switchDashTab(tab) {
  document.getElementById('tb-daily').classList.toggle('active', tab==='daily');
  document.getElementById('tb-cumul').classList.toggle('active', tab==='cumul');
  buildDashChart(tab, getDailyAgg(loadData()));
}

function buildDashChart(tab, daily) {
  if (charts['dash-chart']) { charts['dash-chart'].destroy(); delete charts['dash-chart']; }
  const ctx = document.getElementById('dash-chart'); if (!ctx) return;
  const dates = Object.keys(daily).sort();
  if (tab === 'daily') {
    charts['dash-chart'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dates,
        datasets: PROCESSES.map(p => ({
          label: p, data: dates.map(d => daily[d]?.[p]||0),
          backgroundColor: PROCESS_COLORS[p], stack: 'a'
        }))
      },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{legend:{position:'top'}}, scales:{x:{stacked:true},y:{stacked:true}} }
    });
  } else {
    const datasets = [];
    for (const p of PROCESSES) {
      let cum = 0;
      const vals = dates.map(d => { cum += daily[d]?.[p]||0; return cum; });
      if (cum > 0) datasets.push({ label:p, data:vals,
        borderColor:PROCESS_COLORS[p], backgroundColor:'transparent', tension:0.3 });
    }
    charts['dash-chart'] = new Chart(ctx, {
      type: 'line',
      data: { labels:dates, datasets },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'top'}} }
    });
  }
}

// ============================================================
// 📋 공정진행표 - 전체 현황
// ============================================================
function renderProgressOverview(data, c) {
  const labels  = data.labels        || {};
  const registry = data.label_registry || {};
  const allNums = [...new Set([...Object.keys(registry), ...Object.keys(labels)])].sort();

  if (!allNums.length) {
    c.innerHTML = `<div class="page-title">📋 공정진행표</div>
      <div class="alert alert-info">등록된 레이블이 없습니다. ⚙️ 설정 > 레이블 등록에서 업로드하거나 공정별 시트에서 직접 입력하세요.</div>`;
    return;
  }

  // 목표 기준 누적 실적 가져오기
  const cum = calcCumulative(data);
  const tkwon = cum['분류'].tkwon || 0;   // 12,000권
  const tmyun = cum['분류'].tmyun || 0;   // 1,250,000면

  // 공정별 기준 및 실적값 정의
  // 분류·재편철·공개구분: 권호수/12,000권
  // 면표시·문서스캔·도면스캔·보정·색인: 면/125만면
  function procMetric(p) {
    const c = cum[p];
    const kwonGroup = ['분류','재편철','공개구분'];
    if (kwonGroup.includes(p)) return { done: c.cp, target: tkwon, unit: '권호수', tLabel: '권' };
    return { done: c.cs, target: tmyun, unit: p === '색인' ? '건' : '면', tLabel: '면' };
  }

  // 스테이지 카운트는 레이블 기준 유지
  const stageCounts = {};
  for (const num of allNums) {
    const ld = labels[num] || {};
    const stage = getLabelStage(ld);
    stageCounts[stage] = (stageCounts[stage]||0) + 1;
  }

  const SCAN_COLOR_PO = '#805ad5';

  // 스캔합계: 문서스캔+도면스캔 면 합산
  const scanDoneMyun = cum['문서스캔'].cs + cum['도면스캔'].cs;
  const scanRate = tmyun > 0 ? (scanDoneMyun / tmyun * 100).toFixed(1) : 0;

  function poCard(p) {
    const m = procMetric(p);
    const rate = m.target > 0 ? (m.done / m.target * 100).toFixed(1) : 0;
    return `<div class="scan-inline-item" style="--pc:${PROCESS_COLORS[p]}">
      <div class="metric-label" style="color:${PROCESS_COLORS[p]};font-size:12px;margin-bottom:4px">${p}</div>
      <div style="font-size:16px;font-weight:700">${fmt(m.done)}<span style="font-size:10px;font-weight:400;color:#718096"> ${m.unit}</span></div>
      <div style="font-size:11px;color:#718096;margin-top:2px">${rate}% / ${fmt(m.target)}${m.tLabel}</div>
    </div>`;
  }

  const scanBlock = `<div class="scan-cum-block" style="grid-column:span 2">
    <div class="scan-inline-item" style="--pc:${SCAN_COLOR_PO}">
      <div class="metric-label" style="color:${SCAN_COLOR_PO};font-size:13px;margin-bottom:4px">스캔합계</div>
      <div style="font-size:18px;font-weight:700">${fmt(scanDoneMyun)}<span style="font-size:10px;font-weight:400;color:#718096"> 면</span></div>
      <div style="font-size:11px;color:#718096;margin-top:2px">${scanRate}% / ${fmt(tmyun)}면</div>
    </div>
    <div class="scan-inline-divider"></div>
    ${poCard('문서스캔')}
    <div class="scan-inline-divider"></div>
    ${poCard('도면스캔')}
  </div>`;

  const PO_ORDER = ['분류','면표시','__scan__','보정','색인','재편철','공개구분'];
  const metricHtml = PO_ORDER.map(p => {
    if (p === '__scan__') return scanBlock;
    const m = procMetric(p);
    const rate = m.target > 0 ? (m.done / m.target * 100).toFixed(1) : 0;
    return `<div class="metric-card">
      <div class="metric-label" style="color:${PROCESS_COLORS[p]}">${p}</div>
      <div class="metric-value" style="font-size:18px">${fmt(m.done)}<span style="font-size:12px;color:#718096;font-weight:400"> ${m.unit}</span></div>
      <div class="metric-delta">${rate}% / ${fmt(m.target)}${m.tLabel}</div>
    </div>`;
  }).join('');

  // Filters
  const boxList   = [...new Set(Object.values(registry).map(r=>r.box||'').filter(Boolean))].sort();
  const batchList = [...new Set(Object.values(registry).map(r=>r.batch||'').filter(Boolean))].sort();
  const stageOrder = ['미작업',...PROCESSES.slice(0,-1),'완료'];

  c.innerHTML = `
    <div class="page-title">📋 공정진행표</div>
    <div class="section-header">공정별 완료 현황</div>
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr);align-items:start">${metricHtml}</div>
    <hr class="divider">
    <div class="section-header">레이블 상세</div>
    <div class="filter-row">
      <div class="filter-item"><label>레이블 검색</label><input id="f-search" type="text" placeholder="번호 입력" oninput="applyProgressFilter()"></div>
      <div class="filter-item"><label>상자번호</label><select id="f-box" onchange="applyProgressFilter()"><option>전체</option>${boxList.map(b=>`<option>${esc(b)}</option>`).join('')}</select></div>
      <div class="filter-item"><label>반입회차</label><select id="f-batch" onchange="applyProgressFilter()"><option>전체</option>${batchList.map(b=>`<option>${esc(b)}</option>`).join('')}</select></div>
      <div class="filter-item"><label>현재 단계</label><select id="f-stage" onchange="applyProgressFilter()"><option>전체</option>${stageOrder.map(s=>`<option>${esc(s)}</option>`).join('')}</select></div>
      <div class="filter-item"><label>도면유형</label><select id="f-dom" onchange="applyProgressFilter()"><option>전체</option><option>도면포함</option><option>전체도면</option><option>도면없음</option></select></div>
      <div class="filter-item" style="align-self:end"><button class="btn btn-secondary btn-sm" onclick="clearAllFilters('progress-tbl');resetProgressFilters()">🔄 필터 초기화</button></div>
    </div>
    <div id="progress-table-area"></div>
    <hr class="divider">
    <div class="section-header">레이블 상세 조회</div>
    <div class="form-row" style="grid-template-columns:300px 1fr">
      <div class="form-group">
        <label>레이블번호</label>
        <input type="text" id="detail-input" placeholder="번호 입력" oninput="showLabelDetail()">
      </div>
    </div>
    <div id="label-detail-area"></div>
  `;

  // Store all data for filtering
  window._progressData = { allNums, labels, registry };
  window._progressPage = 1;
  applyProgressFilter();
}

function applyProgressFilter() {
  const { allNums, labels, registry } = window._progressData;
  const search = (document.getElementById('f-search')?.value || '').trim();
  const fBox   = document.getElementById('f-box')?.value || '전체';
  const fBatch = document.getElementById('f-batch')?.value || '전체';
  const fStage = document.getElementById('f-stage')?.value || '전체';
  const fDom   = document.getElementById('f-dom')?.value || '전체';

  const rows = [];
  for (const num of allNums) {
    const ld  = labels[num] || {};
    const reg = registry[num] || {};
    const stage = getLabelStage(ld);
    const box   = reg.box   || '';
    const batch = reg.batch || '';
    const domType = ld['문서스캔']?.domyun_type || ld['도면스캔']?.domyun_type || '';

    if (search && !num.includes(search)) continue;
    if (fBox   !== '전체' && box   !== fBox)   continue;
    if (fBatch !== '전체' && batch !== fBatch) continue;
    if (fStage !== '전체' && stage !== fStage) continue;
    if (fDom === '도면포함'  && domType !== '도면포함')  continue;
    if (fDom === '전체도면'  && domType !== '전체도면')  continue;
    if (fDom === '도면없음'  && domType !== '')          continue;

    const b = ld['분류'] || {};
    const procCells = PROCESSES.map(p => {
      if (p in ld) {
        const d = ld[p].date || '';
        let disp = 'O';
        if (d) { try { disp = d.slice(5); } catch(e){} }
        let extra = '';
        if ((p === '문서스캔' || p === '도면스캔') && ld[p].domyun_type)
          extra = `<br><span style="font-size:10px;color:#805ad5;font-weight:600">${esc(ld[p].domyun_type)}</span>`;
        return `<td style="color:#38a169;text-align:center">${disp}${extra}</td>`;
      }
      return '<td></td>';
    }).join('');

    rows.push({ num, batch, box, stage, domType,
      kwon: b.kwon||'', gun: b.gun||'',
      gunSaekin: ld['색인']?.gun||'',
      myunFace: ld['면표시']?.myun||'',
      myunScan: (ld['문서스캔']?.myun||0)+(ld['도면스캔']?.myun||0)||'',
      myunBojung: ld['보정']?.myun||'',
      procCells });
  }

  let tableHtml = `<div class="caption mb-8">총 ${fmt(rows.length)}건</div>
    <div class="scroll-table-wrap"><table id="progress-tbl">
    <thead><tr>
      <th class="th-cf" onclick="showColFilter(this,'progress-tbl',0)">반입회차<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'progress-tbl',1)">상자번호<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'progress-tbl',2)">레이블번호<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'progress-tbl',3)">현재공정<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'progress-tbl',4)">도면유형<span class="th-cf-icon">▼</span></th>
      <th class="th-cf" onclick="showColFilter(this,'progress-tbl',5)">분권수<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'progress-tbl',6)">건수(분류)<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'progress-tbl',7)">건수(색인)<span class="th-cf-icon">▼</span></th>
      <th class="th-cf" onclick="showColFilter(this,'progress-tbl',8)">면수(면표시)<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'progress-tbl',9)">면수(스캔)<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'progress-tbl',10)">면수(보정)<span class="th-cf-icon">▼</span></th>
      ${PROCESSES.map((p,i)=>`<th class="th-cf" onclick="showColFilter(this,'progress-tbl',${11+i})">${p}<span class="th-cf-icon">▼</span></th>`).join('')}
    </tr></thead><tbody>`;

  for (const r of rows) {
    tableHtml += `<tr>
      <td>${esc(r.batch)}</td><td>${esc(r.box)}</td>
      <td><strong>${esc(r.num)}</strong></td>
      <td><span class="badge badge-gray">${esc(r.stage)}</span></td>
      <td>${r.domType ? `<span class="badge badge-done">${esc(r.domType)}</span>` : ''}</td>
      <td>${r.kwon}</td><td>${r.gun}</td><td>${r.gunSaekin}</td>
      <td>${r.myunFace}</td><td>${r.myunScan}</td><td>${r.myunBojung}</td>
      ${r.procCells}
    </tr>`;
  }
  tableHtml += '</tbody></table></div>';

  document.getElementById('progress-table-area').innerHTML = tableHtml;
  applyAllColFilters('progress-tbl');
  updateCFIndicators('progress-tbl');
}

function setProgressPage(pg) {
  window._progressPage = pg;
  applyProgressFilter();
}

function showLabelDetail() {
  const key = (document.getElementById('detail-input')?.value || '').trim();
  const area = document.getElementById('label-detail-area');
  if (!key) { area.innerHTML = ''; return; }
  const data = loadData();
  const ld  = data.labels[key];
  const reg = data.label_registry[key];
  if (!ld && !reg) { area.innerHTML = `<div class="alert alert-warning">레이블 '${esc(key)}'을(를) 찾을 수 없습니다.</div>`; return; }
  const stage = getLabelStage(ld||{});
  const b = (ld||{})['분류'] || {};
  let rows = PROCESSES.map(p => {
    if (ld && p in ld) {
      const e = ld[p];
      let qty = '';
      if (p==='분류') qty = `${e.kwon||0}권, ${e.gun||0}건`;
      else if (['면표시','문서스캔','도면스캔','보정'].includes(p)) qty = `${e.myun||0}면`;
      else if (p==='색인') qty = `${e.gun||0}건`;
      else qty = `${e.kwon||0}권, ${e.gun||0}건 (자동)`;
      return `<tr><td style="color:${PROCESS_COLORS[p]};font-weight:600">${p}</td><td style="color:#38a169">✔</td><td>${esc(e.date||'-')}</td><td>${esc(e.worker||'-')}</td><td>${esc(qty)}</td><td>${esc(e.note||'')}</td></tr>`;
    }
    return `<tr><td>${p}</td><td></td><td></td><td></td><td></td><td></td></tr>`;
  }).join('');
  area.innerHTML = `<div class="card">
    <div style="margin-bottom:10px"><strong>레이블: ${esc(key)}</strong>${reg?` (상자: ${esc(reg.box||'')} / ${esc(reg.batch||'')})`:''}
    &nbsp;&nbsp;<span class="badge badge-gray">${esc(stage)}</span></div>
    ${b.kwon ? `<div class="caption mb-8">분권수: ${b.kwon}권, 건수: ${b.gun||0}건</div>` : ''}
    <div class="table-wrap"><table>
      <thead><tr><th>공정</th><th>완료</th><th>완료일</th><th>작업자</th><th>작업량</th><th>비고</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

// ============================================================
// 📋 일별 총괄표
// ============================================================
function renderDailySummary(data, c) {
  const labels = data.labels || {};
  if (!Object.keys(labels).length) {
    c.innerHTML = `<div class="page-title">📋 일별 총괄표</div><div class="alert alert-info">등록된 실적이 없습니다.</div>`;
    return;
  }

  // Aggregate per day per process
  // 분류: labels(레이블수), kwon(권호수 직접입력), gun(건 직접입력)
  // 기타: kwon(권호수 from 분류), gun(건 from 분류), myun(면 from 공정입력)
  const daily = {}; // { date: { proc: {labels,kwon,gun,myun,workers} } }
  for (const [, ld] of Object.entries(labels)) {
    const b     = ld['분류'] || {};
    const bKwon = b.kwon || 1;  // 분류에서 기록한 권호수
    const bGun  = b.gun  || 0;  // 분류에서 기록한 건
    for (const proc of PROCESSES) {
      if (!(proc in ld)) continue;
      const e = ld[proc]; const d = e.date; if (!d) continue;
      if (!daily[d]) daily[d] = {};
      if (!daily[d][proc]) daily[d][proc] = { labels:0, kwon:0, gun:0, myun:0, workers:new Set() };
      const pd = daily[d][proc];
      if (e.worker) pd.workers.add(e.worker);
      if (proc === '분류') {
        pd.labels += 1;
        pd.kwon   += e.kwon || 0;
        pd.gun    += e.gun  || 0;
      } else {
        pd.kwon += bKwon;          // 권호수는 분류 데이터에서
        pd.gun  += bGun;           // 건도 분류 데이터에서
        pd.myun += e.myun || 0;    // 면은 공정 입력값
      }
    }
  }

  const dates = Object.keys(daily).sort();

  // Cumulative totals
  const cumTotals = {};
  for (const p of PROCESSES) cumTotals[p] = { labels:0, kwon:0, gun:0, myun:0 };
  for (const d of dates)
    for (const p of PROCESSES) if (daily[d][p]) {
      cumTotals[p].labels += daily[d][p].labels;
      cumTotals[p].kwon   += daily[d][p].kwon;
      cumTotals[p].gun    += daily[d][p].gun;
      cumTotals[p].myun   += daily[d][p].myun;
    }

  // 스캔합계 누적
  const scanCumKwon = cumTotals['문서스캔'].kwon + cumTotals['도면스캔'].kwon;
  const scanCumGun  = cumTotals['문서스캔'].gun  + cumTotals['도면스캔'].gun;
  const scanCumMyun = cumTotals['문서스캔'].myun + cumTotals['도면스캔'].myun;
  const SCAN_COLOR_CUM = '#805ad5';

  function cmCols(cols) {
    return cols.map(({val, label}) => `
      <div class="cm-hcol">
        <div class="cm-hval">${val}</div>
        <div class="cm-hlabel">${label}</div>
      </div>`).join('');
  }
  function cmCard(color, title, cols, extra='') {
    return `<div class="metric-card${extra}" style="--pc:${color}">
      <div class="metric-label" style="color:${color}">${title}</div>
      <div class="cm-hrow">${cmCols(cols)}</div>
    </div>`;
  }

  // 스캔 블록: 스캔합계·문서스캔·도면스캔 한 줄 가로 배치
  function cmInlineCard(color, title, cols) {
    return `<div class="scan-inline-item" style="--pc:${color}">
      <div class="metric-label" style="color:${color};font-size:12px;margin-bottom:6px">${title}</div>
      <div class="cm-hrow">${cmCols(cols)}</div>
    </div>`;
  }
  const scanBlock = `<div class="scan-cum-block">
    ${cmInlineCard(SCAN_COLOR_CUM, '스캔합계', [
      {val: fmt(scanCumKwon), label:'권호수'},
      {val: fmt(scanCumGun),  label:'건'},
      {val: fmt(scanCumMyun), label:'면'}
    ])}
    <div class="scan-inline-divider"></div>
    ${cmInlineCard(PROCESS_COLORS['문서스캔'], '문서스캔', [
      {val: fmt(cumTotals['문서스캔'].kwon), label:'권호수'},
      {val: fmt(cumTotals['문서스캔'].gun),  label:'건'},
      {val: fmt(cumTotals['문서스캔'].myun), label:'면'}
    ])}
    <div class="scan-inline-divider"></div>
    ${cmInlineCard(PROCESS_COLORS['도면스캔'], '도면스캔', [
      {val: fmt(cumTotals['도면스캔'].kwon), label:'권호수'},
      {val: fmt(cumTotals['도면스캔'].gun),  label:'건'},
      {val: fmt(cumTotals['도면스캔'].myun), label:'면'}
    ])}
  </div>`;

  const CM_ORDER = ['분류','면표시','__scan__','보정','색인','재편철','공개구분'];
  const cumMetrics = CM_ORDER.map(p => {
    if (p === '__scan__') return scanBlock;
    const ct = cumTotals[p];
    const cols = p === '분류'
      ? [{val:fmt(ct.labels),label:'권'},{val:fmt(ct.kwon),label:'권호수'},{val:fmt(ct.gun),label:'건'}]
      : [{val:fmt(ct.kwon),label:'권호수'},{val:fmt(ct.gun),label:'건'},{val:fmt(ct.myun),label:'면'}];
    return cmCard(PROCESS_COLORS[p], p, cols);
  }).join('');

  // Table header
  const theadCells = PROCESSES.map(p => {
    const unitLabel = p === '분류' ? '권 / 권호수 / 건 / 인원' : '권호수 / 건 / 면 / 인원';
    return `<th class="ds-proc-head" style="--pc:${PROCESS_COLORS[p]}">
      <span class="ds-proc-name">${p}</span>
      <span class="ds-proc-unit">${unitLabel}</span>
    </th>`;
  }).join('');

  const cleanRows = [...dates].map(d => {
    const row = daily[d];
    const cells = PROCESSES.map(p => {
      const pd = row[p];
      if (!pd) return `<td class="ds-cell ds-empty"></td>`;
      const wCnt = [...pd.workers].filter(Boolean).length;
      let cols = [];
      if (p === '분류') {
        cols = [
          { val: fmt(pd.labels), label: '권' },
          { val: fmt(pd.kwon),   label: '권호수' },
          { val: fmt(pd.gun),    label: '건' },
          { val: wCnt || '-',    label: '명' },
        ];
      } else {
        cols = [
          { val: fmt(pd.kwon),  label: '권호수' },
          { val: fmt(pd.gun),   label: '건' },
          { val: fmt(pd.myun),  label: '면' },
          { val: wCnt || '-',   label: '명' },
        ];
      }
      const colsHtml = cols.map(({val, label}) => `
        <div class="ds-hcol">
          <div class="ds-hval">${val}</div>
          <div class="ds-hlabel">${label}</div>
        </div>`).join('');
      return `<td class="ds-cell" style="--pc:${PROCESS_COLORS[p]}">
        <div class="ds-hrow">${colsHtml}</div>
      </td>`;
    }).join('');
    return `<tr><td class="ds-date"><strong>${d}</strong></td>${cells}</tr>`;
  }).join('');

  c.innerHTML = `
    <div class="page-title">📋 일별 총괄표</div>
    <div class="section-header">누적 합계</div>
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr);align-items:start">${cumMetrics}</div>
    <hr class="divider">
    <div class="section-header">일별 실적</div>
    <div class="card"><div class="scroll-x"><table class="ds-table">
      <thead><tr><th class="ds-date-head">날짜</th>${theadCells}</tr></thead>
      <tbody>${cleanRows}</tbody>
    </table></div></div>
  `;
}

// ============================================================
// 📋 공정별 시트
// ============================================================
function renderProcessSheet(data, c, proc) {
  const workers = data.workers || [];
  const workerOpts = workers.map(w => `<option>${esc(w)}</option>`).join('');
  const registry = data.label_registry || {};
  const boxList = [...new Set(Object.values(registry).map(r=>r.box||'').filter(Boolean))].sort();

  // History filters
  const histWorkers = new Set();
  const histDates   = new Set();
  for (const ld of Object.values(data.labels||{}))
    if (proc in ld) {
      if (ld[proc].worker) histWorkers.add(ld[proc].worker);
      if (ld[proc].date)   histDates.add(ld[proc].date);
    }
  const hwOpts = ['전체',...[...histWorkers].sort()].map(w=>`<option>${esc(w)}</option>`).join('');
  const hdOpts = ['전체',...[...histDates].sort().reverse()].map(d=>`<option>${esc(d)}</option>`).join('');
  const hbOpts = ['전체',...boxList].map(b=>`<option>${esc(b)}</option>`).join('');

  c.innerHTML = `
    <div class="page-title">📋 ${proc}</div>
    ${!workers.length ? '<div class="alert alert-warning">⚙️ 설정에서 작업자를 먼저 등록해주세요.</div>' : ''}
    <div class="card">
      <div class="card-title">실적 입력</div>
      <div class="form-row" style="grid-template-columns:180px 200px">
        <div class="form-group"><label>작업일자</label><input type="date" id="inp-date" value="${todayStr()}"></div>
        <div class="form-group"><label>작업자</label><select id="inp-worker">${workerOpts||'<option>작업자 없음</option>'}</select></div>
      </div>
      <div class="caption-top">${getInputCaption(proc)}</div>
      <div class="table-wrap" style="margin-bottom:8px">
        <table class="input-tbl" id="inp-table">
          <thead><tr>${getInputHeaders(proc)}<th style="width:32px"></th></tr></thead>
          <tbody id="inp-tbody"></tbody>
        </table>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="saveProcessEntries('${proc}')">💾 저장 (Ctrl+S)</button>
        <span class="caption" style="align-self:center">💡 Enter → 다음 행 · ↑↓←→ → 셀 이동 · Ctrl+S → 저장</span>
      </div>
      <div id="inp-msg"></div>
    </div>
    <div class="card">
      <div class="card-title">${proc} 작업 이력</div>
      <div class="filter-row">
        <div class="filter-item"><label>작업자</label><select id="hw" onchange="renderHistTable('${proc}')">${hwOpts}</select></div>
        <div class="filter-item"><label>날짜</label><select id="hd" onchange="renderHistTable('${proc}')">${hdOpts}</select></div>
        <div class="filter-item"><label>상자번호</label><select id="hb" onchange="renderHistTable('${proc}')">${hbOpts}</select></div>
        <div class="filter-item"><label>레이블번호</label><input type="text" id="hl" placeholder="번호 검색..." oninput="renderHistTable('${proc}')" style="width:130px"></div>
      </div>
      <div id="hist-table-area"></div>
    </div>
    <div class="card">
      <div class="card-title">${proc} 일자별 실적</div>
      <div id="proc-daily-area"></div>
    </div>
  `;

  addInputRow(proc);
  renderHistTable(proc);
  renderProcDaily(proc);
}

function getInputCaption(proc) {
  if (proc==='분류') return '레이블, 권, 건을 입력하세요.';
  if (proc==='문서스캔') return '레이블과 면수를 입력하세요. 도면이 포함된 문서는 도면포함을 체크하세요.';
  if (proc==='도면스캔') return '레이블과 면수를 입력하세요. 도면만 있는 경우 전체도면을 체크하세요.';
  if (['면표시','보정'].includes(proc)) return '레이블과 면수를 입력하세요.';
  if (proc==='색인') return '레이블과 건수를 입력하세요.';
  if (AUTO_PROCS.includes(proc)) return '레이블번호만 입력하세요. 분류 데이터에서 권/건이 자동 반영됩니다.';
  return '';
}

function getInputHeaders(proc) {
  if (proc==='분류') return '<th>레이블</th><th>권</th><th>건</th><th>비고</th>';
  if (proc==='문서스캔') return '<th>레이블</th><th>면</th><th>도면포함</th><th>비고</th>';
  if (proc==='도면스캔') return '<th>레이블</th><th>면</th><th>전체도면</th><th>비고</th>';
  if (['면표시','보정'].includes(proc)) return '<th>레이블</th><th>면</th><th>비고</th>';
  if (proc==='색인') return '<th>레이블</th><th>건</th><th>비고</th>';
  if (AUTO_PROCS.includes(proc)) return '<th>레이블</th><th>비고</th>';
  return '<th>레이블</th><th>비고</th>';
}

function addInputRow(proc, focusFirst) {
  const tbody = document.getElementById('inp-tbody');
  if (!tbody) return null;
  const row = tbody.insertRow();
  if (proc==='분류') {
    row.innerHTML = `<td><input type="text" placeholder="레이블번호"></td><td><input type="text" inputmode="numeric" placeholder="권" style="width:60px"></td><td><input type="text" inputmode="numeric" placeholder="건" style="width:60px"></td><td><input type="text" placeholder="비고"></td><td><button class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()">✕</button></td>`;
  } else if (proc==='문서스캔') {
    row.innerHTML = `<td><input type="text" placeholder="레이블번호"></td><td><input type="text" inputmode="numeric" placeholder="면" style="width:70px"></td><td style="text-align:center"><input type="checkbox"></td><td><input type="text" placeholder="비고"></td><td><button class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()">✕</button></td>`;
  } else if (proc==='도면스캔') {
    row.innerHTML = `<td><input type="text" placeholder="레이블번호"></td><td><input type="text" inputmode="numeric" placeholder="면" style="width:70px"></td><td style="text-align:center"><input type="checkbox"></td><td><input type="text" placeholder="비고"></td><td><button class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()">✕</button></td>`;
  } else if (['면표시','보정'].includes(proc)) {
    row.innerHTML = `<td><input type="text" placeholder="레이블번호"></td><td><input type="text" inputmode="numeric" placeholder="면" style="width:70px"></td><td><input type="text" placeholder="비고"></td><td><button class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()">✕</button></td>`;
  } else if (proc==='색인') {
    row.innerHTML = `<td><input type="text" placeholder="레이블번호"></td><td><input type="text" inputmode="numeric" placeholder="건" style="width:70px"></td><td><input type="text" placeholder="비고"></td><td><button class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()">✕</button></td>`;
  } else {
    row.innerHTML = `<td><input type="text" placeholder="레이블번호"></td><td><input type="text" placeholder="비고"></td><td><button class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()">✕</button></td>`;
  }

  // ── 키 핸들러 ──────────────────────────────────────────
  // text/number input (체크박스 제외) 목록
  const inputs = [...row.querySelectorAll('input[type="text"]')];
  inputs.forEach((inp, idx) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (idx === 0) {
          // 레이블 칸 → 새 행 추가 후 레이블 칸 포커스
          const newRow = addInputRow(proc, false);
          if (newRow) {
            const firstInp = newRow.querySelector('input[type="text"]');
            firstInp?.focus();
          }
        } else {
          // 권/건/면/비고 칸 → 다음 기존 행의 같은 칸으로 이동 (엑셀처럼)
          const tbody = row.closest('tbody');
          const allRows = [...tbody.rows];
          const curRowIdx = allRows.indexOf(row);
          const nextRow = allRows[curRowIdx + 1];
          if (nextRow) {
            const nextInputs = [...nextRow.querySelectorAll('input[type="text"]')];
            const target = nextInputs[idx];
            if (target) { target.focus(); target.select?.(); }
          }
        }
      } else if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) {
        if (idx < inputs.length - 1) { e.preventDefault(); inputs[idx + 1].focus(); inputs[idx + 1].select?.(); }
      } else if (e.key === 'ArrowLeft' && inp.selectionStart === 0) {
        if (idx > 0) { e.preventDefault(); inputs[idx - 1].focus(); inputs[idx - 1].select?.(); }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const tbody = row.closest('tbody');
        const allRows = [...tbody.rows];
        const ri = allRows.indexOf(row);
        const prevRow = allRows[ri - 1];
        if (prevRow) {
          const prevInputs = [...prevRow.querySelectorAll('input[type="text"]')];
          const target = prevInputs[idx];
          if (target) { target.focus(); target.select?.(); }
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const tbody = row.closest('tbody');
        const allRows = [...tbody.rows];
        const ri = allRows.indexOf(row);
        const nextRow = allRows[ri + 1];
        if (nextRow) {
          const nextInputs = [...nextRow.querySelectorAll('input[type="text"]')];
          const target = nextInputs[idx];
          if (target) { target.focus(); target.select?.(); }
        }
      }
    });
  });

  if (focusFirst) {
    const first = row.querySelector('input');
    first?.focus();
  }
  return row;
}

function saveProcessEntries(proc) {
  const data   = loadData();
  const worker = document.getElementById('inp-worker')?.value || '';
  const date   = document.getElementById('inp-date')?.value  || todayStr();
  const tbody  = document.getElementById('inp-tbody');
  if (!tbody || !worker) { showToast('작업자를 선택하세요.','warning'); return; }

  const entries = [];
  const seen = new Set();
  for (const row of tbody.rows) {
    const cells = row.cells;
    const label = cells[0].querySelector('input')?.value.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const note = (proc==='분류'||proc==='문서스캔'||proc==='도면스캔'||['면표시','보정'].includes(proc)||proc==='색인')
      ? cells[cells.length-2].querySelector('input')?.value.trim()
      : cells[cells.length-2].querySelector('input')?.value.trim();
    const e = { label };
    if (note) e.note = note;
    if (proc==='분류') {
      e.kwon = parseInt(cells[1].querySelector('input')?.value)||0;
      e.gun  = parseInt(cells[2].querySelector('input')?.value)||0;
    } else if (proc==='문서스캔') {
      e.myun = parseInt(cells[1].querySelector('input')?.value)||0;
      if (cells[2].querySelector('input')?.checked) e.domyun_type = '도면포함';
    } else if (proc==='도면스캔') {
      e.myun = parseInt(cells[1].querySelector('input')?.value)||0;
      if (cells[2].querySelector('input')?.checked) e.domyun_type = '전체도면';
    } else if (['면표시','보정'].includes(proc)) {
      e.myun = parseInt(cells[1].querySelector('input')?.value)||0;
    } else if (proc==='색인') {
      e.gun = parseInt(cells[1].querySelector('input')?.value)||0;
    } else if (AUTO_PROCS.includes(proc)) {
      const info = (data.labels[label]||{})['분류'] || {};
      e.kwon = info.kwon||0; e.gun = info.gun||0;
    }
    entries.push(e);
  }

  if (!entries.length) { showToast('입력할 데이터가 없습니다.','warning'); return; }

  const registry   = data.label_registry || {};
  const hasRegistry = Object.keys(registry).length > 0;
  const unregistered = hasRegistry
    ? entries.filter(e => !(e.label in registry)).map(e => e.label) : [];
  const duplicates = entries.filter(e => data.labels[e.label]?.[proc]);
  // 미등록 레이블 제외
  const validEntries = hasRegistry
    ? entries.filter(e => e.label in registry) : entries;
  const newEntries = validEntries.filter(e => !data.labels[e.label]?.[proc]);

  const msgEl = document.getElementById('inp-msg');
  let msgs = [];
  if (unregistered.length) msgs.push(`<div class="alert alert-danger mt-8">🚫 미등록 레이블 (저장 차단): ${unregistered.join(', ')}<br><span style="font-size:12px">반입반출 현황에서 레이블을 먼저 등록하세요.</span></div>`);
  if (duplicates.length) {
    const dupDetails = duplicates.map(e => {
      const ex = data.labels[e.label][proc];
      return `${e.label} (${ex.date||'?'}, ${ex.worker||'?'})`;
    });
    msgs.push(`<div class="alert alert-warning mt-8">⚠️ 이미 입력된 레이블 (건너뜀):<br>${dupDetails.join('<br>')}</div>`);
  }
  msgEl.innerHTML = msgs.join('');

  if (!newEntries.length) { showToast('저장할 신규 데이터가 없습니다.','warning'); return; }

  for (const e of newEntries) {
    if (!data.labels[e.label]) data.labels[e.label] = {};
    const rec = { date, worker };
    if (e.note) rec.note = e.note;
    if (proc==='분류') { rec.kwon=e.kwon; rec.gun=e.gun; }
    else if (proc==='문서스캔') { rec.myun=e.myun; if(e.domyun_type) rec.domyun_type=e.domyun_type; }
    else if (proc==='도면스캔') { rec.myun=e.myun; if(e.domyun_type) rec.domyun_type=e.domyun_type; }
    else if (['면표시','보정'].includes(proc)) rec.myun=e.myun;
    else if (proc==='색인') rec.gun=e.gun;
    else { rec.kwon=e.kwon; rec.gun=e.gun; }
    data.labels[e.label][proc] = rec;
  }
  saveData(data);
  showToast(`✅ ${newEntries.length}건 저장 완료!`);

  // Reset input rows
  const tb = document.getElementById('inp-tbody');
  if (tb) { tb.innerHTML = ''; addInputRow(proc); }
  renderHistTable(proc);
  renderProcDaily(proc);
}

function renderHistTable(proc) {
  Object.keys(window._colFilters||{}).filter(k=>k.startsWith('hist-tbl:')).forEach(k=>delete window._colFilters[k]);
  const area = document.getElementById('hist-table-area'); if (!area) return;
  const data     = loadData();
  const fWorker  = document.getElementById('hw')?.value || '전체';
  const fDate    = document.getElementById('hd')?.value || '전체';
  const fBox     = document.getElementById('hb')?.value || '전체';
  const fLabel   = (document.getElementById('hl')?.value || '').trim().toLowerCase();
  const registry = data.label_registry || {};
  const workers  = data.workers || [];
  const rows = [];

  for (const [num, ld] of Object.entries(data.labels||{})) {
    if (!(proc in ld)) continue;
    const e   = ld[proc];
    const box = registry[num]?.box || '';
    if (fWorker !== '전체' && e.worker !== fWorker) continue;
    if (fDate   !== '전체' && e.date   !== fDate)   continue;
    if (fBox    !== '전체' && box       !== fBox)    continue;
    if (fLabel  && !String(num).toLowerCase().includes(fLabel)) continue;
    rows.push({ num, date:e.date||'', worker:e.worker||'', box, entry:e });
  }
  rows.sort((a,b) => b.date.localeCompare(a.date));

  if (!rows.length) { area.innerHTML = '<div class="caption">조건에 맞는 작업 이력이 없습니다.</div>'; return; }

  let summary = `총 ${rows.length}건`;
  if (proc==='분류') summary += ` | ${fmt(rows.reduce((s,r)=>s+(r.entry.kwon||0),0))}권 / ${fmt(rows.reduce((s,r)=>s+(r.entry.gun||0),0))}건`;
  else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) summary += ` | ${fmt(rows.reduce((s,r)=>s+(r.entry.myun||0),0))}면`;
  else if (proc==='색인') summary += ` | ${fmt(rows.reduce((s,r)=>s+(r.entry.gun||0),0))}건`;

  // 공정별 추가 헤더
  let extraTh = '';
  if (proc==='분류') extraTh = '<th>권</th><th>건</th>';
  else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) extraTh = '<th>면</th>';
  else if (proc==='색인') extraTh = '<th>건</th>';
  else if (AUTO_PROCS.includes(proc)) extraTh = '<th>권</th><th>건</th>';

  // 행 생성 — data-* 속성에 모든 값 저장, 클릭 가능
  let tbody = '';
  for (const r of rows) {
    const e = r.entry;
    // 수량 데이터 직렬화
    const qData = encodeURIComponent(JSON.stringify({
      kwon: e.kwon||0, gun: e.gun||0, myun: e.myun||0
    }));
    let qCells = '';
    if (proc==='분류')      qCells = `<td class="he" data-field="kwon">${e.kwon||0}</td><td class="he" data-field="gun">${e.gun||0}</td>`;
    else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) qCells = `<td class="he" data-field="myun">${e.myun||0}</td>`;
    else if (proc==='색인') qCells = `<td class="he" data-field="gun">${e.gun||0}</td>`;
    else if (AUTO_PROCS.includes(proc)) qCells = `<td class="he" data-field="kwon">${e.kwon||0}</td><td class="he" data-field="gun">${e.gun||0}</td>`;

    tbody += `<tr class="hist-row" tabindex="0"
        data-label="${esc(r.num)}" data-proc="${esc(proc)}">
      <td onclick="event.stopPropagation()"><input type="checkbox" class="hist-chk" data-label="${esc(r.num)}"></td>
      <td class="he he-ro" data-field="label"><strong>${esc(r.num)}</strong></td>
      <td class="he" data-field="date">${r.date}</td>
      <td class="he" data-field="worker">${esc(r.worker)}</td>
      ${qCells}
      <td class="he" data-field="note">${esc(e.note||'')}</td>
    </tr>`;
  }

  area.innerHTML = `
    <div class="caption mb-8">${summary}</div>
    <div class="caption-top">💡 행을 <strong>더블클릭</strong>하거나 선택 후 <strong>F2</strong>를 눌러 편집 · Enter 저장 · Esc 취소</div>
    <div class="table-wrap"><table id="hist-tbl">
      <thead><tr>
        <th style="width:32px"><input type="checkbox" onchange="toggleHistAll(this)"></th>
        <th class="th-cf" onclick="showColFilter(this,'hist-tbl',1)">레이블<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'hist-tbl',2)">작업일<span class="th-cf-icon">▼</span></th><th class="th-cf" onclick="showColFilter(this,'hist-tbl',3)">작업자<span class="th-cf-icon">▼</span></th>${extraTh}<th class="th-cf" onclick="showColFilter(this,'hist-tbl',this.cellIndex)">비고<span class="th-cf-icon">▼</span></th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table></div>
    <div class="btn-row">
      <button class="btn btn-danger btn-sm" onclick="deleteSelected('${esc(proc)}')">🗑️ 선택 삭제</button>
      <button class="btn btn-secondary btn-sm" onclick="clearAllFilters('hist-tbl')">🔄 필터 초기화</button>
    </div>
  `;

  applyAllColFilters('hist-tbl');
  updateCFIndicators('hist-tbl');

  // ── 이벤트 바인딩 ────────────────────────────────────────────
  const tbl = document.getElementById('hist-tbl');
  if (!tbl) return;

  // 더블클릭 → 해당 셀 편집 시작
  tbl.addEventListener('dblclick', e => {
    const cell = e.target.closest('.he:not(.he-ro)');
    const row = e.target.closest('tr.hist-row');
    if (cell && row) { e.preventDefault(); startCellEdit(cell, row, workers); }
  });

  // F2 → 포커스된 행의 첫 편집 가능 셀
  tbl.addEventListener('keydown', e => {
    if (e.key === 'F2') {
      const row = document.activeElement?.closest('tr.hist-row');
      if (row && !row.querySelector('.he-editing')) {
        e.preventDefault();
        const firstCell = row.querySelector('.he:not(.he-ro)');
        if (firstCell) startCellEdit(firstCell, row, workers);
      }
    }
  });

  // 행 클릭 시 포커스 (F2 대응)
  tbl.querySelectorAll('tr.hist-row').forEach(r => {
    r.addEventListener('click', () => r.focus());
  });
}

function toggleHistAll(chk) {
  document.querySelectorAll('.hist-chk').forEach(c => c.checked = chk.checked);
}

function deleteSelected(proc) {
  const selected = [...document.querySelectorAll('.hist-chk:checked')].map(c => c.dataset.label);
  if (!selected.length) { showToast('삭제할 항목을 선택하세요.','warning'); return; }
  showConfirm(`선택한 ${selected.length}건을 삭제하시겠습니까?`, () => {
    const data = loadData();
    for (const lbl of selected) {
      if (data.labels[lbl]?.[proc]) {
        delete data.labels[lbl][proc];
        if (!PROCESSES.some(p => p in data.labels[lbl])) delete data.labels[lbl];
      }
    }
    saveData(data);
    showToast(`${selected.length}건 삭제 완료`);
    renderHistTable(proc);
    renderProcDaily(proc);
  });
}

// ── 셀 단위 인라인 편집 ──────────────────────────────────────
function startCellEdit(cell, row, workers) {
  if (cell.classList.contains('he-editing')) return;
  const proc     = row.dataset.proc;
  const labelNum = row.dataset.label;
  const data     = loadData();
  const entry    = data.labels[labelNum]?.[proc] || {};
  const field    = cell.dataset.field;
  if (!field) return;

  cell.classList.add('he-editing');
  const origVal = cell.textContent.trim();

  let widget;
  if (field === 'date') {
    widget = document.createElement('input');
    widget.type = 'date'; widget.value = entry.date || origVal;
  } else if (field === 'worker') {
    widget = document.createElement('select');
    const current = entry.worker || origVal;
    widget.innerHTML = workers.map(w => `<option${w===current?' selected':''}>${esc(w)}</option>`).join('');
    if (!workers.length) { widget = document.createElement('input'); widget.type='text'; widget.value=current; }
  } else if (field === 'note') {
    widget = document.createElement('input');
    widget.type = 'text'; widget.value = entry.note ?? origVal;
  } else {
    widget = document.createElement('input');
    widget.type = 'text'; widget.inputMode = 'numeric';
    widget.value = entry[field] ?? origVal;
  }
  widget.className = 'he-cell-input';
  widget.dataset.field = field;
  cell.innerHTML = '';
  cell.appendChild(widget);
  widget.focus();
  widget.select?.();

  function saveCellEdit() {
    const d = loadData();
    if (!d.labels[labelNum]?.[proc]) { cancelCellEdit(); return; }
    const e = d.labels[labelNum][proc];
    const v = widget.value;
    if (field === 'date')   e.date   = v;
    if (field === 'worker') e.worker = v;
    if (field === 'note')   e.note   = v;
    if (field === 'kwon')   e.kwon   = parseInt(v)||0;
    if (field === 'gun')    e.gun    = parseInt(v)||0;
    if (field === 'myun')   e.myun   = parseInt(v)||0;
    saveData(d);
    renderHistTable(proc);
    renderProcDaily(proc);
  }

  function cancelCellEdit() {
    cell.classList.remove('he-editing');
    cell.textContent = origVal;
  }

  function getEditableCells() {
    return [...row.querySelectorAll('.he:not(.he-ro)')];
  }

  function moveTo(targetCell) {
    saveCellAndMoveTo(targetCell);
  }

  function saveCellAndMoveTo(targetCell) {
    // 현재 셀 저장
    const d = loadData();
    if (d.labels[labelNum]?.[proc]) {
      const e = d.labels[labelNum][proc];
      const v = widget.value;
      if (field === 'date')   e.date   = v;
      if (field === 'worker') e.worker = v;
      if (field === 'note')   e.note   = v;
      if (field === 'kwon')   e.kwon   = parseInt(v)||0;
      if (field === 'gun')    e.gun    = parseInt(v)||0;
      if (field === 'myun')   e.myun   = parseInt(v)||0;
      saveData(d);
    }
    cell.classList.remove('he-editing');
    // 원래 값 복원 (renderHistTable 안 하고 빠르게 이동)
    const newData = loadData();
    const newEntry = newData.labels[labelNum]?.[proc] || {};
    cell.textContent = field === 'date' ? (newEntry.date||'') :
                       field === 'worker' ? (newEntry.worker||'') :
                       field === 'note' ? (newEntry.note||'') :
                       String(newEntry[field]||0);
    // 다음 셀 편집 시작
    if (targetCell) {
      const targetRow = targetCell.closest('tr.hist-row');
      const tw = targetRow ? (newData.workers || []) : workers;
      startCellEdit(targetCell, targetCell.closest('tr.hist-row'), tw);
    }
  }

  let saved = false;
  widget.addEventListener('keydown', e => {
    const cells = getEditableCells();
    const curIdx = cells.indexOf(cell);

    if (e.key === 'Enter') {
      e.preventDefault();
      saved = true;
      // Enter → 아래 행의 같은 필드로 이동
      const allRows = [...row.closest('tbody').querySelectorAll('tr.hist-row')];
      const rowIdx = allRows.indexOf(row);
      const nextRow = allRows[rowIdx + 1];
      if (nextRow) {
        const nextCell = nextRow.querySelector(`.he[data-field="${field}"]`);
        if (nextCell) { saveCellAndMoveTo(nextCell); return; }
      }
      saveCellEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault(); saved = true; cancelCellEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault(); saved = true;
      const next = e.shiftKey ? cells[curIdx - 1] : cells[curIdx + 1];
      if (next) saveCellAndMoveTo(next);
      else saveCellEdit();
    } else if (e.key === 'ArrowRight' && widget.type !== 'date' && widget.type !== 'select-one' &&
               widget.selectionStart === widget.value.length) {
      const next = cells[curIdx + 1];
      if (next) { e.preventDefault(); saved = true; saveCellAndMoveTo(next); }
    } else if (e.key === 'ArrowLeft' && widget.type !== 'date' && widget.type !== 'select-one' &&
               widget.selectionStart === 0) {
      const prev = cells[curIdx - 1];
      if (prev) { e.preventDefault(); saved = true; saveCellAndMoveTo(prev); }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); saved = true;
      const allRows = [...row.closest('tbody').querySelectorAll('tr.hist-row')];
      const rowIdx = allRows.indexOf(row);
      const prevRow = allRows[rowIdx - 1];
      if (prevRow) {
        const prevCell = prevRow.querySelector(`.he[data-field="${field}"]`);
        if (prevCell) saveCellAndMoveTo(prevCell);
        else saveCellEdit();
      } else saveCellEdit();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); saved = true;
      const allRows = [...row.closest('tbody').querySelectorAll('tr.hist-row')];
      const rowIdx = allRows.indexOf(row);
      const nextRow = allRows[rowIdx + 1];
      if (nextRow) {
        const nextCell = nextRow.querySelector(`.he[data-field="${field}"]`);
        if (nextCell) saveCellAndMoveTo(nextCell);
        else saveCellEdit();
      } else saveCellEdit();
    }
  });

  widget.addEventListener('blur', () => {
    setTimeout(() => { if (!saved && cell.classList.contains('he-editing')) saveCellEdit(); }, 150);
  });
}

// ── 행 단위 인라인 편집 (레거시, 모달 편집용) ─────────────────
function startRowEdit(row, workers) {
  row.classList.add('editing');
  const proc     = row.dataset.proc;
  const labelNum = row.dataset.label;
  const data     = loadData();
  const entry    = data.labels[labelNum]?.[proc] || {};

  // 각 편집 가능 셀을 입력 위젯으로 교체
  const cells = [...row.querySelectorAll('.he:not(.he-ro)')];
  cells.forEach(cell => {
    const field = cell.dataset.field;
    const val   = cell.textContent.trim();
    let widget;
    if (field === 'date') {
      widget = document.createElement('input');
      widget.type = 'date'; widget.value = entry.date || val;
      widget.style.cssText = 'width:130px;border:1px solid #4c6ef5;border-radius:4px;padding:3px 6px;font-size:13px';
    } else if (field === 'worker') {
      widget = document.createElement('select');
      widget.style.cssText = 'border:1px solid #4c6ef5;border-radius:4px;padding:3px 4px;font-size:13px';
      const current = entry.worker || val;
      widget.innerHTML = workers.map(w => `<option${w===current?' selected':''}>${esc(w)}</option>`).join('');
      if (!workers.length) { widget = document.createElement('input'); widget.type='text'; widget.value=current; }
    } else if (field === 'note') {
      widget = document.createElement('input');
      widget.type = 'text'; widget.value = entry.note || '';
      widget.style.cssText = 'width:160px;border:1px solid #4c6ef5;border-radius:4px;padding:3px 6px;font-size:13px';
    } else {
      // 수량 필드 (kwon / gun / myun)
      widget = document.createElement('input');
      widget.type = 'number'; widget.min = 0;
      widget.value = entry[field] ?? val;
      widget.style.cssText = 'width:70px;border:1px solid #4c6ef5;border-radius:4px;padding:3px 6px;font-size:13px;text-align:right';
    }
    widget.dataset.field = field;
    cell.innerHTML = '';
    cell.appendChild(widget);
  });

  // 저장/취소 미니 버튼을 마지막 셀에 추가
  const lastCell = cells[cells.length - 1];
  if (lastCell) {
    const saveBtn   = document.createElement('button');
    saveBtn.className = 'btn btn-xs btn-success'; saveBtn.textContent = '✓';
    saveBtn.style.marginLeft = '4px';
    saveBtn.onclick = e => { e.stopPropagation(); saveRowEdit(row); };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-xs btn-secondary'; cancelBtn.textContent = '✗';
    cancelBtn.style.marginLeft = '2px';
    cancelBtn.onclick = e => { e.stopPropagation(); cancelRowEdit(row); };

    lastCell.appendChild(saveBtn);
    lastCell.appendChild(cancelBtn);
  }

  // 첫 위젯 포커스
  const firstWidget = row.querySelector('.he input, .he select');
  firstWidget?.focus(); firstWidget?.select?.();

  // Tab 키로 셀 간 이동, Enter 저장, Esc 취소
  const widgets = [...row.querySelectorAll('.he input, .he select')];
  widgets.forEach((w, idx) => {
    w.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveRowEdit(row); }
      if (e.key === 'Escape') { e.preventDefault(); cancelRowEdit(row); }
      if (e.key === 'Tab') {
        e.preventDefault();
        const next = e.shiftKey ? widgets[idx-1] : widgets[idx+1];
        next?.focus(); next?.select?.();
      }
    });
  });
}

function saveRowEdit(row) {
  const proc     = row.dataset.proc;
  const labelNum = row.dataset.label;
  const data     = loadData();
  if (!data.labels[labelNum]?.[proc]) { cancelRowEdit(row); return; }
  const entry = data.labels[labelNum][proc];

  row.querySelectorAll('.he input, .he select').forEach(w => {
    const field = w.dataset.field;
    if (!field) return;
    if (field === 'date')   entry.date   = w.value;
    if (field === 'worker') entry.worker = w.value;
    if (field === 'note')   entry.note   = w.value;
    if (field === 'kwon')   entry.kwon   = parseInt(w.value)||0;
    if (field === 'gun')    entry.gun    = parseInt(w.value)||0;
    if (field === 'myun')   entry.myun   = parseInt(w.value)||0;
  });

  saveData(data);
  showToast('수정 완료');
  // 필터/선택 상태 유지하며 테이블만 재렌더
  renderHistTable(proc);
  renderProcDaily(proc);
}

function cancelRowEdit(row) {
  row.classList.remove('editing');
  const proc = row.dataset.proc;
  renderHistTable(proc);
}

function openHistEdit(proc, labelNum) {
  const data = loadData();
  const e = data.labels[labelNum]?.[proc];
  if (!e) return;
  const workers = data.workers || [];
  const wOpts = workers.map(w=>`<option ${w===e.worker?'selected':''}>${esc(w)}</option>`).join('');
  let qFields = '';
  if (proc==='분류') qFields = `<div class="form-group"><label>권</label><input type="number" id="em-kwon" value="${e.kwon||0}"></div><div class="form-group"><label>건</label><input type="number" id="em-gun" value="${e.gun||0}"></div>`;
  else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) qFields = `<div class="form-group"><label>면</label><input type="number" id="em-myun" value="${e.myun||0}"></div>`;
  else if (proc==='색인') qFields = `<div class="form-group"><label>건</label><input type="number" id="em-gun" value="${e.gun||0}"></div>`;
  openEditModal(`
    <div class="modal-title">편집: ${esc(labelNum)} (${proc})</div>
    <div class="form-row" style="grid-template-columns:1fr 1fr">
      <div class="form-group"><label>작업일</label><input type="date" id="em-date" value="${e.date||''}"></div>
      <div class="form-group"><label>작업자</label><select id="em-worker">${wOpts||`<option>${esc(e.worker||'')}</option>`}</select></div>
    </div>
    <div class="form-row" style="grid-template-columns:1fr 1fr">${qFields}</div>
    <div class="form-group mb-12"><label>비고</label><input type="text" id="em-note" value="${esc(e.note||'')}"></div>
    <div class="btn-row">
      <button class="btn btn-secondary" onclick="closeEditModal()">취소</button>
      <button class="btn btn-primary" onclick="saveHistEdit('${esc(proc)}','${esc(labelNum)}')">저장</button>
    </div>
  `);
}

function saveHistEdit(proc, labelNum) {
  const data = loadData();
  if (!data.labels[labelNum]?.[proc]) return;
  const e = data.labels[labelNum][proc];
  e.date   = document.getElementById('em-date')?.value   || e.date;
  e.worker = document.getElementById('em-worker')?.value || e.worker;
  e.note   = document.getElementById('em-note')?.value || '';
  if (proc==='분류') { e.kwon=parseInt(document.getElementById('em-kwon')?.value)||0; e.gun=parseInt(document.getElementById('em-gun')?.value)||0; }
  else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) e.myun=parseInt(document.getElementById('em-myun')?.value)||0;
  else if (proc==='색인') e.gun=parseInt(document.getElementById('em-gun')?.value)||0;
  saveData(data);
  closeEditModal();
  showToast('수정 완료');
  renderHistTable(proc);
  renderProcDaily(proc);
}

function renderProcDaily(proc) {
  const area = document.getElementById('proc-daily-area'); if (!area) return;
  const data = loadData();
  const daily = {};
  for (const [num, ld] of Object.entries(data.labels||{})) {
    if (!(proc in ld)) continue;
    const e = ld[proc]; const d = e.date; if (!d) continue;
    if (!daily[d]) daily[d] = { cnt:0, workers:new Set(), kwon:0, gun:0, myun:0 };
    daily[d].cnt++;
    if (e.worker) daily[d].workers.add(e.worker);
    if (proc==='분류') { daily[d].kwon+=e.kwon||0; daily[d].gun+=e.gun||0; }
    else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) daily[d].myun+=e.myun||0;
    else if (proc==='색인') daily[d].gun+=e.gun||0;
  }
  if (!Object.keys(daily).length) { area.innerHTML = '<div class="caption">아직 실적이 없습니다.</div>'; return; }
  let rows = '';
  for (const d of Object.keys(daily).sort().reverse()) {
    const v = daily[d];
    let extra = '';
    if (proc==='분류') extra = `<td>${fmt(v.kwon)}</td><td>${fmt(v.gun)}</td>`;
    else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) extra = `<td>${fmt(v.myun)}</td>`;
    else if (proc==='색인') extra = `<td>${fmt(v.gun)}</td>`;
    rows += `<tr><td>${d}</td><td>${v.cnt}</td><td>${[...v.workers].join(', ')}</td>${extra}</tr>`;
  }
  let exHdr = '';
  if (proc==='분류') exHdr = '<th>권</th><th>건</th>';
  else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) exHdr = '<th>면</th>';
  else if (proc==='색인') exHdr = '<th>건</th>';
  area.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>날짜</th><th>레이블수</th><th>작업자</th>${exHdr}</tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

// ============================================================
// 👥 작업자별 현황
// ============================================================
function renderWorkerStats(data, c) {
  const labels = data.labels || {};
  const rows = [];
  for (const [, ld] of Object.entries(labels)) {
    const b = ld['분류'] || {};
    const bKwon = b.kwon || 1; const bGun = b.gun || 0;
    for (const proc of PROCESSES) {
      if (!(proc in ld)) continue;
      const e = ld[proc]; if (!e.date) continue;
      let kwon, qty;
      if (proc==='분류') { kwon=e.kwon||0; qty=e.gun||0; }
      else if (['면표시','문서스캔','도면스캔','보정'].includes(proc)) { kwon=bKwon; qty=e.myun||0; }
      else if (proc==='색인') { kwon=bKwon; qty=e.gun||0; }
      else { kwon=bKwon; qty=bGun; }
      rows.push({ date:e.date, worker:e.worker||'', proc, kwon, qty });
    }
  }

  if (!rows.length) {
    c.innerHTML = `<div class="page-title">👥 작업자별 현황</div><div class="alert alert-info">입력된 실적 데이터가 없습니다.</div>`;
    return;
  }

  const allDates = rows.map(r=>r.date).sort();
  const minD = allDates[0], maxD = allDates[allDates.length-1];
  const procOpts = ['전체', ...PROCESSES].map(p => `<option value="${p}">${p}</option>`).join('');

  c.innerHTML = `
    <div class="page-title">👥 작업자별 현황</div>
    <div class="card">
      <div class="filter-row">
        <div class="filter-item"><label>공정</label>
          <select id="ws-proc" onchange="updateWorkerStats()">${procOpts}</select>
        </div>
        <div class="filter-item"><label>시작일</label><input type="date" id="ws-start" value="${minD}" onchange="updateWorkerStats()"></div>
        <div class="filter-item"><label>종료일</label><input type="date" id="ws-end" value="${maxD}" onchange="updateWorkerStats()"></div>
        <div class="filter-item"><label>정렬</label>
          <select id="ws-sort" onchange="updateWorkerStats()">
            <option value="name">이름순</option>
            <option value="desc">작업량 많은순</option>
            <option value="asc">작업량 적은순</option>
          </select>
        </div>
      </div>
    </div>
    <div id="ws-content"></div>
  `;
  window._wsRows = rows;
  updateWorkerStats();
}

function updateWorkerStats() {
  const rows   = window._wsRows || [];
  const proc   = document.getElementById('ws-proc')?.value  || '전체';
  const start  = document.getElementById('ws-start')?.value || '';
  const end    = document.getElementById('ws-end')?.value   || '';

  const filtered = rows.filter(r =>
    (proc === '전체' || r.proc === proc) &&
    (!start || r.date >= start) &&
    (!end   || r.date <= end)
  );

  if (!filtered.length) {
    document.getElementById('ws-content').innerHTML = '<div class="alert alert-warning">선택 조건에 데이터가 없습니다.</div>';
    return;
  }

  const sort = document.getElementById('ws-sort')?.value || 'name';
  const workersBase = [...new Set(filtered.map(r=>r.worker).filter(Boolean))].sort();

  if (proc === '전체') {
    // ── 전체: 공정×작업자 피벗 테이블 ──────────────────────────
    const pivot = {};
    for (const w of workersBase) pivot[w] = {};
    for (const r of filtered) {
      if (!r.worker) continue;
      pivot[r.worker][r.proc]       = (pivot[r.worker][r.proc]||0)       + r.qty;
      if (r.proc === '분류')
        pivot[r.worker]['분류_kwon'] = (pivot[r.worker]['분류_kwon']||0) + r.kwon;
    }
    const totalQty = w => PROCESSES.reduce((s,p) => s + (pivot[w][p]||0), 0);
    const workers = sort === 'desc' ? [...workersBase].sort((a,b) => totalQty(b)-totalQty(a))
                  : sort === 'asc'  ? [...workersBase].sort((a,b) => totalQty(a)-totalQty(b))
                  : workersBase;

    // 헤더: 분류는 권호수·건 두 컬럼
    const theadCols = PROCESSES.map(p =>
      p === '분류'
        ? `<th colspan="2" style="color:${PROCESS_COLORS[p]};text-align:center">분류</th>`
        : `<th style="color:${PROCESS_COLORS[p]}">${p}</th>`
    ).join('');
    const theadSub = PROCESSES.map(p =>
      p === '분류'
        ? `<th style="font-size:11px;color:${PROCESS_COLORS[p]}">권호수</th><th style="font-size:11px;color:${PROCESS_COLORS[p]}">건</th>`
        : '<th></th>'
    ).join('');
    const thead = `<tr><th rowspan="2">작업자</th>${theadCols}</tr><tr>${theadSub}</tr>`;

    const tbody = workers.map(w => {
      const cells = PROCESSES.map(p =>
        p === '분류'
          ? `<td>${fmt(pivot[w]['분류_kwon']||0)}</td><td>${fmt(pivot[w]['분류']||0)}</td>`
          : `<td>${fmt(pivot[w][p]||0)}</td>`
      ).join('');
      return `<tr><td><span class="worker-chip">${esc(w)}</span></td>${cells}</tr>`;
    }).join('');

    const datasets = PROCESSES.map(p => ({
      label:p, data:workers.map(w=>pivot[w][p]||0),
      backgroundColor:PROCESS_COLORS[p], stack:'a'
    }));

    document.getElementById('ws-content').innerHTML = `
      <div class="card">
        <div class="card-title">작업자별 공정별 실적 (수량 기준)</div>
        <div class="table-wrap"><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
      </div>
    `;
    if (charts['ws-chart'])  { charts['ws-chart'].destroy();  delete charts['ws-chart']; }
    if (charts['ws-chart2']) { charts['ws-chart2'].destroy(); delete charts['ws-chart2']; }

  } else {
    // ── 공정별: 작업자 단위 상세 ────────────────────────────────
    const color  = PROCESS_COLORS[proc];
    const isMyun = ['면표시','문서스캔','도면스캔','보정'].includes(proc);
    const is분류  = proc === '분류';
    const qtyLabel  = is분류 ? '건' : isMyun ? '면' : '건';
    const kwonLabel = is분류 ? '권호수' : '권호수';

    // 작업자별 집계
    const wStats = {};
    for (const r of filtered) {
      if (!r.worker) continue;
      if (!wStats[r.worker]) wStats[r.worker] = { kwon:0, qty:0, days:new Set() };
      wStats[r.worker].kwon += r.kwon;
      wStats[r.worker].qty  += r.qty;
      wStats[r.worker].days.add(r.date);
    }
    const workers = sort === 'desc' ? [...workersBase].sort((a,b) => (wStats[b]?.qty||0)-(wStats[a]?.qty||0))
                  : sort === 'asc'  ? [...workersBase].sort((a,b) => (wStats[a]?.qty||0)-(wStats[b]?.qty||0))
                  : workersBase;

    const tbody = workers.map(w => {
      const s = wStats[w];
      const days = s.days.size;
      const avgKwon = (s.kwon / days).toFixed(1);
      const avgQty  = (s.qty  / days).toFixed(1);
      return `<tr>
        <td><span class="worker-chip" style="background:color-mix(in srgb,${color} 15%,#fff);color:${color}">${esc(w)}</span></td>
        <td>${fmt(s.kwon)}</td><td>${(avgKwon)}/${kwonLabel}</td>
        <td>${fmt(s.qty)}</td><td>${avgQty}/${qtyLabel}</td>
        <td>${days}일</td>
      </tr>`;
    }).join('');

    // 일별 합계 추이
    const dailyMap = {};
    for (const r of filtered) {
      if (!r.worker) continue;
      dailyMap[r.date] = (dailyMap[r.date]||0) + r.qty;
    }
    const dailyDates = Object.keys(dailyMap).sort();

    document.getElementById('ws-content').innerHTML = `
      <div class="card">
        <div class="card-title" style="color:${color}">${proc} — 작업자별 실적</div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>작업자</th>
            <th>${kwonLabel} 합계</th><th>일평균 ${kwonLabel}</th>
            <th>${qtyLabel} 합계</th><th>일평균 ${qtyLabel}</th>
            <th>작업일수</th>
          </tr></thead>
          <tbody>${tbody}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-title">작업자별 ${qtyLabel} 비교</div>
        <div class="chart-wrap chart-h260"><canvas id="ws-chart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">일별 ${qtyLabel} 추이 (전체)</div>
        <div class="chart-wrap chart-h220"><canvas id="ws-chart2"></canvas></div>
      </div>
    `;

    // 작업자별 바 차트
    if (charts['ws-chart'])  { charts['ws-chart'].destroy();  delete charts['ws-chart']; }
    if (charts['ws-chart2']) { charts['ws-chart2'].destroy(); delete charts['ws-chart2']; }

    const ctx = document.getElementById('ws-chart');
    if (ctx) charts['ws-chart'] = new Chart(ctx, {
      type:'bar',
      data:{ labels:workers,
        datasets:[
          {label:`${kwonLabel}`, data:workers.map(w=>wStats[w]?.kwon||0), backgroundColor:color+'99'},
          {label:`${qtyLabel}`,  data:workers.map(w=>wStats[w]?.qty||0),  backgroundColor:color}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{position:'top'}}, scales:{y:{beginAtZero:true}}}
    });

    const ctx2 = document.getElementById('ws-chart2');
    if (ctx2) charts['ws-chart2'] = new Chart(ctx2, {
      type:'line',
      data:{ labels:dailyDates,
        datasets:[{label:`일별 ${qtyLabel}`, data:dailyDates.map(d=>dailyMap[d]||0),
          borderColor:color, backgroundColor:color+'22', fill:true, tension:0.3}]
      },
      options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}}}
    });
  }
}

// ============================================================
// 🔍 품질검사
// ============================================================
function renderQuality(data, c) {
  c.innerHTML = `
    <div class="page-title">🔍 품질검사</div>
    <div class="tabs">
      <button class="tab-btn active" onclick="switchQTab(0)">레이블 검사</button>
      <button class="tab-btn" onclick="switchQTab(1)">검사 현황</button>
      <button class="tab-btn" onclick="switchQTab(2)">오류 유형 분석</button>
      <button class="tab-btn" onclick="switchQTab(3)">재작업 관리</button>
    </div>
    <div id="qtab-0" class="tab-panel active"></div>
    <div id="qtab-1" class="tab-panel"></div>
    <div id="qtab-2" class="tab-panel"></div>
    <div id="qtab-3" class="tab-panel"></div>
  `;
  renderQTab0(data);
  renderQTab1(data);
  renderQTab2(data);
  renderQTab3(data);
}

function switchQTab(idx) {
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i===idx));
  document.querySelectorAll('[id^="qtab-"]').forEach((p,i) => p.classList.toggle('active', i===idx));
}

function renderQTab0(data) {
  const workers = data.workers || [];
  const wOpts = workers.map(w=>`<option>${esc(w)}</option>`).join('');
  const pOpts = PROCESSES.map(p=>`<option>${p}</option>`).join('');
  const errOpts = ERROR_TYPES.map(e=>`<option>${e}</option>`).join('');

  document.getElementById('qtab-0').innerHTML = `
    <div class="card">
      <div class="card-title">레이블 단위 품질검사</div>
      <div class="form-row" style="grid-template-columns:repeat(4,1fr)">
        <div class="form-group"><label>검사일자</label><input type="date" id="qi-date" value="${todayStr()}"></div>
        <div class="form-group"><label>검사자</label><select id="qi-inspector">${wOpts||'<option>-</option>'}</select></div>
        <div class="form-group"><label>검사유형</label><select id="qi-type"><option>전수검사</option><option>샘플링검사</option></select></div>
        <div class="form-group"><label>검사공정</label><select id="qi-proc">${pOpts}</select></div>
      </div>
      <hr class="divider">
      <div class="caption-top">검사한 레이블을 입력하고, 오류가 있는 레이블은 오류유형을 선택하세요.</div>
      <div class="table-wrap" style="margin-bottom:8px">
        <table class="input-tbl">
          <thead><tr><th>레이블</th><th>결과</th><th>오류유형</th><th>오류내용</th><th></th></tr></thead>
          <tbody id="qi-tbody"></tbody>
        </table>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary btn-sm" onclick="addQiRow()">+ 행 추가</button>
      </div>
      <div id="qi-summary"></div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="calcQiResult()">결과 확인</button>
        <button class="btn btn-success hidden" id="qi-save-btn" onclick="saveQiResult()">💾 검사결과 저장</button>
      </div>
    </div>
  `;
  addQiRow();
}

function addQiRow() {
  const tbody = document.getElementById('qi-tbody'); if (!tbody) return;
  const errOpts = ERROR_TYPES.map(e=>`<option value="">${e}</option>`).join('');
  const row = tbody.insertRow();
  row.innerHTML = `
    <td><input type="text" placeholder="레이블번호" style="width:120px"></td>
    <td><select><option>적합</option><option>오류</option></select></td>
    <td><select><option value=""></option>${ERROR_TYPES.map(e=>`<option>${e}</option>`).join('')}</select></td>
    <td><input type="text" placeholder="오류내용" style="width:180px"></td>
    <td><button class="btn btn-xs btn-danger" onclick="this.closest('tr').remove()">✕</button></td>
  `;
}

function calcQiResult() {
  const tbody = document.getElementById('qi-tbody'); if (!tbody) return;
  const valid = [];
  for (const row of tbody.rows) {
    const label = row.cells[0].querySelector('input')?.value.trim();
    if (!label) continue;
    valid.push({
      label, result: row.cells[1].querySelector('select')?.value,
      errType: row.cells[2].querySelector('select')?.value,
      errDetail: row.cells[3].querySelector('input')?.value.trim()
    });
  }
  if (!valid.length) { showToast('검사 데이터를 입력하세요.','warning'); return; }
  const total  = valid.length;
  const errors = valid.filter(r => r.result==='오류');
  const errCnt = errors.length;
  const errRate = (errCnt/total*100).toFixed(3);
  const qualRate = (100 - parseFloat(errRate)).toFixed(3);
  const pass = parseFloat(errRate) <= 0.1;

  document.getElementById('qi-summary').innerHTML = `
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr);margin-top:12px">
      <div class="metric-card"><div class="metric-label">검사 건수</div><div class="metric-value">${total}건</div></div>
      <div class="metric-card"><div class="metric-label">오류 건수</div><div class="metric-value" style="color:#e53e3e">${errCnt}건</div></div>
      <div class="metric-card"><div class="metric-label">오류율</div><div class="metric-value">${errRate}%</div></div>
      <div class="metric-card"><div class="metric-label">판정</div><div class="metric-value" style="color:${pass?'#38a169':'#e53e3e'}">${pass?'적합':'부적합'}</div></div>
    </div>
    <div class="alert ${pass?'alert-success':'alert-danger'} mt-8">
      ${pass?'✅':'❌'} <strong>${pass?'적합':'부적합'}</strong> | 품질률: ${qualRate}% | 오류율: ${errRate}% (기준: 0.1% 이하)
    </div>
  `;
  const btn = document.getElementById('qi-save-btn');
  if (btn) btn.classList.remove('hidden');
  window._qiValid = valid;
}

function saveQiResult() {
  const valid = window._qiValid; if (!valid) return;
  const data = loadData();
  const date     = document.getElementById('qi-date')?.value || todayStr();
  const inspector= document.getElementById('qi-inspector')?.value || '';
  const type     = document.getElementById('qi-type')?.value || '전수검사';
  const proc     = document.getElementById('qi-proc')?.value || '';
  const errors   = valid.filter(r => r.result==='오류');
  const errCnt   = errors.length;
  const errRate  = parseFloat((errCnt/valid.length*100).toFixed(3));
  const qualRate = parseFloat((100-errRate).toFixed(3));

  data.sampling_logs.push({
    date, type, process:proc, total_checked:valid.length, error_count:errCnt,
    error_rate:errRate, quality_rate:qualRate, inspector,
    result: errRate<=0.1 ? '적합' : '부적합',
    labels_checked: valid.map(r=>r.label)
  });

  for (const r of errors) {
    data.error_labels.push({
      date, label:r.label, process:proc, error_type:r.errType,
      error_detail:r.errDetail, inspector, rework_status:'대기'
    });
  }
  saveData(data);
  showToast(`검사결과 저장 완료 (오류 ${errCnt}건 재작업 등록)`);
  renderQuality(data, document.getElementById('main-content'));
}

function renderQTab1(data) {
  const logs = data.sampling_logs || [];
  const area = document.getElementById('qtab-1'); if (!area) return;
  if (!logs.length) { area.innerHTML = '<div class="alert alert-info mt-8">아직 검사 이력이 없습니다.</div>'; return; }

  const totalInsp = logs.length;
  const avgQ = (logs.reduce((s,l)=>s+l.quality_rate,0)/totalInsp).toFixed(2);
  const passCnt = logs.filter(l=>l.result==='적합').length;
  const totalErr = logs.reduce((s,l)=>s+l.error_count,0);

  const sorted = [...logs].sort((a,b)=>a.date.localeCompare(b.date));
  const tRows = [...logs].reverse().map(l=>`<tr>
    <td>${l.date}</td><td>${esc(l.type)}</td><td>${esc(l.process)}</td>
    <td>${l.total_checked}</td><td>${l.error_count}</td>
    <td>${l.error_rate}%</td><td>${l.quality_rate}%</td>
    <td>${esc(l.inspector)}</td>
    <td><span class="badge ${l.result==='적합'?'badge-ok':'badge-ng'}">${l.result}</span></td>
  </tr>`).join('');

  area.innerHTML = `
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:16px">
      <div class="metric-card"><div class="metric-label">총 검사횟수</div><div class="metric-value">${totalInsp}회</div></div>
      <div class="metric-card"><div class="metric-label">평균 품질률</div><div class="metric-value">${avgQ}%</div></div>
      <div class="metric-card"><div class="metric-label">적합 횟수</div><div class="metric-value">${passCnt}/${totalInsp}</div></div>
      <div class="metric-card"><div class="metric-label">총 오류 건수</div><div class="metric-value">${totalErr}건</div></div>
    </div>
    <div class="card">
      <div class="card-title">품질률 추이</div>
      <div class="chart-wrap chart-h300"><canvas id="q1-chart"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">검사 이력</div>
      <div class="table-wrap"><table>
        <thead><tr><th>날짜</th><th>유형</th><th>공정</th><th>검사건수</th><th>오류건수</th><th>오류율</th><th>품질률</th><th>검사자</th><th>판정</th></tr></thead>
        <tbody>${tRows}</tbody>
      </table></div>
    </div>
  `;

  if (charts['q1-chart']) { charts['q1-chart'].destroy(); delete charts['q1-chart']; }
  const ctx = document.getElementById('q1-chart');
  if (ctx) {
    const byProc = {};
    for (const l of sorted) {
      if (!byProc[l.process]) byProc[l.process] = { dates:[], vals:[] };
      byProc[l.process].dates.push(l.date);
      byProc[l.process].vals.push(l.quality_rate);
    }
    charts['q1-chart'] = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: Object.entries(byProc).map(([p,v]) => ({
          label: p, data: v.vals.map((val,i) => ({x:v.dates[i], y:val})),
          borderColor: PROCESS_COLORS[p]||'#4c6ef5', tension:0.3, fill:false
        }))
      },
      options: {
        responsive:true, maintainAspectRatio:false,
        plugins: { legend:{position:'top'},
          annotation: { annotations: { line1:{ type:'line', yMin:99.9, yMax:99.9, borderColor:'red', borderDash:[5,5] } } }
        },
        scales: { x:{type:'category'}, y:{min:90, max:100, title:{display:true,text:'품질률(%)'}} }
      }
    });
  }
}

function renderQTab2(data) {
  const area = document.getElementById('qtab-2'); if (!area) return;
  const errs = data.error_labels || [];
  if (!errs.length) { area.innerHTML = '<div class="alert alert-info mt-8">아직 오류 기록이 없습니다.</div>'; return; }

  const typeCounts = {};
  const procCounts = {};
  for (const e of errs) {
    typeCounts[e.error_type||'기타'] = (typeCounts[e.error_type||'기타']||0) + 1;
    procCounts[e.process||'?'] = (procCounts[e.process||'?']||0) + 1;
  }
  const typeRows = Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`<tr><td>${esc(t)}</td><td>${n}</td></tr>`).join('');
  const errListRows = errs.map(e=>`<tr>
    <td>${e.date}</td><td>${esc(e.label)}</td><td>${esc(e.process)}</td>
    <td>${esc(e.error_type)}</td><td>${esc(e.error_detail)}</td>
    <td>${esc(e.inspector)}</td>
    <td><span class="badge ${e.rework_status==='완료'?'badge-ok':'badge-wait'}">${e.rework_status}</span></td>
  </tr>`).join('');

  area.innerHTML = `
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
      <div class="card">
        <div class="card-title">오류 유형 분포</div>
        <div class="chart-wrap chart-h250"><canvas id="q2-pie"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">유형별 건수</div>
        <div class="table-wrap"><table><thead><tr><th>오류유형</th><th>건수</th></tr></thead><tbody>${typeRows}</tbody></table></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">공정별 오류 건수</div>
      <div class="chart-wrap chart-h250"><canvas id="q2-bar"></canvas></div>
    </div>
    <div class="card">
      <div class="card-title">오류 레이블 목록</div>
      <div class="table-wrap"><table>
        <thead><tr><th>검사일</th><th>레이블</th><th>공정</th><th>오류유형</th><th>오류내용</th><th>검사자</th><th>재작업상태</th></tr></thead>
        <tbody>${errListRows}</tbody>
      </table></div>
    </div>
  `;

  if (charts['q2-pie']) { charts['q2-pie'].destroy(); delete charts['q2-pie']; }
  const pie = document.getElementById('q2-pie');
  if (pie) {
    charts['q2-pie'] = new Chart(pie, {
      type: 'pie',
      data: { labels:Object.keys(typeCounts), datasets:[{ data:Object.values(typeCounts), backgroundColor:['#FF6B6B','#FFA94D','#FFD43B','#69DB7C','#4DABF7','#9775FA'] }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right'}} }
    });
  }
  if (charts['q2-bar']) { charts['q2-bar'].destroy(); delete charts['q2-bar']; }
  const bar = document.getElementById('q2-bar');
  if (bar) {
    charts['q2-bar'] = new Chart(bar, {
      type: 'bar',
      data: { labels:Object.keys(procCounts), datasets:[{ label:'오류건수', data:Object.values(procCounts), backgroundColor:Object.keys(procCounts).map(p=>PROCESS_COLORS[p]||'#4DABF7') }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}} }
    });
  }
}

function renderQTab3(data) {
  const area = document.getElementById('qtab-3'); if (!area) return;
  const errs = data.error_labels || [];
  if (!errs.length) { area.innerHTML = '<div class="alert alert-info mt-8">재작업 대상이 없습니다.</div>'; return; }

  const pending  = errs.filter(e=>e.rework_status==='대기');
  const done     = errs.filter(e=>e.rework_status==='완료');

  const pendingRows = pending.map((e,i) => {
    const realIdx = errs.indexOf(e);
    return `<tr>
      <td><input type="checkbox" class="rw-chk" data-idx="${realIdx}"></td>
      <td>${e.date}</td><td>${esc(e.label)}</td><td>${esc(e.process)}</td>
      <td>${esc(e.error_type)}</td><td>${esc(e.error_detail)}</td>
    </tr>`;
  }).join('');

  const doneRows = done.map(e=>`<tr>
    <td>${e.date}</td><td>${esc(e.label)}</td><td>${esc(e.process)}</td>
    <td>${esc(e.error_type)}</td><td>${e.rework_date||''}</td>
  </tr>`).join('');

  area.innerHTML = `
    <div class="metrics-grid" style="grid-template-columns:repeat(3,1fr)">
      <div class="metric-card"><div class="metric-label">재작업 대기</div><div class="metric-value" style="color:#c77600">${pending.length}건</div></div>
      <div class="metric-card"><div class="metric-label">재작업 완료</div><div class="metric-value" style="color:#38a169">${done.length}건</div></div>
      <div class="metric-card"><div class="metric-label">전체 오류</div><div class="metric-value">${errs.length}건</div></div>
    </div>
    ${pending.length ? `
    <div class="card">
      <div class="card-title">재작업 대기 (${pending.length}건)</div>
      <div class="table-wrap"><table>
        <thead><tr><th><input type="checkbox" onchange="toggleRwAll(this)"></th><th>검사일</th><th>레이블</th><th>공정</th><th>오류유형</th><th>오류내용</th></tr></thead>
        <tbody>${pendingRows}</tbody>
      </table></div>
      <div class="btn-row">
        <button class="btn btn-success btn-sm" onclick="reworkComplete()">✅ 선택 완료 처리</button>
        <button class="btn btn-danger btn-sm" onclick="reworkDelete()">🗑️ 선택 삭제</button>
      </div>
    </div>` : '<div class="alert alert-success">재작업 대기 건이 없습니다.</div>'}
    ${done.length ? `
    <div class="card">
      <div class="card-title">재작업 완료 이력 (${done.length}건)</div>
      <div class="table-wrap"><table>
        <thead><tr><th>검사일</th><th>레이블</th><th>공정</th><th>오류유형</th><th>완료일</th></tr></thead>
        <tbody>${doneRows}</tbody>
      </table></div>
    </div>` : ''}
  `;
}

function toggleRwAll(chk) { document.querySelectorAll('.rw-chk').forEach(c=>c.checked=chk.checked); }

function reworkComplete() {
  const idxs = [...document.querySelectorAll('.rw-chk:checked')].map(c=>+c.dataset.idx);
  if (!idxs.length) { showToast('선택 항목이 없습니다.','warning'); return; }
  showConfirm(`선택 ${idxs.length}건을 재작업 완료 처리하시겠습니까?`, () => {
    const data = loadData();
    for (const i of idxs) { data.error_labels[i].rework_status='완료'; data.error_labels[i].rework_date=todayStr(); }
    saveData(data);
    showToast(`${idxs.length}건 완료 처리`);
    renderQuality(data, document.getElementById('main-content'));
  });
}

function reworkDelete() {
  const idxs = [...document.querySelectorAll('.rw-chk:checked')].map(c=>+c.dataset.idx).sort((a,b)=>b-a);
  if (!idxs.length) { showToast('선택 항목이 없습니다.','warning'); return; }
  showConfirm(`선택 ${idxs.length}건을 삭제하시겠습니까?`, () => {
    const data = loadData();
    for (const i of idxs) data.error_labels.splice(i,1);
    saveData(data);
    showToast(`${idxs.length}건 삭제`);
    renderQuality(data, document.getElementById('main-content'));
  });
}

// ============================================================
// ============================================================
// 📦 반입반출 현황
// ============================================================
function renderTransferPage(data, c) {
  const recs = data.transfer_records || [];
  const registry = data.label_registry || {};
  const labels = data.labels || {};

  // 반입회차별 레이블 연결 통계
  function getBatchStats(batchName) {
    const linked = [];
    for (const [num, reg] of Object.entries(registry)) {
      if ((reg.batch || '') === batchName) linked.push(num);
    }
    const total = linked.length;
    let classified = 0, completed = 0;
    for (const num of linked) {
      const ld = labels[num];
      if (!ld) continue;
      if ('분류' in ld) classified++;
      if ('공개구분' in ld) completed++;
    }
    const stage = getLabelStage;
    const procCounts = {};
    for (const p of PROCESSES) procCounts[p] = 0;
    for (const num of linked) {
      const ld = labels[num];
      if (!ld) continue;
      for (const p of PROCESSES) if (p in ld) procCounts[p]++;
    }
    return { linked, total, classified, completed, procCounts };
  }

  // 그룹별 분리
  const banChul = recs.filter(r => r.group === '반출');
  const banIp   = recs.filter(r => r.group === '반입');

  // 반출수량(철) = 해당 반입회차(batch)의 등록 레이블 수 (자동 집계)
  function getQty(r) { return getBatchStats(r.batch || '').total; }
  function calcDB(r) { return getBatchStats(r.batch || '').completed; }
  function sumF(arr, fn) { return arr.reduce((s, r) => s + fn(r), 0); }

  function groupRows(arr, groupLabel) {
    let rows = '';
    arr.forEach((r, i) => {
      const idx = recs.indexOf(r);
      const qty = getQty(r);
      const db = calcDB(r);
      rows += `<tr class="tf-row" data-idx="${idx}" tabindex="0">
        ${i === 0 ? `<td class="tf-group" rowspan="${arr.length + 1}">${groupLabel}</td>` : ''}
        <td class="tf-cell" data-field="name">${esc(r.name)}</td>
        <td class="tf-cell tf-batch" data-field="batch">${esc(r.batch||'')}</td>
        <td class="tf-cell" data-field="transferDate">${esc(r.transferDate||'')}</td>
        <td class="tf-cell" data-field="place">${esc(r.place)}</td>
        <td class="num tf-calc"><strong>${fmt(qty)}</strong></td>
        <td class="tf-cell num" data-field="split">${fmt(r.split||0)}</td>
        <td class="tf-cell num" data-field="exclude">${fmt(r.exclude||0)}</td>
        <td class="tf-cell num" data-field="childExclude">${fmt(r.childExclude||0)}</td>
        <td class="tf-cell num" data-field="merge">${fmt(r.merge||0)}</td>
        <td class="tf-cell num" data-field="fullSplit">${fmt(r.fullSplit||0)}</td>
        <td class="num tf-calc"><strong>${fmt(db)}</strong></td>
        <td class="tf-cell num" data-field="kwon">${fmt(r.kwon||0)}</td>
        <td class="tf-cell" data-field="inPlace">${esc(r.inPlace||'')}</td>
        <td class="tf-del"><button class="btn btn-xs btn-danger" onclick="deleteTransferRow(${idx},event)">✕</button></td>
      </tr>`;
    });
    // 합계
    const tQty = sumF(arr, getQty);
    const sums = ['split','exclude','childExclude','merge','fullSplit','kwon'].map(f => sumF(arr, r=>r[f]||0));
    const tDB = sumF(arr, calcDB);
    rows += `<tr class="tf-subtotal">
      <td colspan="4"><strong>합계</strong></td>
      <td class="num"><strong>${fmt(tQty)}</strong></td>
      ${sums.slice(0,5).map(v => `<td class="num"><strong>${fmt(v)}</strong></td>`).join('')}
      <td class="num"><strong>${fmt(tDB)}</strong></td>
      <td class="num"><strong>${fmt(sums[5])}</strong></td>
      <td></td>
      <td></td>
    </tr>`;
    return rows;
  }

  const allDB = sumF(recs, calcDB);
  const allKwon = sumF(recs, r => r.kwon||0);
  const allQty = sumF(recs, getQty);
  const totalReg = Object.keys(registry).length;

  c.innerHTML = `
    <div class="page-title">📦 반입반출 현황</div>
    <div class="metrics-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="metric-card"><div class="metric-label">반출입 회차</div><div class="metric-value">${recs.length}건</div></div>
      <div class="metric-card"><div class="metric-label">DB구축 합계</div><div class="metric-value">${fmt(allDB)}철</div></div>
      <div class="metric-card"><div class="metric-label">권호수 합계</div><div class="metric-value">${fmt(allKwon)}권</div></div>
      <div class="metric-card"><div class="metric-label">등록 레이블</div><div class="metric-value">${fmt(allQty)} / ${fmt(totalReg)}</div></div>
    </div>
    <div class="card" id="transfer-section">
      <div class="caption-top mb-8">💡 반출수량(철)은 등록 레이블에서 자동 집계됩니다 · 셀 <strong>더블클릭</strong> 또는 <strong>F2</strong>로 편집 · Enter 저장 · Esc 취소</div>
      <div class="table-wrap"><table class="transfer-tbl" id="transfer-tbl">
        <thead>
          <tr>
            <th rowspan="2" style="width:50px">구분</th>
            <th rowspan="2">회차</th>
            <th rowspan="2">반출/반입<br>회차</th>
            <th rowspan="2">반출/반입<br>일자</th>
            <th rowspan="2">반출장소</th>
            <th colspan="2">반출</th>
            <th colspan="5">반입</th>
            <th rowspan="2">권호수<br>구분</th>
            <th rowspan="2">반입장소</th>
            <th rowspan="2" style="width:36px"></th>
          </tr>
          <tr>
            <th>반출수량<br>(철)</th>
            <th>분철</th>
            <th>제외</th>
            <th>아동카드<br>제외</th>
            <th>합권</th>
            <th>전권분철</th>
            <th>DB구축<br>완료</th>
          </tr>
        </thead>
        <tbody>
          ${banChul.length ? groupRows(banChul, '반출') : ''}
          ${banIp.length ? groupRows(banIp, '반입') : ''}
          ${recs.length ? `<tr class="tf-total">
            <td colspan="5"><strong>반출입 수량 합계</strong></td>
            <td colspan="6" class="num"><strong>${fmt(allDB)}</strong></td>
            <td class="num"><strong>${fmt(allKwon)}</strong></td>
            <td></td>
            <td></td>
          </tr>` : '<tr><td colspan="15" style="text-align:center;padding:24px;color:var(--text-muted)">반입반출 데이터가 없습니다. 엑셀 업로드 또는 수동 추가를 해주세요.</td></tr>'}
        </tbody>
      </table></div>
      <div class="btn-row mt-8">
        <button class="btn btn-secondary btn-sm" onclick="addTransferRow('반출')">+ 반출 추가</button>
        <button class="btn btn-secondary btn-sm" onclick="addTransferRow('반입')">+ 반입 추가</button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">📎 레이블 등록 (엑셀 업로드)</div>
      <div class="caption-top mb-8">레이블번호, 상자번호, 반출/반입회차가 포함된 엑셀(xlsx) 파일을 업로드하세요. 반출/반입회차에 따라 반출수량이 자동 집계됩니다.</div>
      <div class="form-group mb-12">
        <input type="file" id="label-file" accept=".xlsx,.csv" onchange="previewLabelFile(this)">
      </div>
      <div id="label-preview"></div>
    </div>
    <div id="batch-label-modal"></div>
  `;
  initTransferEditing();
}

function showBatchLabels(batchName, e) {
  if (e) e.stopPropagation();
  const data = loadData();
  const registry = data.label_registry || {};
  const labels = data.labels || {};
  const linked = [];
  for (const [num, reg] of Object.entries(registry)) {
    if ((reg.batch || '') === batchName) {
      const ld = labels[num] || {};
      const stage = getLabelStage(ld);
      const box = reg.box || '';
      linked.push({ num, box, stage });
    }
  }
  linked.sort((a,b) => a.num.localeCompare(b.num));

  // 공정별 진행 현황
  const procCounts = {};
  for (const p of PROCESSES) procCounts[p] = 0;
  for (const l of linked) {
    const ld = labels[l.num] || {};
    for (const p of PROCESSES) if (p in ld) procCounts[p]++;
  }
  const procBars = PROCESSES.map(p => {
    const pct = linked.length > 0 ? Math.round(procCounts[p] / linked.length * 100) : 0;
    return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin:2px 0">
      <span style="width:60px;color:${PROCESS_COLORS[p]}">${p}</span>
      <div style="flex:1;height:14px;background:var(--hover-bg);border-radius:3px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${PROCESS_COLORS[p]};border-radius:3px"></div>
      </div>
      <span style="width:60px;text-align:right">${procCounts[p]}/${linked.length} (${pct}%)</span>
    </div>`;
  }).join('');

  const tblRows = linked.map(l =>
    `<tr><td>${esc(l.num)}</td><td>${esc(l.box)}</td><td><span class="badge badge-${l.stage==='완료'?'green':'gray'}">${esc(l.stage)}</span></td></tr>`
  ).join('');

  showModal(`
    <div class="modal-title">📦 ${esc(batchName)} — 연결 레이블 (${linked.length}건)</div>
    <div style="margin-bottom:12px">${procBars}</div>
    <div class="scroll-table-wrap" style="max-height:300px">
      <table>
        <thead><tr><th>레이블번호</th><th>상자번호</th><th>현재 단계</th></tr></thead>
        <tbody>${tblRows || '<tr><td colspan="3" style="text-align:center;padding:16px">연결된 레이블이 없습니다</td></tr>'}</tbody>
      </table>
    </div>
  `);
}

function initTransferEditing() {
  const tbl = document.getElementById('transfer-tbl');
  if (!tbl) return;

  tbl.addEventListener('dblclick', e => {
    const cell = e.target.closest('.tf-cell');
    if (!cell || cell.querySelector('input')) return;
    startTfCellEdit(cell);
  });

  tbl.addEventListener('keydown', e => {
    if (e.key === 'F2') {
      const row = document.activeElement?.closest('.tf-row');
      if (row && !row.querySelector('input')) {
        e.preventDefault();
        const firstCell = row.querySelector('.tf-cell');
        if (firstCell) startTfCellEdit(firstCell);
      }
    }
  });
}

function startTfCellEdit(cell) {
  const row = cell.closest('.tf-row');
  const idx = parseInt(row.dataset.idx);
  const field = cell.dataset.field;
  const data = loadData();
  const rec = data.transfer_records[idx];
  if (!rec) return;

  const TF_NUM = new Set(['qty','split','exclude','childExclude','merge','fullSplit','kwon']);
  const isNum = TF_NUM.has(field);
  const val = rec[field];

  const input = document.createElement('input');
  input.type = isNum ? 'number' : 'text';
  input.value = val ?? '';
  input.className = 'tf-edit-input';
  cell.textContent = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  let saved = false;
  function save() {
    if (saved) return;
    saved = true;
    const newVal = isNum ? (parseInt(input.value) || 0) : input.value.trim();
    const d = loadData();
    d.transfer_records[idx][field] = newVal;
    saveData(d);
    renderTransferPage(d, document.getElementById('main-content'));
  }
  function cancel() { if (!saved) { saved = true; renderTransferPage(loadData(), document.getElementById('main-content')); } }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      const curField = field;
      save();
      setTimeout(() => {
        const tbl = document.getElementById('transfer-tbl');
        if (!tbl) return;
        const newRow = tbl.querySelector(`.tf-row[data-idx="${idx}"]`);
        if (!newRow) return;
        const cells = [...newRow.querySelectorAll('.tf-cell')];
        const ci = cells.findIndex(c => c.dataset.field === curField);
        const next = cells[ci + 1] || cells[0];
        if (next) startTfCellEdit(next);
      }, 50);
    }
  });
  input.addEventListener('blur', () => { setTimeout(() => { if (!saved) save(); }, 100); });
}

function addTransferRow(group) {
  const data = loadData();
  data.transfer_records.push({
    group, name:'', batch:'', transferDate:'', place:'', qty:0, split:0, exclude:0,
    childExclude:0, merge:0, fullSplit:0, kwon:0, inPlace:''
  });
  saveData(data);
  renderTransferPage(data, document.getElementById('main-content'));
}

function deleteTransferRow(idx, e) {
  if (e) e.stopPropagation();
  showConfirm('해당 항목을 삭제하시겠습니까?', () => {
    const data = loadData();
    data.transfer_records.splice(idx, 1);
    saveData(data);
    renderTransferPage(data, document.getElementById('main-content'));
    showToast('삭제 완료');
  });
}


// ⚙️ 설정
// ============================================================
function renderSettings(data, c) {
  c.innerHTML = `
    <div class="page-title">⚙️ 사업 설정</div>
    <div class="tabs">
      <button class="tab-btn active" onclick="switchStTab(0)">사업 정보</button>
      <button class="tab-btn" onclick="switchStTab(1)">작업자 관리</button>
      <button class="tab-btn" onclick="switchStTab(2)">레이블 등록</button>
      <button class="tab-btn" onclick="switchStTab(3)">데이터 관리</button>
    </div>
    <div id="stab-0" class="tab-panel active"></div>
    <div id="stab-1" class="tab-panel"></div>
    <div id="stab-2" class="tab-panel"></div>
    <div id="stab-3" class="tab-panel"></div>
  `;
  renderStTab0(data);
  renderStTab1(data);
  renderStTab2(data);
  renderStTab3(data);
}

function switchStTab(idx) {
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',i===idx));
  document.querySelectorAll('[id^="stab-"]').forEach((p,i)=>p.classList.toggle('active',i===idx));
}

function renderStTab0(data) {
  const p = data.project, t = data.targets||{};
  document.getElementById('stab-0').innerHTML = `
    <div class="card">
      <div class="card-title">사업 기본 정보</div>
      <div class="form-group mb-12"><label>사업명</label><input type="text" id="st-name" value="${esc(p.name)}"></div>
      <div class="form-row" style="grid-template-columns:1fr 1fr">
        <div class="form-group"><label>시작일</label><input type="date" id="st-start" value="${p.start_date}"></div>
        <div class="form-group"><label>종료일</label><input type="date" id="st-end" value="${p.end_date}"></div>
      </div>
      <hr class="divider">
      <div class="card-title">목표량 설정</div>
      <div class="caption-top">전체 공정 공통 목표입니다.</div>
      <div class="form-row" style="grid-template-columns:1fr 1fr">
        <div class="form-group"><label>목표 권수</label><input type="number" id="st-kwon" value="${t.target_kwon||p.total_kwon||12000}"></div>
        <div class="form-group"><label>목표 면수</label><input type="number" id="st-myun" value="${t.target_myun||p.total_myun||1250000}"></div>
      </div>
      <div class="btn-row"><button class="btn btn-primary" onclick="saveProjectInfo()">💾 사업정보 저장</button></div>
    </div>
  `;
}

function saveProjectInfo() {
  const data = loadData();
  data.project.name       = document.getElementById('st-name')?.value  || data.project.name;
  data.project.start_date = document.getElementById('st-start')?.value || data.project.start_date;
  data.project.end_date   = document.getElementById('st-end')?.value   || data.project.end_date;
  const kwon = parseInt(document.getElementById('st-kwon')?.value)||0;
  const myun = parseInt(document.getElementById('st-myun')?.value)||0;
  data.project.total_kwon = kwon; data.project.total_myun = myun;
  data.targets = { target_kwon:kwon, target_myun:myun };
  saveData(data);
  showToast('사업정보 저장 완료');
  renderSidebar();
}

function renderStTab1(data) {
  const workers = data.workers || [];
  const list = workers.map((w,i) => `
    <span class="worker-chip">${esc(w)}
      <button style="background:none;border:none;cursor:pointer;color:#e53e3e;margin-left:4px;font-size:12px" onclick="removeWorker(${i})">✕</button>
    </span>`).join('');

  document.getElementById('stab-1').innerHTML = `
    <div class="card">
      <div class="card-title">등록된 작업자 (${workers.length}명)</div>
      <div style="margin-bottom:12px">${list || '<span class="text-muted">등록된 작업자가 없습니다.</span>'}</div>
      ${workers.length ? `<div class="btn-row"><button class="btn btn-danger btn-sm" onclick="clearAllWorkers()">🗑️ 전체 삭제</button></div>` : ''}
    </div>
    <div class="card">
      <div class="card-title">작업자 추가</div>
      <div class="form-row" style="grid-template-columns:1fr auto">
        <div class="form-group"><label>이름</label><input type="text" id="new-worker" placeholder="작업자 이름"></div>
        <div class="form-group"><label>&nbsp;</label><button class="btn btn-primary" onclick="addWorker()">➕ 추가</button></div>
      </div>
      <div class="form-group mb-12">
        <label>일괄 추가 (쉼표 또는 줄바꿈으로 구분)</label>
        <textarea id="bulk-workers" placeholder="홍길동, 김철수, 이영희"></textarea>
      </div>
      <div class="btn-row"><button class="btn btn-secondary" onclick="addBulkWorkers()">➕ 일괄 추가</button></div>
    </div>
  `;
}

function addWorker() {
  const name = document.getElementById('new-worker')?.value.trim();
  if (!name) return;
  const data = loadData();
  if (data.workers.includes(name)) { showToast(`'${name}'은(는) 이미 등록되어 있습니다.`,'warning'); return; }
  data.workers.push(name);
  saveData(data);
  showToast(`${name} 추가 완료`);
  renderStTab1(data);
}

function addBulkWorkers() {
  const bulk = document.getElementById('bulk-workers')?.value || '';
  const names = bulk.replace(/\n/g,',').split(',').map(n=>n.trim()).filter(Boolean);
  if (!names.length) return;
  const data = loadData();
  const added = names.filter(n => { if(!data.workers.includes(n)){data.workers.push(n);return true;} return false; });
  saveData(data);
  showToast(added.length ? `${added.length}명 추가: ${added.join(', ')}` : '추가할 새 작업자가 없습니다.');
  renderStTab1(data);
}

function removeWorker(idx) {
  const data = loadData();
  data.workers.splice(idx,1);
  saveData(data);
  renderStTab1(data);
}

function clearAllWorkers() {
  showConfirm('모든 작업자를 삭제하시겠습니까?', () => {
    const data = loadData(); data.workers = []; saveData(data);
    showToast('전체 삭제 완료'); renderStTab1(data);
  });
}

function renderStTab2(data) {
  const registry = data.label_registry || {};
  const cnt = Object.keys(registry).length;
  const boxList = [...new Set(Object.values(registry).map(r=>r.box||'').filter(Boolean))].sort();
  const batchList = [...new Set(Object.values(registry).map(r=>r.batch||'').filter(Boolean))].sort();

  let regRows = '';
  let regSearch = window._regSearch || '';
  for (const [lbl,info] of Object.entries(registry)) {
    if (regSearch && !lbl.includes(regSearch)) continue;
    const stage = getLabelStage((data.labels||{})[lbl]||{});
    regRows += `<tr><td>${esc(info.batch||'')}</td><td>${esc(info.box||'')}</td><td>${esc(lbl)}</td><td><span class="badge badge-gray">${esc(stage)}</span></td></tr>`;
  }

  document.getElementById('stab-2').innerHTML = `
    <div class="card">
      <div class="alert alert-info">현재 등록된 레이블: <strong>${fmt(cnt)}건</strong></div>
      <div class="caption-top">레이블 업로드는 <strong>📦 반입반출 현황</strong> 페이지에서 관리합니다.</div>
    </div>
    ${cnt ? `
    <div class="card">
      <div class="card-title">등록된 레이블 목록 (${fmt(cnt)}건)</div>
      <div class="form-row" style="grid-template-columns:200px 1fr">
        <div class="form-group"><label>검색</label><input type="text" placeholder="레이블번호" value="${esc(regSearch)}" oninput="window._regSearch=this.value;renderStTab2(loadData())"></div>
      </div>
      <div class="table-wrap" style="max-height:400px;overflow-y:auto"><table>
        <thead><tr><th>반입회차</th><th>상자번호</th><th>레이블번호</th><th>작업상태</th></tr></thead>
        <tbody>${regRows}</tbody>
      </table></div>
      <div class="btn-row mt-12">
        <button class="btn btn-danger btn-sm" onclick="clearRegistry()">🗑️ 등록 레이블 전체 삭제</button>
      </div>
    </div>` : ''}
  `;
}

function previewLabelFile(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    let rows = [];
    try {
      const wb = XLSX.read(e.target.result, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, {defval:''});
    } catch(err) {
      showToast('파일 읽기 오류: '+err.message,'error'); return;
    }
    if (!rows.length) { showToast('데이터가 없습니다.','warning'); return; }

    // Auto-detect columns
    const cols = Object.keys(rows[0]);
    let labelCol = cols.find(c => /레이블|label/i.test(c));
    let boxCol   = cols.find(c => /상자|box/i.test(c));
    let batchCol = cols.find(c => /반입|회차|batch/i.test(c));

    const preview = rows.slice(0,5).map(r =>
      `<tr>${[labelCol,boxCol,batchCol].map(c=>`<td>${esc(String(r[c||'']||''))}</td>`).join('')}</tr>`
    ).join('');

    document.getElementById('label-preview').innerHTML = `
      <div class="alert alert-info mb-12">감지된 컬럼 — 레이블: <strong>${esc(labelCol||'?')}</strong>, 상자: <strong>${esc(boxCol||'-')}</strong>, 반입회차: <strong>${esc(batchCol||'-')}</strong></div>
      <div class="caption-top">미리보기 (상위 5건, 전체 ${rows.length}건)</div>
      <div class="table-wrap mb-12"><table>
        <thead><tr><th>레이블</th><th>상자번호</th><th>반입회차</th></tr></thead>
        <tbody>${preview}</tbody>
      </table></div>
      <div class="btn-row">
        <button class="btn btn-primary" onclick="importLabels(false)">📥 ${rows.length}건 추가 등록</button>
        <button class="btn btn-secondary" onclick="importLabels(true)">🔄 기존 삭제 후 새로 등록</button>
      </div>
    `;
    window._labelRows = rows;
    window._labelCols = { labelCol, boxCol, batchCol };
  };
  reader.readAsArrayBuffer(file);
}

function importLabels(replace) {
  const rows = window._labelRows; if (!rows) return;
  const { labelCol, boxCol, batchCol } = window._labelCols || {};
  if (!labelCol) { showToast('레이블 컬럼을 찾을 수 없습니다.','error'); return; }
  const data = loadData();
  if (replace) data.label_registry = {};
  let cnt = 0;
  for (const r of rows) {
    const lbl = String(r[labelCol]||'').trim(); if (!lbl) continue;
    data.label_registry[lbl] = { box: String(r[boxCol||'']||'').trim(), batch: String(r[batchCol||'']||'').trim() };
    cnt++;
  }
  // 반입반출 현황: 새 회차 자동 추가
  const newBatches = new Set();
  for (const r of rows) {
    const batch = String(r[batchCol||'']||'').trim();
    if (batch) newBatches.add(batch);
  }
  const existingBatches = new Set((data.transfer_records||[]).map(t => t.batch || t.name));
  for (const batch of newBatches) {
    if (!existingBatches.has(batch)) {
      if (!data.transfer_records) data.transfer_records = [];
      data.transfer_records.push({
        group:'반입', name:'', batch:batch, transferDate:'', place:'', qty:0, split:0, exclude:0,
        childExclude:0, merge:0, fullSplit:0, kwon:0, inPlace:''
      });
    }
  }

  saveData(data);
  showToast(`${cnt}건 레이블 등록 완료`);
  window._regSearch = '';
  // 현재 페이지에 따라 새로고침
  if (document.getElementById('stab-2')) renderStTab2(data);
  if (document.getElementById('transfer-section')) renderTransferPage(data, document.getElementById('main-content'));
}

function clearRegistry() {
  showConfirm('등록된 레이블을 모두 삭제하시겠습니까? (실적 데이터는 유지됩니다)', () => {
    const data = loadData(); data.label_registry = {}; saveData(data);
    showToast('레이블 목록 삭제 완료'); renderStTab2(data);
  });
}

function renderStTab3(data) {
  document.getElementById('stab-3').innerHTML = `
    <div class="card">
      <div class="card-title">데이터 내보내기 / 가져오기</div>
      <div class="btn-row mb-12">
        <button class="btn btn-secondary" onclick="exportData()">📤 JSON 내보내기</button>
        <button class="btn btn-secondary" onclick="document.getElementById('import-file').click()">📥 JSON 가져오기</button>
        <input type="file" id="import-file" accept=".json" style="display:none" onchange="importData(this)">
      </div>
      <hr class="divider">
      <div class="card-title" style="color:#e53e3e">위험 구역</div>
      <div class="btn-row">
        <button class="btn btn-danger" onclick="resetAllData()">🗑️ 전체 데이터 초기화</button>
      </div>
      <div class="caption mt-8">초기화하면 모든 실적, 레이블, 작업자 데이터가 삭제됩니다.</div>
    </div>
  `;
}

function exportData() {
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dashboard_backup_${todayStr()}.json`;
  a.click();
  showToast('JSON 파일 다운로드');
}

function importData(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const d = JSON.parse(e.target.result);
      showConfirm('현재 데이터를 가져온 데이터로 교체하시겠습니까?', () => {
        saveData(d);
        showToast('데이터 가져오기 완료');
        renderSidebar();
        navigate('대시보드');
      });
    } catch(err) { showToast('JSON 파싱 오류: '+err.message,'error'); }
  };
  reader.readAsText(file, 'utf-8');
}

function resetAllData() {
  showConfirm('⚠️ 모든 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.', () => {
    saveData(getDefaultData());
    showToast('전체 초기화 완료');
    navigate('대시보드');
  });
}

// ============================================================
// 초기화
// ============================================================
// ── 글로벌 단축키 ──────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Ctrl+S → 현재 공정 시트 저장
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const saveBtn = document.querySelector('#inp-tbody')?.closest('.card')?.querySelector('.btn-primary');
    if (saveBtn) saveBtn.click();
  }
});

function init() {
  // Import existing data.json if localStorage is empty
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    // Try to fetch data.json from parent directory
    fetch('../data.json')
      .then(r => r.json())
      .then(d => { saveData(d); showToast('기존 data.json 데이터를 불러왔습니다.'); renderSidebar(); renderContent(); })
      .catch(() => { renderSidebar(); renderContent(); });
  } else {
    renderSidebar();
    renderContent();
  }
}

// ============================================================
// 컬럼 헤더 드롭다운 필터
// ============================================================
if (!window._colFilters) window._colFilters = {};

function showColFilter(th, tableId, colIdx) {
  document.querySelectorAll('.col-filter-dropdown').forEach(d => d.remove());
  const table = document.getElementById(tableId);
  if (!table) return;

  const vals = new Set();
  for (const row of table.tBodies[0]?.rows || []) {
    const cell = row.cells[colIdx];
    vals.add((cell?.textContent.trim()) || '(비어있음)');
  }

  const key = `${tableId}:${colIdx}`;
  const active = window._colFilters[key];
  const items = [...vals].sort();

  const div = document.createElement('div');
  div.className = 'col-filter-dropdown';
  const sortKey = `${tableId}:${colIdx}`;
  const curSort = window._colSorts?.[sortKey] || '';
  div.innerHTML = `
    <div class="cfd-sort">
      <button class="cfd-sort-btn ${curSort==='asc'?'active':''}" onclick="applyCFSort('${tableId}',${colIdx},'asc',this)">▲ 오름차순</button>
      <button class="cfd-sort-btn ${curSort==='desc'?'active':''}" onclick="applyCFSort('${tableId}',${colIdx},'desc',this)">▼ 내림차순</button>
    </div>
    <hr class="cfd-divider">
    <div class="cfd-search"><input type="text" placeholder="검색..." oninput="cfdSearch(this)"></div>
    <div class="cfd-items">
      <label class="cfd-item cfd-all-item">
        <input type="checkbox" id="cfd-all-chk" ${!active ? 'checked' : ''} onchange="cfdToggleAll(this)">
        <span><strong>전체 선택</strong></span>
      </label>
      <hr class="cfd-divider">
      ${items.map(v => `<label class="cfd-item"><input type="checkbox" class="cfd-val" value="${v.replace(/"/g,'&quot;')}" ${!active || active.has(v) ? 'checked' : ''}> <span>${v}</span></label>`).join('')}
    </div>
    <div class="cfd-btns">
      <button class="cfd-apply" onclick="applyCFD('${tableId}',${colIdx},this.closest('.col-filter-dropdown'))">적용</button>
      <button onclick="clearCFD('${tableId}',${colIdx})">초기화</button>
    </div>
  `;

  const rect = th.getBoundingClientRect();
  div.style.top = (rect.bottom + 2) + 'px';
  div.style.left = Math.min(rect.left, window.innerWidth - 270) + 'px';
  document.body.appendChild(div);
  div.querySelector('.cfd-search input')?.focus();

  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!div.contains(e.target) && !th.contains(e.target)) {
        div.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 10);
}

if (!window._colSorts) window._colSorts = {};

function applyCFSort(tableId, colIdx, dir, btn) {
  const key = `${tableId}:${colIdx}`;
  // 같은 방향 다시 클릭하면 정렬 해제
  if (window._colSorts[key] === dir) {
    delete window._colSorts[key];
  } else {
    window._colSorts[key] = dir;
  }

  const table = document.getElementById(tableId);
  if (!table) return;
  const tbody = table.tBodies[0];
  if (!tbody) return;

  const rows = [...tbody.rows];
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}-\d{2}$/.test(v);
  rows.sort((a, b) => {
    const aVal = a.cells[colIdx]?.textContent.trim() || '';
    const bVal = b.cells[colIdx]?.textContent.trim() || '';
    let cmp;
    if (isDate(aVal) && isDate(bVal)) {
      cmp = aVal.localeCompare(bVal);
    } else {
      const aNum = parseFloat(aVal.replace(/,/g, ''));
      const bNum = parseFloat(bVal.replace(/,/g, ''));
      if (!isNaN(aNum) && !isNaN(bNum)) cmp = aNum - bNum;
      else cmp = aVal.localeCompare(bVal, 'ko');
    }
    return window._colSorts[key] === 'desc' ? -cmp : cmp;
  });
  for (const row of rows) tbody.appendChild(row);

  document.querySelectorAll('.col-filter-dropdown').forEach(d => d.remove());
  updateCFIndicators(tableId);
}

function cfdSearch(input) {
  const q = input.value.toLowerCase();
  input.closest('.col-filter-dropdown').querySelectorAll('.cfd-val').forEach(chk => {
    chk.closest('.cfd-item').style.display = chk.value.toLowerCase().includes(q) ? '' : 'none';
  });
}

function cfdToggleAll(chk) {
  chk.closest('.col-filter-dropdown').querySelectorAll('.cfd-val').forEach(c => c.checked = chk.checked);
}

function applyCFD(tableId, colIdx, dropdown) {
  const key = `${tableId}:${colIdx}`;
  const allVals = [...dropdown.querySelectorAll('.cfd-val')];
  const checked = allVals.filter(c => c.checked).map(c => c.value);
  if (checked.length === allVals.length) delete window._colFilters[key];
  else window._colFilters[key] = new Set(checked);
  dropdown.remove();
  applyAllColFilters(tableId);
  updateCFIndicators(tableId);
}

function clearCFD(tableId, colIdx) {
  delete window._colFilters[`${tableId}:${colIdx}`];
  document.querySelectorAll('.col-filter-dropdown').forEach(d => d.remove());
  applyAllColFilters(tableId);
  updateCFIndicators(tableId);
}

function applyAllColFilters(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const filters = Object.entries(window._colFilters)
    .filter(([k]) => k.startsWith(tableId + ':'))
    .map(([k, v]) => [parseInt(k.split(':')[1]), v]);
  for (const row of table.tBodies[0]?.rows || []) {
    let show = true;
    for (const [ci, allowed] of filters) {
      const txt = (row.cells[ci]?.textContent.trim()) || '(비어있음)';
      if (!allowed.has(txt)) { show = false; break; }
    }
    row.style.display = show ? '' : 'none';
  }
}

function updateCFIndicators(tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const ths = [...(table.tHead?.rows[0]?.cells || [])];
  ths.forEach((th, i) => th.classList.toggle('cf-active', !!(window._colFilters[`${tableId}:${i}`])));
}

function clearAllFilters(tableId) {
  // 컬럼 필터 전체 해제
  for (const key of Object.keys(window._colFilters || {})) {
    if (key.startsWith(tableId + ':')) delete window._colFilters[key];
  }
  // 정렬 전체 해제
  for (const key of Object.keys(window._colSorts || {})) {
    if (key.startsWith(tableId + ':')) delete window._colSorts[key];
  }
  document.querySelectorAll('.col-filter-dropdown').forEach(d => d.remove());
  applyAllColFilters(tableId);
  updateCFIndicators(tableId);
  showToast('필터 초기화 완료', 'info');
}

function resetProgressFilters() {
  // 상단 드롭다운 필터도 초기화
  const ids = ['f-search','f-box','f-batch','f-stage','f-dom'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  }
  applyProgressFilter();
}

// Expose to window for inline handlers
window.navigate = navigate;
window.switchDashTab = switchDashTab;
window.applyProgressFilter = applyProgressFilter;
window.setProgressPage = setProgressPage;
window.showLabelDetail = showLabelDetail;
window.addInputRow = addInputRow;
window.saveProcessEntries = saveProcessEntries;
window.renderHistTable = renderHistTable;
window.startRowEdit = startRowEdit;
window.saveRowEdit = saveRowEdit;
window.cancelRowEdit = cancelRowEdit;
window.openHistEdit = openHistEdit;
window.saveHistEdit = saveHistEdit;
window.deleteSelected = deleteSelected;
window.toggleHistAll = toggleHistAll;
window.updateWorkerStats = updateWorkerStats;
window.addTransferRow = addTransferRow;
window.deleteTransferRow = deleteTransferRow;
window.startTfCellEdit = startTfCellEdit;
window.showBatchLabels = showBatchLabels;
window.switchQTab = switchQTab;
window.addQiRow = addQiRow;
window.calcQiResult = calcQiResult;
window.saveQiResult = saveQiResult;
window.reworkComplete = reworkComplete;
window.reworkDelete = reworkDelete;
window.toggleRwAll = toggleRwAll;
window.switchStTab = switchStTab;
window.saveProjectInfo = saveProjectInfo;
window.addWorker = addWorker;
window.addBulkWorkers = addBulkWorkers;
window.removeWorker = removeWorker;
window.clearAllWorkers = clearAllWorkers;
window.previewLabelFile = previewLabelFile;
window.importLabels = importLabels;
window.clearRegistry = clearRegistry;
window.exportData = exportData;
window.importData = importData;
window.resetAllData = resetAllData;
window.confirmOk = confirmOk;
window.confirmCancel = confirmCancel;
window.closeEditModal = closeEditModal;
window.loadData = loadData;
function toggleScanChildren(parentRow) {
  let row = parentRow.nextElementSibling;
  let hidden = null;
  while (row && row.classList.contains('scan-child-row')) {
    if (hidden === null) hidden = row.style.display !== 'none';
    row.style.display = hidden ? 'none' : '';
    row = row.nextElementSibling;
  }
  const icon = parentRow.querySelector('.scan-toggle-icon');
  if (icon) icon.textContent = hidden ? '▸' : '▾';
}
window.toggleScanChildren = toggleScanChildren;
window.showColFilter = showColFilter;
window.clearAllFilters = clearAllFilters;
window.resetProgressFilters = resetProgressFilters;
window.applyCFSort = applyCFSort;
window.cfdSearch = cfdSearch;
window.cfdToggleAll = cfdToggleAll;
window.applyCFD = applyCFD;
window.clearCFD = clearCFD;
window.applyAllColFilters = applyAllColFilters;
window.updateCFIndicators = updateCFIndicators;

init();
