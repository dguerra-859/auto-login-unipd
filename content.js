const chiaveOverlayCaricamento = 'unipd-login-loading';

function mostraCaricamentoSeAttivo() {
  chrome.storage.local.get(['unipd_action_stage', 'unipd_action_time'], (dati) => {
    const scaduta = !dati.unipd_action_time || Date.now() - dati.unipd_action_time > 120000;
    const fasiAttive = ['root', 'login', 'shibboleth', 'uniweb_root', 'uniweb_shibboleth'];

    if (scaduta || !fasiAttive.includes(dati.unipd_action_stage)) {
      if (dati.unipd_action_stage && scaduta) {
        chrome.storage.local.remove(['unipd_action_stage', 'unipd_action_time']);
      }
      return;
    }

    if (!document.documentElement || document.getElementById(chiaveOverlayCaricamento)) return;

    const overlay = document.createElement('div');
    overlay.id = chiaveOverlayCaricamento;
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');

    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('logo.png');
    logo.alt = 'Universita degli Studi di Padova';

    const testo = document.createElement('div');
    testo.textContent = 'Accesso UniPD in corso...';

    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');

    overlay.append(logo, testo, spinner);
    document.documentElement.append(overlay);
    window.setTimeout(() => overlay.remove(), 120000);
  });
}

mostraCaricamentoSeAttivo();

function avviaEstensioneUniPD() {
  chrome.storage.local.get(['unipd_user', 'unipd_dominio', 'unipd_pass', 'unipd_autosubmit', 'unipd_action_stage', 'unipd_action_time'], (dati) => {
    // Non fa nulla se l'utente non ha ancora inserito i dati nel popup
    if (!dati.unipd_user || !dati.unipd_pass) {
      chrome.storage.local.remove(['unipd_action_stage', 'unipd_action_time']);
      const overlay = document.getElementById(chiaveOverlayCaricamento);
      if (overlay) overlay.remove();
      return;
    }

    const host = window.location.hostname;
    const actionScaduta = !dati.unipd_action_time || Date.now() - dati.unipd_action_time > 120000;
    const actionStage = actionScaduta ? null : dati.unipd_action_stage;

    const azzeraAzione = () => {
      chrome.storage.local.remove(['unipd_action_stage', 'unipd_action_time']);
      const overlay = document.getElementById(chiaveOverlayCaricamento);
      if (overlay) overlay.remove();
    };

    // Uniweb: il pulsante della popup clicca il link Login; l'uso manuale resta passivo
    if (host === 'uniweb.unipd.it') {
      if (actionStage !== 'uniweb_root') {
        if (actionStage) azzeraAzione();
        return;
      }

      const linkLogin = document.getElementById('menu_link-navbox_account_auth/Logon')
        || document.querySelector('a[href*="/auth/Logon.do"]');

      if (linkLogin) {
        const urlLogin = linkLogin.href;
        chrome.storage.local.set({
          unipd_action_stage: 'uniweb_shibboleth',
          unipd_action_time: Date.now()
        }, () => {
          window.location.assign(urlLogin);
        });
      } else {
        azzeraAzione();
      }
      return;
    }

    // CASO 1: Pagina Moodle, gestita solo quando il pulsante della popup ha avviato il flusso
    if (host.endsWith('elearning.unipd.it')) {
      if (!actionStage) {
        if (dati.unipd_action_stage) azzeraAzione();
        return;
      }

      // Dalla radice, cerca e clicca il link Login.
      if (actionStage === 'root') {
        const selettoriLogin = [
          'a[href*="/login/index.php"]',
          'a[href*="/login/"]',
          'a.login'
        ];
        let linkLogin = null;
        for (const selettore of selettoriLogin) {
          linkLogin = document.querySelector(selettore);
          if (linkLogin) break;
        }

        if (!linkLogin) {
          linkLogin = Array.from(document.querySelectorAll('a')).find((link) =>
            link.textContent.trim().toLowerCase() === 'login'
          );
        }

        if (linkLogin) {
          const urlLogin = linkLogin.href;
          chrome.storage.local.set({
            unipd_action_stage: 'login',
            unipd_action_time: Date.now()
          }, () => {
            window.location.assign(urlLogin);
          });
        } else {
          // Nessun link Login: si tratta probabilmente di una sessione gia autenticata.
          azzeraAzione();
        }
        return;
      }

      if (actionStage !== 'login') {
        const endpointShibboleth = actionStage === 'shibboleth'
          && window.location.pathname.startsWith('/auth/shibboleth/');
        if (endpointShibboleth) {
          window.setTimeout(() => {
            if (window.location.pathname.startsWith('/auth/shibboleth/')) {
              azzeraAzione();
            }
          }, 15000);
        } else {
          azzeraAzione();
        }
        return;
      }

      // Evita loop se Moodle sta mostrando un errore di login
      const erroreLogin = document.getElementById('loginerrormessage');
      if (erroreLogin && erroreLogin.textContent.trim() !== '') {
        azzeraAzione();
        return;
      }

      // Cerca il pulsante "SingleSignOn - UniPD"
      const bottoneSSO = document.querySelector('a.login-identityprovider-btn[href*="shibboleth"]');
      if (bottoneSSO) {
        const urlSSO = bottoneSSO.href;
        chrome.storage.local.set({
          unipd_action_stage: 'shibboleth',
          unipd_action_time: Date.now()
        }, () => {
          window.location.assign(urlSSO);
        });
      } else {
        azzeraAzione();
      }
      return;
    }

    // CASO 2: Pagina effettiva di login Shibboleth (shibidp.cca.unipd.it)
    if (host === 'shibidp.cca.unipd.it') {
      if (actionStage !== 'shibboleth' && actionStage !== 'uniweb_shibboleth') {
        if (actionStage) azzeraAzione();
        return;
      }

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

      if (!campoUserVisibile || !campoPass) {
        azzeraAzione();
        return;
      }

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
          chrome.storage.local.remove(['unipd_action_stage', 'unipd_action_time']);
          const overlay = document.getElementById(chiaveOverlayCaricamento);
          if (overlay) window.setTimeout(() => overlay.remove(), 10000);
        }, 300);
      } else {
        azzeraAzione();
      }
    }
  });
}

const hostname = window.location.hostname;
const avviaDopoCaricamentoDom = () => {
  const ritardo = hostname === 'shibidp.cca.unipd.it' ? 300 : 0;
  setTimeout(avviaEstensioneUniPD, ritardo);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', avviaDopoCaricamentoDom, { once: true });
} else {
  avviaDopoCaricamentoDom();
}