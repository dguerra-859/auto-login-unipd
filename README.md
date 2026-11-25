# Auto Login Portale Studenti UniPD

Estensione Chrome/Edge Manifest V3 non ufficiale che compila automaticamente i dati di accesso sulla pagina SSO del portale studenti dell'Universita di Padova.

> Il progetto non e affiliato all'Universita di Padova.

## Clausola di esclusione della responsabilita

Questo software viene fornito esclusivamente per uso personale e a proprio rischio. Gli autori e i contributori non rilasciano alcuna garanzia, esplicita o implicita, e non si assumono alcuna responsabilita per danni, perdite, accessi non autorizzati, problemi di sicurezza, interruzioni del servizio o qualsiasi altro danno diretto o indiretto derivante dall'uso o dall'uso improprio dell'estensione.

L'utente e l'unico responsabile della gestione delle proprie credenziali, dell'utilizzo dell'estensione nel rispetto delle regole dell'Universita di Padova e delle proprie politiche di sicurezza. L'estensione non garantisce l'autenticazione, la disponibilita del servizio SSO o la protezione delle credenziali in caso di compromissione del dispositivo o del browser.

## Funzionalita

- Configurazione di nome utente, dominio e password tramite popup
- Supporto per i profili:
  - `@unipd.it`
  - `@studenti.unipd.it`
  - `@ext.unipd.it`
- Compilazione automatica dei campi sulla pagina Shibboleth
- Invio automatico facoltativo del modulo
- Schermata di caricamento con logo UniPD durante l'accesso avviato dalla popup
- Salvataggio delle impostazioni con `chrome.storage.local`
- Dashboard studente apribile dalla popup
- Sincronizzazione manuale e automatica ogni 10 minuti di profilo/libretto Uniweb e corsi STEM
- Salvataggio locale dei dati dashboard e modifica manuale dei campi
- Tema dashboard automatico secondo la preferenza del browser, con pulsante per passare tra automatico, chiaro e scuro

## Come funziona

Il popup salva localmente nel browser:

- `unipd_user`: nome utente senza suffisso `@...`
- `unipd_dominio`: radio button del dominio selezionato
- `unipd_pass`: password
- `unipd_autosubmit`: stato dell'invio automatico

Quando viene caricata una pagina corrispondente a `https://shibidp.cca.unipd.it/*`, [content.js](./scripts/content.js) attende il caricamento della pagina, seleziona il profilo configurato, compila nome utente e password e, se abilitato, clicca il pulsante `Accedi` dopo 300 ms.

Se username o password non sono stati configurati, l'estensione non modifica la pagina.

## Installazione

1. Apri Chrome o Edge e visita:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Attiva la **Modalita sviluppatore**.
3. Seleziona **Carica unpacked** / **Carica decompressa**.
4. Seleziona la cartella di questo progetto.

L'estensione verra caricata senza passare attraverso il Chrome Web Store.

## Uso

1. Apri il popup dell'estensione dalla barra del browser.
   - Usa **Entra in STEM eLearning** per aprire direttamente `https://stem.elearning.unipd.it/`; se hai gia una sessione attiva, entri nel sito senza rifare l'accesso.
   - Il pulsante avvia il percorso Login → SSO. Visitare manualmente STEM o cliccare direttamente "Login" non attiva automaticamente l'accesso SSO.
   - Usa **Entra in Uniweb** per aprire Uniweb e avviare il Login SSO solo in quel flusso. Visitare o usare Uniweb manualmente non attiva l'accesso automatico.
2. Inserisci il nome utente senza `@...`, ad esempio `mario.rossi`.
3. Seleziona il profilo corrispondente.
4. Inserisci la password.
5. Lascia attivo **Clicca "Accedi" in automatico** oppure disattivalo per compilare i campi senza inviare il modulo.
6. Premi **Salva Credenziali**.

La compilazione automatica e la schermata di caricamento si attivano nei flussi avviati dai pulsanti della popup. Durante il refresh della dashboard, se una scheda STEM/Uniweb richiede l'accesso e arriva a SSO, l'estensione può tentare una sola volta il login con le credenziali salvate, purché l'invio automatico sia abilitato nel popup.

### Dashboard e sincronizzazione

1. Dopo aver aggiornato i file dell'estensione, premi **Ricarica** nella pagina `chrome://extensions` o `edge://extensions`.
2. Accedi a STEM e Uniweb nel browser almeno una volta e assicurati che la sessione sia attiva.
3. Premi **Apri dashboard studente** nel popup.
4. Premi **Aggiorna da STEM e Uniweb** per avviare subito il refresh. In seguito l'estensione ripete l'operazione ogni 10 minuti mentre il browser e in esecuzione.

Il refresh apre una scheda inattiva alla volta, leggendo i corsi STEM da **I miei corsi** e i dati Uniweb da **Home Studente** e **Libretto**; poi chiude le schede. Usa la sessione browser esistente e, se una scheda di sincronizzazione viene reindirizzata al SSO UniPD, può tentare una sola volta il login con le credenziali salvate nel popup, solo se **Clicca "Accedi" in automatico** è abilitato. La password viene inviata esclusivamente alla pagina SSO UniPD; non viene inviata ai server di questo progetto. L'email mostrata nella dashboard viene composta dal nome utente e dal dominio scelto nel popup, non letta dal profilo Uniweb. Corso e anno di corso vengono letti dalla Home Studente. Se la tabella del Libretto è riconosciuta ma le celle dei voti sono vuote, il libretto viene considerato letto senza registrare esami. Se la sessione scade, l'accesso automatico non è abilitato o un portale non risponde, il refresh segnala l'errore e mantiene visibili i dati salvati. La dashboard mostra l'ora dell'ultimo tentativo e si aggiorna automaticamente quando il refresh termina. Chrome/Edge possono ritardare gli allarmi, ad esempio quando il browser e sospeso o chiuso: l'intervallo di 10 minuti non garantisce un'esecuzione precisa al minuto. Il riconoscimento dipende dalla struttura visibile dei portali; i campi si possono correggere con **Modifica profilo**. I dati e i collegamenti restano in `chrome.storage.local`.

## Struttura del progetto

- `manifest.json`: configurazione Manifest V3, permessi e content script
- `scripts/`: service worker e script content/popup/dashboard
- `pages/`: popup, dashboard e pagina di caricamento
- `styles/`: fogli di stile della dashboard e della schermata di caricamento
- `assets/`: logo e icone dell'estensione
- `README.md`: documentazione del progetto

## Permessi

L'estensione usa i permessi `storage` e `alarms` per salvare credenziali/dati dashboard localmente e pianificare il refresh ogni 10 minuti. Il permesso `scripting` consente, solo sulle pagine STEM autorizzate, di interrogare il servizio AJAX Moodle nella scheda di sincronizzazione quando le card dei corsi non sono state renderizzate. L'accesso host è limitato a STEM, Uniweb e al portale SSO UniPD per aprire le pagine, leggere il contenuto e, se necessario, inviare le credenziali al login. Non richiede il permesso generico `tabs`.

Il content script viene eseguito esclusivamente sulle pagine sotto `https://shibidp.cca.unipd.it/*`, `https://stem.elearning.unipd.it/*` e `https://uniweb.unipd.it/*`. La schermata di caricamento con il logo UniPD viene mostrata solo durante un flusso avviato dalla popup.

## Sicurezza

Le credenziali e i dati della dashboard vengono memorizzati nel profilo browser tramite `chrome.storage.local`. La sincronizzazione apre schede inattive dei portali e legge i dati tramite il content script. Se una scheda di sincronizzazione richiede il login, può inviare una sola volta le credenziali salvate al SSO UniPD, purché l'invio automatico sia abilitato. Non invia credenziali o dati personali a server appartenenti a questo progetto, né copia il testo integrale delle pagine.

L'invio della password avviene esclusivamente all'apertura della pagina SSO configurata nel manifest. Usa l'estensione solo sul tuo dispositivo personale e disinstallala se non la utilizzi.