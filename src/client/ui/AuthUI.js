export function initAuthUI(network, onAuthenticated) {
  const form = document.getElementById('login-form');
  const usernameInput = document.getElementById('username-input');
  const passwordInput = document.getElementById('password-input');
  const errorEl = document.getElementById('login-error');
  const registerButton = document.getElementById('register-button');

  async function submit(action) {
    errorEl.textContent = '';
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
      if (action === 'register') await network.register(username, password);
      else await network.login(username, password);

      passwordInput.value = '';
      network.connectSocket();
      onAuthenticated();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit('login');
  });

  registerButton.addEventListener('click', (e) => {
    e.preventDefault();
    submit('register');
  });
}
