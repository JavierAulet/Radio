import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Capturar beforeinstallprompt lo antes posible, antes de que React monte
window.__pwaPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__pwaPrompt = e;
  // Notificar a React si ya está montado
  window.dispatchEvent(new Event('pwaPromptReady'));
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    // Limpiar todos los SWs y caches anteriores
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    // Registrar SW mínimo (solo para PWA instalable)
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
