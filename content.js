function eseguiLoginUniPD() {
  chrome.storage.local.get(['unipd_user', 'unipd_dominio', 'unipd_pass', 'unipd_autosubmit'], (dati) => {
    // Se l'utente non ha ancora configurato username e password nel popup, non fa nulla
    if (!dati.unipd_user || !dati.unipd_pass) return;

    const userPulito = dati.unipd_user.split('@')[0];
    const idRadio = dati.unipd_dominio || 'radio2'; // Default: @studenti.unipd.it
    const autoSubmit = dati.unipd_autosubmit !== false;

    // 1. Seleziona il radio button del dominio scelto (radio1, radio2 o radio3)
    const radioScelto = document.getElementById(idRadio);
    if (radioScelto) {
      radioScelto.checked = true;
      radioScelto.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // 2. Individua i campi visibili reali della pagina
    const campoUserVisibile = document.getElementById('j_username_js');
    const campoUserNascosto = document.getElementById('j_username');
    const campoPass = document.getElementById('password');
    const bottoneAccedi = document.getElementById('login_button_js');

    if (!campoUserVisibile || !campoPass) return;

    // 3. Mappa il suffisso dominio per il campo nascosto
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

    // 4. Invia il modulo se l'opzione è attiva
    if (autoSubmit && bottoneAccedi) {
      setTimeout(() => {
        bottoneAccedi.click();
      }, 300);
    }
  });
}

// Attende 300ms dopo il caricamento completo per superare initOverLabels() della pagina
if (document.readyState === 'complete') {
  setTimeout(eseguiLoginUniPD, 300);
} else {
  window.addEventListener('load', () => {
    setTimeout(eseguiLoginUniPD, 300);
  });
}