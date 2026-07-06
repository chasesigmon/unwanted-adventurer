import { useState, type FormEvent } from 'react';

export interface AuthScreenProps {
  errorMessage: string;
  onLogin: (username: string, password: string) => void;
  onRegister: (username: string, password: string) => void;
}

export function AuthScreen({ errorMessage, onLogin, onRegister }: AuthScreenProps): JSX.Element {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    onLogin(username.trim(), password);
    setPassword('');
  }

  function handleRegister(): void {
    onRegister(username.trim(), password);
    setPassword('');
  }

  return (
    <div id="login-overlay">
      <form id="login-form" onSubmit={handleSubmit}>
        <h1>Text Arena</h1>
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className="login-buttons">
          <button type="submit">Log In</button>
          <button type="button" id="register-button" onClick={handleRegister}>
            Register
          </button>
        </div>
        <div id="login-error">{errorMessage}</div>
      </form>
    </div>
  );
}
