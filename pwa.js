// pwa.js
(function () {
  const installBtn = document.getElementById('installAppBtn');
  const installStatus = document.getElementById('installStatus');
  let deferredPrompt = null;

  function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function setInstallStatus(message) {
    if (!installStatus) return;
    installStatus.textContent = message;
    installStatus.classList.add('visible');
    setTimeout(() => installStatus.classList.remove('visible'), 2400);
  }

  function hideInstallButton() {
    if (installBtn) installBtn.classList.add('hiddenInstall');
  }

  function showInstallButton() {
    if (installBtn) installBtn.classList.remove('hiddenInstall');
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js');

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setInstallStatus('Actualizacion disponible. Recarga la app.');
          }
        });
      });
    } catch (err) {
      console.error('Error registrando Service Worker:', err);
    }
  }

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      setInstallStatus('Instalando app...');
      hideInstallButton();
    }

    deferredPrompt = null;
  }

  function initInstallFlow() {
    if (!installBtn) return;

    if (isStandaloneMode()) {
      hideInstallButton();
      return;
    }

    hideInstallButton();

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
      hideInstallButton();
      setInstallStatus('App instalada correctamente.');
      deferredPrompt = null;
    });

    installBtn.addEventListener('click', handleInstallClick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerServiceWorker();
      initInstallFlow();
    });
  } else {
    registerServiceWorker();
    initInstallFlow();
  }
})();
