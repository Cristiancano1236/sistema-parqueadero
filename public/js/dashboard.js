document.addEventListener('DOMContentLoaded', function() {
    // Verificar si el usuario está autenticado
    if (!localStorage.getItem('token')) {
        window.location.href = '/';
        return;
    }

    // Configuración del sidebar
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('show');
        });
    }

    // Cerrar sidebar al hacer clic fuera en dispositivos móviles
    document.addEventListener('click', (e) => {
        if (window.innerWidth < 992 && 
            !sidebar.contains(e.target) && 
            !sidebarToggle.contains(e.target)) {
            sidebar.classList.remove('show');
        }
    });

    // Mostrar nombre del usuario y ocultar menús admin para operadores
    const nameEl = document.getElementById('userName');
    if (nameEl) {
        nameEl.textContent = localStorage.getItem('userName') || 'Usuario';
    }
    const role = localStorage.getItem('userRole');
    if (role !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('d-none'));
    }

    // Manejo del logout
    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        localStorage.removeItem('userName');
        localStorage.removeItem('userRole');
        localStorage.removeItem('empresaId');
        localStorage.removeItem('empresaNit');
        window.location.href = '/';
    };

    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) btnLogout.addEventListener('click', handleLogout);
    const logoutDropdown = document.getElementById('logoutDropdown');
    if (logoutDropdown) logoutDropdown.addEventListener('click', handleLogout);

    // Cargar datos del dashboard
    loadDashboardData();
});

let __page = 0;

// Cache simple de empresa para impresión
let __empresaInfo = null;
async function getEmpresaInfo() {
    if (__empresaInfo) return __empresaInfo;
    try {
        const r = await fetch('/api/empresa/me', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } });
        const j = await r.json();
        if (r.ok) __empresaInfo = j.data;
    } catch (_) {}
    return __empresaInfo;
}

// Función para cargar los datos del dashboard
async function loadDashboardData() {
    try {
        const response = await fetch(`/api/dashboard/stats?page=${__page}&pageSize=5`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            showToast('Sesión expirada', 'Por favor inicia sesión nuevamente', 'warning');
            localStorage.clear();
            setTimeout(()=> location.href='/', 1200);
            return;
        }

        if (!response.ok) {
            throw new Error('Error al cargar los datos del dashboard');
        }

        const data = await response.json();
        updateDashboardStats(data);
        updateRecentActivity(data.recentActivity);
        const btnNext = document.getElementById('btnNext');
        const btnPrev = document.getElementById('btnPrev');
        const pageInfo = document.getElementById('pageInfo');
        if (btnNext && btnPrev && pageInfo) {
            btnNext.disabled = !data.paging?.hasNext;
            btnPrev.disabled = (__page <= 0);
            pageInfo.textContent = `Página ${__page + 1}`;
            btnNext.onclick = () => { __page += 1; loadDashboardData(); };
            btnPrev.onclick = () => { if (__page > 0) { __page -= 1; loadDashboardData(); } };
        }

    } catch (error) {
        console.error('Error:', error);
        showError('Error al cargar los datos del dashboard');
        // Reseteo seguro de KPIs
        updateDashboardStats({ currentVehicles: 0, todayIncome: 0, averageTime: 0, totalUsers: 0 });
        updateRecentActivity([]);
    }
}

// Función para actualizar las estadísticas
function updateDashboardStats(data) {
    // Actualizar contadores por tipo
    const map = { carro: 0, moto: 0, bici: 0 };
    (data.currentVehiclesByType || []).forEach(r => { map[r.tipo] = r.count; });
    document.getElementById('currCarros').textContent = map.carro || 0;
    document.getElementById('currMotos').textContent = map.moto || 0;
    document.getElementById('currBicis').textContent = map.bici || 0;
    document.getElementById('todayIncome').textContent = formatCurrency(data.todayIncome || 0);
    // Ocupación: consultar KPI de reportes para hoy
    setOcupacionKpi();
}

async function setOcupacionKpi(){
    try{
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const dd = String(d.getDate()).padStart(2,'0');
        const hoy = `${yyyy}-${mm}-${dd}`;
        const res = await fetch(`/api/reportes/kpis?desde=${hoy}&hasta=${hoy}`, { headers:{'Authorization':`Bearer ${localStorage.getItem('token')}`} });
        const j = await res.json();
        if (!res.ok) throw new Error(j.message||'Error KPI');
        const ocup = (j.data && j.data.ocupacion!=null) ? j.data.ocupacion : 0;
        const el = document.getElementById('kpiOcupacionDash');
        if (el) el.textContent = `${ocup}%`;
    }catch(_){
        const el = document.getElementById('kpiOcupacionDash');
        if (el) el.textContent = '0%';
    }
}

// Función para actualizar la tabla de actividad reciente
function updateRecentActivity(activities) {
    const tableBody = document.getElementById('recentActivityTable');
    if (!activities || activities.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">No hay actividad reciente</td></tr>';
        return;
    }

    tableBody.innerHTML = activities.map(activity => `
        <tr>
            <td>${activity.placa}</td>
            <td>${activity.tipo}</td>
            <td>${formatDateTime(activity.entrada)}</td>
            <td><span class="badge bg-${activity.estado === 'activo' ? 'success' : 'secondary'}">${activity.estado}</span></td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="viewDetails(${activity.id})">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// Ver detalle del movimiento y abrir modal
window.viewDetails = async function(idMovimiento) {
    try {
        const res = await fetch(`/api/movimientos/detalle/${idMovimiento}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Error obteniendo detalle');

        const m = data.data;
        const modalHtml = `
            <div class="modal fade" id="detalleModal" tabindex="-1">
              <div class="modal-dialog">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title">Detalle Movimiento #${m.id_movimiento}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body">
                    <div><strong>Placa:</strong> ${m.placa}</div>
                    <div><strong>Tipo:</strong> ${m.tipo}</div>
                    <div><strong>Entrada:</strong> ${new Date(m.fecha_entrada).toLocaleString('es-CO')}</div>
                    ${m.fecha_salida ? `<div><strong>Salida:</strong> ${new Date(m.fecha_salida).toLocaleString('es-CO')}</div>` : ''}
                    ${m.total_a_pagar ? `<div><strong>Total:</strong> ${formatCurrency(m.total_a_pagar)}</div>` : ''}
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>
                  </div>
                </div>
              </div>
            </div>`;

        // Insertar y abrir modal
        const container = document.createElement('div');
        container.innerHTML = modalHtml;
        document.body.appendChild(container);
        const modal = new bootstrap.Modal(container.querySelector('#detalleModal'));
        modal.show();
        container.addEventListener('hidden.bs.modal', () => container.remove());
    } catch (e) {
        console.error(e);
        showError('No fue posible obtener el detalle');
    }
}

// Finalizar (checkout) un movimiento activo con confirmación + impresión
window.checkoutVehicle = async function(idMovimiento) {
    try {
        // Traer detalle
        const resDet = await fetch(`/api/movimientos/detalle/${idMovimiento}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const det = await resDet.json();
        if (!resDet.ok) throw new Error(det.message || 'Error');
        const m = det.data;
        if (m.fecha_salida) {
            showToast('Aviso', 'Este vehículo ya tuvo salida.', 'warning');
            return;
        }

        // Modal de confirmación
        const modalHtml = `
            <div class="modal fade" id="checkoutModal" tabindex="-1">
              <div class="modal-dialog">
                <div class="modal-content">
                  <div class="modal-header">
                    <h5 class="modal-title">Confirmar salida</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body">
                    <div class="mb-2"><strong>Placa:</strong> ${m.placa}</div>
                    <div class="mb-2"><strong>Tipo:</strong> ${m.tipo}</div>
                    <div class="mb-2"><strong>Entrada:</strong> ${new Date(m.fecha_entrada).toLocaleString('es-CO')}</div>
                    <div class="mt-3">
                      <label class="form-label">Método de pago</label>
                      <select class="form-select" id="checkoutMetodo">
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="QR">QR</option>
                      </select>
                    </div>
                  </div>
                  <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-success" id="btnConfirmCheckout">Confirmar salida</button>
                  </div>
                </div>
              </div>
            </div>`;

        const container = document.createElement('div');
        container.innerHTML = modalHtml;
        document.body.appendChild(container);
        const modal = new bootstrap.Modal(container.querySelector('#checkoutModal'));
        modal.show();

        container.querySelector('#btnConfirmCheckout').addEventListener('click', async () => {
            const metodoPago = container.querySelector('#checkoutMetodo').value;
            try {
                const res = await fetch('/api/movimientos/salida', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ placa: m.placa, metodoPago })
                });
                const data = await res.json();
                if (!res.ok) {
                    if (res.status === 404) {
                        showToast('Aviso', data.message || 'El vehículo no tiene ingreso activo', 'warning');
                        return;
                    }
                    throw new Error(data.message || 'No se pudo finalizar');
                }

                // Refrescar dashboard
                await loadDashboardData();

                // Imprimir ticket
                const empresa = await getEmpresaInfo();
                const f = data.data;
                const ticketHtml = renderTicketSalida(f, empresa);
                imprimirHTML(ticketHtml, 'Factura de Salida', 80, {
                    t: 'salida', e: empresa?.nit, m: f.movimientoId, p: f.placa, fs: f.fechaSalida, total: f.total
                });
                // Abrir modal de pago como en ingreso/salida
                try {
                    // Reutilizar modal de ingreso/salida si está disponible o informar
                    if (window.abrirModalPago) {
                        window.abrirModalPago(f);
                    } else {
                        showToast('Info', 'Para registrar pagos usa Ingreso/Salida.', 'info');
                    }
                } catch (_) {}

                showToast('Éxito', 'Salida registrada: ' + formatCurrency(f.total), 'success');
                modal.hide();
                container.remove();
            } catch (err) {
                console.error(err);
                showToast('Error', 'No fue posible finalizar el movimiento', 'error');
            }
        });

        container.addEventListener('hidden.bs.modal', () => container.remove());
    } catch (e) {
        console.error(e);
        showError('No fue posible abrir la confirmación');
    }
}

// Render del ticket de salida
function renderTicketSalida(salida, empresa){
    const e = empresa || {};
    const header = `
        <div style="text-align:center">
            ${e.logo_url ? `<img src="${e.logo_url}" alt="logo" style="max-height:60px">` : ''}
            <div><strong>${e.nombre||'Empresa'}</strong></div>
            <div>NIT: ${e.nit||''}</div>
            <div>${e.direccion||''} ${e.telefono? ' - '+e.telefono:''}</div>
            <hr/>
            <div><strong>SALIDA</strong></div>
        </div>`;
    // Pie de ticket con crédito y enlace/ícono de YouTube de Ciscode
    const ciscodeFooter = `
        <hr/>
        <div style="text-align:center;margin-top:6px">
            <div>Desarrollado por <strong>Ciscode</strong></div>
            <div>
                <a href="https://ciscode.co" target="_blank" style="text-decoration:none;color:#000">ciscode.co</a>
                &nbsp;|&nbsp;
                <a href="https://www.youtube.com/@Ciscode" target="_blank" aria-label="YouTube Ciscode" style="display:inline-flex;align-items:center;gap:4px;text-decoration:none;color:#000">
                    <span>
                        <svg width="18" height="12" viewBox="0 0 24 17" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M23.5 2.6a3 3 0 0 0-2.1-2.1C19.5 0 12 0 12 0s-7.5 0-9.4.5A3 3 0 0 0 .5 2.6 31 31 0 0 0 0 8.5a31 31 0 0 0 .5 5.9 3 3 0 0 0 2.1 2.1C4.5 17 12 17 12 17s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-5.9 31 31 0 0 0-.5-5.9z" fill="#FF0000"/>
                            <path d="M9.75 12.25V4.75L15.5 8.5l-5.75 3.75z" fill="#fff"/>
                        </svg>
                    </span>
                    <span style="font-size:10px">YouTube</span>
                </a>
            </div>
        </div>`;
    return `${header}
        <div>Movimiento: <strong>#${salida.movimientoId}</strong></div>
        <div>Placa: <strong>${salida.placa}</strong></div>
        <div>Tipo: <strong>${salida.tipo}</strong></div>
        <div>Entrada: <strong>${new Date(salida.fechaEntrada).toLocaleString('es-CO')}</strong></div>
        <div>Salida: <strong>${new Date(salida.fechaSalida).toLocaleString('es-CO')}</strong></div>
        <div>Tiempo: <strong>${salida.detalleTiempo.dias}d ${salida.detalleTiempo.horas}h ${salida.detalleTiempo.minutos}m</strong></div>
        <hr/>
        <div>Tarifas</div>
        <div>Minuto: <strong>${salida.tarifa.valor_minuto}</strong></div>
        <div>Hora: <strong>${salida.tarifa.valor_hora}</strong></div>
        <div>Día: <strong>${salida.tarifa.valor_dia_completo}</strong></div>
        <hr/>
        <div>Total a pagar: <strong>${formatCurrency(salida.total)}</strong></div>
        <div>Atendido por: ${localStorage.getItem('userName')||''}</div>
        <div>Fecha impresión: ${new Date().toLocaleString('es-CO')}</div>
        ${ciscodeFooter}`;
}

// Ventana de impresión tipo ticket con QR opcional
function imprimirHTML(html, titulo, anchoMM, qrPayload){
    const width = anchoMM || 58; // 58 o 80
    const w = window.open('', '_blank', 'width=420,height=700');
    const payload = encodeURIComponent(JSON.stringify(qrPayload || {}));
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>${titulo}</title>
        <style>
            @page{ size: ${width}mm auto; margin: 3mm }
            body{ width:${width}mm; font-family: Arial, sans-serif; font-size:11px; margin:0 }
            .wrap{ padding:4mm }
            hr{ border:none; border-top:1px dashed #999; margin:6px 0 }
            img{ display:block; margin:0 auto 6px; max-width:100% }
            .qr{ display:flex; justify-content:center; margin-top:6px }
        </style>
    </head><body><div class="wrap">${html}<div class="qr"><div id="qrcode"></div></div></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
    <script>(function(){
        try{
            var payload = JSON.parse(decodeURIComponent('${payload}'));
            new QRCode(document.getElementById('qrcode'), {text: JSON.stringify(payload), width:96, height:96});
        }catch(e){}
        setTimeout(function(){ window.print(); window.close(); }, 400);
    })();<\/script>
    </body></html>`;
    w.document.write(doc);
    w.document.close();
    w.focus();
}

// Funciones de utilidad
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatTime(minutes) {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatDateTime(date) {
    return new Date(date).toLocaleString('es-CO', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Función para mostrar errores
function showError(message) {
    showToast('Error', message, 'error');
}

// Notificaciones visuales (toasts)
function showToast(title, message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) { console[type==='error'?'error':'log'](message); return; }
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
    const toast = new bootstrap.Toast(el, { delay: 3500 });
    toast.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}
