import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Expected #root to exist in the DOM.');
}

createRoot(container).render(<App />);
