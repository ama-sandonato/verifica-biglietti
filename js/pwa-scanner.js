// =====================
// SESSION
// =====================
const TOKEN_KEY    = 'ama_pwa_token';
const USER_KEY     = 'ama_pwa_user';
const PERMESSI_KEY = 'ama_pwa_permessi';

const PERMESSO_VERIFICA = 'tab:verifica-biglietti';

function getToken()    { return sessionStorage.getItem(TOKEN_KEY); }
function getUser()     { return sessionStorage.getItem(USER_KEY); }
function getPermessi() { return JSON.parse(sessionStorage.getItem(PERMESSI_KEY) || '[]'); }
function hasPermesso(p) { return getPermessi().includes(p); }

function saveSession(token, user, permessi) {
  sessionStorage.setItem(TOKEN_KEY,    token);
  sessionStorage.setItem(USER_KEY,     user);
  sessionStorage.setItem(PERMESSI_KEY, JSON.stringify(permessi || []));
}

function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(PERMESSI_KEY);
}

// Aggiorna i permessi dal backend in background.
// Chiamata al caricamento app e ad ogni ritorno in foreground.
function refreshPermessi() {
  if (!getToken()) return;
  fetch(AppConfig.apiUrl, {
    method : 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body   : JSON.stringify({ action: 'getPermessi', token: getToken() })
  })
  .then(res => res.json())
  .then(res => {
    if (res.esito === 'OK') {
      sessionStorage.setItem(PERMESSI_KEY, JSON.stringify(res.permessi || []));
      // Se il permesso di verifica è stato revocato, forza logout
      if (!hasPermesso(PERMESSO_VERIFICA)) {
        logout();
      }
    }
  })
  .catch(() => {}); // errori di rete ignorati silenziosamente
}


// =====================
// INIT
// =====================
document.addEventListener('DOMContentLoaded', () => {
  updateStatusBadge();
  window.addEventListener('online',  updateStatusBadge);
  window.addEventListener('offline', updateStatusBadge);

  // Refresh permessi quando la PWA torna in foreground (es. dopo lock schermo)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshPermessi();
  });

  if (getToken()) {
    showScannerScreen();
    refreshPermessi();
  } else {
    showLoginScreen();
  }
});

function updateStatusBadge() {
  const badge = document.getElementById('status-badge');
  if (navigator.onLine) {
    badge.textContent = '● Online';
    badge.className   = 'header-badge online';
  } else {
    badge.textContent = '● Offline';
    badge.className   = 'header-badge offline';
  }
}


// =====================
// SHOW / HIDE SCREENS
// =====================
function showLoginScreen() {
  document.getElementById('login-screen').style.display   = 'flex';
  document.getElementById('scanner-screen').style.display = 'none';
  document.getElementById('user-footer').style.display    = 'none';
  document.getElementById('risultato').style.display      = 'none';
}

function showScannerScreen() {
  document.getElementById('login-screen').style.display   = 'none';
  document.getElementById('scanner-screen').style.display = 'flex';
  document.getElementById('user-footer').style.display    = 'flex';
  document.getElementById('user-footer-name').textContent = getUser();
}


// =====================
// LOGIN
// =====================
function doLogin() {
  const user     = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-password').value;
  const errorDiv = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errorDiv.style.display = 'none';

  if (!user || !password) {
    errorDiv.textContent   = 'Inserisci utente e password.';
    errorDiv.style.display = 'block';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Accesso in corso...';
  document.getElementById('loading-overlay').style.display = 'flex';

  fetch(AppConfig.apiUrl, {
    method : 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body   : JSON.stringify({ action: 'login', formData: { user, password } })
  })
  .then(res => res.json())
  .then(res => {
    document.getElementById('loading-overlay').style.display = 'none';
    btn.disabled    = false;
    btn.textContent = 'Accedi';

    if (res.esito === 'OK') {
      if (!(res.permessi || []).includes(PERMESSO_VERIFICA)) {
        errorDiv.textContent   = '❌ Utente non autorizzato per la verifica biglietti.';
        errorDiv.style.display = 'block';
        return;
      }
      saveSession(res.token, res.user, res.permessi);
      document.getElementById('login-password').value = '';
      showScannerScreen();
    } else {
      errorDiv.textContent   = '❌ ' + (res.messaggio || 'Credenziali non valide.');
      errorDiv.style.display = 'block';
    }
  })
  .catch(() => {
    document.getElementById('loading-overlay').style.display = 'none';
    btn.disabled           = false;
    btn.textContent        = 'Accedi';
    errorDiv.textContent   = '❌ Errore di connessione.';
    errorDiv.style.display = 'block';
  });
}

function logout() {
  fermaScanner();
  clearSession();
  chiudiRisultato();
  showLoginScreen();
}


// =====================
// AVVIA SCANNER
// =====================
let locked  = false;
let scanner = null;

function avviaScanner() {
  chiudiRisultato();
  locked = false;

  document.getElementById('cam-placeholder').style.display = 'none';

  scanner = new Html5Qrcode("reader");
  scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 260 },
    onQRCodeScansionato,
    () => {}
  ).then(() => {
    const video = document.querySelector("#reader video");
    if (video) {
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.muted = true;
      video.play();
    }
    document.getElementById('b-start-scan').style.display = 'none';
    document.getElementById('b-stop-scan').style.display  = 'block';
    document.querySelector('.reader-wrap').classList.add('scanning');
  }).catch(err => {
    document.getElementById('cam-placeholder').style.display = 'flex';
    document.getElementById('b-start-scan').style.display   = 'block';
    document.getElementById('b-stop-scan').style.display    = 'none';
    mostraRisultato({ esito: 'KO', icona: '❌', messaggio: 'Errore fotocamera: ' + err, dati: null });
  });
}


// =====================
// FERMA SCANNER
// =====================
function fermaScanner() {
  if (scanner) {
    scanner.stop().then(() => {
      scanner.clear();
      scanner = null;

      document.querySelector('.reader-wrap').classList.remove('scanning');

      // Ripristina placeholder
      const reader = document.getElementById('reader');
      reader.innerHTML = '';
      const ph = document.createElement('div');
      ph.id        = 'cam-placeholder';
      ph.className = 'cam-placeholder';
      ph.innerHTML = '<div class="cam-placeholder-icon">📷</div><div class="cam-placeholder-text">Fotocamera non attiva</div>';
      reader.appendChild(ph);

      document.getElementById('b-start-scan').style.display = 'block';
      document.getElementById('b-stop-scan').style.display  = 'none';
    }).catch(err => console.error("Errore stop scanner:", err));
  }
}


// =====================
// QR SCANSIONATO
// =====================
function onQRCodeScansionato(codiceDecodificato) {
  if (locked) return;
  locked = true;

  fermaScanner();

  document.getElementById('loading').style.display = 'flex';

  if (AppConfig.debugMode) {
    console.log('[QR] Codice scansionato:', codiceDecodificato);
  }

  fetch(AppConfig.apiUrl, {
    method : "POST",
    headers: { "Content-Type": "text/plain" },
    body   : JSON.stringify({
      action  : "verificaEAggiorna",
      token   : getToken(),
      codiceQR: codiceDecodificato
    })
  })
  .then(res => res.json())
  .then(res => {
    document.getElementById('loading').style.display = 'none';

    // Token scaduto o non valido → torna al login
    if (res.motivo === 'AUTH_EXPIRED' || res.motivo === 'AUTH_MISSING' || res.motivo === 'AUTH_INVALID') {
      clearSession();
      showLoginScreen();
      return;
    }

    mostraRisultato(res);
  })
  .catch(() => {
    document.getElementById('loading').style.display = 'none';
    mostraRisultato({ esito: 'KO', icona: '❌', messaggio: 'Errore di connessione. Riprova.', dati: null });
  });
}


// =====================
// MOSTRA RISULTATO
// =====================
function mostraRisultato(risposta) {
  const esito = (risposta.esito || 'KO').toUpperCase();
  let statoClass, iconClass, esitoClass, icona;

  if (esito === 'OK') {
    statoClass = 'stato-ok';   iconClass = 'icon-ok';   esitoClass = 'esito-ok';
    icona = '✅';
  } else if (esito === 'WARNING') {
    statoClass = 'stato-warn'; iconClass = 'icon-warn'; esitoClass = 'esito-warn';
    icona = '⚠️';
  } else {
    statoClass = 'stato-ko';   iconClass = 'icon-ko';   esitoClass = 'esito-ko';
    icona = '❌';
  }

  let datiHtml = '';
  if (risposta.dati) {
    const d = risposta.dati;
    const ingressi = Number(d.adulti || 0) + Number(d.bambini || 0);
    const rows = [
      { icon: '👤', label: 'Nominativo',   value: d.name },
      { icon: '👥', label: 'Ingressi',      value: ingressi },
      { icon: '🍕', label: 'Menù Pizza',    value: d.menu1 },
      { icon: '🌭', label: 'Menù Hot Dog',  value: d.menu2 },
      { icon: '🍺', label: 'Birre extra',   value: d.birreExtra },
      // per ora non servono : { icon: '🎮', label: 'Token giochi',  value: d.tokensGiochi },
    ];

    datiHtml = rows.map(r => `
      <div class="dati-row">
        <div class="dati-label">
          <span class="dati-label-icon">${r.icon}</span>
          ${r.label}
        </div>
        <div class="dati-value">${r.value ?? '—'}</div>
      </div>
    `).join('');
  }

  const div = document.getElementById('risultato');
  div.className = statoClass;
  div.innerHTML = `
    <div class="result-header">
      <div class="result-icon-wrap ${iconClass}">${icona}</div>
      <div class="result-header-text">
        <div class="result-esito ${esitoClass}">${risposta.esito}</div>
        <div class="result-messaggio">${risposta.messaggio || ''}</div>
      </div>
    </div>
    <div class="result-divider"></div>
    ${datiHtml ? `<div class="result-dati">${datiHtml}</div>` : '<div style="flex:1"></div>'}
    <div class="result-actions">
      <button class="btn-result chiudi" onclick="chiudiRisultato()">✕ Chiudi</button>
      <button class="btn-result nuovo" onclick="avviaScanner()">📷 Nuovo Scan</button>
    </div>
  `;
  div.style.display = 'flex';

  setTimeout(() => locked = false, 1500);
  navigator.vibrate?.(esito === 'OK' ? 100 : [100, 50, 100]);

  if (AppConfig.debugMode) {
    console.log('[Risultato]', risposta);
  }
}


// =====================
// CHIUDI RISULTATO
// =====================
function chiudiRisultato() {
  document.getElementById('risultato').style.display = 'none';
  locked = false;
}
