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
- Salvataggio delle impostazioni con `chrome.storage.local`

## Come funziona

Il popup salva localmente nel browser:

- `unipd_user`: nome utente senza suffisso `@...`
- `unipd_dominio`: radio button del dominio selezionato
- `unipd_pass`: password
- `unipd_autosubmit`: stato dell'invio automatico

Quando viene caricata una pagina corrispondente a `https://shibidp.cca.unipd.it/*`, [content.js](./content.js) attende il caricamento della pagina, seleziona il profilo configurato, compila nome utente e password e, se abilitato, clicca il pulsante `Accedi` dopo 300 ms.

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
2. Inserisci il nome utente senza `@...`, ad esempio `mario.rossi`.
3. Seleziona il profilo corrispondente.
4. Inserisci la password.
5. Lascia attivo **Clicca "Accedi" in automatico** oppure disattivalo per compilare i campi senza inviare il modulo.
6. Premi **Salva Credenziali**.

Aprendo successivamente una pagina di accesso configurata, i dati vengono compilati automaticamente.

## Struttura del progetto

- `manifest.json`: configurazione Manifest V3, permessi e content script
- `popup.html`: interfaccia delle impostazioni
- `popup.js`: caricamento e salvataggio delle impostazioni
- `content.js`: compilazione e eventuale invio del modulo SSO
- `README.md`: documentazione del progetto

## Permessi

L'estensione richiede il permesso `storage` per salvare le credenziali e le preferenze localmente nel browser.

Il content script viene eseguito esclusivamente sulle pagine sotto `https://shibidp.cca.unipd.it/*`.

## Sicurezza

Le credenziali vengono memorizzate nel profilo browser tramite `chrome.storage.local`. Non vengono inviate a server appartenenti a questo progetto.

L'invio della password avviene esclusivamente all'apertura della pagina SSO configurata nel manifest. Usa l'estensione solo sul tuo dispositivo personale e disinstallala se non la utilizzi.