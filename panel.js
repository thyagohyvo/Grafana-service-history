(() => {
  /* ── Referências ──────────────────────────────────────────────────────── */
  const root       = htmlNode.querySelector('#sc-root');
  const list       = htmlNode.querySelector('#sc-list');
  const empty      = htmlNode.querySelector('#sc-empty');
  const subEl      = htmlNode.querySelector('#sc-sub');
  const filterEl   = htmlNode.querySelector('#sc-filter');
  const btnClear   = htmlNode.querySelector('#sc-clear');
  const cntOk      = htmlNode.querySelector('#sc-cnt-ok');
  const cntDown    = htmlNode.querySelector('#sc-cnt-down');
  const totalOk    = htmlNode.querySelector('#sc-total-ok');
  const totalDown  = htmlNode.querySelector('#sc-total-down');
  const totalAll   = htmlNode.querySelector('#sc-total-all');
  const footerTs   = htmlNode.querySelector('#sc-footer-ts');
  const btnName    = htmlNode.querySelector('#sc-sort-name');
  const btnStatus  = htmlNode.querySelector('#sc-sort-status');
  const btnItem    = htmlNode.querySelector('#sc-sort-uptime');

  /* ── Tema automático ──────────────────────────────────────────────────── */
  root.dataset.theme = htmlGraphics?.theme?.isDark ? 'dark' : 'light';

  /* ── Estado persistente ───────────────────────────────────────────────── */
  const KEY = '__sc_svc_state__';
  const S = window[KEY] ||= { q: '', sortCol: 'Servidor', sortDir: 'asc' };

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  const isNil = v =>
    v === null || v === undefined || v === '' ||
    (typeof v === 'number' && !isFinite(v));

  const asNum = v => {
    const n = parseFloat(String(v ?? '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };

  const asStr = v => isNil(v) ? '' : String(v);

  const asTime = v => {
    if (v instanceof Date) return v.getTime();
    const n = asNum(v);
    if (n === null) return null;
    return n > 1e12 ? n : n * 1000;
  };

  const getVal = (field, i) => {
    const vals = field?.values;
    if (!vals) return null;
    return typeof vals.get === 'function' ? vals.get(i) : vals[i];
  };

  /* ── Status Zabbix service.info[x,state] ──────────────────────────────
     0 = Running       1 = Paused          2 = Start Pending
     3 = Pause Pending 4 = Continue Pending 5 = Stop Pending
     6 = Stopped       7 = Unknown
  ────────────────────────────────────────────────────────────────────────── */
  const STATUS_LABEL = {
    0: 'Running',
    1: 'Paused',
    2: 'Start Pending',
    3: 'Pause Pending',
    4: 'Continue Pending',
    5: 'Stop Pending',
    6: 'Stopped',
    7: 'Unknown',
  };

  const isUp    = raw => asNum(raw) === 0;
  const stKey   = raw => isUp(raw) ? 'up' : 'down';
  const stLabel = raw => {
    const n = asNum(raw);
    return n !== null ? (STATUS_LABEL[n] ?? `State ${n}`) : '—';
  };

  /* ── Mapeamento flexível de colunas ──────────────────────────────────────
     Aceita variações de nome: maiúsculas, acentos, nomes do Zabbix/Grafana
  ────────────────────────────────────────────────────────────────────────── */
  const COL_MAP = {
    Servidor: ['servidor', 'host', 'h.name', 'hostname', 'name'],
    Item:     ['item', 'i.name', 'nome', 'itemname', 'item_name', 'description'],
    Status:   ['status', 'statusservico', 'value', 'estado', 'state'],
    ItemId:   ['itemid', 'item_id', 'i.itemid', 'id'],
    Clock:    ['clock', 'time', 'timestamp', 'datetime'],
    Value:    ['value', 'val', 'estado', 'state'],
  };

  const findField = (fields, key) => {
    const aliases = COL_MAP[key];
    let f = fields.find(f => f.name === key);
    if (f) return f;
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    f = fields.find(f => aliases.some(a => norm(f.name) === norm(a)));
    return f ?? null;
  };

  /* ── Leitura de dados (status atual — series[0]) ─────────────────────── */
  const toRows = () => {
    const series = htmlGraphics?.data?.series;
    if (!series?.length) return [];
    const df     = series[0];
    const fields = df.fields || [];
    const n      = fields[0]?.values?.length ?? 0;

    if (!window.__sc_logged__) {
      window.__sc_logged__ = true;
      console.log('[sc-svc] colunas (series[0]):', fields.map(f => `"${f.name}"`).join(', '));
      if (series[1]) {
        console.log('[sc-svc] colunas (series[1]):', (series[1].fields || []).map(f => `"${f.name}"`).join(', '));
      }
    }

    const fServidor = findField(fields, 'Servidor');
    const fItem     = findField(fields, 'Item');
    const fStatus   = findField(fields, 'Status');
    const fItemId   = findField(fields, 'ItemId');

    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        Servidor: fServidor ? getVal(fServidor, i) : null,
        Item:     fItem     ? getVal(fItem, i)     : null,
        Status:   fStatus   ? getVal(fStatus, i)   : null,
        ItemId:   fItemId   ? getVal(fItemId, i)   : null,
      });
    }
    return out;
  };

  /* ── Leitura de histórico 24h (series[1]) ───────────────────────────── */
  const buildHistoryMap = () => {
    const map = new Map();
    const series = htmlGraphics?.data?.series;
    if (!series || series.length < 2) return map;

    const df     = series[1];
    const fields = df.fields || [];
    const fItemId = findField(fields, 'ItemId');
    const fClock  = findField(fields, 'Clock');
    const fValue  = findField(fields, 'Value');
    if (!fItemId || !fClock || !fValue) return map;

    const n = fItemId.values?.length ?? 0;
    for (let i = 0; i < n; i++) {
      const id = asStr(getVal(fItemId, i));
      const t  = asTime(getVal(fClock, i));
      const v  = asNum(getVal(fValue, i));
      if (id === '' || t === null || v === null) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({ t, v });
    }
    map.forEach(arr => arr.sort((a, b) => a.t - b.t));
    return map;
  };

  let historyMap = new Map();

  /* ── Ordenação ────────────────────────────────────────────────────────── */
  const sortRows = rows => [...rows].sort((a, b) => {
    let d = 0;
    if (S.sortCol === 'Status') {
      d = (asNum(a.Status) ?? 99) - (asNum(b.Status) ?? 99);
    } else if (S.sortCol === 'Item') {
      d = asStr(a.Item).localeCompare(asStr(b.Item), 'pt-BR', { sensitivity: 'base' });
    } else {
      d = asStr(a.Servidor).localeCompare(asStr(b.Servidor), 'pt-BR', {
        numeric: true, sensitivity: 'base'
      });
    }
    return S.sortDir === 'asc' ? d : -d;
  });

  /* ── Botões de sort ───────────────────────────────────────────────────── */
  const updateSortBtns = () => {
    const map = { Servidor: btnName, Status: btnStatus, Item: btnItem };
    [btnName, btnStatus, btnItem].forEach(b => b.classList.remove('sc-sort-btn--active'));
    map[S.sortCol]?.classList.add('sc-sort-btn--active');
  };

  /* ── Modal de histórico — anexado dentro do htmlNode (não no body) ────── */
  let modalEl = htmlNode.querySelector('#sc-history-modal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'sc-history-modal';
    modalEl.className = 'sc-modal-overlay';
    modalEl.innerHTML = `
      <div class="sc-modal">
        <div class="sc-modal__header">
          <span class="sc-modal__title" id="sc-modal-title">Histórico</span>
          <button class="sc-modal__close" id="sc-modal-close" type="button">✕</button>
        </div>
        <div class="sc-modal__stats" id="sc-modal-stats"></div>
        <div class="sc-modal__chart" id="sc-modal-chart"></div>
      </div>
    `;
    root.appendChild(modalEl);

    const closeModal = () => { modalEl.style.display = 'none'; };
    modalEl.querySelector('#sc-modal-close').addEventListener('click', closeModal);
    modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
  }

  if (!root.dataset.escBound) {
    root.dataset.escBound = '1';
    htmlNode.addEventListener('keydown', e => {
      if (e.key === 'Escape') modalEl.style.display = 'none';
    });
  }

  /* ── Cálculo de estatísticas (quedas + tempo parado) ─────────────────── */
  const computeStats = (points, from, now) => {
    let downMs = 0;
    let drops  = 0;
    let prevUp = null;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const segStart = Math.max(p.t, from);
      const segEnd   = (i + 1 < points.length) ? points[i + 1].t : now;
      if (segEnd <= from) continue;

      const up = p.v === 0;
      const clippedStart = Math.max(segStart, from);
      const clippedEnd   = Math.min(segEnd, now);
      const dur = Math.max(clippedEnd - clippedStart, 0);

      if (!up) downMs += dur;

      if (prevUp !== null && prevUp === true && up === false) drops++;
      prevUp = up;
    }

    const fmtDur = ms => {
      const totalMin = Math.round(ms / 60000);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      if (h === 0 && m === 0) return '0min';
      if (h === 0) return `${m}min`;
      return `${h}h ${m}min`;
    };

    const totalMs = now - from;
    const upPct = totalMs > 0 ? ((totalMs - downMs) / totalMs * 100) : 100;

    return { drops, downMs, downFmt: fmtDur(downMs), upPct: upPct.toFixed(2) };
  };

  /* ── Gráfico de linha/step com grade ──────────────────────────────────── */
  const renderHistoryChart = (points, title) => {
    modalEl.querySelector('#sc-modal-title').textContent = title;
    const chartEl = modalEl.querySelector('#sc-modal-chart');
    const statsEl = modalEl.querySelector('#sc-modal-stats');

    const now  = Date.now();
    const from = now - 24 * 3600 * 1000;

    if (!points || !points.length) {
      chartEl.innerHTML = '<div class="sc-modal-empty">Sem dados de histórico nas últimas 24h.</div>';
      statsEl.innerHTML = '';
      return;
    }

    const stats = computeStats(points, from, now);
    statsEl.innerHTML = `
      <div class="sc-stat-card">
        <span class="sc-stat-card__num crit">${stats.drops}</span>
        <span class="sc-stat-card__lbl">Quedas (24h)</span>
      </div>
      <div class="sc-stat-card">
        <span class="sc-stat-card__num crit">${stats.downFmt}</span>
        <span class="sc-stat-card__lbl">Tempo parado</span>
      </div>
      <div class="sc-stat-card">
        <span class="sc-stat-card__num ok">${stats.upPct}%</span>
        <span class="sc-stat-card__lbl">Disponibilidade</span>
      </div>
    `;

    const W = 760, H = 180;
    const padL = 36, padR = 14, padT = 14, padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const yUp   = padT;
    const yDown = padT + plotH;

    const xScale = t => padL + ((Math.min(Math.max(t, from), now) - from) / (now - from)) * plotW;
    const yScale = v  => (v === 0) ? yUp : yDown;

    let path = '';
    let firstX = xScale(Math.max(points[0].t, from));
    let firstY = yScale(points[0].v);
    path += `M ${firstX.toFixed(1)} ${firstY.toFixed(1)} `;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const segEnd = (i + 1 < points.length) ? points[i + 1].t : now;
      const x2 = xScale(Math.min(segEnd, now));
      const y  = yScale(p.v);
      path += `L ${x2.toFixed(1)} ${y.toFixed(1)} `;
      if (i + 1 < points.length) {
        const yNext = yScale(points[i + 1].v);
        path += `L ${x2.toFixed(1)} ${yNext.toFixed(1)} `;
      }
    }

    const dangerRects = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const segStart = Math.max(p.t, from);
      const segEnd   = (i + 1 < points.length) ? points[i + 1].t : now;
      if (segEnd <= from || p.v === 0) continue;
      const x1 = xScale(segStart);
      const x2 = xScale(Math.min(segEnd, now));
      dangerRects.push(
        `<rect x="${x1.toFixed(1)}" y="${padT}" width="${Math.max(x2 - x1, 1).toFixed(1)}" height="${plotH}" fill="var(--crit)" opacity="0.12" />`
      );
    }

    const gridLines = [];
    const hourLabels = [];
    const totalHours = 24;
    for (let h = 0; h <= totalHours; h += 4) {
      const t = from + h * 3600 * 1000;
      const x = xScale(t);
      gridLines.push(`<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${yDown}" stroke="var(--border)" stroke-width="1" />`);
      const label = new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const anchor = h === 0 ? 'start' : (h === totalHours ? 'end' : 'middle');
      hourLabels.push(`<text x="${x.toFixed(1)}" y="${H - 8}" font-size="10" fill="var(--muted)" text-anchor="${anchor}">${label}</text>`);
    }

    const hGrid = `
      <line x1="${padL}" y1="${yUp}" x2="${W - padR}" y2="${yUp}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3" />
      <line x1="${padL}" y1="${yDown}" x2="${W - padR}" y2="${yDown}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3" />
    `;

    chartEl.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg">
        ${dangerRects.join('')}
        ${gridLines.join('')}
        ${hGrid}
        <text x="${padL - 6}" y="${yUp + 4}" font-size="10" fill="var(--ok)" text-anchor="end">Up</text>
        <text x="${padL - 6}" y="${yDown + 4}" font-size="10" fill="var(--crit)" text-anchor="end">Down</text>
        <path d="${path}" fill="none" stroke="var(--ok)" stroke-width="2" stroke-linejoin="round" />
        ${hourLabels.join('')}
      </svg>
      <div class="sc-modal-legend">
        <span><span class="sc-legend-dot ok"></span>Running</span>
        <span><span class="sc-legend-dot crit"></span>Parado / Outro estado</span>
      </div>
    `;
  };

  /* ── Render ───────────────────────────────────────────────────────────── */
  const render = () => {
    root.dataset.theme = htmlGraphics?.theme?.isDark ? 'dark' : 'light';

    let rows = toRows();
    historyMap = buildHistoryMap();

    const now = new Date();
    const ts  = now.toLocaleString('pt-BR');

    if (!rows.length) {
      empty.style.display = 'block';
      list.querySelectorAll('.sc-card').forEach(c => c.remove());
      subEl.textContent = 'Sem dados';
      cntOk.innerHTML   = '<span class="sc-pill__dot"></span>0 Running';
      cntDown.innerHTML = '<span class="sc-pill__dot"></span>0 Stopped';
      totalOk.textContent = totalDown.textContent = totalAll.textContent = '0';
      footerTs.textContent = ts;
      return;
    }
    empty.style.display = 'none';

    const allRows = toRows();
    let okCount = 0, downCount = 0;
    allRows.forEach(r => { isUp(r.Status) ? okCount++ : downCount++; });

    cntOk.innerHTML   = `<span class="sc-pill__dot"></span>${okCount} Running`;
    cntDown.innerHTML = `<span class="sc-pill__dot"></span>${downCount} Stopped`;

    totalOk.textContent   = okCount;
    totalDown.textContent = downCount;
    totalAll.textContent  = allRows.length;

    if (S.q) {
      const q = S.q.toLowerCase();
      rows = rows.filter(r =>
        asStr(r.Servidor).toLowerCase().includes(q) ||
        asStr(r.Item).toLowerCase().includes(q)
      );
    }

    const sorted = sortRows(rows);
    updateSortBtns();

    list.querySelectorAll('.sc-card').forEach(c => c.remove());

    sorted.forEach((row, i) => {
    const up   = isUp(row.Status);
    const sk   = stKey(row.Status);
    const sl   = stLabel(row.Status);
    const srv  = `SRV-WIND-${String(i + 1).padStart(2, '0')}`;
    const item = `Service-${String(i + 1).padStart(2, '0')}`;
      const itemId = asStr(row.ItemId).replace(/[<>"]/g, '');

      const card = document.createElement('div');
      card.className = 'sc-card';
      card.innerHTML = `
        <div class="sc-card__stripe ${sk}"></div>

        <div class="sc-card__name">
          <span class="sc-card__srv" title="${srv}">${srv}</span>
          <span class="sc-card__host">Host</span>
        </div>

        <div class="sc-card__center">
          <div class="sc-card__uptime">
            <span class="sc-card__uptime-label">Serviço</span>
            <span class="sc-card__uptime-val" title="${item}">${item}</span>
          </div>
        </div>

        <div class="sc-card__right">
          <span class="sc-badge ${sk}">${sl}</span>
          <button class="sc-history-btn" type="button"
                  data-itemid="${itemId}"
                  data-name="${srv} — ${item}">History</button>
        </div>
      `;
      list.appendChild(card);
    });

    subEl.textContent = `${rows.length} itens · ${ts}`;
    footerTs.textContent = ts;
  };

  /* ── Eventos ──────────────────────────────────────────────────────────── */
  if (!root.dataset.bound) {
    root.dataset.bound = '1';

    filterEl.addEventListener('input', () => {
      S.q = (filterEl.value || '').trim().toLowerCase();
      render();
    });

    btnClear.addEventListener('click', () => {
      S.q = '';
      filterEl.value = '';
      render();
    });

    [
      [btnName,   'Servidor'],
      [btnStatus, 'Status'],
      [btnItem,   'Item'],
    ].forEach(([btn, col]) => {
      btn.addEventListener('click', () => {
        S.sortDir = (S.sortCol === col && S.sortDir === 'asc') ? 'desc' : 'asc';
        S.sortCol = col;
        render();
      });
    });

    list.addEventListener('click', e => {
      const btn = e.target.closest('.sc-history-btn');
      if (!btn) return;
      const id    = btn.dataset.itemid;
      const title = btn.dataset.name;
      const points = historyMap.get(id) || [];
      renderHistoryChart(points, title);
      modalEl.style.display = 'flex';
    });
  }

  filterEl.value = S.q || '';
  updateSortBtns();

  /* ── Entry point ──────────────────────────────────────────────────────── */
  onRender = () => { try { render(); } catch(e) { console.error('[sc-svc]', e); } };
  try { render(); } catch(e) { console.error('[sc-svc]', e); }
})();
