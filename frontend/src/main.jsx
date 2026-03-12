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
    // Desregistrar SWs viejos (sin ?v=) — migración única
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const url = reg.active?.scriptURL || reg.installing?.scriptURL || '';
      if (!url.includes('?v=')) await reg.unregister();
    }
    // Limpiar todas las caches viejas
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));

    // Registrar nuevo SW versionado
    navigator.serviceWorker.register(`/sw.js?v=${__BUILD_TIME__}`)
      .catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
