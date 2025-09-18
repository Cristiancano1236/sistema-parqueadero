document.addEventListener('DOMContentLoaded', function() {
    // Verificar autenticación
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    // Inicializar DataTable
    const table = $('#vehiculosTable').DataTable({
        language: {
            url: '//cdn.datatables.net/plug-ins/1.13.7/i18n/es-ES.json'
        },
        order: [[4, 'desc']], // Ordenar por fecha de registro descendente
        columns: [
            { 
                data: 'placa',
                render: function(data, type, row){
                    return `<button class="btn btn-link p-0" onclick="verHistorial(${row.id_vehiculo}, '${data}')">${data}</button>`;
                }
            },
            { data: 'tipo' },
            { data: 'color' },
            { data: 'modelo' },
            { 
                data: 'fecha_registro',
                render: function(data) {
                    return new Date(data).toLocaleString('es-CO');
                }
            },
            { 
                data: 'estado',
                render: function(data) {
                    return data === 'activo' 
                        ? '<span class="badge bg-success">Activo</span>'
                        : '<span class="badge bg-secondary">Inactivo</span>';
                }
            },
            {
                data: null,
                render: function(data, type, row) {
                    return `
                        <button class="btn btn-sm btn-info me-1" onclick="editarVehiculo(${row.id_vehiculo})">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="eliminarVehiculo(${row.id_vehiculo})">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                }
            }
        ]
    });

    // Cargar datos iniciales
    cargarVehiculos();

    // Event Listeners
    document.getElementById('btnGuardar').addEventListener('click', guardarVehiculo);
    document.getElementById('filtroTipo').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroPlaca').addEventListener('input', aplicarFiltros);
    document.getElementById('btnLogout').addEventListener('click', cerrarSesion);
    document.getElementById('logoutDropdown').addEventListener('click', cerrarSesion);

    // Mostrar nombre del usuario
    document.getElementById('userName').textContent = localStorage.getItem('userName') || 'Usuario';
    // Ocultar menús admin para operadores
    if (localStorage.getItem('userRole') !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.add('d-none'));
    }

    // Toggle Sidebar
    document.querySelector('.sidebar-toggle').addEventListener('click', function() {
        document.querySelector('.sidebar').classList.toggle('show');
    });
});

// Función para cargar vehículos
async function cargarVehiculos() {
    try {
        const response = await fetch('/api/vehiculos', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Error al cargar los vehículos');
        }

        const data = await response.json();
        $('#vehiculosTable').DataTable().clear().rows.add(data).draw();

    } catch (error) {
        mostrarError('Error al cargar los vehículos');
        console.error(error);
    }
}

// Función para guardar vehículo
async function guardarVehiculo() {
    const vehiculoId = document.getElementById('vehiculoId').value;
    const vehiculo = {
        placa: document.getElementById('placa').value,
        tipo: document.getElementById('tipo').value,
        color: document.getElementById('color').value,
        modelo: document.getElementById('modelo').value
    };

    try {
        const url = vehiculoId 
            ? `/api/vehiculos/${vehiculoId}`
            : '/api/vehiculos';
        
        const response = await fetch(url, {
            method: vehiculoId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify(vehiculo)
        });

        if (!response.ok) {
            throw new Error('Error al guardar el vehículo');
        }

        // Cerrar modal y recargar datos
        $('#vehiculoModal').modal('hide');
        cargarVehiculos();
        mostrarExito(vehiculoId ? 'Vehículo actualizado' : 'Vehículo registrado');

    } catch (error) {
        mostrarError(error.message);
        console.error(error);
    }
}

// Función para editar vehículo
async function editarVehiculo(id) {
    try {
        const response = await fetch(`/api/vehiculos/${id}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Error al cargar los datos del vehículo');
        }

        const vehiculo = await response.json();
        
        // Llenar el formulario
        document.getElementById('vehiculoId').value = vehiculo.id_vehiculo;
        document.getElementById('placa').value = vehiculo.placa;
        document.getElementById('tipo').value = vehiculo.tipo;
        document.getElementById('color').value = vehiculo.color;
        document.getElementById('modelo').value = vehiculo.modelo || '';

        // Actualizar título del modal
        document.getElementById('modalTitle').textContent = 'Editar Vehículo';
        
        // Abrir modal
        $('#vehiculoModal').modal('show');

    } catch (error) {
        mostrarError(error.message);
        console.error(error);
    }
}

// Función para eliminar vehículo
async function eliminarVehiculo(id) {
    if (!confirm('¿Está seguro de eliminar este vehículo?')) {
        return;
    }

    try {
        const response = await fetch(`/api/vehiculos/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Error al eliminar el vehículo');
        }

        cargarVehiculos();
        mostrarExito('Vehículo eliminado');

    } catch (error) {
        mostrarError(error.message);
        console.error(error);
    }
}

// Función para aplicar filtros
function aplicarFiltros() {
    const tipo = document.getElementById('filtroTipo').value;
    const placa = document.getElementById('filtroPlaca').value.toLowerCase();

    $.fn.dataTable.ext.search.push(function(settings, data) {
        const cumpleTipo = !tipo || data[1] === tipo;
        const cumplePlaca = !placa || data[0].toLowerCase().includes(placa);
        return cumpleTipo && cumplePlaca;
    });

    $('#vehiculosTable').DataTable().draw();
    $.fn.dataTable.ext.search.pop();
}

// Ver historial por vehículo
async function verHistorial(idVehiculo, placa){
    try{
        const res = await fetch(`/api/vehiculos/${idVehiculo}/historial`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error obteniendo historial');
        const tb = document.getElementById('historialBody');
        document.getElementById('histPlaca').textContent = placa;
        if (!j.data || j.data.length === 0){
            tb.innerHTML = '<tr><td colspan="6" class="text-center">Sin registros</td></tr>';
        } else {
            tb.innerHTML = j.data.map(r => {
                const fmt = v => new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v||0);
                const total = Number(r.total_a_pagar || 0);
                const pagado = Number(r.total_pagado || 0);
                const diff = pagado - total;
                const estadoPago = total === 0 ? '-' : (diff >= 0 ? `Vuelto: ${fmt(Math.abs(diff))}` : `Falta: ${fmt(Math.abs(diff))}`);
                const badgeEstado = r.estado==='activo' ? 'success' : (diff>=0 && total>0 ? 'primary' : 'secondary');
                const pagosResumen = total>0
                    ? `${fmt(pagado)} ${r.pagos?`(${r.pagos})`:''} <br><small class="text-${diff>=0?'success':'danger'}">${estadoPago}</small>`
                    : (pagado>0 ? `${fmt(pagado)} ${r.pagos?`(${r.pagos})`:''}` : '-');
                return `
                <tr>
                    <td>${r.id_movimiento}</td>
                    <td>${new Date(r.fecha_entrada).toLocaleString('es-CO')}</td>
                    <td>${r.fecha_salida ? new Date(r.fecha_salida).toLocaleString('es-CO') : '-'}</td>
                    <td><span class="badge bg-${badgeEstado}">${r.estado}</span></td>
                    <td>${total ? fmt(total) : '-'}</td>
                    <td>${pagosResumen}</td>
                </tr>`;
            }).join('');
        }
        const modal = new bootstrap.Modal(document.getElementById('historialModal'));
        modal.show();
    }catch(err){
        alert('Error: ' + err.message);
    }
}

// Función para mostrar mensajes de éxito
function mostrarExito(mensaje) {
    // Implementar según el sistema de notificaciones que prefieras
    alert(mensaje);
}

// Función para mostrar mensajes de error
function mostrarError(mensaje) {
    // Implementar según el sistema de notificaciones que prefieras
    alert('Error: ' + mensaje);
}

// Función para cerrar sesión
function cerrarSesion() {
    localStorage.clear();
    window.location.href = '/';
}
