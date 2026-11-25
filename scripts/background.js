const chiaveFlusso = (tabId) => `unipd_login_flow_${tabId}`;
const durataFlussoLogin = 120000;
const chiaveDashboard = 'unipd_dashboard_data_v1';
const chiaveSyncInCorso = 'unipd_dashboard_sync_pending_v1';
const nomeAllarmeSync = 'unipd-dashboard-sync';
const nomeAllarmeTimeout = 'unipd-dashboard-sync-timeout';
const durataTimeoutSync = 120000;
const fontiInLettura = new Set();
const fontiInCompletamento = new Set();
const syncInAvvio = new Set();
const syncInFinalizzazione = new Set();
const loginSyncInAvvio = new Set();
const fontiInVerificaAccesso = new Set();
const fontiSync = {
  stem: 'https://stem.elearning.unipd.it/my/courses.php',
  uniwebHome: 'https://uniweb.unipd.it/auth/studente/HomePageStudente.do#shortcut',
  uniwebLibretto: 'https://uniweb.unipd.it/auth/studente/Libretto/LibrettoHome.do'
};

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
  if (typeof sendResponse === 'function') sendResponse({ ok: false, errore, messaggio: errore });
}

function dettaglioPagina(pagina) {
  if (!pagina) return '';
  const pagine = Array.isArray(pagina) ? pagina : [pagina];
  const dettagli = pagine.map((voce) => {
    const indirizzo = [voce.host, voce.percorso].filter(Boolean).join('');
    const titolo = voce.titolo ? `“${voce.titolo}”` : '';
    const pagina = [titolo, indirizzo].filter(Boolean).join(' — ');
    const conteggioCorsi = Number.isInteger(voce.linkCorsi) ? `; link ai corsi: ${voce.linkCorsi}` : '';
    const conteggioSchede = Number.isInteger(voce.schedeCorsi) ? `; schede corso: ${voce.schedeCorsi}` : '';
    const erroreApiCorsi = voce.erroreApiCorsi ? `; API corsi: ${voce.erroreApiCorsi}` : '';
    const statoScheda = voce.statoScheda ? `; scheda ${voce.statoScheda}` : '';
    return `${pagina}${conteggioCorsi}${conteggioSchede}${erroreApiCorsi}${statoScheda}`;
  }).filter(Boolean);
  return dettagli.length ? ` (${dettagli.join('; ')})` : '';
}

function haDatiRiconosciuti(dati) {
  const profilo = dati.profile || {};
  const carriera = dati.career || {};
  return Object.values(profilo).some((valore) => valore !== '' && valore !== null && valore !== undefined)
    || (Array.isArray(dati.courses) && dati.courses.length > 0)
    || (Array.isArray(carriera.grades) && carriera.grades.length > 0)
    || carriera.cfu !== null && carriera.cfu !== undefined
    || carriera.cfuTotal !== null && carriera.cfuTotal !== undefined
    || carriera.average !== null && carriera.average !== undefined;
}

function emailDaImpostazioni(dati) {
  const username = String(dati.unipd_user || '').trim().split('@')[0];
  if (!username) return '';

  const domini = {
    radio1: '@unipd.it',
    radio2: '@studenti.unipd.it',
    radio3: '@ext.unipd.it'
  };
  return `${username}${domini[dati.unipd_dominio] || domini.radio2}`;
}

async function leggiCorsiMoodleNelPortale() {
  try {
    const configurazione = window.M && window.M.cfg;
    if (!configurazione || !configurazione.wwwroot || !configurazione.sesskey) {
      return { ok: false, errore: 'La configurazione di sessione Moodle non è disponibile nella pagina.' };
    }

    const vistaCorsi = document.querySelector('[data-region="courses-view"]');
    const leggiFiltro = (nome, predefinito) => (
      vistaCorsi && vistaCorsi.getAttribute(`data-${nome}`) || predefinito
    );
    const argsBase = {
      limit: 100,
      classification: leggiFiltro('grouping', 'all'),
      sort: leggiFiltro('sort', 'fullname'),
      customfieldname: leggiFiltro('customfieldname', ''),
      customfieldvalue: leggiFiltro('customfieldvalue', ''),
      requiredfields: ['id', 'fullname', 'shortname', 'showcoursecategory', 'showshortname', 'visible', 'enddate']
    };
    const corsi = [];
    let offset = 0;
    const endpoint = new URL('/lib/ajax/service.php', configurazione.wwwroot);
    endpoint.searchParams.set('sesskey', configurazione.sesskey);
    endpoint.searchParams.set('info', 'core_course_get_enrolled_courses_by_timeline_classification');

    for (let pagina = 0; pagina < 20; pagina += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      let rispostaHttp;
      try {
        rispostaHttp = await fetch(endpoint.href, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{
            index: 0,
            methodname: 'core_course_get_enrolled_courses_by_timeline_classification',
            args: { ...argsBase, offset }
          }]),
          signal: controller.signal
        });
      } finally {
        window.clearTimeout(timeout);
      }

      if (!rispostaHttp.ok) {
        return { ok: false, errore: `Servizio Moodle non riuscito (HTTP ${rispostaHttp.status}).` };
      }
      const payload = await rispostaHttp.json();
      const risultato = Array.isArray(payload) ? payload[0] : null;
      if (!risultato || risultato.error) {
        const messaggio = risultato && risultato.exception && risultato.exception.message;
        return { ok: false, errore: messaggio || 'Il servizio corsi Moodle ha rifiutato la richiesta.' };
      }
      const risposta = risultato.data;
      const righe = Array.isArray(risposta)
        ? risposta
        : Array.isArray(risposta && risposta.courses)
          ? risposta.courses
          : risposta && risposta.courses && typeof risposta.courses === 'object'
            ? Object.values(risposta.courses)
            : null;
      if (!righe) {
        return { ok: false, errore: 'Risposta del servizio corsi Moodle in formato inatteso.' };
      }

      corsi.push(...righe);
      const prossimoOffset = Number(risposta && risposta.nextoffset);
      if (!Number.isInteger(prossimoOffset) || prossimoOffset <= offset || righe.length === 0) break;
      offset = prossimoOffset;
    }

    return {
      ok: true,
      courses: corsi.map((corso) => {
        const id = String(corso.id || '');
        const title = String(corso.fullname || corso.shortname || '').trim();
        if (!/^\d+$/.test(id) || title.length < 2) return null;
        const url = new URL('/course/view.php', window.location.origin);
        url.searchParams.set('id', id);
        return { title, url: url.href, source: 'stem' };
      }).filter(Boolean)
    };
  } catch (errore) {
    return {
      ok: false,
      errore: errore && errore.message ? String(errore.message) : 'Errore durante la lettura del servizio corsi Moodle.'
    };
  }
}

function leggiCorsiStemViaApi(tabId, callback) {
  chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: leggiCorsiMoodleNelPortale
  }, (risultati) => {
    if (chrome.runtime.lastError) {
      callback({ ok: false, errore: chrome.runtime.lastError.message });
      return;
    }

    const risultato = risultati && risultati[0] && risultati[0].result;
    if (!risultato || !risultato.ok || !Array.isArray(risultato.courses)) {
      callback({
        ok: false,
        errore: risultato && risultato.errore || 'Il servizio corsi Moodle non ha restituito dati validi.'
      });
      return;
    }
    callback({ ok: true, courses: risultato.courses });
  });
}

function aggregaRisultatiUniweb(fonti) {
  const dettagli = fonti.uniwebHome || fonti.uniwebLibretto
    ? [
      ['Home studente', fonti.uniwebHome && fonti.uniwebHome.esito],
      ['Libretto', fonti.uniwebLibretto && fonti.uniwebLibretto.esito]
    ]
    : [['Uniweb', fonti.uniweb && fonti.uniweb.esito]];
  const esitiRiusciti = dettagli.filter(([, esito]) => esito && esito.ok);
  const pagine = dettagli.map(([, esito]) => esito && esito.pagina).filter(Boolean);
  const avvisi = dettagli.flatMap(([nome, esito]) => {
    if (!esito || !esito.ok) return [`${nome}: ${esito && esito.errore || 'lettura non riuscita'}`];
    const carriera = esito.data && esito.data.career || {};
    if (nome === 'Libretto' && carriera.librettoRiconosciuto) return [];
    return haDatiRiconosciuti(esito.data || {}) ? [] : [`${nome}: nessun dato riconosciuto`];
  });

  if (!esitiRiusciti.length) {
    return { ok: false, errore: avvisi.join('; '), pagina: pagine };
  }

  const dati = { profile: {}, career: { grades: [] }, courses: [] };
  const esami = new Map();
  esitiRiusciti.forEach(([, esito]) => {
    const risultato = esito.data || {};
    Object.entries(risultato.profile || {}).forEach(([campo, valore]) => {
      if (valore !== '' && valore !== null && valore !== undefined) dati.profile[campo] = valore;
    });
    Object.entries(risultato.career || {}).forEach(([campo, valore]) => {
      if (campo !== 'grades' && campo !== 'librettoRiconosciuto' && valore !== null && valore !== undefined) {
        dati.career[campo] = valore;
      }
    });
    (Array.isArray(risultato.career && risultato.career.grades) ? risultato.career.grades : []).forEach((esame) => {
      const chiave = `${esame.name || ''}|${esame.grade || ''}|${esame.credits == null ? '' : esame.credits}`;
      if (!esami.has(chiave)) esami.set(chiave, esame);
    });
  });
  dati.career.grades = Array.from(esami.values());
  return { ok: true, data: dati, pagina: pagine, avvisi };
}

function aggiornaDashboard(datiCorrenti, risultati, callback, emailAccount) {
  const dashboard = datiCorrenti[chiaveDashboard] || {
    profile: {},
    career: { grades: [] },
    courses: [],
    sync: { sources: {} }
  };
  dashboard.profile = dashboard.profile || {};
  dashboard.career = dashboard.career || { grades: [] };
  dashboard.profile.email = emailAccount || '';
  dashboard.courses = Array.isArray(dashboard.courses) ? dashboard.courses : [];
  dashboard.sync = dashboard.sync || { sources: {} };
  dashboard.sync.sources = dashboard.sync.sources || {};

  risultati.forEach(({ fonte, esito }) => {
    if (!esito.ok) {
      dashboard.sync.sources[fonte] = {
        status: 'error',
        message: `${esito.errore || 'Lettura non riuscita.'}${dettaglioPagina(esito.pagina)}`,
        updatedAt: Date.now()
      };
      return;
    }

    const dati = esito.data || {};
    const profilo = dati.profile || {};
    const corsi = Array.isArray(dati.courses) ? dati.courses : [];
    const carriera = dati.career || {};
    const esami = Array.isArray(carriera.grades) ? carriera.grades : [];
    const haDati = haDatiRiconosciuti(dati);

    if (haDati) {
      if (fonte === 'uniweb') {
        const profiloValido = Object.fromEntries(
          Object.entries(profilo).filter(([, valore]) => valore !== '' && valore !== null && valore !== undefined)
        );
        dashboard.profile = { ...dashboard.profile, ...profiloValido };
      }
      const carrieraValida = Object.fromEntries(
        Object.entries(carriera).filter(([campo, valore]) => campo !== 'grades' && valore !== null && valore !== undefined)
      );
      dashboard.career = { ...dashboard.career, ...carrieraValida };
      if (esami.length > 0) dashboard.career.grades = esami;
      if (corsi.length > 0) {
        dashboard.courses = dashboard.courses.filter((corso) => corso.source !== fonte).concat(corsi);
      }
    }

    dashboard.sync.sources[fonte] = {
      status: haDati ? 'updated' : 'empty',
      message: haDati
        ? `Dati aggiornati.${esito.avvisi && esito.avvisi.length ? ` Avvisi: ${esito.avvisi.join('; ')}.` : ''}`
        : `Pagina raggiunta, ma non sono stati riconosciuti dati${esito.avvisi && esito.avvisi.length ? `: ${esito.avvisi.join('; ')}` : ''}${dettaglioPagina(esito.pagina)}.`,
      updatedAt: Date.now()
    };
  });

  const aggiornate = ['stem', 'uniweb'].filter((fonte) => {
    const risultato = risultati.find((voce) => voce.fonte === fonte);
    return risultato && risultato.esito.ok && dashboard.sync.sources[fonte].status === 'updated';
  });
  const nonAggiornate = ['stem', 'uniweb'].filter((fonte) => !aggiornate.includes(fonte));
  const avvisi = risultati.flatMap(({ fonte, esito }) => (esito.avvisi || []).map((avviso) => (
    `${fonte === 'stem' ? 'STEM' : 'Uniweb'}: ${avviso}`
  )));
  const timestamp = Date.now();
  dashboard.sync.lastAttemptAt = timestamp;
  dashboard.sync.lastResult = aggiornate.length === 2 && !avvisi.length
    ? 'success' : aggiornate.length || avvisi.length ? 'partial' : 'error';
  dashboard.sync.message = aggiornate.length === 2 && !avvisi.length
    ? 'Aggiornamento completato da STEM e Uniweb.'
    : aggiornate.length
      ? `Aggiornamento parziale da ${aggiornate.map((fonte) => fonte === 'stem' ? 'STEM' : 'Uniweb').join(' e ')}. ${nonAggiornate.map((fonte) => `${fonte === 'stem' ? 'STEM' : 'Uniweb'}: ${dashboard.sync.sources[fonte].message}`).join(' ')} ${avvisi.join(' ')} I dati precedenti sono stati mantenuti.`
      : `Aggiornamento non riuscito o nessun dato riconosciuto. ${nonAggiornate.map((fonte) => `${fonte === 'stem' ? 'STEM' : 'Uniweb'}: ${dashboard.sync.sources[fonte].message}`).join(' ')} ${avvisi.join(' ')} I dati salvati sono stati mantenuti.`;

  chrome.storage.local.set({ [chiaveDashboard]: dashboard }, () => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      if (callback) callback(chrome.runtime.lastError);
      return;
    }
    if (callback) callback(null, dashboard.sync.message);
  });
}

function leggiSyncInCorso(callback) {
  chrome.storage.local.get(chiaveSyncInCorso, (dati) => {
    if (chrome.runtime.lastError) {
      callback(null, chrome.runtime.lastError);
      return;
    }
    callback(dati[chiaveSyncInCorso] || null, null);
  });
}

function salvaSyncInCorso(sync, callback) {
  chrome.storage.local.set({ [chiaveSyncInCorso]: sync }, () => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      if (callback) callback(chrome.runtime.lastError);
      return;
    }
    if (callback) callback(null);
  });
}

function chiudiSchedeSync(sync) {
  const ids = Object.values(sync.fonti || {}).map((fonte) => fonte.tabId).filter((id) => typeof id === 'number');
  if (ids.length) {
    chrome.tabs.remove(ids, () => {
      if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
    });
  }
}

function completaFonteSync(idSync, nomeFonte, esito, callback) {
  loginSyncInAvvio.delete(`${idSync}:${nomeFonte}`);
  const chiaveCompletamento = `${idSync}:${nomeFonte}`;
  if (fontiInCompletamento.has(chiaveCompletamento)) return;
  fontiInCompletamento.add(chiaveCompletamento);
  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync || sync.id !== idSync) {
      fontiInCompletamento.delete(chiaveCompletamento);
      if (callback) callback();
      return;
    }
    const fonte = sync.fonti[nomeFonte];
    if (!fonte || fonte.stato === 'completata') {
      fontiInCompletamento.delete(chiaveCompletamento);
      if (callback) callback();
      return;
    }

    fonte.stato = 'completata';
    fonte.esito = esito;
    salvaSyncInCorso(sync, (erroreSalvataggio) => {
      fontiInCompletamento.delete(chiaveCompletamento);
      chrome.alarms.clear(nomeAllarmeTimeout);
      if (typeof fonte.tabId === 'number') {
        chrome.tabs.remove(fonte.tabId, () => {
          if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
        });
      }
      if (erroreSalvataggio) {
        chrome.storage.local.remove(chiaveSyncInCorso);
        if (callback) callback();
        return;
      }
      if (callback) callback();
      avviaFonteSuccessiva(idSync);
    });
  });
}

function avviaLoginSync(idSync, nomeFonte, tabId, fase = 'shibboleth') {
  const chiaveRichiesta = `${idSync}:${nomeFonte}`;
  if (loginSyncInAvvio.has(chiaveRichiesta)) return;
  loginSyncInAvvio.add(chiaveRichiesta);
  const terminaRichiesta = () => loginSyncInAvvio.delete(chiaveRichiesta);
  const faseSSO = fase === 'shibboleth' || fase === 'uniweb_shibboleth';
  const fasiConsentite = ['root', 'login', 'shibboleth', 'uniweb_root', 'uniweb_shibboleth'];
  if (!fasiConsentite.includes(fase)) {
    terminaRichiesta();
    completaFonteSync(idSync, nomeFonte, { ok: false, errore: 'Fase di login non valida.' });
    return;
  }

  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync || sync.id !== idSync) {
      terminaRichiesta();
      return;
    }
    const fonte = sync.fonti[nomeFonte];
    if (!fonte || fonte.tabId !== tabId || fonte.stato === 'completata'
      || faseSSO && fonte.loginAttempted || !faseSSO && fonte.loginFlowStarted) {
      terminaRichiesta();
      return;
    }

    chrome.storage.local.get(['unipd_user', 'unipd_pass', 'unipd_autosubmit'], (credenziali) => {
      if (chrome.runtime.lastError) {
        terminaRichiesta();
        completaFonteSync(idSync, nomeFonte, { ok: false, errore: chrome.runtime.lastError.message });
        return;
      }
      if (!credenziali.unipd_user || !credenziali.unipd_pass) {
        terminaRichiesta();
        completaFonteSync(idSync, nomeFonte, {
          ok: false,
          errore: 'Sessione scaduta: salva le credenziali nel popup per consentire il login SSO durante il refresh.'
        });
        return;
      }
      if (credenziali.unipd_autosubmit === false) {
        terminaRichiesta();
        completaFonteSync(idSync, nomeFonte, {
          ok: false,
          errore: 'Sessione scaduta: abilita l’invio automatico nel popup per completare il login SSO durante il refresh.'
        });
        return;
      }

      if (faseSSO) fonte.loginAttempted = true;
      else fonte.loginFlowStarted = true;
      salvaSyncInCorso(sync, (erroreSalvataggio) => {
        if (erroreSalvataggio) {
          terminaRichiesta();
          completaFonteSync(idSync, nomeFonte, { ok: false, errore: erroreSalvataggio.message });
          return;
        }

        const key = chiaveFlusso(tabId);
        chrome.storage.local.set({
          [key]: {
            fase,
            aggiornatoIl: Date.now()
          }
        }, () => {
          if (chrome.runtime.lastError) {
            terminaRichiesta();
            completaFonteSync(idSync, nomeFonte, { ok: false, errore: chrome.runtime.lastError.message });
            return;
          }

          chrome.alarms.create(nomeAllarmeTimeout, { when: Date.now() + durataTimeoutSync });
          chrome.tabs.sendMessage(tabId, { type: 'start-sync-login' }, (risposta) => {
            terminaRichiesta();
            const erroreMessaggio = chrome.runtime.lastError;
            if (erroreMessaggio || !risposta || !risposta.ok) {
              const messaggioErrore = erroreMessaggio
                ? erroreMessaggio.message
                : risposta && risposta.errore || 'Impossibile avviare il login SSO durante il refresh.';
              chrome.storage.local.remove(key);
              completaFonteSync(idSync, nomeFonte, { ok: false, errore: messaggioErrore });
            }
          });
        });
      });
    });
  });
}

function gestisciPaginaFonte(idSync, nomeFonte, tabId, url, ripresa = false) {
  const chiaveVerifica = `${idSync}:${nomeFonte}`;
  try {
    const pagina = new URL(url);
    if (pagina.hostname === 'shibidp.cca.unipd.it') {
      avviaLoginSync(idSync, nomeFonte, tabId, 'shibboleth');
      return;
    }
    if (pagina.hostname !== 'stem.elearning.unipd.it' && pagina.hostname !== 'uniweb.unipd.it') {
      leggiFonteCaricata(idSync, nomeFonte, tabId, ripresa);
      return;
    }

    if (fontiInVerificaAccesso.has(chiaveVerifica)) return;
    fontiInVerificaAccesso.add(chiaveVerifica);
    chrome.tabs.sendMessage(tabId, { type: 'prepare-sync-auth' }, (risposta) => {
      fontiInVerificaAccesso.delete(chiaveVerifica);
      const erroreMessaggio = chrome.runtime.lastError;
      if (erroreMessaggio || !risposta || !risposta.ok) {
        completaFonteSync(idSync, nomeFonte, {
          ok: false,
          errore: erroreMessaggio
            ? erroreMessaggio.message
            : risposta && risposta.errore || 'Impossibile verificare la sessione del portale.'
        });
        return;
      }
      if (risposta.richiedeLogin) {
        avviaLoginSync(idSync, nomeFonte, tabId, risposta.fase);
        return;
      }
      leggiFonteCaricata(idSync, nomeFonte, tabId, ripresa);
    });
  } catch (errore) {
    fontiInVerificaAccesso.delete(chiaveVerifica);
    completaFonteSync(idSync, nomeFonte, { ok: false, errore: `URL della pagina non valida: ${errore.message}` });
  }
}

function sbloccaLetturaFonte(idSync, nomeFonte, tabId) {
  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync || sync.id !== idSync) return;
    const fonte = sync.fonti[nomeFonte];
    if (!fonte || fonte.tabId !== tabId || fonte.stato !== 'caricamento') return;
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError || !tab || tab.status !== 'complete'
        || typeof tab.url !== 'string' || tab.url === 'about:blank') return;
      gestisciPaginaFonte(idSync, nomeFonte, tabId, tab.url);
    });
  });
}

function finalizzaSync(idSync, sync) {
  if (syncInFinalizzazione.has(idSync)) return;
  syncInFinalizzazione.add(idSync);
  chrome.storage.local.get([chiaveDashboard, 'unipd_user', 'unipd_dominio'], (dati) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      syncInFinalizzazione.delete(idSync);
      chrome.storage.local.remove(chiaveSyncInCorso, () => {
        syncInFinalizzazione.delete(idSync);
        chiudiSchedeSync(sync);
      });
      return;
    }
    const risultati = [
      { fonte: 'stem', esito: sync.fonti.stem.esito || { ok: false, errore: 'Aggiornamento interrotto.' } },
      { fonte: 'uniweb', esito: aggregaRisultatiUniweb(sync.fonti) }
    ];
    aggiornaDashboard(dati, risultati, () => {
      chrome.storage.local.remove(chiaveSyncInCorso, () => {
        if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
        syncInFinalizzazione.delete(idSync);
      });
      chrome.alarms.clear(nomeAllarmeTimeout);
    }, emailDaImpostazioni(dati));
  });
}

function avviaFonteSuccessiva(idSync) {
  if (syncInAvvio.has(idSync)) return;
  syncInAvvio.add(idSync);
  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync || sync.id !== idSync) {
      syncInAvvio.delete(idSync);
      return;
    }
    const prossima = Object.entries(sync.fonti).find(([, fonte]) => fonte.stato === 'in_coda');
    if (!prossima) {
      const attiva = Object.values(sync.fonti).some((fonte) => ['creazione', 'caricamento', 'lettura'].includes(fonte.stato));
      syncInAvvio.delete(idSync);
      if (!attiva) finalizzaSync(idSync, sync);
      return;
    }

    const [nomeFonte, fonte] = prossima;
    fonte.stato = 'creazione';
    fonte.iniziataIl = Date.now();
    salvaSyncInCorso(sync, (erroreSalvataggio) => {
      if (erroreSalvataggio) {
        syncInAvvio.delete(idSync);
        return;
      }
      chrome.tabs.create({ url: 'about:blank', active: false }, (tab) => {
        if (chrome.runtime.lastError || !tab || typeof tab.id !== 'number') {
          syncInAvvio.delete(idSync);
          completaFonteSync(idSync, nomeFonte, {
            ok: false,
            errore: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Impossibile aprire una scheda in background.'
          });
          return;
        }

        chrome.storage.local.remove(chiaveFlusso(tab.id), () => {
          if (chrome.runtime.lastError) {
            const errorePulizia = chrome.runtime.lastError.message;
            syncInAvvio.delete(idSync);
            chrome.tabs.remove(tab.id);
            completaFonteSync(idSync, nomeFonte, { ok: false, errore: errorePulizia });
            return;
          }

          fonte.tabId = tab.id;
          fonte.stato = 'caricamento';
          fonte.iniziataIl = Date.now();
          salvaSyncInCorso(sync, (erroreSalvataggioTab) => {
            if (erroreSalvataggioTab) {
              syncInAvvio.delete(idSync);
              chrome.tabs.remove(tab.id);
              return;
            }
            chrome.alarms.create(nomeAllarmeTimeout, { when: Date.now() + durataTimeoutSync });
            chrome.tabs.update(tab.id, { url: fonte.url }, () => {
              syncInAvvio.delete(idSync);
              if (chrome.runtime.lastError) {
                completaFonteSync(idSync, nomeFonte, { ok: false, errore: chrome.runtime.lastError.message });
                return;
              }
              sbloccaLetturaFonte(idSync, nomeFonte, tab.id);
            });
          });
        });
      });
    });
  });
}

function leggiFonteCaricata(idSync, nomeFonte, tabId, ripresa = false) {
  const chiaveLettura = `${idSync}:${nomeFonte}`;
  if (fontiInLettura.has(chiaveLettura)) return;
  fontiInLettura.add(chiaveLettura);
  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync || sync.id !== idSync) {
      fontiInLettura.delete(chiaveLettura);
      return;
    }
    const fonte = sync.fonti[nomeFonte];
    if (!fonte || fonte.tabId !== tabId
      || fonte.stato !== 'caricamento' && !(ripresa && fonte.stato === 'lettura')) {
      fontiInLettura.delete(chiaveLettura);
      return;
    }
    fonte.stato = 'lettura';
    salvaSyncInCorso(sync, (erroreSalvataggio) => {
      if (erroreSalvataggio) {
        fontiInLettura.delete(chiaveLettura);
        return;
      }
      chrome.tabs.sendMessage(tabId, { type: 'collect-dashboard-data' }, (risposta) => {
        fontiInLettura.delete(chiaveLettura);
        const erroreMessaggio = chrome.runtime.lastError;
        if (erroreMessaggio || !risposta || !risposta.ok) {
          const messaggioErrore = erroreMessaggio
            ? /receiving end does not exist|could not establish connection/i.test(erroreMessaggio.message)
              ? 'Il portale ha reindirizzato a una pagina non supportata o la sessione e scaduta.'
              : erroreMessaggio.message
            : risposta && risposta.errore || 'Impossibile leggere i dati della pagina.';
          completaFonteSync(idSync, nomeFonte, {
            ok: false,
            errore: messaggioErrore,
            pagina: risposta && risposta.pagina
          });
          return;
        }

        const datiLetti = risposta.data || {};
        const corsiRiconosciuti = Array.isArray(datiLetti.courses) ? datiLetti.courses : [];
        if (nomeFonte === 'stem' && corsiRiconosciuti.length === 0) {
          leggiCorsiStemViaApi(tabId, (risultatoApi) => {
            const pagina = { ...(risposta.pagina || {}) };
            if (risultatoApi.ok && risultatoApi.courses.length > 0) {
              completaFonteSync(idSync, nomeFonte, {
                ok: true,
                data: { ...datiLetti, courses: risultatoApi.courses },
                pagina
              });
              return;
            }

            if (!risultatoApi.ok) pagina.erroreApiCorsi = risultatoApi.errore;
            completaFonteSync(idSync, nomeFonte, {
              ok: true,
              data: datiLetti,
              pagina
            });
          });
          return;
        }

        completaFonteSync(idSync, nomeFonte, {
          ok: true,
          data: datiLetti,
          pagina: risposta.pagina
        });
      });
    });
  });
}

function avviaSincronizzazione(sendResponse) {
  leggiSyncInCorso((syncEsistente, errore) => {
    if (errore) {
      rispostaErrore(sendResponse, errore.message);
      return;
    }
    if (syncEsistente && Date.now() - syncEsistente.iniziataIl < 180000) {
      if (typeof sendResponse === 'function') {
        sendResponse({ ok: false, inCorso: true, messaggio: 'Aggiornamento gia in corso. I dati salvati restano disponibili.' });
      }
      return;
    }

    const avvia = () => {
      const idSync = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const sync = {
        id: idSync,
        iniziataIl: Date.now(),
        fonti: Object.fromEntries(Object.entries(fontiSync).map(([nome, url]) => [
          nome,
          { url, stato: 'in_coda', tabId: null }
        ]))
      };
      salvaSyncInCorso(sync, (erroreSalvataggio) => {
        if (erroreSalvataggio) {
          rispostaErrore(sendResponse, erroreSalvataggio.message);
          return;
        }
        chrome.alarms.create(nomeAllarmeTimeout, { when: Date.now() + durataTimeoutSync });
        if (typeof sendResponse === 'function') {
          sendResponse({ ok: true, messaggio: 'Aggiornamento avviato in background. I dati salvati restano visibili.' });
        }
        avviaFonteSuccessiva(idSync);
      });
    };

    if (syncEsistente) {
      chrome.storage.local.remove(chiaveSyncInCorso, () => {
        if (chrome.runtime.lastError) {
          rispostaErrore(sendResponse, chrome.runtime.lastError.message);
          return;
        }
        chrome.alarms.clear(nomeAllarmeTimeout);
        chiudiSchedeSync(syncEsistente);
        avvia();
      });
      return;
    }
    avvia();
  });
}

function riprendiSincronizzazione() {
  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync) return;
    const attiva = Object.entries(sync.fonti).find(([, fonte]) => ['creazione', 'caricamento', 'lettura'].includes(fonte.stato));
    if (!attiva) {
      avviaFonteSuccessiva(sync.id);
      return;
    }
    const [nomeFonte, fonte] = attiva;
    if (typeof fonte.tabId !== 'number') {
      completaFonteSync(sync.id, nomeFonte, { ok: false, errore: 'Aggiornamento interrotto durante l’apertura della scheda.' });
      return;
    }
    chrome.tabs.get(fonte.tabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        completaFonteSync(sync.id, nomeFonte, {
          ok: false,
          errore: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'La scheda di aggiornamento non e piu disponibile.'
        });
        return;
      }
      if (tab.status === 'complete' && tab.url !== 'about:blank') {
        gestisciPaginaFonte(sync.id, nomeFonte, fonte.tabId, tab.url, true);
      } else {
        chrome.alarms.create(nomeAllarmeTimeout, { when: Date.now() + durataTimeoutSync });
      }
    });
  });
}

function gestisciTimeoutSync() {
  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync) return;
    const attiva = Object.entries(sync.fonti).find(([, fonte]) => ['creazione', 'caricamento', 'lettura'].includes(fonte.stato));
    if (!attiva) {
      avviaFonteSuccessiva(sync.id);
      return;
    }
    const [nomeFonte, fonte] = attiva;
    const completaTimeout = (pagina) => completaFonteSync(sync.id, nomeFonte, {
      ok: false,
      errore: 'Il portale non ha risposto entro il tempo previsto. Verifica la sessione UniPD.',
      pagina
    });
    if (typeof fonte.tabId !== 'number') {
      completaTimeout(null);
      return;
    }

    chrome.tabs.get(fonte.tabId, (tab) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        completaTimeout(null);
        return;
      }
      if (!tab || typeof tab.url !== 'string') {
        completaTimeout(null);
        return;
      }
      const url = new URL(tab.url);
      completaTimeout({
        host: url.hostname,
        percorso: url.pathname,
        titolo: tab.title || '',
        statoScheda: tab.status || ''
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(nomeAllarmeSync, { periodInMinutes: 10 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(nomeAllarmeSync, { periodInMinutes: 10 });
  riprendiSincronizzazione();
});

chrome.alarms.onAlarm.addListener((allarme) => {
  if (allarme.name === nomeAllarmeSync) avviaSincronizzazione();
  if (allarme.name === nomeAllarmeTimeout) gestisciTimeoutSync();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = tab && typeof tab.url === 'string' ? tab.url : changeInfo.url;
  if (changeInfo.status !== 'complete' || typeof url !== 'string' || url === 'about:blank') return;
  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync) return;
    const voce = Object.entries(sync.fonti).find(([, fonte]) => fonte.tabId === tabId);
    if (voce) gestisciPaginaFonte(sync.id, voce[0], tabId, url);
  });
});

chrome.runtime.onMessage.addListener((messaggio, mittente, sendResponse) => {
  if (!messaggio || typeof messaggio.type !== 'string') return;

  if (messaggio.type === 'sync-dashboard') {
    avviaSincronizzazione(sendResponse);
    return true;
  }

  if (messaggio.type === 'start-login-flow') {
    const destinazione = destinazioni[messaggio.destinazione];
    if (!destinazione) {
      rispostaErrore(sendResponse, 'Destinazione di login non valida.');
      return;
    }

    chrome.tabs.create({ url: chrome.runtime.getURL('pages/loading.html') }, (tab) => {
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
  chrome.storage.local.remove(chiaveFlusso(tabId), () => {
    if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
  });
  leggiSyncInCorso((sync, errore) => {
    if (errore || !sync) return;
    const voce = Object.entries(sync.fonti).find(([, fonte]) => fonte.tabId === tabId && fonte.stato !== 'completata');
    if (!voce) return;
    completaFonteSync(sync.id, voce[0], {
      ok: false,
      errore: 'La scheda di aggiornamento e stata chiusa prima di completare la lettura.'
    });
  });
});
