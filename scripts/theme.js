(() => {
  const chiaveTema = 'unipd_dashboard_theme_v1';
  const preferenzaSalvata = localStorage.getItem(chiaveTema);
  const preferenzaValida = ['system', 'light', 'dark'].includes(preferenzaSalvata);
  let preferenza = preferenzaValida ? preferenzaSalvata : 'system';
  const temaBrowser = window.matchMedia('(prefers-color-scheme: dark)');
  const metaTema = document.querySelector('meta[name="color-scheme"]');
  let pulsanteTema;

  function aggiornaTema() {
    const temaScuro = preferenza === 'dark' || (preferenza === 'system' && temaBrowser.matches);
    if (preferenza === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = preferenza;
    metaTema.content = temaScuro ? 'dark light' : 'light dark';

    if (!pulsanteTema) return;
    const etichetta = preferenza === 'system' ? 'automatico' : preferenza === 'dark' ? 'scuro' : 'chiaro';
    pulsanteTema.textContent = `Tema: ${etichetta}`;
    pulsanteTema.setAttribute('aria-label', `Cambia tema; modalità attuale: ${etichetta}`);
    pulsanteTema.title = 'Clicca per passare tra tema automatico, scuro e chiaro';
  }

  function cambiaTema() {
    if (preferenza === 'system') preferenza = temaBrowser.matches ? 'light' : 'dark';
    else if (preferenza === (temaBrowser.matches ? 'light' : 'dark')) {
      preferenza = temaBrowser.matches ? 'dark' : 'light';
    } else preferenza = 'system';
    localStorage.setItem(chiaveTema, preferenza);
    aggiornaTema();
  }

  function inizializzaPulsante() {
    pulsanteTema = document.getElementById('theme-toggle');
    pulsanteTema.addEventListener('click', cambiaTema);
    aggiornaTema();
  }

  temaBrowser.addEventListener('change', () => {
    if (preferenza === 'system') aggiornaTema();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inizializzaPulsante, { once: true });
  } else {
    inizializzaPulsante();
  }
})();
