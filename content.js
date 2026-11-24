const chiaveOverlayCaricamento = 'unipd-login-loading';
const durataFlussoLogin = 120000;

function rimuoviOverlayCaricamento() {
  const overlay = document.getElementById(chiaveOverlayCaricamento);
  if (overlay) overlay.remove();
}

function leggiFlussoLogin(callback) {
  chrome.runtime.sendMessage({ type: 'get-login-flow' }, (flusso) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      callback(null);
      return;
    }

    callback(flusso);
  });
}

function aggiornaFaseLogin(fase, callback) {
  chrome.runtime.sendMessage({ type: 'update-login-flow', fase }, (risposta) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      azzeraFlussoLogin();
      return;
    }

    if (!risposta || !risposta.ok) {
      console.error(risposta && risposta.errore ? risposta.errore : 'Impossibile aggiornare il flusso di login.');
      azzeraFlussoLogin();
      return;
    }

    callback();
  });
}

function azzeraFlussoLogin(rimuoviOverlay) {
  chrome.runtime.sendMessage({ type: 'clear-login-flow' }, () => {
    if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
  });
  if (rimuoviOverlay !== false) rimuoviOverlayCaricamento();
}

function mostraCaricamentoSeAttivo() {
  leggiFlussoLogin((flusso) => {
    const fasiAttive = ['root', 'login', 'shibboleth', 'uniweb_root', 'uniweb_shibboleth'];
    if (!flusso || Date.now() - flusso.aggiornatoIl > durataFlussoLogin || !fasiAttive.includes(flusso.fase)) {
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
    window.setTimeout(rimuoviOverlayCaricamento, durataFlussoLogin);
  });
}

mostraCaricamentoSeAttivo();

function avviaEstensioneUniPD(tentativi = 0) {
  chrome.storage.local.get(['unipd_user', 'unipd_dominio', 'unipd_pass', 'unipd_autosubmit'], (dati) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      rimuoviOverlayCaricamento();
      return;
    }

    if (!dati.unipd_user || !dati.unipd_pass) {
      azzeraFlussoLogin();
      return;
    }

    leggiFlussoLogin((flusso) => {
      if (!flusso || Date.now() - flusso.aggiornatoIl > durataFlussoLogin) {
        rimuoviOverlayCaricamento();
        return;
      }

      const host = window.location.hostname;
      const actionStage = flusso.fase;

      if (host === 'uniweb.unipd.it') {
        if (actionStage === 'uniweb_shibboleth') {
          if (window.location.pathname.startsWith('/auth/Logon.do')) {
            window.setTimeout(() => {
              if (window.location.pathname.startsWith('/auth/Logon.do')) {
                azzeraFlussoLogin();
              }
            }, 15000);
          } else {
            azzeraFlussoLogin();
          }
          return;
        }

        if (actionStage === 'uniweb_root') {
          const linkLogin = document.getElementById('menu_link-navbox_account_auth/Logon')
            || document.querySelector('a[href*="/auth/Logon.do"]');
          if (!linkLogin) {
            azzeraFlussoLogin();
            return;
          }

          aggiornaFaseLogin('uniweb_shibboleth', () => {
            window.location.assign(linkLogin.href);
          });
          return;
        }

        azzeraFlussoLogin();
        return;
      }

      if (host.endsWith('elearning.unipd.it')) {
        if (actionStage === 'root') {
          const nonAutenticato = document.body.classList.contains('notloggedin');
          if (!nonAutenticato) {
            azzeraFlussoLogin();
            return;
          }

          const linkLogin = Array.from(document.querySelectorAll('a[href]')).find((link) => {
            const url = new URL(link.href, window.location.href);
            return url.origin === window.location.origin
              && url.pathname.replace(/\/+$/, '') === '/login/index.php';
          });

          if (!linkLogin) {
            azzeraFlussoLogin();
            return;
          }

          aggiornaFaseLogin('login', () => {
            window.location.assign(linkLogin.href);
          });
          return;
        }

        if (actionStage === 'login') {
          const erroreLogin = document.getElementById('loginerrormessage');
          if (erroreLogin && erroreLogin.textContent.trim() !== '') {
            azzeraFlussoLogin();
            return;
          }

          const bottoneSSO = document.querySelector('a.login-identityprovider-btn[href*="shibboleth"]');
          if (!bottoneSSO) {
            azzeraFlussoLogin();
            return;
          }

          aggiornaFaseLogin('shibboleth', () => {
            window.location.assign(bottoneSSO.href);
          });
          return;
        }

        if (actionStage === 'shibboleth' && window.location.pathname.startsWith('/auth/shibboleth/')) {
          window.setTimeout(() => {
            if (window.location.pathname.startsWith('/auth/shibboleth/')) {
              azzeraFlussoLogin();
            }
          }, 15000);
          return;
        }

        azzeraFlussoLogin();
        return;
      }

      if (host === 'shibidp.cca.unipd.it') {
        if (actionStage !== 'shibboleth' && actionStage !== 'uniweb_shibboleth') {
          azzeraFlussoLogin();
          return;
        }

        const userPulito = dati.unipd_user.split('@')[0];
        const idRadio = dati.unipd_dominio || 'radio2';
        const autoSubmit = dati.unipd_autosubmit !== false;
        const radioScelto = document.getElementById(idRadio);

        if (radioScelto) {
          radioScelto.checked = true;
          radioScelto.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const campoUserVisibile = document.getElementById('j_username_js');
        const campoUserNascosto = document.getElementById('j_username');
        const campoPass = document.getElementById('password');
        const bottoneAccedi = document.getElementById('login_button_js');

        if (!campoUserVisibile || !campoPass) {
          if (tentativi < 20) {
            window.setTimeout(() => avviaEstensioneUniPD(tentativi + 1), 250);
            return;
          }
          azzeraFlussoLogin();
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

        if (autoSubmit && bottoneAccedi) {
          window.setTimeout(() => {
            bottoneAccedi.click();
            azzeraFlussoLogin(false);
            window.setTimeout(rimuoviOverlayCaricamento, 10000);
          }, 300);
        } else {
          azzeraFlussoLogin();
        }
      }
    });
  });
}

const hostname = window.location.hostname;
const avviaDopoCaricamentoDom = () => {
  const ritardo = hostname === 'shibidp.cca.unipd.it' ? 300 : 0;
  window.setTimeout(avviaEstensioneUniPD, ritardo);
};

if (hostname === 'shibidp.cca.unipd.it') {
  if (document.readyState === 'complete') {
    avviaDopoCaricamentoDom();
  } else {
    window.addEventListener('load', avviaDopoCaricamentoDom, { once: true });
  }
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', avviaDopoCaricamentoDom, { once: true });
} else {
  avviaDopoCaricamentoDom();
}
