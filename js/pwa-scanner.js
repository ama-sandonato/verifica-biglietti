// =====================
// SESSION
// =====================
const TOKEN_KEY    = 'ama_pwa_token';
const USER_KEY     = 'ama_pwa_user';
const PERMESSI_KEY = 'ama_pwa_permessi';

const PERMESSO_VERIFICA   = 'tab:verifica-biglietti';
const PERMESSO_DASHBOARD  = 'tab:dashboard-verificator';
const PERMESSO_CUCINA     = 'tab:dashboard-cucina';

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

// =====================
// API HELPER
// =====================
function pwaFetch(action, extra) {
  return fetch(AppConfig.apiUrl, {
    method : 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body   : JSON.stringify({ action, token: getToken(), ...extra })
  })
  .then(r => r.json())
  .then(res => {
    if (res.motivo === 'AUTH_EXPIRED' || res.motivo === 'AUTH_MISSING' || res.motivo === 'AUTH_INVALID') {
      const eraScaduto = res.motivo === 'AUTH_EXPIRED';
      logout();
      if (eraScaduto) {
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent   = '⏰ Sessione scaduta. Effettua nuovamente il login.';
        errorDiv.style.display = 'block';
      }
      return Promise.reject('auth');
    }
    return res;
  });
}

// =====================
// PERMESSI
// =====================
function refreshPermessi() {
  if (!getToken()) return;
  pwaFetch('getPermessi')
    .then(res => {
      if (res.esito === 'OK') {
        sessionStorage.setItem(PERMESSI_KEY, JSON.stringify(res.permessi || []));
        if (!hasPermesso(PERMESSO_VERIFICA) && !hasPermesso(PERMESSO_CUCINA)) logout();
        // Aggiorna visibilità tab dashboard (solo per verificator)
        const bnav = document.getElementById('bnav-dashboard');
        if (bnav) bnav.style.display = hasPermesso(PERMESSO_DASHBOARD) ? '' : 'none';
      }
    })
    .catch(() => {});
}

// =====================
// INIT
// =====================
document.addEventListener('DOMContentLoaded', () => {
  updateStatusBadge();
  window.addEventListener('online',  updateStatusBadge);
  window.addEventListener('offline', updateStatusBadge);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshPermessi();
      if (_currentTab === 'dashboard') loadDashboardVerificator(true);
      if (_currentTab === 'cucina')    loadDashboardCucina(true);
    }
  });

  if (getToken()) {
    showMainScreen();
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
  document.getElementById('login-screen').style.display    = 'flex';
  document.getElementById('tab-scanner').style.display     = 'none';
  document.getElementById('tab-dashboard').style.display   = 'none';
  document.getElementById('tab-cucina').style.display      = 'none';
  document.getElementById('sticky-stats').style.display    = 'none';
  document.getElementById('bottom-nav').style.display      = 'none';
  document.getElementById('btn-logout').style.display      = 'none';
  document.getElementById('risultato').style.display       = 'none';
  stopStatsInterval();
  stopCucinaInterval();
}

function showMainScreen() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('btn-logout').style.display   = '';
  document.getElementById('sstat-username').textContent = getUser();

  if (hasPermesso(PERMESSO_CUCINA) && !hasPermesso(PERMESSO_VERIFICA)) {
    // Utente cucina-only: niente scanner, niente sticky, niente bottom-nav
    document.getElementById('sticky-stats').style.display = 'none';
    document.getElementById('bottom-nav').style.display   = 'none';
    showTab('cucina');
    startCucinaInterval();
  } else {
    // Utente verificator (con o senza cucina)
    document.getElementById('sticky-stats').style.display = 'flex';
    document.getElementById('bottom-nav').style.display   = 'flex';
    const bnavDash   = document.getElementById('bnav-dashboard');
    const bnavCucina = document.getElementById('bnav-cucina');
    if (bnavDash)   bnavDash.style.display   = hasPermesso(PERMESSO_DASHBOARD) ? '' : 'none';
    if (bnavCucina) bnavCucina.style.display = hasPermesso(PERMESSO_CUCINA)    ? '' : 'none';
    showTab(_currentTab || 'scanner');
    startStatsInterval();
    pwaFetch('getDashboardVerificator').then(updateStickyStats).catch(() => {});
  }
}


// =====================
// TAB NAVIGATION
// =====================
let _currentTab = 'scanner';

function showTab(tab) {
  if (tab === 'dashboard' && !hasPermesso(PERMESSO_DASHBOARD)) tab = 'scanner';

  _currentTab = tab;

  document.getElementById('tab-scanner').style.display   = tab === 'scanner'   ? 'flex'  : 'none';
  document.getElementById('tab-dashboard').style.display = tab === 'dashboard' ? 'block' : 'none';
  document.getElementById('tab-cucina').style.display    = tab === 'cucina'    ? 'flex'  : 'none';

  const bnavScanner = document.getElementById('bnav-scanner');
  const bnavDash    = document.getElementById('bnav-dashboard');
  const bnavCucina  = document.getElementById('bnav-cucina');
  if (bnavScanner) bnavScanner.classList.toggle('active', tab === 'scanner');
  if (bnavDash)    bnavDash.classList.toggle('active',    tab === 'dashboard');
  if (bnavCucina)  bnavCucina.classList.toggle('active',  tab === 'cucina');

  if (tab === 'dashboard') loadDashboardVerificator();
  if (tab === 'cucina')    loadDashboardCucina();
  if (tab === 'scanner')   chiudiRisultato();
}


// =====================
// STICKY STATS
// =====================
let _statsInterval = null;

function updateStickyStats(stats) {
  if (!stats || stats.esito !== 'OK') return;
  const b = stats.biglietti;
  const p = stats.persone;
  document.getElementById('sstat-biglietti').textContent = `${b.entrati}/${b.confermati}`;
  document.getElementById('sstat-persone').textContent   = `${p.entrate}/${p.confermate}`;
}

function startStatsInterval() {
  stopStatsInterval();
  _statsInterval = setInterval(() => {
    pwaFetch('getDashboardVerificator')
      .then(data => {
        updateStickyStats(data);
        if (_currentTab === 'dashboard') { _dashboardLoaded = false; loadDashboardVerificator(); }
      })
      .catch(() => {});
  }, 5 * 60 * 1000);
}

function stopStatsInterval() {
  if (_statsInterval) { clearInterval(_statsInterval); _statsInterval = null; }
}


// =====================
// DASHBOARD VERIFICATOR
// =====================
let _dashboardLoaded = false;

function loadDashboardVerificator(force) {
  if (_dashboardLoaded && !force) return;
  document.getElementById('dashboard-content').innerHTML =
    '<div class="vd-placeholder">⌛ Caricamento dati...</div>';

  pwaFetch('getDashboardVerificator')
    .then(data => {
      _dashboardLoaded = true;
      updateStickyStats(data);
      renderDashboardVerificator(data);
    })
    .catch(err => {
      if (err !== 'auth') {
        document.getElementById('dashboard-content').innerHTML =
          '<div class="vd-placeholder vd-error">❌ Errore caricamento. Riprova.</div>';
      }
    });
}

function renderDashboardVerificator(data) {
  const pct      = (a, b) => b > 0 ? Math.round(a / b * 100) : 0;
  const barColor = p => p >= 90 ? 'var(--ok)' : p >= 60 ? 'var(--warn)' : 'var(--ko)';

  const card = (icon, label, entrati, confermati) => {
    const p        = pct(entrati, confermati);
    const mancanti = confermati - entrati;
    const bColor   = barColor(p);
    return `
      <div class="vd-card">
        <div class="vd-card-top">
          <span class="vd-icon">${icon}</span>
          <span class="vd-label">${label}</span>
          <span class="vd-pct" style="color:${bColor}">${p}%</span>
        </div>
        <div class="vd-progress-track">
          <div class="vd-progress-bar" style="width:${p}%; background:${bColor}"></div>
        </div>
        <div class="vd-card-bottom">
          <span class="vd-entrati">${entrati} entrati</span>
          <span class="vd-mancanti ${mancanti > 0 ? 'warn' : 'ok'}">
            ${mancanti > 0 ? mancanti + ' mancanti' : '✓ tutti entrati'}
          </span>
        </div>
      </div>`;
  };

  document.getElementById('dashboard-content').innerHTML = `
    <div class="vd-toolbar">
      <span class="vd-title">📊 Ingressi in tempo reale</span>
      <button class="btn-vd-refresh" onclick="loadDashboardVerificator(true)">↻ Aggiorna</button>
    </div>
    <div class="vd-cards">
      ${card('🎫', 'Biglietti', data.biglietti.entrati,  data.biglietti.confermati)}
      ${card('👥', 'Persone',   data.persone.entrate,    data.persone.confermate)}
      ${card('🍕', 'Menu 1',    data.menu1.entrati,      data.menu1.confermati)}
      ${card('🌭', 'Menu 2',    data.menu2.entrati,      data.menu2.confermati)}
      ${card('🍺', 'Birre',     data.birre.entrate,      data.birre.confermate)}
    </div>
  `;
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
      const permessi = res.permessi || [];
      if (!permessi.includes(PERMESSO_VERIFICA) && !permessi.includes(PERMESSO_CUCINA)) {
        errorDiv.textContent   = '❌ Utente non autorizzato.';
        errorDiv.style.display = 'block';
        return;
      }
      saveSession(res.token, res.user, res.permessi);
      document.getElementById('login-password').value = '';
      showMainScreen();
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
  _dashboardLoaded  = false;
  _cucinaLoaded     = false;
  _currentTab       = 'scanner';
  showLoginScreen();
}


// =====================
// DASHBOARD CUCINA
// =====================
let _cucinaLoaded    = false;
let _cucinaInterval  = null;

function loadDashboardCucina(force) {
  if (_cucinaLoaded && !force) return;
  document.getElementById('cucina-content').innerHTML =
    '<div class="vd-placeholder">⌛ Caricamento dati...</div>';

  pwaFetch('getDashboardCucina')
    .then(data => {
      _cucinaLoaded = true;
      renderDashboardCucina(data);
    })
    .catch(err => {
      if (err !== 'auth') {
        document.getElementById('cucina-content').innerHTML =
          '<div class="vd-placeholder vd-error">❌ Errore caricamento. Riprova.</div>';
      }
    });
}

function renderDashboardCucina(data) {
  const card = (icon, label, entrati, confermati) => {
    const rimanenti = confermati - entrati;
    const pct       = confermati > 0 ? Math.round(entrati / confermati * 100) : 0;
    const bColor    = pct >= 90 ? 'var(--ok)' : pct >= 60 ? 'var(--warn)' : 'var(--ko)';
    const rimClass  = rimanenti <= 0 ? 'ok' : rimanenti <= 3 ? 'warn' : '';
    const rimTesto  = rimanenti > 0 ? `${rimanenti} ancora da servire` : '✓ Tutti serviti!';
    return `
      <div class="cu-card">
        <div class="cu-header">${icon} ${label}</div>
        <div class="cu-nums">
          <div class="cu-num-block">
            <div class="cu-big">${entrati}</div>
            <div class="cu-sub">Serviti</div>
          </div>
          <div class="cu-sep">／</div>
          <div class="cu-num-block">
            <div class="cu-big cu-total">${confermati}</div>
            <div class="cu-sub">Totali</div>
          </div>
        </div>
        <div class="vd-progress-track">
          <div class="vd-progress-bar" style="width:${pct}%; background:${bColor}"></div>
        </div>
        <div class="cu-rimanenti ${rimClass}">${rimTesto}</div>
      </div>`;
  };

  document.getElementById('cucina-content').innerHTML = `
    <div class="cu-toolbar">
      <span class="cu-title">🍕 Stato preparazioni</span>
      <button class="btn-vd-refresh" onclick="loadDashboardCucina(true)">↻ Aggiorna</button>
    </div>
    <div class="cu-cards">
      ${card('🍕', 'Menu 1', data.menu1.entrati, data.menu1.confermati)}
      ${card('🌭', 'Menu 2', data.menu2.entrati, data.menu2.confermati)}
    </div>
  `;
}

function startCucinaInterval() {
  stopCucinaInterval();
  _cucinaInterval = setInterval(() => {
    loadDashboardCucina(true);
  }, 5 * 60 * 1000);
}

function stopCucinaInterval() {
  if (_cucinaInterval) { clearInterval(_cucinaInterval); _cucinaInterval = null; }
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

  if (AppConfig.debugMode) console.log('[QR] Codice scansionato:', codiceDecodificato);

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

    if (res.motivo === 'AUTH_EXPIRED' || res.motivo === 'AUTH_MISSING' || res.motivo === 'AUTH_INVALID') {
      const eraScaduto = res.motivo === 'AUTH_EXPIRED';
      logout();
      if (eraScaduto) {
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent   = '⏰ Sessione scaduta. Effettua nuovamente il login.';
        errorDiv.style.display = 'block';
      }
      return;
    }

    // Aggiorna sticky stats con i dati freschi allegati alla risposta
    if (res.stats) updateStickyStats(res.stats);

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

  if (AppConfig.debugMode) console.log('[Risultato]', risposta);
}


// =====================
// CHIUDI RISULTATO
// =====================
function chiudiRisultato() {
  document.getElementById('risultato').style.display = 'none';
  locked = false;
}


// =====================
// GUIDA MODAL
// =====================
let _guidaCaricata = false;

function apriGuida() {
  document.getElementById('guida-modal').style.display = 'flex';
  if (!_guidaCaricata) {
    const file = hasPermesso(PERMESSO_CUCINA) && !hasPermesso(PERMESSO_VERIFICA)
      ? './guide-cucina.md'
      : './guide-verificator.md';
    fetch(file)
      .then(r => r.text())
      .then(md => {
        document.getElementById('guida-body').innerHTML = marked.parse(md);
        _guidaCaricata = true;
      })
      .catch(() => {
        document.getElementById('guida-body').innerHTML = '<p>Guida non disponibile.</p>';
      });
  }
}

function chiudiGuida() {
  document.getElementById('guida-modal').style.display = 'none';
}
