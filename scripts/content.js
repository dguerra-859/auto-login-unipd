const chiaveOverlayCaricamento = 'unipd-login-loading';
const durataFlussoLogin = 120000;
let loginSSOInAvvio = false;

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
    logo.src = chrome.runtime.getURL('assets/logo.png');
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
  leggiFlussoLogin((flusso) => {
    if (!flusso || Date.now() - flusso.aggiornatoIl > durataFlussoLogin) {
      rimuoviOverlayCaricamento();
      return;
    }

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
          const nonAutenticato = document.body.classList.contains('notloggedin')
            || document.querySelector('a[href*="/login/index.php"]');
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
        if (tentativi === 0) {
          if (loginSSOInAvvio) return;
          loginSSOInAvvio = true;
        } else if (!loginSSOInAvvio) {
          return;
        }

        if (actionStage !== 'shibboleth' && actionStage !== 'uniweb_shibboleth') {
          loginSSOInAvvio = false;
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
          loginSSOInAvvio = false;
          azzeraFlussoLogin();
          return;
        }

        const suffissi = {
          radio1: '@unipd.it',
          radio2: '@studenti.unipd.it',
          radio3: '@ext.unipd.it'
        };

        const compilaCredenziali = () => {
          campoUserVisibile.value = userPulito;
          campoUserVisibile.dispatchEvent(new Event('input', { bubbles: true }));
          campoUserVisibile.dispatchEvent(new Event('change', { bubbles: true }));

          if (campoUserNascosto) {
            campoUserNascosto.value = userPulito + (suffissi[idRadio] || '@studenti.unipd.it');
          }

          campoPass.value = dati.unipd_pass;
          campoPass.dispatchEvent(new Event('input', { bubbles: true }));
          campoPass.dispatchEvent(new Event('change', { bubbles: true }));
        };

        compilaCredenziali();

        if (autoSubmit && bottoneAccedi) {
          window.setTimeout(() => {
            compilaCredenziali();
            bottoneAccedi.click();
            azzeraFlussoLogin(false);
            window.setTimeout(rimuoviOverlayCaricamento, 10000);
          }, 300);
        } else {
          loginSSOInAvvio = false;
          azzeraFlussoLogin();
        }
      }
    });
  });
}

function testoVisibile(elemento) {
  if (!elemento) return '';
  const testo = elemento.innerText && elemento.innerText.trim()
    ? elemento.innerText
    : elemento.textContent || '';
  return testo.replace(/\s+/g, ' ').trim();
}

function normalizzaEtichetta(valore) {
  return valore.toLocaleLowerCase('it-IT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function raccogliCoppieEtichettaValore() {
  const coppie = [];

  document.querySelectorAll('tr').forEach((riga) => {
    const celle = Array.from(riga.querySelectorAll('th, td')).map(testoVisibile).filter(Boolean);
    if (celle.length >= 2) coppie.push([celle[0], celle.slice(1).join(' ')]);
  });

  document.querySelectorAll('dt').forEach((etichetta) => {
    const valore = etichetta.nextElementSibling;
    if (valore && valore.tagName.toLowerCase() === 'dd') coppie.push([testoVisibile(etichetta), testoVisibile(valore)]);
  });

  document.querySelectorAll('.profile_field, .userprofile .contentnode, [class*="profile_field"]').forEach((campo) => {
    const etichetta = campo.querySelector('dt, .fieldname, .profile_fieldname, label');
    const valore = campo.querySelector('dd, .fieldvalue, .profile_fieldvalue');
    if (etichetta && valore) coppie.push([testoVisibile(etichetta), testoVisibile(valore)]);
  });

  document.querySelectorAll('label, .label, .fieldname, .field-label, .field_label, [class*="fieldname"], [class*="field-label"]').forEach((etichetta) => {
    const testoEtichetta = testoVisibile(etichetta);
    const labelNormalizzata = normalizzaEtichetta(testoEtichetta);
    if (!/(matricol|anno.*(corso|immatricol|iscrizion|frequenza)|corso\s+di\s+(?:studio|studi|laurea))/.test(labelNormalizzata)) return;

    let valore = etichetta.nextElementSibling;
    if (!valore && etichetta.parentElement) {
      valore = Array.from(etichetta.parentElement.children).find((fratello) => fratello !== etichetta);
    }
    if (!valore) return;

    const contenuto = valore.matches('input, textarea, select') ? valore.value.trim() : testoVisibile(valore);
    if (contenuto && normalizzaEtichetta(contenuto) !== labelNormalizzata) {
      coppie.push([testoEtichetta, contenuto]);
    }
  });

  document.querySelectorAll('p.text-align-left').forEach((paragrafo) => {
    const testoEtichetta = Array.from(paragrafo.childNodes)
      .filter((nodo) => nodo.nodeType === 3)
      .map((nodo) => nodo.textContent)
      .join(' ')
      .trim();
    const etichetta = testoEtichetta.replace(/[:：]\s*$/, '').trim();
    if (/^corso(?:\s+di\s+(?:studio|studi|laurea))?$/i.test(etichetta)) {
      const valoreCorso = paragrafo.querySelector('b, strong, a');
      if (valoreCorso && testoVisibile(valoreCorso)) {
        coppie.push([etichetta, testoVisibile(valoreCorso)]);
      }
      return;
    }
    if (!/^(?:data\s+)?immatricolazione$/i.test(etichetta)) return;

    const valore = paragrafo.querySelector('b, strong');
    if (valore && testoVisibile(valore)) {
      coppie.push(['Immatricolazione', testoVisibile(valore)]);
    }
  });

  return coppie;
}

function trovaValore(coppie, etichette) {
  const etichetteNormalizzate = etichette.map(normalizzaEtichetta);
  const coppia = coppie.find(([etichetta, valore]) => {
    const label = normalizzaEtichetta(etichetta);
    return valore && etichetteNormalizzate.some((cercata) => label === cercata || label.startsWith(`${cercata} `) || label.startsWith(`${cercata}:`));
  });
  return coppia ? coppia[1] : '';
}

function leggiProfiloPortale(coppie) {
  const titoloMatricola = testoVisibile(document.querySelector('h2.pagetitle_title'));
  const numeroNelTitolo = /\bmatricola\b/i.test(titoloMatricola)
    ? titoloMatricola.match(/(?:^|\D)(\d{5,10})(?:\D|$)/)
    : null;
  const nomeCompleto = trovaValore(coppie, ['nome e cognome', 'nominativo', 'nome completo', 'cognome e nome']);
  const cognome = trovaValore(coppie, ['cognome', 'lastname', 'surname']);
  const nomeProprio = trovaValore(coppie, ['nome', 'firstname', 'first name']);

  return {
    name: nomeCompleto || [nomeProprio, cognome].filter(Boolean).join(' '),
    studentId: trovaValore(coppie, ['matricola', 'numero di matricola', 'numero matricola', 'n. matricola', 'n matricola', 'matricola studente', 'codice matricola', 'student id', 'student number'])
      || (numeroNelTitolo ? numeroNelTitolo[1] : ''),
    email: '',
    course: trovaValore(coppie, [
      'corso di studio',
      'corso di studi',
      'corso di laurea',
      'denominazione del corso',
      'denominazione corso',
      'denominazione corso di studio',
      'programma di studio',
      'degree programme',
      'degree program',
      'corso'
    ]),
    year: trovaValore(coppie, ['anno di corso', 'anno corso', 'anno di iscrizione', 'anno iscrizione', 'anno di frequenza']),
    enrollmentYear: trovaValore(coppie, ['anno di immatricolazione', 'anno immatricolazione', 'data immatricolazione', 'immatricolazione', 'anno accademico di immatricolazione', 'anno di prima immatricolazione'])
  };
}

function leggiCarriera(coppie) {
  const cfuValue = trovaValore(coppie, ['cfu conseguiti', 'crediti acquisiti', 'cfu acquisiti', 'crediti conseguiti']);
  const cfuTotalValue = trovaValore(coppie, ['cfu totali', 'crediti totali', 'crediti previsti', 'cfu previsti']);
  const averageValue = trovaValore(coppie, ['media ponderata', 'media aritmetica', 'media voti', 'media']);
  const parseNumero = (valore) => {
    const match = String(valore || '').replace(',', '.').match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  };

  const tabelleEsami = [];
  let librettoRiconosciuto = false;
  document.querySelectorAll('table').forEach((tabella) => {
    const righe = Array.from(tabella.querySelectorAll('tr'));
    const intestazione = righe.find((riga) => /esame|insegnamento|attivita formativa|attivita didattica/i.test(testoVisibile(riga)));
    if (!intestazione) return;

    const colonne = Array.from(intestazione.querySelectorAll('th, td')).map((cella) => normalizzaEtichetta(testoVisibile(cella)));
    const indiceNome = colonne.findIndex((testo) => /esame|insegnamento|attivita formativa|attivita didattica|denominazione/.test(testo));
    const indiceVoto = colonne.findIndex((testo) => /voto|esito|valutazione|grade/.test(testo));
    const indiceCfu = colonne.findIndex((testo) => /cfu|crediti/.test(testo));
    if (indiceNome < 0 || indiceVoto < 0) return;
    librettoRiconosciuto = true;

    righe.filter((riga) => riga !== intestazione).forEach((riga) => {
      const celle = Array.from(riga.querySelectorAll('th, td')).map(testoVisibile);
      const nomeEsame = celle[indiceNome] || '';
      const voto = celle[indiceVoto] || '';
      const cfu = parseNumero(celle[indiceCfu]);
      if (!nomeEsame || !voto || !/^(?:30\s*e\s*lode|30l?|2[0-9]|1[89]|idone[oa]|superat[oa])$/i.test(voto.trim())) return;
      tabelleEsami.push({ name: nomeEsame, grade: voto.trim(), credits: cfu });
    });
  });

  const cfuEsami = tabelleEsami.filter((esame) => esame.credits !== null)
    .reduce((somma, esame) => somma + esame.credits, 0);
  const votiNumerici = tabelleEsami.map((esame) => {
    const match = esame.grade.match(/\d+/);
    return match ? { voto: Number(match[0]), cfu: esame.credits } : null;
  }).filter((voto) => voto && voto.voto >= 18 && voto.voto <= 30 && voto.cfu > 0);
  const cfuEspliciti = parseNumero(cfuValue);
  const mediaCalcolata = votiNumerici.length
    ? votiNumerici.reduce((somma, voto) => somma + voto.voto * voto.cfu, 0) / votiNumerici.reduce((somma, voto) => somma + voto.cfu, 0)
    : null;

  return {
    cfu: cfuEspliciti !== null ? cfuEspliciti : (cfuEsami || null),
    cfuTotal: parseNumero(cfuTotalValue),
    average: parseNumero(averageValue) || mediaCalcolata,
    grades: tabelleEsami,
    librettoRiconosciuto
  };
}

function raccogliCorsiStem() {
  const corsi = new Map();
  document.querySelectorAll(
    'a[href*="/course/view.php"], a[data-courseid], a[data-course-id], [data-courseid], [data-course-id]'
  ).forEach((elemento) => {
    const link = elemento.matches('a') ? elemento : elemento.querySelector('a[href]') || elemento;
    let url;
    try {
      url = new URL(link.href, window.location.href);
    } catch (errore) {
      return;
    }

    const schedaCorso = elemento.closest('.coursebox, .course-card, .course-listitem, [data-courseid], [data-course-id]');
    const idCorso = url.searchParams.get('id')
      || elemento.dataset.courseid
      || elemento.dataset.courseId
      || link.dataset.courseid
      || link.dataset.courseId
      || schedaCorso && (schedaCorso.dataset.courseid || schedaCorso.dataset.courseId);
    const urlCorsoValido = /^\/course\/view\.php$/i.test(url.pathname);
    const haIdCorso = elemento.hasAttribute('data-courseid')
      || elemento.hasAttribute('data-course-id')
      || link.hasAttribute('data-courseid')
      || link.hasAttribute('data-course-id')
      || schedaCorso && (schedaCorso.hasAttribute('data-courseid') || schedaCorso.hasAttribute('data-course-id'));
    if (url.hostname !== 'stem.elearning.unipd.it'
      || !urlCorsoValido && !haIdCorso
      || !idCorso || !/^\d+$/.test(idCorso)) return;

    const nodoTitolo = link.querySelector('[data-region="course-content"] .multiline[title], .multiline[title]')
      || schedaCorso && schedaCorso.querySelector('.multiline[title]');
    const titoloCompleto = nodoTitolo && nodoTitolo.getAttribute('title');
    const titoloScheda = schedaCorso && schedaCorso.querySelector('h2, h3, h4, .coursename, .course-title, .multiline');
    const titolo = titoloCompleto
      || testoVisibile(link)
      || link.getAttribute('aria-label')
      || link.getAttribute('title')
      || testoVisibile(titoloScheda)
      || elemento.getAttribute('aria-label')
      || elemento.getAttribute('title')
      || '';
    if (titolo.trim().length < 2) return;

    const urlCorso = new URL('/course/view.php', window.location.origin);
    urlCorso.searchParams.set('id', idCorso);
    corsi.set(urlCorso.href, { title: titolo.trim(), url: urlCorso.href, source: 'stem' });
  });
  return Array.from(corsi.values());
}

function informazioniPagina() {
  return {
    host: window.location.hostname,
    percorso: window.location.pathname,
    titolo: document.title
  };
}

function estraiDatiDashboard(fonte) {
  const testoPagina = normalizzaEtichetta(testoVisibile(document.body));
  const linkLogin = document.querySelector('a[href*="/login/index.php"]');
  const paginaLogin = document.querySelector('input[type="password"]')
    || document.body.classList.contains('notloggedin')
    || linkLogin
    || /\bospite\b/.test(testoPagina)
    || testoPagina.includes('effettua il login')
    || testoPagina.includes('nome utente e password');
  if (paginaLogin) return { ok: false, errore: 'La pagina non risulta autenticata.', pagina: informazioniPagina() };

  const coppie = raccogliCoppieEtichettaValore();
  const dati = {
    profile: leggiProfiloPortale(coppie),
    career: fonte === 'uniweb' ? leggiCarriera(coppie) : { grades: [] },
    courses: fonte === 'stem' ? raccogliCorsiStem() : []
  };
  const pagina = informazioniPagina();
  if (fonte === 'stem' && dati.courses.length === 0) {
    pagina.linkCorsi = Array.from(document.querySelectorAll('a[href*="/course/view.php"]')).filter((link) => {
      const url = new URL(link.href, window.location.href);
      return url.hostname === 'stem.elearning.unipd.it' && /^\/course\/view\.php$/i.test(url.pathname);
    }).length;
    pagina.schedeCorsi = document.querySelectorAll('.course-card[data-course-id], .course-card[data-courseid]').length;
  }

  return { ok: true, data: dati, pagina };
}

chrome.runtime.onMessage.addListener((messaggio, mittente, sendResponse) => {
  if (!messaggio) return;

  if (messaggio.type === 'prepare-sync-auth') {
    const host = window.location.hostname;
    if (host === 'stem.elearning.unipd.it') {
      const risultato = estraiDatiDashboard('stem');
      const richiedeLogin = !risultato.ok && risultato.errore === 'La pagina non risulta autenticata.';
      sendResponse({
        ok: true,
        richiedeLogin,
        fase: window.location.pathname.replace(/\/+$/, '') === '/login/index.php' ? 'login' : 'root'
      });
      return;
    }

    if (host === 'uniweb.unipd.it' && window.location.pathname.startsWith('/auth/Logon.do')) {
      sendResponse({ ok: true, richiedeLogin: true, fase: 'uniweb_shibboleth' });
      return;
    }

    if (host !== 'uniweb.unipd.it') {
      sendResponse({ ok: false, errore: 'La pagina non appartiene a un portale supportato.' });
      return;
    }

    sendResponse({ ok: true, richiedeLogin: false });
    return;
  }

  if (messaggio.type === 'start-sync-login') {
    const host = window.location.hostname;
    if (host !== 'shibidp.cca.unipd.it' && host !== 'stem.elearning.unipd.it' && host !== 'uniweb.unipd.it') {
      sendResponse({ ok: false, errore: 'Il login automatico e consentito solo sui portali UniPD supportati.' });
      return;
    }

    avviaEstensioneUniPD();
    sendResponse({ ok: true });
    return;
  }

  if (messaggio.type !== 'collect-dashboard-data') return;

  const fonte = window.location.hostname === 'stem.elearning.unipd.it' ? 'stem'
    : window.location.hostname === 'uniweb.unipd.it' ? 'uniweb' : null;
  if (!fonte) {
    sendResponse({
      ok: false,
      errore: 'La pagina non appartiene a un portale supportato.',
      pagina: informazioniPagina()
    });
    return;
  }

  if (fonte === 'stem') {
    let tentativo = 0;
    const raccogliDopoCaricamento = () => {
      const risultato = estraiDatiDashboard(fonte);
      if (!risultato.ok || risultato.data.courses.length > 0 || tentativo >= 20) {
        sendResponse(risultato);
        return;
      }
      tentativo += 1;
      window.setTimeout(raccogliDopoCaricamento, 250);
    };
    raccogliDopoCaricamento();
    return true;
  }

  sendResponse(estraiDatiDashboard(fonte));
});

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
