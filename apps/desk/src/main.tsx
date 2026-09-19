import './polyfills'; // must be first — Buffer global before the SDK loads
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Tailwind bridge. Imported here (not linked from the HTML) so Vite owns it:
// public/*.css stay un-bundled runtime files, this one is part of the graph.
import './styles/theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
