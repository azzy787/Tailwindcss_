// Revenue page logic (sidebar dropdown, KPIs, charts, table)
(() => {
    // ----- Sidebar dropdown -----
    function wireSidebar() {
      const btn  = document.getElementById('btnDashboard');
      const menu = document.getElementById('menuDashboard');
      const chev = document.getElementById('chevDashboard');
      if (!btn || !menu) return;
  
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hidden = menu.classList.toggle('hidden');
        btn.setAttribute('aria-expanded', String(!hidden));
        if (chev) chev.style.transform = hidden ? 'rotate(0deg)' : 'rotate(180deg)';
      });
  
      document.addEventListener('click', (e) => {
        if (!menu.classList.contains('hidden') &&
            !btn.contains(e.target) && !menu.contains(e.target)) {
          menu.classList.add('hidden');
          btn.setAttribute('aria-expanded', 'false');
          if (chev) chev.style.transform = 'rotate(0deg)';
        }
      });
    }
  
    // ----- Demo data -----
    const months = ['Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];
    const monthlyRevenue = [82000,91000,88000,104000,99000,112000,120000,131000,126000,138000,145000,152000];
    const currentMonthIndex = months.length - 1;
  
    const channelLabels = ['Direct', 'Marketplace', 'Wholesale', 'Partners'];
    const channelValues = [54200, 38900, 22700, 13100];
    const channelColors = ['#2563eb','#16a34a','#f59e0b','#64748b'];
  
    const grossMarginPct = 0.621;
  
    const tableRows = [
      {date:'2025-08-30', channel:'Direct',      region:'NA',  orders:312, avg:79.40,  rev:24772, status:'Closed'},
      {date:'2025-08-30', channel:'Marketplace', region:'EU',  orders:205, avg:62.10,  rev:12731, status:'Pending'},
      {date:'2025-08-29', channel:'Wholesale',   region:'APAC',orders:88,  avg:154.60, rev:13605, status:'Invoiced'},
      {date:'2025-08-29', channel:'Partners',    region:'NA',  orders:47,  avg:139.80, rev:6571,  status:'Closed'}
    ];
  
    // ----- Helpers -----
    const fmt = (n) => n.toLocaleString(undefined, {style:'currency', currency:'USD'});
  
    function fillKPIs() {
      const MTD = monthlyRevenue[currentMonthIndex];
      const prev = monthlyRevenue[currentMonthIndex-1] ?? MTD;
      const MTDdelta = ((MTD - prev)/prev) * 100;
  
      const janIdx = months.indexOf('Jan');
      const YTD = monthlyRevenue.slice(janIdx).reduce((a,b)=>a+b,0);
      const prevYTD = monthlyRevenue.slice(0, janIdx).reduce((a,b)=>a+b,0);
      const YTDdelta = prevYTD ? ((YTD - prevYTD)/prevYTD)*100 : 0;
  
      document.getElementById('kpiMTD').textContent = fmt(MTD);
      document.getElementById('kpiMTDDelta').textContent =
        (MTDdelta>=0?'+':'') + MTDdelta.toFixed(1) + '% vs last month';
  
      document.getElementById('kpiYTD').textContent = fmt(YTD);
      document.getElementById('kpiYTDDelta').textContent =
        (YTDdelta>=0?'+':'') + YTDdelta.toFixed(1) + '% YoY';
  
      document.getElementById('kpiGM').textContent = (grossMarginPct*100).toFixed(1) + '%';
    }
  
    let revChart, channelChart;
  
    function renderRevChart(mode='bar') {
      const ctx = document.getElementById('revMonthly');
      if (!ctx) return;
      if (revChart) revChart.destroy();
  
      const isArea = mode === 'area';
      const type = isArea ? 'line' : (mode === 'line' ? 'line' : 'bar');
  
      revChart = new Chart(ctx, {
        type,
        data: {
          labels: months,
          datasets: [{
            label: 'Revenue',
            data: monthlyRevenue,
            borderColor: '#2563eb',
            backgroundColor: mode === 'bar' ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.20)',
            fill: isArea,
            tension: 0.25
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c)=> 'Revenue: ' + fmt(c.parsed.y) } }
          },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => '$'+Number(v).toLocaleString() } }
          },
          onClick: (_evt, els) => {
            if (!els.length) return;
            const i = els[0].index;
            document.getElementById('channelMonth').textContent = `Breakdown: ${months[i]}`;
          }
        }
      });
    }
  
    function renderChannelChart() {
      const ctx = document.getElementById('revChannels');
      if (!ctx) return;
      if (channelChart) channelChart.destroy();
  
      channelChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: channelLabels, datasets: [{ data: channelValues, backgroundColor: channelColors }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => `${c.label}: ${fmt(c.parsed)}` } }
          }
        }
      });
  
      const legend = document.getElementById('channelLegend');
      legend.innerHTML = '';
      channelLabels.forEach((l, idx) => {
        const row = document.createElement('div');
        row.className = 'flex justify-between';
        row.innerHTML = `<span class="flex items-center gap-2"><span class="inline-block w-3 h-3 rounded-full" style="background:${channelColors[idx]}"></span>${l}</span><span>${fmt(channelValues[idx])}</span>`;
        legend.appendChild(row);
      });
      document.getElementById('channelMonth').textContent = `Breakdown: ${months[currentMonthIndex]}`;
    }
  
    function fillTable() {
      const tbody = document.getElementById('revBody');
      if (!tbody) return;
      tbody.innerHTML = '';
      tableRows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="px-4 py-3">${r.date}</td>
          <td class="px-4 py-3">${r.channel}</td>
          <td class="px-4 py-3">${r.region}</td>
          <td class="px-4 py-3">${r.orders.toLocaleString()}</td>
          <td class="px-4 py-3">${fmt(r.avg)}</td>
          <td class="px-4 py-3 text-right">${fmt(r.rev)}</td>
          <td class="px-4 py-3 text-right">
            <span class="rounded px-2 py-0.5 ${
              r.status==='Closed' ? 'bg-green-100 text-green-700' :
              r.status==='Pending' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-gray-200 text-gray-800'
            }">${r.status}</span>
          </td>`;
        tbody.appendChild(tr);
      });
      document.getElementById('tableMeta').textContent = `${tableRows.length} rows`;
    }
  
    function exportCSV() {
      const btn = document.getElementById('btnExport');
      if (!btn) return;
      const head = ['Date','Channel','Region','Orders','AvgOrder','Revenue','Status'];
      const lines = [head.join(',')];
      tableRows.forEach(r=>{
        const row = [r.date,r.channel,r.region,r.orders,r.avg,r.rev,r.status].map(v=>{
          const s = String(v).replace(/"/g,'""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        });
        lines.push(row.join(','));
      });
      const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'revenue_breakdown.csv';
      a.click();
    }
  
    function wireModeButtons(){
      const btns = document.querySelectorAll('.modeBtn');
      btns.forEach(b=>{
        b.addEventListener('click', ()=>{
          btns.forEach(x=>x.classList.remove('bg-gray-100'));
          b.classList.add('bg-gray-100');
          renderRevChart(b.dataset.mode);
        });
      });
      btns[0]?.classList.add('bg-gray-100');
    }
  
    // ----- Init -----
    window.addEventListener('DOMContentLoaded', () => {
      wireSidebar();
      document.getElementById('btnExport')?.addEventListener('click', exportCSV);
      fillKPIs();
      renderRevChart('bar');
      renderChannelChart();
      fillTable();
      wireModeButtons();
    });
  })();
  