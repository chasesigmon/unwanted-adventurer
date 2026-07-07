import { useState, type FormEvent } from 'react';
import { RACES } from '../../shared/constants.js';

export interface AuthScreenProps {
  errorMessage: string;
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string, race: string) => void;
}

type Tab = 'login' | 'register';

export function AuthScreen({ errorMessage, onLogin, onRegister }: AuthScreenProps): JSX.Element {
  const [tab, setTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [race, setRace] = useState<string>(RACES[0]);

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (tab === 'login') {
      onLogin(username.trim(), password);
    } else {
      onRegister(username.trim(), password, race);
    }
    setPassword('');
  }

  return (
    <div id="login-overlay">
      <form id="login-form" onSubmit={handleSubmit}>
        <h1>Text Arena</h1>
        <div id="auth-tabs">
          <button
            type="button"
            className={`auth-tab${tab === 'login' ? ' auth-tab--active' : ''}`}
            onClick={() => setTab('login')}
          >
            Login
          </button>
          <button
            type="button"
            className={`auth-tab${tab === 'register' ? ' auth-tab--active' : ''}`}
            onClick={() => setTab('register')}
          >
            Register
          </button>
        </div>
        <p>Type a command and press Enter: w/up, a, s/down, d. Type &quot;logout&quot; to end your session.</p>
        <input
          id="username-input"
          type="text"
          placeholder="Username"
          maxLength={16}
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          id="password-input"
          type="password"
          placeholder="Password"
          minLength={8}
          maxLength={128}
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {tab === 'register' && (
          <select id="race-select" value={race} onChange={(e) => setRace(e.target.value)}>
            {RACES.map((r) => (
              <option key={r} value={r}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
        )}
        <button type="submit">{tab === 'login' ? 'Log In' : 'Register'}</button>
        <div id="login-error">{errorMessage}</div>
      </form>
    </div>
  );
}
