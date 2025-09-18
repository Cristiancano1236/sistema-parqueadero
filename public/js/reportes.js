// Frontend de Reportes
// Relacionado con: public/admin/reportes.html y rutas /api/reportes/*

let __pageRep = 0;
let __pageSizeRep = 20;
let chartIngresos = null;
let chartMetodo = null;

document.addEventListener('DOMContentLoaded', () => {
    // Auth básica
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/'; return; }

    document.getElementById('userName').textContent = localStorage.getItem('userName') || 'Usuario';
    document.querySelector('.sidebar-toggle').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('show'));
    document.getElementById('btnLogout').addEventListener('click',()=>{localStorage.clear(); location.href='/';});
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') { document.querySelectorAll('.admin-only').forEach(el=> el.classList.add('d-none')); }

    // Rango por defecto: hoy
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth()+1).padStart(2,'0');
    const dd = String(hoy.getDate()).padStart(2,'0');
    document.getElementById('fDesde').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('fHasta').value = `${yyyy}-${mm}-${dd}`;

    document.getElementById('btnHoy').addEventListener('click', setHoy);
    document.getElementById('btnUltimos7').addEventListener('click', setUltimos7);
    document.getElementById('btnMes').addEventListener('click', setMes);
    document.getElementById('btnAplicar').addEventListener('click', ()=>{ __pageRep = 0; cargarTodo(); });
    document.getElementById('btnPrev').addEventListener('click', ()=>{ if(__pageRep>0){ __pageRep--; cargarMovimientos(); } });
    document.getElementById('btnNext').addEventListener('click', ()=>{ __pageRep++; cargarMovimientos(); });
    document.getElementById('btnExport').addEventListener('click', exportarPDF);
    const btnXlsx = document.getElementById('btnExportXlsx');
    if (btnXlsx) btnXlsx.addEventListener('click', exportarExcelBackend);
    document.getElementById('fMetodo').addEventListener('change', cargarChartIngresos);

    cargarTodo();

    // --- Insertar sección de Cierres de turno ---
    initTurnosView();
});

// Carga robusta de SheetJS si no está disponible (intenta varios CDNs)
async function ensureXLSX(){
    if (window.XLSX) return window.XLSX;
    const urls = [
        'https://cdn.jsdelivr.net/npm/xlsx@0.19.3/dist/xlsx.full.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.19.3/xlsx.full.min.js',
        'https://unpkg.com/xlsx@0.19.3/dist/xlsx.full.min.js'
    ];
    let lastErr = null;
    for (const url of urls){
        try{
            await new Promise((resolve, reject)=>{
                const s = document.createElement('script');
                s.src = url;
                s.async = true;
                s.onload = ()=> setTimeout(resolve, 0);
                s.onerror = (e)=> reject(e);
                document.head.appendChild(s);
            });
            if (window.XLSX) return window.XLSX;
        }catch(e){ lastErr = e; }
    }
    throw lastErr || new Error('No se pudo cargar SheetJS');
}

function paramsBase(){
    const desde = document.getElementById('fDesde').value;
    const hasta = document.getElementById('fHasta').value;
    return { desde, hasta };
}

async function cargarTodo(){
    await Promise.all([
        cargarKPIs(),
        cargarChartIngresos(),
        cargarChartMetodo(),
        cargarMovimientos(),
        cargarTopPlacas()
    ]);
}

// --------- Vista: Cierres de Turno (Modal) ---------
function initTurnosView(){
    const token = localStorage.getItem('token');
    const container = document.querySelector('.container-fluid');
    if (!container || document.getElementById('turnosModal')) {
        return;
    }

    // Botón en la cabecera de filtros principales
    const filtrosHeader = document.querySelector('.card.mb-4 .card-header') || container.querySelector('.card .card-header');
    if (filtrosHeader && !document.getElementById('btnTurnosModal')){
        const btn = document.createElement('button');
        btn.id = 'btnTurnosModal';
        btn.className = 'btn btn-outline-dark btn-sm ms-2';
        btn.innerHTML = '<i class="fas fa-cash-register me-1"></i>Cierres de turno';
        filtrosHeader.appendChild(btn);
        btn.addEventListener('click', ()=>{ loadTurnos(); new bootstrap.Modal(document.getElementById('turnosModal')).show(); });
    }

    // Modal con filtros y tabla
    const modal = document.createElement('div');
    modal.innerHTML = [
      '<div class="modal fade" id="turnosModal" tabindex="-1" aria-hidden="true">',
      '  <div class="modal-dialog modal-xl">',
      '    <div class="modal-content">',
      '      <div class="modal-header">',
      '        <h5 class="modal-title"><i class="fas fa-cash-register me-2"></i>Cierres de turno</h5>',
      '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
      '      </div>',
      '      <div class="modal-body">',
      '        <div class="d-flex flex-wrap gap-2 mb-3">',
      '          <input type="date" id="tDesde" class="form-control form-control-sm" />',
      '          <input type="date" id="tHasta" class="form-control form-control-sm" />',
      '          <input type="text" id="tUsuario" class="form-control form-control-sm" placeholder="Usuario" />',
      '          <button class="btn btn-sm btn-primary" id="tBuscar"><i class="fas fa-filter me-1"></i>Filtrar</button>',
      '          <button class="btn btn-sm btn-outline-success" id="tExportXlsx"><i class="fas fa-file-excel me-1"></i>Excel</button>',
      '        </div>',
      '        <div class="table-responsive">',
      '          <table class="table table-sm" id="tbTurnos">',
      '            <thead><tr>',
      '              <th>#</th><th>Apertura</th><th>Cierre</th><th>Usuario</th>',
      '              <th>Base</th><th>Efectivo</th><th>Tarjeta</th><th>QR</th><th>Total</th><th>Diferencia</th><th></th>',
      '            </tr></thead>',
      '            <tbody></tbody>',
      '          </table>',
      '        </div>',
      '      </div>',
      '      <div class="modal-footer">',
      '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal.firstChild);

    // Fechas por defecto (local)
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    document.getElementById('tDesde').value = today;
    document.getElementById('tHasta').value = today;

    document.getElementById('tBuscar').addEventListener('click', loadTurnos);

    async function loadTurnos(){
      const params = new URLSearchParams({
        desde: document.getElementById('tDesde').value,
        hasta: document.getElementById('tHasta').value,
        usuario: document.getElementById('tUsuario').value.trim()
      });
      const r = await fetch('/api/reportes/turnos?'+params.toString(), { headers:{ 'Authorization':'Bearer '+token } });
      const j = await r.json();
      if (!r.ok) { toast('Error', j.message||'Error listando turnos', 'error'); return; }
      const tb = document.querySelector('#tbTurnos tbody');
      tb.innerHTML = '';
      j.data.forEach((t, idx)=>{
        const tr = document.createElement('tr');
        tr.innerHTML = [
          `<td>${idx+1}</td>`,
          `<td>${fmtDate(t.fecha_apertura)}</td>`,
          `<td>${fmtDate(t.fecha_cierre)||''}</td>`,
          `<td>${escHtml(t.usuario||t.usuario_login||'')}</td>`,
          `<td>${fmt(t.base_inicial)}</td>`,
          `<td>${fmt(t.total_efectivo)}</td>`,
          `<td>${fmt(t.total_tarjeta)}</td>`,
          `<td>${fmt(t.total_qr)}</td>`,
          `<td class="fw-bold">${fmt(t.total_general)}</td>`,
          `<td class="${Number(t.diferencia||0)===0?'text-success':'text-danger'}">${fmt(t.diferencia)}</td>`,
          `<td><button class=\"btn btn-outline-primary btn-sm\" data-reimp=\"${t.id_turno}\"><i class=\"fas fa-print\"></i></button></td>`
        ].join('');
        tb.appendChild(tr);
      });

      // Reimpresión
      tb.querySelectorAll('button[data-reimp]').forEach(btn=>{
        btn.addEventListener('click', ()=> reimprimirTurno(btn.getAttribute('data-reimp')));
      });
    }

    function fmt(n){ return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(Number(n||0)); }
    function fmtDate(d){ return d ? new Date(d).toLocaleString('es-CO') : ''; }
    function escHtml(s){ return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

    // Exportación a Excel
    document.getElementById('tExportXlsx').addEventListener('click', async ()=>{
      const params = new URLSearchParams({
        desde: document.getElementById('tDesde').value,
        hasta: document.getElementById('tHasta').value,
        usuario: document.getElementById('tUsuario').value.trim()
      });
      const res = await fetch('/api/reportes/turnos/export/xlsx?'+params.toString(), { headers:{ 'Authorization':'Bearer '+token } });
      if (!res.ok) { const j = await res.json().catch(()=>({message:'Error exportando'})); toast('Error', j.message||'Error exportando', 'error'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cierres_turno_${Date.now()}.xlsx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });

    // Reimpresión de cierre
    async function reimprimirTurno(id){
      try{
        const r = await fetch('/api/turnos/detalle/'+id, { headers:{ 'Authorization':'Bearer '+token } });
        const j = await r.json(); if(!r.ok) throw new Error(j.message||'Error');
        const t = j.data.turno; const exp = j.data.expected||{ total:0, efectivo:0, tarjeta:0, qr:0 }; const stats = j.data.stats||{ total:0, porTipo:{carro:0,moto:0,bici:0}};
        const res = { user:{ efectivo:t.total_efectivo||0, tarjeta:t.total_tarjeta||0, qr:t.total_qr||0, total:t.total_general||0 }, expected: exp, diff: Number((Number(t.total_general||0) - Number(exp.total||0)).toFixed(2)), obs: t.observacion_cierre, base_inicial: t.base_inicial, turno:{ id_turno:t.id_turno, usuario: (t.usuario||t.usuario_login||'') }, stats };
        if (window.imprimirResumen){ window.imprimirResumen(res); return; }
        const html = `
          <div style="font-family:Arial,sans-serif;font-size:12px">
            <h3 style="margin:0 0 8px">Cierre de Turno</h3>
            <div>Fecha: ${new Date().toLocaleString('es-CO')}</div>
            <div>Turno #${res.turno.id_turno} | Usuario: ${escHtml(res.turno.usuario)}</div>
            <div>Base inicial: <strong>${fmt(res.base_inicial)}</strong></div>
            <div>Tickets: <strong>${res.stats.total}</strong> (Carros: ${res.stats.porTipo.carro} | Motos: ${res.stats.porTipo.moto} | Bicis: ${res.stats.porTipo.bici})</div>
            <hr/>
            <div style="display:flex;gap:16px">
              <div>
                <div style="font-weight:bold">Conteo usuario</div>
                <div>Efectivo: ${fmt(res.user.efectivo)}</div>
                <div>Tarjeta: ${fmt(res.user.tarjeta)}</div>
                <div>QR: ${fmt(res.user.qr)}</div>
                <div><strong>Total: ${fmt(res.user.total)}</strong></div>
              </div>
              <div>
                <div style="font-weight:bold">Sistema</div>
                <div>Efectivo: ${fmt(res.expected.efectivo)}</div>
                <div>Tarjeta: ${fmt(res.expected.tarjeta)}</div>
                <div>QR: ${fmt(res.expected.qr)}</div>
                <div><strong>Total: ${fmt(res.expected.total)}</strong></div>
              </div>
            </div>
            <hr/>
            <div><strong>Diferencia: ${fmt(res.diff)}</strong></div>
            ${res.obs?('<div>Obs.: '+escHtml(res.obs)+'</div>'):''}
          </div>`;

        ensurePrintSizeModal();
        const m = new bootstrap.Modal(document.getElementById('turnosPrintSizeModal'));
        const b58 = document.getElementById('btnTurnosPrint58');
        const b80 = document.getElementById('btnTurnosPrint80');
        const on58 = ()=>{ printHtmlAtWidth(html, 58); cleanup(); };
        const on80 = ()=>{ printHtmlAtWidth(html, 80); cleanup(); };
        function cleanup(){ b58.removeEventListener('click', on58); b80.removeEventListener('click', on80); m.hide(); }
        b58.addEventListener('click', on58);
        b80.addEventListener('click', on80);
        m.show();
      }catch(e){ toast('Error', e.message, 'error'); }
    }

    function printHtmlAtWidth(html, mm){
      const w = window.open('', '_blank', 'width=420,height=700');
      const css = `@page{ size: ${mm}mm auto; margin: 3mm } body{ width:${mm}mm; font-family: Arial, sans-serif; font-size:11px; margin:0 } .wrap{ padding:4mm } hr{ border:none; border-top:1px dashed #999; margin:6px 0 }`;
      w.document.write(`<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Reimpresión Cierre</title><style>${css}</style></head><body><div class=\"wrap\">${html}</div><script>window.print(); setTimeout(()=>window.close(), 300);<\/script></body></html>`);
      w.document.close();
    }

    function ensurePrintSizeModal(){
      if (document.getElementById('turnosPrintSizeModal')) return;
      const div = document.createElement('div');
      div.innerHTML = [
        '<div class="modal fade" id="turnosPrintSizeModal" tabindex="-1" aria-hidden="true">',
        '  <div class="modal-dialog">',
        '    <div class="modal-content">',
        '      <div class="modal-header">',
        '        <h5 class="modal-title">Seleccionar tamaño de impresión</h5>',
        '        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
        '      </div>',
        '      <div class="modal-body">',
        '        <p class="mb-2">Elige el ancho del papel térmico para imprimir el cierre.</p>',
        '        <div class="d-flex gap-2">',
        '          <button type="button" id="btnTurnosPrint58" class="btn btn-primary">58 mm</button>',
        '          <button type="button" id="btnTurnosPrint80" class="btn btn-outline-primary">80 mm</button>',
        '        </div>',
        '      </div>',
        '      <div class="modal-footer">',
        '        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>',
        '      </div>',
        '    </div>',
        '  </div>',
        '</div>'
      ].join('');
      document.body.appendChild(div.firstChild);
    }
}

async function cargarKPIs(){
    try{
        const { desde, hasta } = paramsBase();
        const res = await fetch(`/api/reportes/kpis?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error KPIs');
        const d = j.data || {};
        document.getElementById('kpiIngresos').textContent = formatCurrency(d.ingresos||0);
        document.getElementById('kpiTickets').textContent = String(d.tickets||0);
        document.getElementById('kpiPromedio').textContent = formatCurrency(d.promedioTicket||0);
        document.getElementById('kpiOcupacion').textContent = (d.ocupacion!=null? d.ocupacion:0) + '%';
    }catch(e){ toast('Error', e.message, 'error'); }
}

async function cargarChartIngresos(){
    try{
        const { desde, hasta } = paramsBase();
        const metodo = document.getElementById('fMetodo').value;
        const q = new URLSearchParams({ desde, hasta });
        if (metodo) q.append('metodo', metodo);
        const res = await fetch(`/api/reportes/ingresos-por-dia?${q.toString()}`, { headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error ingresos por día');
        const labels = j.data.map(r=>r.fecha);
        const data = j.data.map(r=>Number(r.total||0));
        renderLineChart('chartIngresos', labels, data, 'Ingresos');
    }catch(e){ toast('Error', e.message, 'error'); }
}

async function cargarChartMetodo(){
    try{
        const { desde, hasta } = paramsBase();
        const res = await fetch(`/api/reportes/ingresos-por-metodo?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`, { headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error ingresos por método');
        const labels = j.data.map(r=>r.metodo_pago);
        const data = j.data.map(r=>Number(r.total||0));
        renderDoughnut('chartMetodo', labels, data);
    }catch(e){ toast('Error', e.message, 'error'); }
}

async function cargarMovimientos(){
    try{
        const { desde, hasta } = paramsBase();
        const tipo = document.getElementById('fTipo').value;
        const estado = document.getElementById('fEstado').value;
        const placa = document.getElementById('fPlaca').value.trim();
        const q = new URLSearchParams({ desde, hasta, page:String(__pageRep), pageSize:String(__pageSizeRep) });
        if (tipo) q.append('tipo', tipo);
        if (estado) q.append('estado', estado);
        if (placa) q.append('placa', placa);
        const res = await fetch(`/api/reportes/movimientos?${q.toString()}`, { headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error movimientos');
        const tb = document.getElementById('tbMov');
        if (!j.data || j.data.length === 0){
            tb.innerHTML = '<tr><td colspan="7" class="text-center">Sin registros</td></tr>';
        } else {
            tb.innerHTML = j.data.map(r=>`
                <tr>
                    <td>${r.id_movimiento}</td>
                    <td>${r.placa}</td>
                    <td>${r.tipo}</td>
                    <td>${formatDateTime(r.fecha_entrada)}</td>
                    <td>${r.fecha_salida? formatDateTime(r.fecha_salida): '-'}</td>
                    <td><span class="badge bg-${r.estado==='activo'?'success':'secondary'}">${r.estado}</span></td>
                    <td>${r.total_a_pagar!=null? formatCurrency(r.total_a_pagar) : '-'}</td>
                    <td>
                        ${r.estado==='finalizado' ? `<button class="btn btn-sm btn-outline-primary" onclick="reimprimirSalida(${r.id_movimiento})"><i class='fas fa-print'></i></button>` : ''}
                    </td>
                </tr>
            `).join('');
        }
        const total = j.paging?.total || 0;
        const maxPage = Math.max(0, Math.ceil(total / __pageSizeRep) - 1);
        document.getElementById('btnPrev').disabled = __pageRep <= 0;
        document.getElementById('btnNext').disabled = __pageRep >= maxPage;
        document.getElementById('pageInfo').textContent = `Página ${__pageRep+1} de ${maxPage+1}`;
        document.getElementById('movPaging').textContent = `Total: ${total}`;
    }catch(e){ toast('Error', e.message, 'error'); }
}

// Reimpresión de ticket de salida desde reportes
window.reimprimirSalida = async function(idMovimiento){
    try{
        // Traer la factura con estructura de ingreso-salida
        const res = await fetch(`/api/movimientos/factura/${idMovimiento}`, { headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message||'No se pudo obtener la factura');
        const f = j.data;
        // Empresa, logo (DataURL) y configuración
        const empresa = await fetch('/api/empresa/me',{ headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} }).then(r=>r.json()).then(x=>x.data).catch(()=>null);
        let logoUrl = '';
        try{
            const lr = await fetch('/api/empresa/logo',{headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
            if (lr.ok){ const b = await lr.blob(); logoUrl = await new Promise((res)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(b); }); }
        }catch(_){ }
        let cfg = null;
        try{ cfg = await fetch('/api/empresa/config',{headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`}}).then(r=>r.json()).then(x=>x.data); }catch(_){ }
        const empresaInfo = Object.assign({}, empresa, { logo_url: logoUrl||empresa?.logo_url }, cfg||{});

        // Reutilizar el mismo render de ingreso-salida si está disponible
        if (window.renderComprobante && window.imprimirHTML){
            const htmlTicket = renderComprobante('SALIDA', null, f, empresaInfo);
            imprimirHTML(htmlTicket, 'Factura de Salida', 80, { t:'salida', e:empresaInfo?.nit, m:f.movimientoId, p:f.placa, fs:f.fechaSalida, total: f.total });
            return;
        }
        // Fallback simple (por si se abre reportes de forma aislada)
        const header = `
            <div style="text-align:center">
                ${empresaInfo.logo_url ? `<img src="${empresaInfo.logo_url}" alt="logo" style="max-height:60px">` : ''}
                <div><strong>${empresaInfo.nombre||'Empresa'}</strong></div>
                <div>NIT: ${empresaInfo.nit||''}</div>
                <div>${empresaInfo.direccion||''} ${empresaInfo.telefono? ' - '+empresaInfo.telefono:''}</div>
                <div>Horario: <strong>${(empresaInfo?.operacion_24h)?'24 horas':((fmtTimeRS(empresaInfo?.horario_apertura)||'')+' - '+(fmtTimeRS(empresaInfo?.horario_cierre)||''))}</strong></div>
                <hr/>
                <div><strong>SALIDA</strong></div>
            </div>`;
        const pagosHtml = (f.pagosList && f.pagosList.length)
            ? `<div><strong>Pagos</strong></div>` + f.pagosList.map(p=>`<div>${p.metodo_pago}: <strong>${formatCurrency(Number(p.monto||0))}</strong></div>`).join('')
            : '';
        const body = `
            <div>Movimiento: <strong>#${f.movimientoId}</strong></div>
            <div>Placa: <strong>${f.placa}</strong></div>
            <div>Tipo: <strong>${f.tipo}</strong></div>
            <div>Entrada: <strong>${new Date(f.fechaEntrada).toLocaleString('es-CO')}</strong></div>
            <div>Salida: <strong>${new Date(f.fechaSalida).toLocaleString('es-CO')}</strong></div>
            <hr/>
            <div>Tarifas</div>
            <div>Minuto: <strong>${f.tarifa.valor_minuto}</strong></div>
            <div>Hora: <strong>${f.tarifa.valor_hora}</strong></div>
            <div>Día: <strong>${f.tarifa.valor_dia_completo}</strong></div>
            <hr/>
            <div>Total a pagar: <strong>${formatCurrency(f.total)}</strong></div>
            ${pagosHtml}
            <div>Atendido por: ${localStorage.getItem('userName')||''}</div>
            <div>Fecha reimpresión: ${new Date().toLocaleString('es-CO')}</div>`;
        const printWin = window.open('','_blank','width=420,height=700');
        const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reimpresión</title>
            <style>@page{ size:80mm auto; margin: 3mm } body{ width:80mm; font-family: Arial, sans-serif; font-size:11px; margin:0 } .wrap{ padding:4mm } hr{ border:none; border-top:1px dashed #999; margin:6px 0 } img{ display:block; margin:0 auto 6px; max-width:100% } .qr{ display:flex; justify-content:center; margin-top:6px }</style>
            </head><body><div class="wrap">${header+body}<div class="qr"><div id="qrcode"></div></div></div>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
            <script>(function(){ try{ new QRCode(document.getElementById('qrcode'), {text:'https://ciscodedev.netlify.app/', width:96, height:96}); }catch(e){} setTimeout(function(){ window.print(); window.close(); }, 400); })();<\/script>
            </body></html>`;
        printWin.document.write(doc);
        printWin.document.close();
        printWin.focus();
    }catch(e){ toast('Error', e.message, 'error'); }
}

function fmtTimeRS(t){ if(!t) return ''; const s=String(t); return s.length>=5? s.substring(0,5): s; }

async function cargarTopPlacas(){
    try{
        const { desde, hasta } = paramsBase();
        const res = await fetch(`/api/reportes/top-placas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&limit=10`, { headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error top placas');
        const tb = document.getElementById('tbTop');
        if (!j.data || j.data.length === 0){
            tb.innerHTML = '<tr><td colspan="4" class="text-center">Sin registros</td></tr>';
        } else {
            tb.innerHTML = j.data.map(r=>`
                <tr>
                    <td>${r.placa}</td>
                    <td>${r.tipo}</td>
                    <td>${r.visitas}</td>
                    <td>${formatCurrency(r.total||0)}</td>
                </tr>
            `).join('');
        }
    }catch(e){ toast('Error', e.message, 'error'); }
}

// Render charts
function renderLineChart(id, labels, data, label){
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (chartIngresos) { chartIngresos.destroy(); }
    chartIngresos = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label, data, fill:false, borderColor:'#0d6efd', tension:0.25 }]},
        options: { responsive: true, plugins:{ legend:{ display:false } }, scales:{ y:{ ticks:{ callback:(v)=>formatCurrency(v) } } } }
    });
}

function renderDoughnut(id, labels, data){
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (chartMetodo) { chartMetodo.destroy(); }
    chartMetodo = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor:['#198754','#0d6efd','#ffc107'] }] },
        options: { responsive:true, plugins:{ legend:{ position:'bottom' } } }
    });
}

// Exportación PDF con diseño
async function exportarPDF(){
    try{
        const { desde, hasta } = paramsBase();
        const tipo = document.getElementById('fTipo').value;
        const estado = document.getElementById('fEstado').value;
        const placa = document.getElementById('fPlaca').value.trim();
        // Usar el endpoint ajustado para coherencia con Excel y donut
        const q = new URLSearchParams({ desde, hasta, limit:'1000' });
        if (tipo) q.append('tipo', tipo);
        if (estado) q.append('estado', estado);
        if (placa) q.append('placa', placa);
        const res = await fetch(`/api/reportes/movimientos-ajustados?${q.toString()}`, { headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error exportando');
        const rows = j.data || [];

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'a4' });

        // Encabezado con marca
        const empresa = localStorage.getItem('empresaNit') || '';
        doc.setFillColor(13, 110, 253); // Bootstrap primary
        doc.rect(0, 0, doc.internal.pageSize.getWidth(), 60, 'F');
        doc.setTextColor(255,255,255);
        doc.setFont('helvetica','bold');
        doc.setFontSize(16);
        doc.text('Reporte de Movimientos - ParkSystem', 24, 38);
        doc.setFontSize(10);
        doc.text(`Empresa: ${empresa}`, doc.internal.pageSize.getWidth()-200, 24);
        doc.text(`Generado: ${new Date().toLocaleString('es-CO')}`, doc.internal.pageSize.getWidth()-200, 40);

        // Subtítulo filtros
        doc.setTextColor(0,0,0);
        doc.setFont('helvetica','normal');
        doc.setFontSize(11);
        const subt = `Rango: ${desde} a ${hasta}` + (tipo? ` | Tipo: ${tipo}`:'') + (estado? ` | Estado: ${estado}`:'') + (placa? ` | Placa: ${placa.toUpperCase()}`:'');
        doc.text(subt, 24, 80);

        // Resumen (KPIs) calculado desde filas ajustadas
        const ingresos = rows.reduce((a,b)=> a + Number(b.total_a_pagar||0), 0);
        const tickets = rows.length;
        const promedio = tickets>0 ? ingresos / tickets : 0;
        const sumEf = rows.reduce((a,b)=> a + Number(b.efectivo||0), 0);
        const sumTa = rows.reduce((a,b)=> a + Number(b.tarjeta||0), 0);
        const sumQr = rows.reduce((a,b)=> a + Number(b.qr||0), 0);

        // Bloque Resumen (tabla pequeña)
        doc.autoTable({
            head: [["Indicador", "Valor"]],
            body: [
                ["Ingresos", formatCurrency(ingresos)],
                ["Tickets", String(tickets)],
                ["Promedio Ticket", formatCurrency(promedio)]
            ],
            startY: 95,
            styles: { fontSize: 10, cellPadding: 6 },
            headStyles: { fillColor:[13,110,253], textColor:255, fontStyle:'bold' },
            columnStyles: { 0:{cellWidth:160}, 1:{cellWidth:200} }
        });

        // Bloque Métodos (ajustado)
        const afterResumenY = doc.lastAutoTable.finalY + 10;
        doc.autoTable({
            head: [["Efectivo", "Tarjeta", "QR"]],
            body: [[formatCurrency(sumEf), formatCurrency(sumTa), formatCurrency(sumQr)]],
            startY: afterResumenY,
            styles: { fontSize: 10, cellPadding: 6, halign:'right' },
            headStyles: { fillColor:[13,110,253], textColor:255, fontStyle:'bold', halign:'center' },
            columnStyles: { 0:{cellWidth:120, halign:'right'}, 1:{cellWidth:120, halign:'right'}, 2:{cellWidth:100, halign:'right'} }
        });

        const startMainY = doc.lastAutoTable.finalY + 14;

        // Tabla principal usando autoTable
        const head = [["#Mov","Placa","Tipo","Entrada","Salida","Estado","Total","Efectivo","Tarjeta","QR"]];
        const body = rows.map(r=>[
            r.id_movimiento,
            r.placa,
            r.tipo,
            formatPdfDate(r.fecha_entrada),
            r.fecha_salida? formatPdfDate(r.fecha_salida):'-',
            r.estado.toUpperCase(),
            r.total_a_pagar!=null? formatCurrency(r.total_a_pagar):'-',
            formatCurrency(r.efectivo||0),
            formatCurrency(r.tarjeta||0),
            formatCurrency(r.qr||0)
        ]);

        doc.autoTable({
            head,
            body,
            startY: startMainY,
            styles: { fontSize: 9, cellPadding: 6, valign:'middle' },
            headStyles: { fillColor:[13,110,253], textColor:255, fontStyle:'bold' },
            alternateRowStyles: { fillColor:[245,248,255] },
            columnStyles: { 0:{cellWidth:40}, 1:{cellWidth:90}, 2:{cellWidth:60}, 3:{cellWidth:110}, 4:{cellWidth:110}, 5:{cellWidth:70}, 6:{cellWidth:80, halign:'right'}, 7:{cellWidth:80, halign:'right'}, 8:{cellWidth:80, halign:'right'}, 9:{cellWidth:60, halign:'right'} },
            didDrawPage: (data)=>{
                // Pie de página
                const pageSize = doc.internal.pageSize;
                const pageHeight = pageSize.getHeight();
                doc.setFontSize(9);
                doc.setTextColor(140);
                doc.text(`Página ${doc.internal.getNumberOfPages()}`, pageSize.getWidth()-80, pageHeight-12);
            }
        });

        // Resumen al final
        const total = rows.reduce((a,b)=> a + (Number(b.total_a_pagar||0)), 0);
        doc.setFontSize(11);
        doc.setFont('helvetica','bold');
        doc.text(`Total movimientos: ${rows.length}    |    Total facturado: ${formatCurrency(total)}`, 24, doc.autoTable.previous.finalY + 24);

        doc.save(`reporte_movimientos_${Date.now()}.pdf`);
    }catch(e){ toast('Error', e.message, 'error'); }
}

// Utils
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(amount||0));
}
function formatDateTime(date) {
    return new Date(date).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit' });
}
function toast(title, message, type) {
    const container = document.getElementById('toastContainer');
    const id = 't_' + Date.now();
    const typeClass = type==='success' ? 'toast-success' : type==='warning' ? 'toast-warning' : type==='info' ? 'toast-info' : 'toast-error';
    const el = document.createElement('div');
    el.className = `toast align-items-center toast-custom ${typeClass}`;
    el.id = id;
    el.role = 'alert';
    el.ariaLive = 'assertive';
    el.ariaAtomic = 'true';
    el.innerHTML = `
      <div class="toast-header">
        <strong class="me-auto">${title}</strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">${message}</div>
    `;
    container.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3500 });
    t.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}
function setHoy(){
    const d = new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0');
    document.getElementById('fDesde').value = `${y}-${m}-${da}`;
    document.getElementById('fHasta').value = `${y}-${m}-${da}`;
    __pageRep = 0; cargarTodo();
}
function setUltimos7(){
    const d = new Date(); const d2 = new Date(d); d2.setDate(d.getDate()-6);
    const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0');
    const y2=d2.getFullYear(); const m2=String(d2.getMonth()+1).padStart(2,'0'); const da2=String(d2.getDate()).padStart(2,'0');
    document.getElementById('fDesde').value = `${y2}-${m2}-${da2}`;
    document.getElementById('fHasta').value = `${y}-${m}-${da}`;
    __pageRep = 0; cargarTodo();
}
function setMes(){
    const d = new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0');
    const first = `${y}-${m}-01`;
    const lastDay = new Date(y, Number(m), 0).getDate();
    const last = `${y}-${m}-${String(lastDay).padStart(2,'0')}`;
    document.getElementById('fDesde').value = first;
    document.getElementById('fHasta').value = last;
    __pageRep = 0; cargarTodo();
}
function escapeCsv(v){
    const s = String(v==null?'':v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
}
function safeIso(d){ try{ return new Date(d).toISOString(); }catch(_){ return ''; } }
function formatPdfDate(d){ try{ return new Date(d).toLocaleString('es-CO'); }catch(_){ return ''; } }

// Exportación Excel vía backend (sin Internet ni dependencias en el navegador)
async function exportarExcelBackend(){
    try{
        const { desde, hasta } = paramsBase();
        const tipo = document.getElementById('fTipo').value;
        const estado = document.getElementById('fEstado').value;
        const placa = document.getElementById('fPlaca').value.trim();
        const q = new URLSearchParams({ desde, hasta });
        if (tipo) q.append('tipo', tipo);
        if (estado) q.append('estado', estado);
        if (placa) q.append('placa', placa);
        const res = await fetch(`/api/reportes/export/xlsx?${q.toString()}`, { headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
        if (!res.ok) {
            const j = await res.json().catch(()=>({message:'Error no especificado'}));
            throw new Error(j.message||'Error exportando Excel');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_movimientos_${Date.now()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }catch(e){ toast('Error', e.message, 'error'); }
}

async function buildKpiSheetData(){
    const { desde, hasta } = paramsBase();
    const res = await fetch(`/api/reportes/kpis?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.message||'Error KPIs');
    const d = j.data || {};
    return [
        ['Reporte de Movimientos - ParkSystem',''],
        ['Rango', `${desde} a ${hasta}`],
        ['Ingresos', String(formatCurrency(d.ingresos||0))],
        ['Tickets', String(d.tickets||0)],
        ['Promedio Ticket', String(formatCurrency(d.promedioTicket||0))],
        ['Activos', String(d.activos||0)],
        ['Ocupación', (d.ocupacion!=null? d.ocupacion:0) + '%']
    ];
}

function formatExcelDate(d){ try{ return new Date(d).toLocaleString('es-CO'); }catch(_){ return ''; } }


