import './polyfills'; // must be first — Buffer global before the SDK loads
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RfqDemo from './RfqDemo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RfqDemo />
  </StrictMode>,
);
