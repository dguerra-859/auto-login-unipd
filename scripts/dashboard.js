const CHIAVE_DASHBOARD = 'unipd_dashboard_data_v1';
const CHIAVE_SYNC_IN_CORSO = 'unipd_dashboard_sync_pending_v1';
let datiDashboard = {
  profile: {},
  career: { grades: [] },
  courses: [],
  sync: { sources: {} }
};

const elementi = {
  messaggio: document.getElementById('sync-message'),
  ultimoRefresh: document.getElementById('last-refresh'),
  pulsanteAggiorna: document.getElementById('refresh-data'),
  dialog: document.getElementById('profile-dialog'),
  form: document.getElementById('profile-form'),
  profiloStato: document.getElementById('profile-source-status'),
  carrieraStato: document.getElementById('career-source-status'),
  stemStato: document.getElementById('stem-source-status')
};

function mostraNumero(valore, decimali) {
  if (valore === null || valore === undefined || valore === '') return '—';
  const numero = Number(valore);
  return Number.isFinite(numero) ? numero.toFixed(decimali) : '—';
}

function formattaData(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp));
}

function formattaUltimoRefresh(timestamp) {
  if (!timestamp) return 'Ultimo refresh: mai';
  const data = new Date(timestamp);
  const oggi = new Date();
  const ieri = new Date(oggi);
  ieri.setDate(oggi.getDate() - 1);
  const stessaData = (prima, seconda) => prima.getFullYear() === seconda.getFullYear()
    && prima.getMonth() === seconda.getMonth()
    && prima.getDate() === seconda.getDate();
  const ora = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(data);
  if (stessaData(data, oggi)) return `Ultimo refresh: oggi alle ${ora}`;
  if (stessaData(data, ieri)) return `Ultimo refresh: ieri alle ${ora}`;
  return `Ultimo refresh: ${formattaData(timestamp)}`;
}

function aggiornaIndicatoreSyncInCorso(sync) {
  const inCorso = Boolean(sync);
  elementi.pulsanteAggiorna.disabled = inCorso;
  elementi.pulsanteAggiorna.textContent = inCorso ? 'Aggiornamento in corso…' : 'Aggiorna da STEM e Uniweb';
  if (inCorso) elementi.messaggio.textContent = 'Lettura in background in corso; i dati salvati restano disponibili.';
}

function aggiornaStato(elemento, stato) {
  const aggiornato = stato && stato.status === 'updated';
  elemento.dataset.state = aggiornato ? 'updated' : stato && stato.status === 'error' ? 'error' : '';
  elemento.title = stato && stato.message ? stato.message : '';
  if (!stato) {
    elemento.textContent = 'In attesa di sincronizzazione';
    return;
  }
  const fonte = stato.status === 'updated' ? 'Aggiornato'
    : stato.status === 'empty' ? 'Nessun dato riconosciuto'
      : stato.status === 'error' && stato.message && stato.message.startsWith('Ricarica le schede') ? 'Ricarica pagina'
        : stato.status === 'error' ? 'Non disponibile' : 'In attesa di sincronizzazione';
  elemento.textContent = `${fonte}${stato.updatedAt ? ` · ${formattaData(stato.updatedAt)}` : ''}`;
}

function renderizzaProfilo(profilo) {
  const nome = profilo.name || '';
  document.getElementById('student-name').textContent = nome || 'Dati non ancora disponibili';
  document.getElementById('student-course').textContent = profilo.course || 'Il profilo verra compilato dai dati riconosciuti su Uniweb.';
  document.getElementById('student-id').textContent = profilo.studentId || '—';
  document.getElementById('student-email').textContent = profilo.email || '—';
  document.getElementById('student-year').textContent = profilo.year || '—';
  document.getElementById('student-enrollment-year').textContent = profilo.enrollmentYear || '—';
  const iniziali = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toLocaleUpperCase('it-IT');
  document.getElementById('avatar').textContent = iniziali || 'ST';
}

async function copiaNegliAppunti(valore) {
  let erroreClipboard;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(valore);
      return;
    } catch (errore) {
      erroreClipboard = errore;
    }
  }

  const campoTemporaneo = document.createElement('textarea');
  campoTemporaneo.value = valore;
  campoTemporaneo.setAttribute('readonly', '');
  campoTemporaneo.style.position = 'fixed';
  campoTemporaneo.style.opacity = '0';
  try {
    document.body.append(campoTemporaneo);
    campoTemporaneo.select();
    campoTemporaneo.setSelectionRange(0, campoTemporaneo.value.length);
    if (!document.execCommand('copy')) {
      throw new Error('Il browser ha rifiutato la copia negli appunti.');
    }
  } catch (errore) {
    if (erroreClipboard) {
      throw new Error(`Clipboard API e copia compatibile non riuscite: ${errore.message || erroreClipboard.message}`);
    }
    throw errore;
  } finally {
    campoTemporaneo.remove();
  }
}

function renderizzaCarriera(carriera) {
  const cfu = carriera.cfu;
  const cfuTotali = carriera.cfuTotal;
  const media = carriera.average;
  document.getElementById('earned-credits').textContent = cfu === null || cfu === undefined ? '—' : mostraNumero(cfu, 0);
  document.getElementById('total-credits').textContent = cfuTotali === null || cfuTotali === undefined
    ? 'Totale non disponibile'
    : `su ${mostraNumero(cfuTotali, 0)} CFU`;
  document.getElementById('grade-average').textContent = mostraNumero(media, 2);
  document.getElementById('degree-estimate').textContent = media === null || media === undefined || !Number.isFinite(Number(media))
    ? '—'
    : ((Number(media) * 110) / 30).toFixed(1);

  const contenitore = document.getElementById('grades-list');
  contenitore.replaceChildren();
  const esami = Array.isArray(carriera.grades) ? carriera.grades : [];
  if (esami.length === 0) {
    const riga = document.createElement('tr');
    const cella = document.createElement('td');
    cella.colSpan = 3;
    cella.className = 'empty';
    cella.textContent = 'Nessun esame riconosciuto nei dati salvati.';
    riga.append(cella);
    contenitore.append(riga);
    return;
  }

  esami.forEach((esame) => {
    const riga = document.createElement('tr');
    [esame.name || '—', esame.grade || '—', esame.credits === null || esame.credits === undefined ? '—' : esame.credits].forEach((valore) => {
      const cella = document.createElement('td');
      cella.textContent = String(valore);
      riga.append(cella);
    });
    contenitore.append(riga);
  });
}

function renderizzaCorsi(corsi) {
  const contenitore = document.getElementById('courses-list');
  contenitore.replaceChildren();
  if (!Array.isArray(corsi) || corsi.length === 0) {
    const vuoto = document.createElement('p');
    vuoto.className = 'empty';
    vuoto.textContent = 'Nessun corso riconosciuto nei dati salvati.';
    contenitore.append(vuoto);
    return;
  }

  corsi.forEach((corso) => {
    let url;
    try {
      url = new URL(corso.url);
    } catch (errore) {
      return;
    }
    if (url.origin !== 'https://stem.elearning.unipd.it' || !/^\/course\/view\.php$/i.test(url.pathname)) return;

    const link = document.createElement('a');
    link.className = 'course-link';
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const titolo = document.createElement('span');
    titolo.textContent = corso.title || 'Apri corso STEM';
    const etichetta = document.createElement('small');
    etichetta.textContent = 'Apri ↗';
    link.append(titolo, etichetta);
    contenitore.append(link);
  });
}

function renderizza(dati) {
  datiDashboard = {
    profile: dati.profile || {},
    career: dati.career || { grades: [] },
    courses: Array.isArray(dati.courses) ? dati.courses : [],
    sync: dati.sync || { sources: {} }
  };
  const fonti = datiDashboard.sync.sources || {};
  renderizzaProfilo(datiDashboard.profile);
  renderizzaCarriera(datiDashboard.career);
  renderizzaCorsi(datiDashboard.courses);
  aggiornaStato(elementi.profiloStato, fonti.uniweb);
  aggiornaStato(elementi.carrieraStato, fonti.uniweb);
  aggiornaStato(elementi.stemStato, fonti.stem);
  elementi.ultimoRefresh.textContent = formattaUltimoRefresh(datiDashboard.sync.lastAttemptAt);
  if (datiDashboard.sync.message) elementi.messaggio.textContent = datiDashboard.sync.message;
}

function caricaDati() {
  chrome.storage.local.get([CHIAVE_DASHBOARD, CHIAVE_SYNC_IN_CORSO], (risultato) => {
    if (chrome.runtime.lastError) {
      elementi.messaggio.textContent = 'Impossibile leggere i dati locali dell’estensione.';
      console.error(chrome.runtime.lastError.message);
      return;
    }
    renderizza(risultato[CHIAVE_DASHBOARD] || {});
    aggiornaIndicatoreSyncInCorso(risultato[CHIAVE_SYNC_IN_CORSO]);
  });
}

function sincronizza() {
  elementi.pulsanteAggiorna.disabled = true;
  elementi.pulsanteAggiorna.textContent = 'Avvio aggiornamento…';
  elementi.messaggio.textContent = 'Avvio della lettura in background; i dati salvati restano visibili…';
  chrome.runtime.sendMessage({ type: 'sync-dashboard' }, (risposta) => {
    const errore = chrome.runtime.lastError;
    if (errore || !risposta) {
      elementi.pulsanteAggiorna.disabled = false;
      elementi.pulsanteAggiorna.textContent = 'Aggiorna da STEM e Uniweb';
      elementi.messaggio.textContent = errore
        ? `Errore di comunicazione con l’estensione: ${errore.message}`
        : 'Il processo in background non ha restituito una risposta.';
      console.error(errore ? errore.message : 'Risposta non valida dal processo in background.');
      return;
    }
    elementi.messaggio.textContent = risposta.messaggio;
    if (!risposta.ok) console.error(risposta.errore || risposta.messaggio);
    if (risposta.inCorso) aggiornaIndicatoreSyncInCorso({});
    else if (!risposta.ok) aggiornaIndicatoreSyncInCorso(null);
  });
}

function apriEditor() {
  const profilo = datiDashboard.profile;
  const carriera = datiDashboard.career;
  document.getElementById('edit-name').value = profilo.name || '';
  document.getElementById('edit-student-id').value = profilo.studentId || '';
  document.getElementById('edit-email').value = profilo.email || '';
  document.getElementById('edit-course').value = profilo.course || '';
  document.getElementById('edit-year').value = profilo.year || '';
  document.getElementById('edit-enrollment-year').value = profilo.enrollmentYear || '';
  document.getElementById('edit-credits').value = carriera.cfu ?? '';
  document.getElementById('edit-total-credits').value = carriera.cfuTotal ?? '';
  document.getElementById('edit-average').value = carriera.average ?? '';
  elementi.dialog.showModal();
}

function salvaModifiche(evento) {
  evento.preventDefault();
  const profilo = {
    ...datiDashboard.profile,
    name: document.getElementById('edit-name').value.trim(),
    studentId: document.getElementById('edit-student-id').value.trim(),
    email: document.getElementById('edit-email').value.trim(),
    course: document.getElementById('edit-course').value.trim(),
    year: document.getElementById('edit-year').value.trim(),
    enrollmentYear: document.getElementById('edit-enrollment-year').value.trim()
  };
  const valoreNumerico = (id) => {
    const valore = document.getElementById(id).value;
    return valore === '' ? null : Number(valore);
  };
  const carriera = {
    ...datiDashboard.career,
    cfu: valoreNumerico('edit-credits'),
    cfuTotal: valoreNumerico('edit-total-credits'),
    average: valoreNumerico('edit-average')
  };

  const aggiornati = { ...datiDashboard, profile: profilo, career: carriera };
  chrome.storage.local.set({ [CHIAVE_DASHBOARD]: aggiornati }, () => {
    if (chrome.runtime.lastError) {
      elementi.messaggio.textContent = 'Impossibile salvare le modifiche locali.';
      console.error(chrome.runtime.lastError.message);
      return;
    }
    elementi.dialog.close();
    renderizza(aggiornati);
    elementi.messaggio.textContent = 'Modifiche salvate nel browser.';
  });
}

document.getElementById('refresh-data').addEventListener('click', sincronizza);
document.getElementById('edit-profile').addEventListener('click', apriEditor);
document.getElementById('close-dialog').addEventListener('click', () => elementi.dialog.close());
document.getElementById('cancel-dialog').addEventListener('click', () => elementi.dialog.close());
elementi.form.addEventListener('submit', salvaModifiche);
document.querySelectorAll('.copy-button').forEach((pulsante) => {
  pulsante.addEventListener('click', async () => {
    const valore = document.getElementById(pulsante.dataset.copyTarget).textContent.trim();
    const etichetta = pulsante.dataset.copyLabel;
    const feedback = document.getElementById('copy-feedback');
    if (!valore || valore === '—') {
      feedback.textContent = `${etichetta} non disponibile.`;
      return;
    }

    try {
      await copiaNegliAppunti(valore);
      pulsante.textContent = 'Copiato';
      pulsante.dataset.copied = 'true';
      feedback.textContent = `${etichetta} copiata negli appunti.`;
      if (pulsante.dataset.resetTimer) window.clearTimeout(Number(pulsante.dataset.resetTimer));
      pulsante.dataset.resetTimer = String(window.setTimeout(() => {
        pulsante.textContent = 'Copia';
        delete pulsante.dataset.copied;
        delete pulsante.dataset.resetTimer;
      }, 1500));
    } catch (errore) {
      feedback.textContent = `Impossibile copiare ${etichetta.toLowerCase()}.`;
      console.error(errore);
    }
  });
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[CHIAVE_DASHBOARD]) renderizza(changes[CHIAVE_DASHBOARD].newValue || {});
  if (changes[CHIAVE_SYNC_IN_CORSO]) aggiornaIndicatoreSyncInCorso(changes[CHIAVE_SYNC_IN_CORSO].newValue);
});

caricaDati();
