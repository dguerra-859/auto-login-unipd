const chiaveFlusso = (tabId) => `unipd_login_flow_${tabId}`;
const durataFlussoLogin = 120000;

const destinazioni = {
  stem: {
    url: 'https://stem.elearning.unipd.it/',
    fase: 'root'
  },
  uniweb: {
    url: 'https://uniweb.unipd.it/Root.do#shortcut',
    fase: 'uniweb_root'
  }
};

function rispostaErrore(sendResponse, errore) {
  console.error(errore);
  sendResponse({ ok: false, errore });
}

chrome.runtime.onMessage.addListener((messaggio, mittente, sendResponse) => {
  if (!messaggio || typeof messaggio.type !== 'string') return;

  if (messaggio.type === 'start-login-flow') {
    const destinazione = destinazioni[messaggio.destinazione];
    if (!destinazione) {
      rispostaErrore(sendResponse, 'Destinazione di login non valida.');
      return;
    }

    chrome.tabs.create({ url: chrome.runtime.getURL('loading.html') }, (tab) => {
      if (chrome.runtime.lastError || !tab || typeof tab.id !== 'number') {
        rispostaErrore(sendResponse, chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Impossibile creare la scheda di login.');
        return;
      }

      const tabId = tab.id;
      const key = chiaveFlusso(tabId);
      chrome.storage.local.set({
        [key]: {
          fase: destinazione.fase,
          aggiornatoIl: Date.now()
        }
      }, () => {
        if (chrome.runtime.lastError) {
          const errore = chrome.runtime.lastError.message;
          chrome.tabs.remove(tabId);
          rispostaErrore(sendResponse, errore);
          return;
        }

        chrome.tabs.update(tabId, { url: destinazione.url }, () => {
          if (chrome.runtime.lastError) {
            const errore = chrome.runtime.lastError.message;
            chrome.storage.local.remove(key);
            chrome.tabs.remove(tabId);
            rispostaErrore(sendResponse, errore);
            return;
          }
          sendResponse({ ok: true });
        });
      });
    });
    return true;
  }

  const tabId = mittente.tab && mittente.tab.id;
  if (typeof tabId !== 'number') {
    rispostaErrore(sendResponse, 'Il flusso di login non e associato a una scheda.');
    return;
  }

  const key = chiaveFlusso(tabId);
  if (messaggio.type === 'get-login-flow') {
    chrome.storage.local.get(key, (dati) => {
      if (chrome.runtime.lastError) {
        rispostaErrore(sendResponse, chrome.runtime.lastError.message);
        return;
      }

      const flusso = dati[key];
      if (flusso && Date.now() - flusso.aggiornatoIl <= durataFlussoLogin) {
        sendResponse(flusso);
        return;
      }

      if (flusso) chrome.storage.local.remove(key);
      sendResponse(null);
    });
    return true;
  }

  if (messaggio.type === 'update-login-flow') {
    const fasiValide = ['root', 'login', 'shibboleth', 'uniweb_root', 'uniweb_shibboleth'];
    if (!fasiValide.includes(messaggio.fase)) {
      rispostaErrore(sendResponse, 'Fase di login non valida.');
      return;
    }

    chrome.storage.local.get(key, (dati) => {
      if (chrome.runtime.lastError) {
        rispostaErrore(sendResponse, chrome.runtime.lastError.message);
        return;
      }

      const flusso = dati[key];
      if (!flusso || Date.now() - flusso.aggiornatoIl > durataFlussoLogin) {
        chrome.storage.local.remove(key);
        rispostaErrore(sendResponse, 'Il flusso di login e scaduto.');
        return;
      }

      chrome.storage.local.set({
        [key]: {
          fase: messaggio.fase,
          aggiornatoIl: Date.now()
        }
      }, () => {
        if (chrome.runtime.lastError) {
          rispostaErrore(sendResponse, chrome.runtime.lastError.message);
          return;
        }
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (messaggio.type === 'clear-login-flow') {
    chrome.storage.local.remove(key, () => {
      if (chrome.runtime.lastError) {
        rispostaErrore(sendResponse, chrome.runtime.lastError.message);
        return;
      }
      sendResponse({ ok: true });
    });
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove(chiaveFlusso(tabId));
});
