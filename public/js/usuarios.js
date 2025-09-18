// Gestión Frontend de Usuarios (admin)
// Relacionado con: public/admin/usuarios.html y API /api/usuarios

document.addEventListener('DOMContentLoaded', () => {
    // Auth y rol
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('userRole');
    if (!token) { window.location.href = '/'; return; }
    if (role !== 'admin') { window.location.href = '/admin/dashboard'; return; }

    document.getElementById('userName').textContent = localStorage.getItem('userName') || 'Usuario';
    document.querySelector('.sidebar-toggle').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('show'));
    document.getElementById('btnLogout').addEventListener('click',()=>{ localStorage.clear(); location.href='/'; });

    // Eventos
    document.getElementById('btnGuardarUsuario').addEventListener('click', guardarUsuario);

    // Cargar lista
    cargarUsuarios();
});

async function cargarUsuarios(){
    try{
        const res = await fetch('/api/usuarios', { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }});
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error listando usuarios');
        const tbody = document.querySelector('#usuariosTable tbody');
        tbody.innerHTML = j.data.map(u => `
            <tr>
                <td>${u.nombre}</td>
                <td>${u.usuario_login}</td>
                <td><span class="badge bg-${u.rol==='admin'?'primary':'secondary'} text-uppercase">${u.rol}</span></td>
                <td>${u.activo ? '<span class="badge bg-success">Sí</span>' : '<span class="badge bg-secondary">No</span>'}</td>
                <td>${u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-CO') : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-info me-1" onclick='editar(${JSON.stringify(u)})'><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-warning me-1" onclick='abrirCambioClave(${JSON.stringify({id:u.id_usuario, login:u.usuario_login, nombre:u.nombre})})'><i class="fas fa-key"></i></button>
                    <button class="btn btn-sm btn-danger" onclick='desactivar(${u.id_usuario})'><i class="fas fa-user-slash"></i></button>
                </td>
            </tr>
        `).join('');
    }catch(err){ toast('Error', err.message, 'error'); }
}

function editar(u){
    document.getElementById('usuarioId').value = u.id_usuario;
    document.getElementById('usuarioModalTitle').textContent = 'Editar Usuario';
    document.getElementById('nombre').value = u.nombre;
    document.getElementById('usuario_login').value = u.usuario_login;
    document.getElementById('contraseña').value = '';
    document.getElementById('rol').value = u.rol;
    document.getElementById('activo').checked = !!u.activo;
    const modal = new bootstrap.Modal(document.getElementById('usuarioModal'));
    modal.show();
}

async function desactivar(id){
    if(!confirm('¿Desactivar este usuario?')) return;
    try{
        const res = await fetch(`/api/usuarios/${id}`, { method:'DELETE', headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }});
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error');
        toast('Éxito','Usuario desactivado','success');
        cargarUsuarios();
    }catch(err){ toast('Error', err.message, 'error'); }
}

async function guardarUsuario(){
    const id = document.getElementById('usuarioId').value;
    const body = {
        nombre: document.getElementById('nombre').value.trim(),
        usuario_login: document.getElementById('usuario_login').value.trim(),
        contraseña: document.getElementById('contraseña').value,
        rol: document.getElementById('rol').value,
        activo: document.getElementById('activo').checked
    };
    // Validaciones frontend
    const errors = [];
    const usernameRegex = /^[A-Za-z0-9]+$/; // sin espacios, guiones ni especiales
    if (!body.nombre) errors.push('El nombre es requerido.');
    if (!body.usuario_login) errors.push('El nombre de usuario es requerido.');
    if (body.usuario_login && !usernameRegex.test(body.usuario_login)) errors.push('Usuario solo puede tener letras y números (sin espacios ni guiones).');
    if (!id && !body.contraseña) errors.push('La contraseña es requerida.');
    if (body.contraseña && body.contraseña.length < 6) errors.push('La contraseña debe tener al menos 6 caracteres.');
    if (!['admin','operador'].includes(body.rol)) errors.push('Selecciona un rol válido.');
    if (errors.length) { mostrarErroresFormulario(errors); return; }
    limpiarErroresFormulario();
    
    // Indicador de carga
    const btn = document.getElementById('btnGuardarUsuario');
    const prevHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';
    if (id) { if (!body.contraseña) { delete body.contraseña; } }
    try{
        const res = await fetch(id ? `/api/usuarios/${id}` : '/api/usuarios', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify(body)
        });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'Error guardando usuario');
        toast('Éxito', id ? 'Usuario actualizado' : 'Usuario creado', 'success');
        document.getElementById('usuarioForm').reset();
        document.getElementById('usuarioId').value='';
        document.getElementById('usuarioModalTitle').textContent = 'Nuevo Usuario';
        bootstrap.Modal.getInstance(document.getElementById('usuarioModal')).hide();
        cargarUsuarios();
    }catch(err){ mostrarErroresFormulario([err.message]); }
    finally {
        btn.disabled = false;
        btn.innerHTML = prevHtml;
    }
}

function toast(title, message, type){
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

// UI helpers para errores bajo los campos
function mostrarErroresFormulario(messages){
    const cont = document.getElementById('usuarioForm');
    // Reset estados
    limpiarErroresFormulario();
    // Mostrar alert general
    let alert = cont.querySelector('.alert');
    if (!alert) {
        alert = document.createElement('div');
        alert.className = 'alert alert-danger';
        cont.prepend(alert);
    }
    alert.innerHTML = messages.map(m=>`<div>${m}</div>`).join('');
    // Marcar campos si aplica
    const username = document.getElementById('usuario_login');
    const pass = document.getElementById('contraseña');
    const usernameRegex = /^[A-Za-z0-9]+$/;
    if (username.value && !usernameRegex.test(username.value)) username.classList.add('is-invalid');
    if (pass.value && pass.value.length < 6) pass.classList.add('is-invalid');
}

function limpiarErroresFormulario(){
    const cont = document.getElementById('usuarioForm');
    const alert = cont.querySelector('.alert');
    if (alert) alert.remove();
    cont.querySelectorAll('.is-invalid').forEach(el=> el.classList.remove('is-invalid'));
}

// Cambio de clave - UI y lógica. Relacionado con modal #passwordModal en public/admin/usuarios.html y endpoint PUT /api/usuarios/:id
function abrirCambioClave(data){
    // data: { id, login, nombre }
    document.getElementById('pwd_user_id').value = data.id;
    document.getElementById('pwd_user_login').value = `${data.login} (${data.nombre})`;
    document.getElementById('pwd_new').value = '';
    document.getElementById('pwd_confirm').value = '';
    const alert = document.getElementById('pwd_alert');
    alert.className = 'alert d-none';
    alert.textContent = '';
    // toggle ver/ocultar
    const toggleBtn = document.getElementById('pwd_toggle');
    const inputPwd = document.getElementById('pwd_new');
    toggleBtn.onclick = ()=>{
        const t = inputPwd.type === 'password' ? 'text' : 'password';
        inputPwd.type = t;
        toggleBtn.innerHTML = t === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    };
    // Guardar
    document.getElementById('btnPwdSave').onclick = cambiarClave;
    new bootstrap.Modal(document.getElementById('passwordModal')).show();
}

async function cambiarClave(){
    const id = document.getElementById('pwd_user_id').value;
    const pass1 = document.getElementById('pwd_new').value;
    const pass2 = document.getElementById('pwd_confirm').value;
    const alert = document.getElementById('pwd_alert');
    // Validaciones
    const msgs = [];
    if (!pass1) msgs.push('La nueva contraseña es obligatoria.');
    if (pass1 && pass1.length < 6) msgs.push('La contraseña debe tener al menos 6 caracteres.');
    if (pass1 !== pass2) msgs.push('Las contraseñas no coinciden.');
    if (msgs.length){
        alert.className = 'alert alert-danger';
        alert.innerHTML = msgs.map(m=>`<div>${m}</div>`).join('');
        return;
    }
    // Llamado API
    const btn = document.getElementById('btnPwdSave');
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Guardando...';
    try{
        const res = await fetch(`/api/usuarios/${id}`,{
            method:'PUT',
            headers:{'Content-Type':'application/json','Authorization':`Bearer ${localStorage.getItem('token')}`},
            body: JSON.stringify({ contraseña: pass1 })
        });
        const j = await res.json();
        if(!res.ok) throw new Error(j.message||'No se pudo actualizar la contraseña');
        alert.className = 'alert alert-success';
        alert.textContent = 'Contraseña actualizada correctamente.';
        setTimeout(()=>{
            bootstrap.Modal.getInstance(document.getElementById('passwordModal')).hide();
        }, 600);
    }catch(err){
        alert.className = 'alert alert-danger';
        alert.textContent = err.message;
    }finally{
        btn.disabled = false;
        btn.innerHTML = prev;
    }
}


