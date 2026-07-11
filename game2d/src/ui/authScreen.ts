// The login/register form — tab switching and submit handling. Calling
// code (main.ts) passes in what "authenticated" means (showing the
// character-select screen next, see characterSelect.ts), so this module
// doesn't need to know about Phaser or characters at all — account
// auth and character selection are two separate steps (item 1).
import { network } from '../state.js';

const authScreen = document.getElementById('auth-screen') as HTMLDivElement;
const authForm = document.getElementById('auth-form') as HTMLFormElement;
const emailLabel = document.getElementById('auth-email-label') as HTMLLabelElement;
const emailInput = document.getElementById('auth-email') as HTMLInputElement;
const usernameInput = document.getElementById('auth-username') as HTMLInputElement;
const passwordInput = document.getElementById('auth-password') as HTMLInputElement;
const authError = document.getElementById('auth-error') as HTMLDivElement;
const tabLogin = document.getElementById('tab-login') as HTMLButtonElement;
const tabRegister = document.getElementById('tab-register') as HTMLButtonElement;
const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement;

export function hideAuthScreen(): void {
  authScreen.hidden = true;
}

export function showAuthScreen(): void {
  authScreen.hidden = false;
}

let mode: 'login' | 'register' = 'login';
function setMode(next: 'login' | 'register'): void {
  mode = next;
  tabLogin.classList.toggle('active', mode === 'login');
  tabRegister.classList.toggle('active', mode === 'register');
  emailLabel.hidden = mode !== 'register';
  emailInput.required = mode === 'register';
  submitBtn.textContent = mode === 'register' ? 'Register' : 'Login';
}
tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));
setMode('login');

// `onAccountAuthenticated` fires once account-level login/register
// succeeds — NOT once a character is picked (see characterSelect.ts,
// which is what actually starts the game).
export function initAuthScreen(onAccountAuthenticated: () => void): void {
  authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    void handleAuthSubmit(onAccountAuthenticated);
  });
}

async function handleAuthSubmit(onAccountAuthenticated: () => void): Promise<void> {
  authError.textContent = '';
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    if (mode === 'register') {
      await network.register(emailInput.value.trim(), username, password);
    } else {
      await network.login(username, password);
    }
  } catch (err) {
    authError.textContent = err instanceof Error ? err.message : 'Request failed.';
    return;
  }

  onAccountAuthenticated();
}
