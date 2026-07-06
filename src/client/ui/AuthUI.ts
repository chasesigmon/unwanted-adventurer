import type { NetworkManager } from '../net/NetworkManager.js';
import { getElement } from '../dom.js';

type AuthAction = 'login' | 'register';

export function initAuthUI(network: NetworkManager, onAuthenticated: () => void): void {
  const form = getElement<HTMLFormElement>('login-form');
  const usernameInput = getElement<HTMLInputElement>('username-input');
  const passwordInput = getElement<HTMLInputElement>('password-input');
  const errorEl = getElement('login-error');
  const registerButton = getElement<HTMLButtonElement>('register-button');

  async function submit(action: AuthAction): Promise<void> {
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
      errorEl.textContent = err instanceof Error ? err.message : String(err);
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void submit('login');
  });

  registerButton.addEventListener('click', (e) => {
    e.preventDefault();
    void submit('register');
  });
}
