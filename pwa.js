/* Easy Agenda — web app: service worker, botão "Instalar" e cor da barra do navegador */
(() => {
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // A cor da barra do navegador acompanha o tema (claro/escuro/sistema)
  const meta = document.querySelector('meta[name="theme-color"]');
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  const sync = () => {
    if (!meta) return;
    const t = document.documentElement.dataset.theme;
    meta.content = (t ? t === 'dark' : darkMq.matches) ? '#1b1d2b' : '#f4f6fb';
  };
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (darkMq.addEventListener) darkMq.addEventListener('change', sync);
  sync();

  // Botão "Instalar"
  const btn = document.getElementById('installBtn');
  const tip = document.getElementById('installTip');
  if (!btn) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return;
  let deferred = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; btn.hidden = false; });
  addEventListener('appinstalled', () => { deferred = null; btn.hidden = true; if (tip) tip.hidden = true; });
  // iPhone/iPad não têm o pedido automático: mostra o botão com instruções
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) btn.hidden = false;
  btn.addEventListener('click', async () => {
    if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; btn.hidden = true; return; }
    if (tip) tip.hidden = !tip.hidden;
  });
})();
