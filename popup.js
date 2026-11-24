document.addEventListener('DOMContentLoaded', () => {
  const inputUser = document.getElementById('username');
  const selectDominio = document.getElementById('dominio');
  const inputPass = document.getElementById('password');
  const checkAutoSubmit = document.getElementById('autoSubmit');
  const btnSalva = document.getElementById('salva');
  const divStato = document.getElementById('stato');

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
});