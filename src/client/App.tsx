import { AuthScreen } from './components/AuthScreen.js';
import { GameScreen } from './components/GameScreen.js';
import { useGameConnection } from './hooks/useGameConnection.js';

export function App(): JSX.Element {
  const { state, login, register, sendCommand } = useGameConnection();

  if (state.screen === 'auth') {
    return <AuthScreen errorMessage={state.authError} onLogin={login} onRegister={register} />;
  }

  return (
    <GameScreen
      player={state.player}
      minimap={state.minimap}
      room={state.room}
      monsterMessage={state.monsterMessage}
      combat={state.combat}
      messages={state.messages}
      onCommand={sendCommand}
    />
  );
}
