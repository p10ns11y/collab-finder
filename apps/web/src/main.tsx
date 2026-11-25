import '@w3c/webmcp-polyfill/auto';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ProofProvider } from './cards.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode><ProofProvider><App /></ProofProvider></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js'); });
}
