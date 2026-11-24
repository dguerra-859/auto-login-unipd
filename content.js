function avviaEstensioneUniPD() {
  chrome.storage.local.get(['unipd_user', 'unipd_dominio', 'unipd_pass', 'unipd_autosubmit'], (dati) => {
    // Non fa nulla se l'utente non ha ancora inserito i dati nel popup
    if (!dati.unipd_user || !dati.unipd_pass) return;

    const host = window.location.hostname;

    // CASO 1: Pagina intermedia Moodle (es. stem.elearning.unipd.it/login/index.php)
    if (host.endsWith('elearning.unipd.it')) {
      // Evita loop se Moodle sta mostrando un errore di login
      const erroreLogin = document.getElementById('loginerrormessage');
      if (erroreLogin && erroreLogin.textContent.trim() !== '') return;

      // Cerca il pulsante "SingleSignOn - UniPD"
      const bottoneSSO = document.querySelector('a.login-identityprovider-btn[href*="shibboleth"]');
      if (bottoneSSO) {
        bottoneSSO.click();
      }
      return;
    }

    // CASO 2: Pagina effettiva di login Shibboleth (shibidp.cca.unipd.it)
    if (host === 'shibidp.cca.unipd.it') {
      const userPulito = dati.unipd_user.split('@')[0];
      const idRadio = dati.unipd_dominio || 'radio2'; // Default: @studenti.unipd.it
      const autoSubmit = dati.unipd_autosubmit !== false;

      // 1. Seleziona il radio button del dominio
      const radioScelto = document.getElementById(idRadio);
      if (radioScelto) {
        radioScelto.checked = true;
        radioScelto.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // 2. Individua i campi reali visibili
      const campoUserVisibile = document.getElementById('j_username_js');
      const campoUserNascosto = document.getElementById('j_username');
      const campoPass = document.getElementById('password');
      const bottoneAccedi = document.getElementById('login_button_js');

      if (!campoUserVisibile || !campoPass) return;

      const suffissi = {
        radio1: '@unipd.it',
        radio2: '@studenti.unipd.it',
        radio3: '@ext.unipd.it'
      };

      campoUserVisibile.value = userPulito;
      campoUserVisibile.dispatchEvent(new Event('input', { bubbles: true }));
      campoUserVisibile.dispatchEvent(new Event('change', { bubbles: true }));

      if (campoUserNascosto) {
        campoUserNascosto.value = userPulito + (suffissi[idRadio] || '@studenti.unipd.it');
      }

      campoPass.value = dati.unipd_pass;
      campoPass.dispatchEvent(new Event('input', { bubbles: true }));
      campoPass.dispatchEvent(new Event('change', { bubbles: true }));

      // 3. Clicca su Accedi
      if (autoSubmit && bottoneAccedi) {
        setTimeout(() => {
          bottoneAccedi.click();
        }, 300);
      }
    }
  });
}

// Su Moodle parte subito al caricamento; su Shibboleth attende 300ms per superare initOverLabels()
if (window.location.hostname.endsWith('elearning.unipd.it')) {
  avviaEstensioneUniPD();
} else {
  if (document.readyState === 'complete') {
    setTimeout(avviaEstensioneUniPD, 300);
  } else {
    window.addEventListener('load', () => {
      setTimeout(avviaEstensioneUniPD, 300);
    });
  }
}