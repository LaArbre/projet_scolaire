const card = document.getElementById('card');

function toggleCard() {
    card.classList.toggle('flipped');
}

function animateFields(form, fields, className, duration = 1500) {
    fields.forEach(fieldName => {
        const field = form.querySelector(`[name="${fieldName}"]`);
        if (field) {
            const inputGroup = field.closest('.input-group');
            if (inputGroup) {
                inputGroup.classList.add(className);
            }
        }
    });

    setTimeout(() => {
        fields.forEach(fieldName => {
            const field = form.querySelector(`[name="${fieldName}"]`);
            if (field) {
                const inputGroup = field.closest('.input-group');
                if (inputGroup) {
                    inputGroup.classList.remove(className);
                }
            }
        });
    }, duration);
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const emailField = form.elements.email;
    const passwordField = form.elements.password;
    const email = emailField.value;
    const password = passwordField.value;

    if (!email || !password) {
        animateFields(form, ['email', 'password'], 'error');
        return;
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (data.success) {
            animateFields(form, ['email', 'password'], 'success');
            setTimeout(() => {
                window.location.href = '/dashboard/';
            }, 500);
        } else if (data.error) {
            animateFields(form, data.fields, 'error');
            if (data.fields.length === 0) {
                setTimeout(() => alert('Erreur serveur, réessayez plus tard.'), 500);
            }
        }
    } catch (error) {
        console.error('Erreur réseau / serveur (login) :', error);
        animateFields(form, ['email', 'password'], 'error');
        setTimeout(() => alert('Impossible de contacter le serveur.'), 500);
    }
});

document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const nameField = form.elements.name;
    const emailField = form.elements.email;
    const passwordField = form.elements.password;
    const confirmField = form.elements.confirm;

    const fullname = nameField.value;
    const email = emailField.value;
    const password = passwordField.value;
    const confirm = confirmField.value;

    if (!fullname || !email || !password || !confirm) {
        const emptyFields = [];
        if (!fullname) emptyFields.push('name');
        if (!email) emptyFields.push('email');
        if (!password) emptyFields.push('password');
        if (!confirm) emptyFields.push('confirm');
        animateFields(form, emptyFields, 'error');
        return;
    }

    if (password !== confirm) {
        animateFields(form, ['password', 'confirm'], 'error');
        return;
    }

    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ fullname, email, password })
        });
        const data = await res.json();

        if (data.success) {
            animateFields(form, ['name', 'email', 'password', 'confirm'], 'success');
            setTimeout(() => {
                window.location.href = '/dashboard/';
            }, 2000);
        } else if (data.error) {
            animateFields(form, data.fields, 'error');
            if (data.fields.length === 0) {
                setTimeout(() => alert('Erreur serveur, réessayez plus tard.'), 500);
            }
        }
    } catch (error) {
        console.error('Erreur réseau / serveur (register) :', error);
        animateFields(form, ['name', 'email', 'password', 'confirm'], 'error');
        setTimeout(() => alert('Impossible de contacter le serveur.'), 500);
    }
});

window.onload = () => {
    card.style.transition = 'transform 1.2s cubic-bezier(0.34, 1.2, 0.64, 1)';
};