document.addEventListener('DOMContentLoaded', () => {
    // Guard de rol: solo admin
    if (localStorage.getItem('userRole') !== 'admin') { window.location.href = '/admin/dashboard'; return; }
    document.getElementById('userName').textContent = localStorage.getItem('userName') || 'Usuario';
    document.querySelector('.sidebar-toggle').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('show'));
    document.getElementById('btnLogout').addEventListener('click',()=>{localStorage.clear(); location.href='/';});

    loadTarifas();

    // Habilitar/deshabilitar campos según modo
    const modo = document.getElementById('modo_cobro');
    const fToggle = () => {
        const m = modo.value;
        const enMin = m === 'minuto' || m === 'mixto';
        const enHora = m === 'hora' || m === 'mixto';
        const enDia = m === 'dia' || m === 'mixto';
        document.getElementById('valor_minuto').disabled = !enMin;
        document.getElementById('valor_hora').disabled = !enHora;
        document.getElementById('valor_dia_completo').disabled = !enDia;
        const escalas = m === 'mixto';
        document.getElementById('paso_minutos_a_horas').disabled = !escalas;
        document.getElementById('paso_horas_a_dias').disabled = !escalas;
        document.getElementById('redondeo_horas').disabled = !escalas;
        document.getElementById('redondeo_dias').disabled = !escalas;
    };
    modo.addEventListener('change', fToggle);
    fToggle();

    document.getElementById('tarifaForm').addEventListener('submit', async (e)=>{
        e.preventDefault();
        const body = {
            tipo_vehiculo: document.getElementById('tipo_vehiculo').value,
            modo_cobro: document.getElementById('modo_cobro').value,
            valor_minuto: parseFloat(document.getElementById('valor_minuto').value||0),
            valor_hora: parseFloat(document.getElementById('valor_hora').value||0),
            valor_dia_completo: parseFloat(document.getElementById('valor_dia_completo').value||0),
            paso_minutos_a_horas: parseInt(document.getElementById('paso_minutos_a_horas').value||0, 10),
            paso_horas_a_dias: parseInt(document.getElementById('paso_horas_a_dias').value||0, 10),
            redondeo_horas: document.getElementById('redondeo_horas').value,
            redondeo_dias: document.getElementById('redondeo_dias').value
        };
        try{
            const res = await fetch('/api/tarifas', {
                method: 'PUT',
                headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${localStorage.getItem('token')}` },
                body: JSON.stringify(body)
            });
            const j = await res.json();
            if(!res.ok) throw new Error(j.message||'No se pudo guardar');
            showToast('Éxito','Tarifa guardada','success');
            loadTarifas();
        }catch(err){
            showToast('Error', err.message, 'error');
        }
    });
});

async function loadTarifas(){
    try{
        const res = await fetch('/api/tarifas/current', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }});
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error cargando tarifas');
        const ul = document.getElementById('listaTarifas');
        ul.innerHTML = j.data.map(t => `
            <li class="list-group-item d-flex flex-column">
                <div class="d-flex justify-content-between align-items-center">
                    <strong class="text-capitalize">${t.tipo_vehiculo}</strong>
                    <span class="badge bg-primary">${t.modo_cobro}</span>
                </div>
                <small>Min: ${t.valor_minuto} | Hora: ${t.valor_hora} | Día: ${t.valor_dia_completo}</small>
                <small>Escalas → min→hr: ${t.paso_minutos_a_horas} min, hr→día: ${t.paso_horas_a_dias} h</small>
            </li>
        `).join('');
    }catch(err){
        showToast('Error', err.message, 'error');
    }
}

function showToast(title, message, type) {
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
    const toast = new bootstrap.Toast(el, { delay: 3500 });
    toast.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}


