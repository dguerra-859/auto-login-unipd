document.addEventListener('DOMContentLoaded', () => {
  const inputUser = document.getElementById('username');
  const selectDominio = document.getElementById('dominio');
  const inputPass = document.getElementById('password');
  const checkAutoSubmit = document.getElementById('autoSubmit');
  const btnSalva = document.getElementById('salva');
  const btnEntra = document.getElementById('entra');
  const btnEntraUniweb = document.getElementById('entraUniweb');
  const btnApriDashboard = document.getElementById('apriDashboard');
  const btnAggiornaDashboard = document.getElementById('aggiornaDashboard');
  const divStato = document.getElementById('stato');

  const avviaAccesso = (destinazione) => {
    chrome.runtime.sendMessage({ type: 'start-login-flow', destinazione }, (risposta) => {
      if (chrome.runtime.lastError) {
        divStato.textContent = 'Impossibile avviare il login.';
        console.error(chrome.runtime.lastError.message);
        return;
      }

      if (!risposta || !risposta.ok) {
        divStato.textContent = 'Impossibile avviare il login.';
        console.error(risposta && risposta.errore ? risposta.errore : 'Risposta non valida dal processo in background.');
      }
    });
  };

  // Carica eventuali dati già salvati quando si apre il popup
  chrome.storage.local.get(['unipd_user', 'unipd_dominio', 'unipd_pass', 'unipd_autosubmit'], (dati) => {
    if (dati.unipd_user) inputUser.value = dati.unipd_user;
    if (dati.unipd_dominio) selectDominio.value = dati.unipd_dominio;
    if (dati.unipd_pass) inputPass.value = dati.unipd_pass;
    if (typeof dati.unipd_autosubmit === 'boolean') {
      checkAutoSubmit.checked = dati.unipd_autosubmit;
    }
  });

  // Salva i dati al clic sul pulsante
  btnSalva.addEventListener('click', () => {
    const userPulito = inputUser.value.trim().split('@')[0];
    const dominioScelto = selectDominio.value;
    const passwordInserita = inputPass.value;
    const autoSubmit = checkAutoSubmit.checked;

    chrome.storage.local.set({
      unipd_user: userPulito,
      unipd_dominio: dominioScelto,
      unipd_pass: passwordInserita,
      unipd_autosubmit: autoSubmit
    }, () => {
      divStato.textContent = 'Impostazioni salvate!';
      setTimeout(() => {
        divStato.textContent = '';
      }, 2500);
    });
  });

  btnEntra.addEventListener('click', () => {
    avviaAccesso('stem');
  });

  btnEntraUniweb.addEventListener('click', () => {
    avviaAccesso('uniweb');
  });

  btnApriDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/dashboard.html') }, () => {
      if (chrome.runtime.lastError) {
        divStato.textContent = 'Impossibile aprire la dashboard.';
        console.error(chrome.runtime.lastError.message);
      }
    });
  });

  btnAggiornaDashboard.addEventListener('click', () => {
    divStato.textContent = 'Avvio aggiornamento in background...';
    btnAggiornaDashboard.disabled = true;
    chrome.runtime.sendMessage({ type: 'sync-dashboard' }, (risposta) => {
      btnAggiornaDashboard.disabled = false;
      if (chrome.runtime.lastError || !risposta) {
        divStato.textContent = chrome.runtime.lastError
          ? `Errore di comunicazione: ${chrome.runtime.lastError.message}`
          : 'Il processo in background non ha restituito una risposta.';
        console.error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Risposta non valida dal processo in background.');
        return;
      }

      divStato.textContent = risposta.messaggio;
      if (!risposta.ok) console.error(risposta.errore || risposta.messaggio);
    });
  });
});