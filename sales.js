// Sales Dashboard logic (CSV intake, filters, charts, table)
// Requires: Chart.js + adapter, Papa Parse (loaded in sales.html)

(() => {
    // ---- State ----
    let rawRows = [];
    let headers = [];
    let mapped = { date:null, product:null, region:null, qty:null, price:null, revenue:null };
  
    let rows = [];      // normalized rows
    let filtered = [];  // after filters/search
  
    // pagination & sorting
    let page = 1;
    let pageSize = 25;
    let sortKey = null, sortDir = 'asc';
  
    // charts
    let chTime, chProducts, chRegions;
  
    // ---- DOM ----
    const byId = id => document.getElementById(id);
    const el = {
      file: byId('csvFile'),
      url: byId('csvUrl'),
      loadUrl: byId('btnLoadUrl'),
      search: byId('search'),
      dateFrom: byId('dateFrom'),
      dateTo: byId('dateTo'),
      bucket: byId('bucket'),
      reset: byId('btnReset'),
      download: byId('btnDownload'),
  
      kpiRows: byId('kpiRows'),
      kpiUnits: byId('kpiUnits'),
      kpiRevenue: byId('kpiRevenue'),
      kpiAOV: byId('kpiAOV'),
      kpiNote: byId('kpiNote'),
  
      tableHead: byId('tableHead'),
      tableBody: byId('tableBody'),
      pagerInfo: byId('pagerInfo'),
      prevPage: byId('prevPage'),
      nextPage: byId('nextPage'),
      pageLabel: byId('pageLabel'),
      pageSize: byId('pageSize'),
      metaLoaded: byId('metaLoaded'),
  
      topNProducts: byId('topNProducts'),
  
      mapper: byId('mapper'),
      mapperWarn: byId('mapperWarn'),
      mapDate: byId('mapDate'),
      mapProduct: byId('mapProduct'),
      mapRegion: byId('mapRegion'),
      mapQty: byId('mapQty'),
      mapPrice: byId('mapPrice'),
      mapRevenue: byId('mapRevenue'),
      mapperCancel: byId('mapperCancel'),
      mapperApply: byId('mapperApply'),
    };
  
    // ---- Utils ----
    const NUM = (v) => {
      if (v == null) return 0;
      const s = String(v).replace(/[^0-9.\-]/g,'');
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };
    const tryParseDate = (s) => {
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d) ? null : d;
    };
    const fmtCurrency = (n) => n.toLocaleString(undefined, {style:'currency', currency:'USD'});
  
    function autoMap(headers) {
      const lc = headers.map(h => h.toLowerCase());
      const pick = (cands) => {
        for (const c of cands){
          const i = lc.indexOf(c);
          if (i !== -1) return headers[i];
        }
        return '';
      };
      return {
        date:    pick(['date','order date','created','timestamp']),
        product: pick(['product','item','sku','category','name']),
        region:  pick(['region','country','state','market','location']),
        qty:     pick(['qty','quantity','units','count']),
        price:   pick(['price','unit price','unit_price','unitprice','cost']),
        revenue: pick(['revenue','total','amount','sales','gross','net'])
      };
    }
  
    function openMapper() {
      const fill = (sel, headers, current) => {
        sel.innerHTML = '<option value="">— none —</option>' + headers.map(h=>`<option>${h}</option>`).join('');
        if (current) sel.value = current;
      };
      const guess = autoMap(headers);
      mapped = {...mapped, ...guess};
  
      fill(el.mapDate, headers, mapped.date);
      fill(el.mapProduct, headers, mapped.product);
      fill(el.mapRegion, headers, mapped.region);
      fill(el.mapQty, headers, mapped.qty);
      fill(el.mapPrice, headers, mapped.price);
      fill(el.mapRevenue, headers, mapped.revenue);
  
      el.mapperWarn.classList.add('hidden');
      el.mapper.classList.remove('hidden');
    }
    function closeMapper(){ el.mapper.classList.add('hidden'); }
    function applyMapper(){
      mapped = {
        date: el.mapDate.value || null,
        product: el.mapProduct.value || null,
        region: el.mapRegion.value || null,
        qty: el.mapQty.value || null,
        price: el.mapPrice.value || null,
        revenue: el.mapRevenue.value || null,
      };
      if (!mapped.date || !mapped.product){
        el.mapperWarn.textContent = 'At minimum, map Date and Product/Category.';
        el.mapperWarn.classList.remove('hidden');
        return;
      }
      closeMapper();
      normalize();
      refreshAll();
    }
  
    function normalize(){
      rows = rawRows.map(r => {
        const date = tryParseDate(r[mapped.date]);
        const product = String(r[mapped.product] ?? '').trim() || '(Unknown)';
        const region  = mapped.region ? (String(r[mapped.region] ?? '').trim() || '(Unknown)') : '(All)';
        const qty     = mapped.qty ? NUM(r[mapped.qty]) : 1;
        const price   = mapped.price ? NUM(r[mapped.price]) : 0;
        const revenue = mapped.revenue ? NUM(r[mapped.revenue]) : (price*qty);
        return { date, product, region, qty, price, revenue, _raw:r };
      }).filter(x => x.date instanceof Date && !isNaN(x.date));
      headers = Object.keys(rawRows[0] ?? {});
    }
  
    // ---- Parsing & loading ----
    function parseFile(file){
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res)=>{
          rawRows = res.data;
          headers = res.meta.fields || Object.keys(rawRows[0] ?? {});
          el.metaLoaded.textContent = `Loaded file: ${file.name} (${rawRows.length} rows)`;
          openMapper();
        },
        error: (err)=> alert('CSV parse error: ' + err.message),
      });
    }
    function parseUrl(url){
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (res)=>{
          rawRows = res.data;
          headers = res.meta.fields || Object.keys(rawRows[0] ?? {});
          el.metaLoaded.textContent = `Loaded URL: ${url} (${rawRows.length} rows)`;
          openMapper();
        },
        error: (err)=> alert('CSV fetch/parse error: ' + err.message),
      });
    }
  
    // ---- Filters, KPIs ----
    function applyFilters(){
      const q = el.search.value.trim().toLowerCase();
      const from = el.dateFrom.value ? new Date(el.dateFrom.value) : null;
      const to   = el.dateTo.value ? new Date(el.dateTo.value) : null;
  
      filtered = rows.filter(r => {
        if (from && r.date < from) return false;
        if (to && r.date > new Date(to.getTime()+24*3600*1000-1)) return false; // inclusive
        if (q){
          const hay = [r.product, r.region].join(' ').toLowerCase();
          return hay.includes(q);
        }
        return true;
      });
      page = 1;
    }
    function updateKPIs(){
      el.kpiRows.textContent = String(filtered.length);
      const units = filtered.reduce((a,b)=>a + (b.qty||0), 0);
      el.kpiUnits.textContent = units.toLocaleString();
      const revenue = filtered.reduce((a,b)=>a + (b.revenue||0), 0);
      el.kpiRevenue.textContent = fmtCurrency(revenue);
      const orders = filtered.length || 1;
      el.kpiAOV.textContent = fmtCurrency(revenue / orders);
      el.kpiNote.textContent = mapped.revenue
        ? `Summed: “${mapped.revenue}”`
        : (mapped.price && mapped.qty ? `Computed as ${mapped.price} × ${mapped.qty}` : 'No revenue field detected.');
    }
  
    // ---- Aggregations for charts ----
    function roundDate(d, bucket){
      const t = new Date(d);
      if (bucket==='day'){ t.setHours(0,0,0,0); }
      if (bucket==='week'){
        const day = (t.getDay()+6)%7; // Monday=0
        t.setDate(t.getDate()-day); t.setHours(0,0,0,0);
      }
      if (bucket==='month'){ t.setDate(1); t.setHours(0,0,0,0); }
      return +t;
    }
    function aggTime(bucket){
      const map = new Map();
      for (const r of filtered){
        const key = roundDate(r.date, bucket);
        map.set(key, (map.get(key)||0) + (r.revenue||0));
      }
      const arr = Array.from(map.entries()).sort((a,b)=>a[0]-b[0]);
      return { labels: arr.map(x=> new Date(x[0])), values: arr.map(x=> x[1]) };
    }
    function topBy(field, n=10){
      const map = new Map();
      for (const r of filtered){
        const key = r[field] || '(Unknown)';
        map.set(key, (map.get(key)||0) + (r.revenue||0));
      }
      const arr = Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,n);
      return { labels: arr.map(x=>x[0]), values: arr.map(x=>x[1]) };
    }
    function byRegion(){ return topBy('region', 50); }
  
    // ---- Charts ----
    function makeChart(canvas, cfg){
      if (canvas._chart){ canvas._chart.destroy(); }
      const chart = new Chart(canvas, cfg);
      canvas._chart = chart;
      return chart;
    }
    function colors(n){
      const base = ['#2563eb','#16a34a','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#22c55e','#ec4899','#84cc16','#14b8a6','#a855f7'];
      return Array.from({length:n}, (_,i)=> base[i%base.length]);
    }
    function renderCharts(){
      const bucket = el.bucket.value;
      const time = aggTime(bucket);
      const modeBtn = document.querySelector('.chartType.active');
      const mode = modeBtn?.dataset.type || 'line';
      const isArea = mode==='area';
  
      // time chart
     // ---------- Time chart (hardened) ----------
const elTime = document.getElementById('chartTime');
if (elTime) {
  // Coerce labels to Date objects
  const labels = (time.labels || []).map(d => (d instanceof Date ? d : new Date(d)));

  // Detect if the time adapter is actually present
  const hasTimeAdapter = !!(Chart._adapters?.date && typeof Chart._adapters.date.parse === 'function');

  const xScale = hasTimeAdapter
    ? { type: 'time', time: { unit: bucket === 'day' ? 'day' : (bucket === 'week' ? 'week' : 'month') } }
    : { type: 'category' }; // graceful fallback if adapter missing

  // Optional: destroy previous instance if you re-render frequently
  if (elTime._chart) elTime._chart.destroy();

  const cfg = {
    type: isArea ? 'line' : (mode === 'bar' ? 'bar' : 'line'),
    data: {
      labels,
      datasets: [{
        label: 'Revenue',
        data: time.values || [],
        fill: isArea,
        tension: 0.25,
        borderColor: '#2563eb',
        backgroundColor: isArea ? 'rgba(37,99,235,0.15)' : 'rgba(37,99,235,0.3)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: xScale,
        y: {
          beginAtZero: true,
          ticks: { callback: v => '$' + Number(v).toLocaleString() }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => 'Revenue: ' + fmtCurrency(ctx.parsed.y) } }
      },
      onClick: (_evt, els) => {
        if (!els.length) return;
        const i = els[0].index;
        const center = labels[i];
        if (!center) return;

        if (bucket === 'month') {
          el.dateFrom.valueAsDate = new Date(center.getFullYear(), center.getMonth(), 1);
          el.dateTo.valueAsDate   = new Date(center.getFullYear(), center.getMonth() + 1, 0);
        } else if (bucket === 'week') {
          const from = new Date(center); const to = new Date(center); to.setDate(to.getDate() + 6);
          el.dateFrom.valueAsDate = from; el.dateTo.valueAsDate = to;
        } else {
          el.dateFrom.valueAsDate = center; el.dateTo.valueAsDate = center;
        }
        refreshAll();
      }
    }
  };

  // Create chart and keep a reference to destroy later
  elTime._chart = new Chart(elTime, cfg);
} else {
  console.warn('#chartTime not found in DOM');
}
  
      // products
      const topN = parseInt(el.topNProducts.value||'10',10);
      const p = topBy('product', topN);
      const ctxP = document.getElementById('chartProducts');
      makeChart(ctxP, {
        type: 'bar',
        data: { labels: p.labels, datasets: [{ label: 'Revenue', data: p.values, backgroundColor: colors(p.labels.length) }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display:false }, tooltip: { callbacks:{ label: ctx => fmtCurrency(ctx.parsed.x) } } },
          scales: { x: { ticks:{ callback: v => '$' + Number(v).toLocaleString() } } },
          onClick: (evt, els) => {
            if (!els.length) return;
            el.search.value = p.labels[els[0].index];
            refreshAll();
          }
        }
      });
  
      // regions
      const r = byRegion();
      const ctxR = document.getElementById('chartRegions');
      makeChart(ctxR, {
        type: 'doughnut',
        data: { labels: r.labels, datasets: [{ data: r.values, backgroundColor: colors(r.labels.length) }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position:'bottom' }, tooltip: { callbacks:{ label: ctx => `${ctx.label}: ${fmtCurrency(ctx.parsed)}` } } },
          onClick: (evt, els) => {
            if (!els.length) return;
            el.search.value = r.labels[els[0].index];
            refreshAll();
          }
        }
      });
    }
  
    // chart type toggle
    function wireChartTypeButtons(){
      document.querySelectorAll('.chartType').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          document.querySelectorAll('.chartType').forEach(b=>b.classList.remove('active','bg-gray-100'));
          btn.classList.add('active','bg-gray-100');
          renderCharts();
        });
      });
    }
  
    // ---- Table (sorting + pagination) ----
    function renderTable(){
      el.tableHead.innerHTML = '';
      const tr = document.createElement('tr');
      headers.forEach(h=>{
        const th = document.createElement('th');
        th.textContent = h;
        th.className = 'px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none';
        th.addEventListener('click', ()=>{
          if (sortKey===h){ sortDir = (sortDir==='asc'?'desc':'asc'); } else { sortKey=h; sortDir='asc'; }
          sortData(); paintBody();
        });
        tr.appendChild(th);
      });
      el.tableHead.appendChild(tr);
      paintBody();
    }
    function sortData(){
      if (!sortKey) return;
      const key = sortKey;
      const asc = sortDir==='asc' ? 1 : -1;
      filtered.sort((a,b)=>{
        const av = a._raw[key]; const bv = b._raw[key];
        const na = NUM(av), nb = NUM(bv);
        if (String(na)===String(av) || String(nb)===String(bv)){
          return (na-nb)*asc; // numeric-ish
        }
        return String(av??'').localeCompare(String(bv??''))*asc;
      });
    }
    function paintBody(){
      pageSize = parseInt(el.pageSize.value||'25',10);
      const total = filtered.length;
      const pages = Math.max(1, Math.ceil(total/pageSize));
      if (page>pages) page = pages;
      const start = (page-1)*pageSize;
      const end = Math.min(total, start+pageSize);
  
      el.pagerInfo.textContent = `${total.toLocaleString()} rows`;
      el.pageLabel.textContent = `Page ${page} / ${pages}`;
      const rowsPage = filtered.slice(start, end);
  
      el.tableBody.innerHTML = '';
      for (const r of rowsPage){
        const tr = document.createElement('tr');
        headers.forEach(h=>{
          const td = document.createElement('td');
          td.className = 'px-4 py-2 text-sm text-gray-700';
          td.textContent = r._raw[h] ?? '';
          tr.appendChild(td);
        });
        el.tableBody.appendChild(tr);
      }
    }
  
    // ---- Refresh pipeline ----
    function refreshAll(){
      applyFilters();
      updateKPIs();
      renderCharts();
      renderTable();
    }
  
    // ---- Events ----
    function wireEvents(){
      el.file.addEventListener('change', (e)=> {
        const f = e.target.files?.[0];
        if (f) parseFile(f);
      });
      el.loadUrl.addEventListener('click', ()=> {
        const url = el.url.value.trim();
        if (!url) return alert('Enter a CSV URL first');
        // Note: the CSV server must allow CORS for this to work from file:// or localhost
        parseUrl(url);
      });
  
      // filters
      ['input','change'].forEach(ev=>{
        el.search.addEventListener(ev, ()=> refreshAll());
        el.dateFrom.addEventListener(ev, ()=> refreshAll());
        el.dateTo.addEventListener(ev, ()=> refreshAll());
        el.bucket.addEventListener(ev, ()=> renderCharts());
        el.topNProducts.addEventListener(ev, ()=> renderCharts());
      });
  
      el.reset.addEventListener('click', ()=>{
        el.search.value = '';
        el.dateFrom.value = '';
        el.dateTo.value = '';
        el.bucket.value = 'month';
        refreshAll();
      });
  
      // download filtered CSV
      el.download.addEventListener('click', ()=>{
        if (!filtered.length){ alert('Nothing to download.'); return; }
        const lines = [];
        lines.push(headers.join(','));
        filtered.forEach(r=>{
          const row = headers.map(h=>{
            const v = r._raw[h];
            if (v==null) return '';
            const s = String(v).replace(/"/g,'""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          });
          lines.push(row.join(','));
        });
        const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'sales_filtered.csv';
        a.click();
      });
  
      // mapper modal
      el.mapperCancel.addEventListener('click', closeMapper);
      el.mapperApply.addEventListener('click', applyMapper);
  
      // chart type buttons
      wireChartTypeButtons();
  
      // pager
      el.prevPage.addEventListener('click', ()=>{ if (page>1){ page--; paintBody(); } });
      el.nextPage.addEventListener('click', ()=>{ const pages = Math.max(1, Math.ceil(filtered.length/pageSize)); if (page<pages){ page++; paintBody(); } });
      el.pageSize.addEventListener('change', ()=>{ page=1; paintBody(); });
    }
  
    // ---- Demo data so page is alive before CSV ----
    const demoCSV = `Date,Product,Region,Quantity,Price,Revenue
  2025-06-01,Speaker A,US,2,199,398
  2025-06-02,Headphones X,US,1,149,149
  2025-06-03,Speaker A,EU,1,199,199
  2025-06-03,Soundbar Z,US,1,349,349
  2025-06-04,Speaker A,APAC,3,199,597
  2025-06-05,Headphones X,EU,2,149,298
  2025-06-05,Soundbar Z,US,1,349,349
  2025-06-06,Headphones X,APAC,1,149,149
  2025-06-07,Turntable R,US,1,499,499
  2025-06-08,Speaker A,EU,1,199,199
  2025-06-10,Turntable R,EU,1,499,499
  2025-06-12,Soundbar Z,APAC,2,349,698
  2025-06-15,Speaker A,US,1,199,199
  2025-06-18,Headphones X,US,3,149,447
  2025-06-21,Turntable R,APAC,1,499,499
  2025-06-25,Soundbar Z,EU,1,349,349`;
  
    function bootstrapDemo(){
      Papa.parse(demoCSV, { header:true, skipEmptyLines:true, complete:(res)=>{
        rawRows = res.data;
        headers = res.meta.fields;
        mapped = { date:'Date', product:'Product', region:'Region', qty:'Quantity', price:'Price', revenue:'Revenue' };
        normalize();
        el.metaLoaded.textContent = `Demo data loaded (${rawRows.length} rows) — upload/URL to replace`;
        refreshAll();
      }});
    }
  
    // ---- Init ----
    window.addEventListener('DOMContentLoaded', () => {
      wireEvents();
      bootstrapDemo();
    });
    
    document.addEventListener('DOMContentLoaded', () => {
        const testEl = document.getElementById('chartTime');
        if (!testEl) return;
        if (testEl._chart) testEl._chart.destroy();
        const demoLabels = [ '2025-01-01','2025-02-01','2025-03-01','2025-04-01','2025-05-01','2025-06-01' ].map(d=>new Date(d));
        const demoValues = [1200,1800,1600,2200,2100,2600];
        testEl._chart = new Chart(testEl, {
          type: 'line',
          data: { labels: demoLabels, datasets: [{ data: demoValues, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.20)', fill: true, tension: 0.25 }] },
          options: { responsive:true, maintainAspectRatio:false, scales:{ x:{ type:'time', time:{ unit:'month' } }, y:{ beginAtZero:true } }, plugins:{ legend:{ display:false } } }
        });
      });
  })();
  
  