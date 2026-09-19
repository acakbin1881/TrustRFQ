import './polyfills'; // must be first — Buffer global before the SDK loads
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Tailwind bridge. Imported here (not linked from the HTML) so Vite owns it:
// public/*.css stay un-bundled runtime files, this one is part of the graph.
import './styles/theme.css';

/**
 * Hold the type animations until the webfont is in.
 *
 * Started before it lands, a line animates in the fallback face and then
 * re-lays out under the reader when Space Grotesk arrives — a jump that reads
 * as a second, worse animation. The CSS pauses anything text-shaped until
 * .tr-fonts is on <html> (see theme.css).
 *
 * The 900ms ceiling is the important half: a font that never loads — blocked,
 * offline, a slow CDN — must not cost the entrance entirely. Whichever
 * happens first wins, and a fallback-face animation beats no animation.
 */
const armType = () => document.documentElement.classList.add('tr-fonts');

if (document.fonts?.ready) {
  const ceiling = window.setTimeout(armType, 900);
  void document.fonts.ready.then(() => {
    window.clearTimeout(ceiling);
    armType();
  });
} else {
  armType();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
