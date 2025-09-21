document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('error-message');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            // Ocultar mensaje de error previo
            errorMessage.style.display = 'none';
            errorMessage.textContent = '';

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email, password }),
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Error al iniciar sesión.');
                }

                // Si el login es exitoso, redirigir según el rol
                if (result.role === 'admin') {
                    window.location.href = '/admin'; // Redirigir al panel de admin
                } else {
                    window.location.href = '/'; // Redirigir a la página principal para usuarios
                }

            } catch (error) {
                // Mostrar mensaje de error en la página
                errorMessage.textContent = error.message;
                errorMessage.style.display = 'block';
            }
        });
    }
});
