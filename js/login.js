// Esperar a que el documento esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // Obtener el formulario
    const loginForm = document.getElementById('loginForm');

    // Función para validar el formulario
    loginForm.addEventListener('submit', function(event) {
        event.preventDefault();
        event.stopPropagation();

        // Validar el formulario usando las clases de Bootstrap
        if (loginForm.checkValidity()) {
            // Obtener los valores del formulario
            const usuario = document.getElementById('usuario').value;
            const password = document.getElementById('password').value;
            const recordar = document.getElementById('recordar').checked;

            // Aquí iría la lógica para enviar los datos al servidor
            console.log('Datos del formulario:', {
                usuario,
                password,
                recordar
            });

            // Simulación de envío (reemplazar con llamada real al servidor)
            mostrarCargando();
        }

        loginForm.classList.add('was-validated');
    });

    // Función para mostrar el estado de carga
    function mostrarCargando() {
        const boton = loginForm.querySelector('button[type="submit"]');
        const textoOriginal = boton.innerHTML;
        
        // Cambiar el texto del botón y deshabilitarlo
        boton.innerHTML = `
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            Iniciando sesión...
        `;
        boton.disabled = true;

        // Simular delay de carga (eliminar en producción)
        setTimeout(() => {
            boton.innerHTML = textoOriginal;
            boton.disabled = false;
        }, 2000);
    }

    // Prevenir que se muestre la validación antes del primer envío
    Array.from(loginForm.elements).forEach(element => {
        element.addEventListener('input', () => {
            if (!loginForm.classList.contains('was-validated')) return;
            loginForm.classList.add('was-validated');
        });
    });
});
