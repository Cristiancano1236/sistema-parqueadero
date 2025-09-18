// Gestión de turnos: apertura/cierre, modal y gating
// Relacionado con: src/routes/turnos.js (API) y páginas admin/*.html
(function(){
	const token = localStorage.getItem('token');
	if (!token) return;

	// Inyectar modal solo una vez
	if (document.getElementById('turnoModal')) return;

	const modalHtml = [
		'<div class="modal fade" id="turnoModal" tabindex="-1" aria-hidden="true">',
			'<div class="modal-dialog">',
				'<div class="modal-content">',
					'<div class="modal-header">',
						'<h5 class="modal-title"><i class="bi bi-cash-coin me-2"></i>Turno de Caja</h5>',
						'<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
					'</div>',
					'<div class="modal-body">',
						'<div id="turnoAlert" class="alert d-none" role="alert"></div>',
						'<div id="vistaApertura">',
							'<div class="mb-3">',
								'<label class="form-label">Base inicial</label>',
								'<input type="number" min="0" step="0.01" id="baseInicial" class="form-control" placeholder="0.00" />',
							'</div>',
							'<div class="mb-2">',
								'<label class="form-label">Observación (opcional)</label>',
								'<input type="text" id="obsApertura" class="form-control" maxlength="255" />',
							'</div>',
							'<div class="small text-muted">Debes abrir turno para poder registrar ingresos/salidas.</div>',
						'</div>',
						'<div id="vistaCierre" class="d-none">',
							'<div class="row g-2">',
								'<div class="col-6">',
									'<label class="form-label">Efectivo</label>',
									'<input type="number" min="0" step="0.01" id="sumEfec" class="form-control" placeholder="0.00" />',
								'</div>',
								'<div class="col-6">',
									'<label class="form-label">Tarjeta</label>',
									'<input type="number" min="0" step="0.01" id="sumCard" class="form-control" placeholder="0.00" />',
								'</div>',
								'<div class="col-6">',
									'<label class="form-label">QR</label>',
									'<input type="number" min="0" step="0.01" id="sumQR" class="form-control" placeholder="0.00" />',
								'</div>',
								'<div class="col-6">',
									'<label class="form-label">Total</label>',
									'<input type="number" min="0" step="0.01" id="sumTotal" class="form-control" placeholder="0.00" readonly />',
								'</div>',
							'</div>',
							'<div class="mt-2">',
								'<div class="d-flex justify-content-between">',
									'<div>Sistema (esperado): <strong id="sumExpected">$0</strong></div>',
									'<div>Diferencia: <strong id="sumDiffLive">$0</strong></div>',
								'</div>',
								'<div class="form-text">La diferencia = Conteo - Sistema.</div>',
							'</div>',
							'<div class="mb-2 mt-2">',
								'<label class="form-label">Observación de cierre</label>',
								'<input type="text" id="obsCierre" class="form-control" maxlength="255" />',
							'</div>',
							'<div class="small text-muted">Al cerrar, se guardará el resumen y podrás imprimir.</div>',
						'</div>',
					'</div>',
					'<div class="modal-footer">',
						'<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cerrar</button>',
						'<button type="button" class="btn btn-primary" id="btnAbrirTurno">Abrir turno</button>',
						'<button type="button" class="btn btn-success d-none" id="btnCerrarTurno">Cerrar e imprimir</button>',
					'</div>',
				'</div>',
			'</div>',
		'</div>'
	].join('');

	const wrap = document.createElement('div');
	wrap.innerHTML = modalHtml;
	document.body.appendChild(wrap.firstChild);

	const modal = new bootstrap.Modal(document.getElementById('turnoModal'));
	const alertBox = document.getElementById('turnoAlert');
	const vistaA = document.getElementById('vistaApertura');
	const vistaC = document.getElementById('vistaCierre');
	const btnAbrir = document.getElementById('btnAbrirTurno');
	const btnCerrar = document.getElementById('btnCerrarTurno');

	function openCierreModal(){
		vistaA.classList.add('d-none');
		vistaC.classList.remove('d-none');
		btnAbrir.classList.add('d-none');
		btnCerrar.classList.remove('d-none');
		alertBox.className = 'alert d-none';
		fetchResumenEsperado();
		modal.show();
	}

	function showAlert(type, msg){
		alertBox.className = 'alert alert-'+type;
		alertBox.textContent = msg;
	}

	let turnoAbierto = false;

	async function turnoActual(){
		const r = await fetch('/api/turnos/actual', { headers:{ 'Authorization':'Bearer '+token }});
		const j = await r.json();
		return j.data || null;
	}

	function setIngresoSalidaEnabled(enabled){
		var inBtn = document.querySelector('#formIngreso button[type="submit"]');
		var outBtn = document.querySelector('#formSalida button[type="submit"]');
		if (inBtn) inBtn.disabled = !enabled;
		if (outBtn) outBtn.disabled = !enabled;
	}

	function updateGuardUI(){
		// Enlace de acciones rápidas (dashboard)
		Array.from(document.querySelectorAll('a[href*="ingreso-salida"]')).forEach(a=>{
			if (!a.__guarded){
				a.addEventListener('click', function(e){ if(!turnoAbierto){ e.preventDefault(); exigirTurno(); }}, true);
				a.__guarded = true;
			}
		});
		// Formularios de ingreso/salida (vista ingreso-salida)
		document.addEventListener('submit', function(e){
			var id = (e.target && e.target.id)||'';
			if ((id==='formIngreso' || id==='formSalida') && !turnoAbierto){ e.preventDefault(); e.stopPropagation(); exigirTurno(); }
		}, true);
		setIngresoSalidaEnabled(turnoAbierto);

		// Indicador en la topbar si existe navbar
		let badge = document.getElementById('turnoBadge');
		if (!badge){
			const nav = document.querySelector('.navbar .container-fluid .navbar-collapse, .navbar .container-fluid');
			if (nav){
				badge = document.createElement('span');
				badge.id = 'turnoBadge';
				badge.className = 'ms-2 badge rounded-pill';
				nav.appendChild(badge);
				// Botón rápido
				const quick = document.createElement('button');
				quick.id = 'turnoQuickBtn';
				quick.type = 'button';
				quick.className = 'btn btn-outline-danger btn-sm ms-2';
				quick.innerHTML = '<i class="bi bi-door-closed me-1"></i>Cerrar turno';
				nav.appendChild(quick);
				quick.addEventListener('click', function(){ if (turnoAbierto) { openCierreModal(); } else { exigirTurno(); } });
			}
		}
		if (badge){
			if (turnoAbierto){ badge.className = 'ms-2 badge rounded-pill bg-success'; badge.textContent = 'Turno abierto'; }
			else { badge.className = 'ms-2 badge rounded-pill bg-secondary'; badge.textContent = 'Turno cerrado'; }
		}
		var quickBtn = document.getElementById('turnoQuickBtn');
		if (quickBtn){ quickBtn.classList.toggle('d-none', !turnoAbierto); }
	}

	async function exigirTurno(){
		const t = await turnoActual();
		turnoAbierto = !!t;
		updateGuardUI();
		if (!t){
			vistaA.classList.remove('d-none');
			vistaC.classList.add('d-none');
			btnAbrir.classList.remove('d-none');
			btnCerrar.classList.add('d-none');
			modal.show();
		}else{
			// Turno abierto
		}
	}

	btnAbrir.addEventListener('click', async ()=>{
		try{
			const base = Number(document.getElementById('baseInicial').value||0);
			const obs = (document.getElementById('obsApertura').value||'').trim();
			const r = await fetch('/api/turnos/abrir', {
				method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
				body: JSON.stringify({ base_inicial: base, observacion_apertura: obs })
			});
			const j = await r.json();
			if(!r.ok) throw new Error(j.message||'Error abriendo turno');
			showAlert('success','Turno abierto correctamente.');
			turnoAbierto = true;
			updateGuardUI();
			setTimeout(()=>{ modal.hide(); }, 800);
		}catch(e){ showAlert('danger', e.message); }
	});

	// Cálculo en vivo del total y diferencia contra sistema
	let expectedTotals = { total: 0 };
	['sumEfec','sumCard','sumQR'].forEach(id=>{
		const el = ()=> document.getElementById(id);
		document.addEventListener('input', (e)=>{
			if (e.target && e.target.id === id){ recalcLive(); }
		});
	});
	async function fetchResumenEsperado(){
		try{
			const r = await fetch('/api/turnos/resumen', { headers:{'Authorization':'Bearer '+token} });
			const j = await r.json();
			if (r.ok && j && j.data && j.data.totales){ expectedTotals = j.data.totales; }
			else { expectedTotals = { total: 0 }; }
			document.getElementById('sumExpected').textContent = fmt(expectedTotals.total||0);
			recalcLive();
		}catch(_){ expectedTotals = { total: 0 }; }
	}
	function recalcLive(){
		const ef = Number(document.getElementById('sumEfec').value||0);
		const ta = Number(document.getElementById('sumCard').value||0);
		const qr = Number(document.getElementById('sumQR').value||0);
		const total = ef + ta + qr;
		document.getElementById('sumTotal').value = String(total.toFixed(2));
		const diff = Number((total - (expectedTotals.total||0)).toFixed(2));
		const diffEl = document.getElementById('sumDiffLive');
		diffEl.textContent = fmt(diff);
		diffEl.className = (Math.abs(diff) < 0.01) ? 'text-success' : 'text-danger';
	}

	btnCerrar.addEventListener('click', async ()=>{
		try{
			const payload = {
				total_efectivo: Number(document.getElementById('sumEfec').value||0),
				total_tarjeta: Number(document.getElementById('sumCard').value||0),
				total_qr: Number(document.getElementById('sumQR').value||0),
				total_general: Number(document.getElementById('sumTotal').value||0),
				observacion_cierre: (document.getElementById('obsCierre').value||'').trim()
			};
			const r = await fetch('/api/turnos/cerrar', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify(payload) });
			const j = await r.json();
			if(!r.ok) throw new Error(j.message||'Error cerrando turno');
			const exp = j.data.expected;
			const usr = j.data.userTotals;
			const diff = Number(j.data.diferencia||0);
			if (Math.abs(diff) > 0.009){
				showAlert('warning','Atención: existe diferencia entre conteo y sistema: '+fmt(diff)+'.');
			} else {
				showAlert('success','Turno cerrado. Generando ticket...');
			}
			turnoAbierto = false;
			updateGuardUI();
			setTimeout(()=>{
				imprimirResumen({
					user: usr,
					expected: exp,
					diff: diff,
					obs: payload.observacion_cierre,
					base_inicial: j.data.base,
					stats: j.data.stats,
					turno: j.data.turno
				});
				modal.hide();
			}, 600);
		}catch(e){ showAlert('danger', e.message); }
	});

	function imprimirResumen(res){
		const html = [
			'<div style="font-family:Arial,sans-serif;font-size:12px">',
				'<h3 style="margin:0 0 8px">Cierre de Turno</h3>',
				// Linea de empresa
				('<div><strong>'+esc(localStorage.getItem('empresaNombre')||'')+'</strong>'+(localStorage.getItem('empresaNit')? ' - NIT: '+esc(localStorage.getItem('empresaNit')):'')+'</div>'),
				(res.turno?('<div>Turno #'+(res.turno.id_turno||'')+' | Usuario: '+esc(res.turno.usuario||localStorage.getItem('userName')||'')+'</div>'):''),
				(res.base_inicial!=null?('<div>Base inicial: <strong>'+fmt(res.base_inicial)+'</strong></div>'):''),
				'<div>Fecha: '+new Date().toLocaleString('es-CO')+'</div>',
				(res.stats?('<div>Tickets total: <strong>'+Number(res.stats.total||0)+'</strong></div>'):''),
				(res.stats?('<div>Carros: '+(res.stats.porTipo&&res.stats.porTipo.carro||0)+' | Motos: '+(res.stats.porTipo&&res.stats.porTipo.moto||0)+' | Bicis: '+(res.stats.porTipo&&res.stats.porTipo.bici||0)+'</div>'):''),
				'<hr/>',
				'<div style="display:flex;gap:16px">',
					'<div>',
						'<div style="font-weight:bold">Conteo usuario</div>',
						'<div>Efectivo: '+fmt(res.user.efectivo)+'</div>',
						'<div>Tarjeta: '+fmt(res.user.tarjeta)+'</div>',
						'<div>QR: '+fmt(res.user.qr)+'</div>',
						'<div><strong>Total: '+fmt(res.user.total)+'</strong></div>',
					'</div>',
					'<div>',
						'<div style="font-weight:bold">Sistema</div>',
						'<div>Efectivo: '+fmt(res.expected.efectivo)+'</div>',
						'<div>Tarjeta: '+fmt(res.expected.tarjeta)+'</div>',
						'<div>QR: '+fmt(res.expected.qr)+'</div>',
						'<div><strong>Total: '+fmt(res.expected.total)+'</strong></div>',
					'</div>',
				'</div>',
				'<hr/>',
				'<div><strong>Diferencia: '+fmt(res.diff)+'</strong></div>',
				(res.obs?('<div>Obs.: '+escapeHtml(res.obs)+'</div>'):'') ,
			'</div>'
		].join('');
		function printWidth(mm){
			const w = window.open('', '_blank', 'width=420,height=700');
			const css = `@page{ size: ${mm}mm auto; margin: 3mm } body{ width:${mm}mm; font-family: Arial, sans-serif; font-size:11px; margin:0 } .wrap{ padding:4mm } hr{ border:none; border-top:1px dashed #999; margin:6px 0 }`;
			w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cierre de Turno</title><style>'+css+'</style></head><body><div class="wrap">'+html+'</div><script>window.print(); setTimeout(()=>window.close(), 300);<'+'/'+'script></body></html>');
			w.document.close();
		}
		// Selector de tamaño (58mm / 80mm) con modal Bootstrap
		ensureSizeModal();
		const m = new bootstrap.Modal(document.getElementById('turnoPrintSizeModal'));
		const b58 = document.getElementById('btnPrint58');
		const b80 = document.getElementById('btnPrint80');
		const on58 = ()=>{ printWidth(58); cleanup(); };
		const on80 = ()=>{ printWidth(80); cleanup(); };
		function cleanup(){ b58.removeEventListener('click', on58); b80.removeEventListener('click', on80); m.hide(); }
		b58.addEventListener('click', on58);
		b80.addEventListener('click', on80);
		m.show();
	}
	function esc(s){ return String(s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

	function ensureSizeModal(){
		if (document.getElementById('turnoPrintSizeModal')) return;
		const div = document.createElement('div');
		div.innerHTML = [
			'<div class="modal fade" id="turnoPrintSizeModal" tabindex="-1" aria-hidden="true">',
				'<div class="modal-dialog">',
					'<div class="modal-content">',
						'<div class="modal-header">',
							'<h5 class="modal-title">Seleccionar tamaño de impresión</h5>',
							'<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>',
						'</div>',
						'<div class="modal-body">',
							'<p class="mb-2">Elige el ancho del papel térmico para imprimir el cierre.</p>',
							'<div class="d-flex gap-2">',
								'<button type="button" id="btnPrint58" class="btn btn-primary">58 mm</button>',
								'<button type="button" id="btnPrint80" class="btn btn-outline-primary">80 mm</button>',
							'</div>',
						'</div>',
						'<div class="modal-footer">',
							'<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>',
						'</div>',
					'</div>',
				'</div>',
			'</div>'
		].join('');
		document.body.appendChild(div.firstChild);
	}
	function fmt(n){ return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(Number(n||0)); }
	function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m])); }

	// Gating: bloquear acciones críticas si no hay turno
	window.requireOpenShift = exigirTurno;

	// Mostrar modal si entra al panel sin turno
	setTimeout(exigirTurno, 200);
})();


