// HubAccounts — App shell: theme, header, sidebar brand, lock, clock, session timer, expiry banners and network status.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- CLOCK & STATUS ----------
const VI_DAYS = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
function tickClock(){
  const now = new Date();
  const hh = String(now.getHours()).padStart(2,'0');
  const mm = String(now.getMinutes()).padStart(2,'0');
  const ss = String(now.getSeconds()).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const MM = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  const timeEl = document.getElementById('clockTime');
  const dateEl = document.getElementById('clockDate');
  if(timeEl) timeEl.textContent = `${hh}:${mm}:${ss}`;
  if(dateEl) dateEl.textContent = `${VI_DAYS[now.getDay()]}, ${dd}/${MM}/${yyyy}`;

  const currentWindow = Math.floor(Date.now() / 1000 / 30);
  if(currentWindow !== totpLastWindow){
    totpLastWindow = currentWindow;
    refreshTotpCodes();
  } else {
    updateTotpColors();
  }

  checkAutoLogout();
  // expiry status doesn't need per-second precision — only re-scan once a minute
  const currentMinute = Math.floor(Date.now() / 60000);
  if(currentMinute !== lastExpiryCheckMinute){
    lastExpiryCheckMinute = currentMinute;
    checkPhoneExpiryNotifications();
    checkProxyExpiryNotifications();
  }
}

// ---------- SESSION: activity tracking and auto-logout ----------
function startSession(){
  const now = Date.now();
  state.session.loginTime = now;
  state.session.lastActivity = now;
  requestPersistentStorage();
}

async function requestPersistentStorage(){
  if(!navigator.storage || typeof navigator.storage.persist !== 'function') return false;
  try{
    if(typeof navigator.storage.persisted === 'function' && await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  }catch(error){
    return false;
  }
}

function endSession(){
  state.session.loginTime = null;
  state.session.lastActivity = null;
  state.phoneNotified = new Set();
  state.proxyAlertDismissedIds = new Set();
  clearPersistedSessionKey(); // any lock/logout — explicit, auto, or via switching vault files — always really locks
  const proxyBar = document.getElementById('proxyAlertBar');
  if(proxyBar){ proxyBar.classList.remove('show'); proxyBar.innerHTML = ''; }
  if(proxyExpiryNoticeTimer){ clearTimeout(proxyExpiryNoticeTimer); proxyExpiryNoticeTimer = null; }
  // The Ctrl+K palette keeps its own copy of decrypted entries: close it and
  // drop them so nothing stays visible or copyable after the vault locks.
  closeCommandPalette();
  commandPaletteFilteredEntries = [];
  const paletteList = document.getElementById('paletteResultsList');
  if(paletteList) paletteList.innerHTML = '';
}

function markActivity(){
  if(state.key && state.session.loginTime){
    state.session.lastActivity = Date.now();
  }
}
['click','keydown','touchstart','scroll'].forEach(evt => {
  document.addEventListener(evt, markActivity, { passive: true });
});

function checkAutoLogout(){
  if(!state.key || !state.session.lastActivity) return;
  const idleFor = Date.now() - state.session.lastActivity;
  if(idleFor >= AUTO_LOGOUT_MS){
    closeModal();
    lockVault('Đã tự động khoá sau 30 phút không hoạt động');
    toast('Đã tự động đăng xuất do không hoạt động 30 phút');
  }
}

// ---------- PHONE EXPIRY NOTIFICATIONS ----------
// warns once per session as soon as a "Phone" entry's Ngày hết hạn (expiry date)
// is within 1 day away (today or tomorrow)
function checkPhoneExpiryNotifications(){
  if(!state.key) return;
  const dueSoon = [];
  state.entries.filter(e => e.platform === 'phone' && e.expiryDate).forEach(e => {
    const info = phoneExpiryInfo(e.expiryDate);
    if(!info) return;
    if(info.diffDays >= 0 && info.diffDays <= 1 && !state.phoneNotified.has(e.id)){
      state.phoneNotified.add(e.id);
      dueSoon.push({ label: e.fbName || e.displayName || '(chưa có số)', diffDays: info.diffDays });
    }
  });
  if(dueSoon.length === 1){
    const d = dueSoon[0];
    toast(`⚠ SĐT ${d.label} ${d.diffDays === 0 ? 'hết hạn hôm nay' : 'sắp hết hạn (còn 1 ngày)'}`, 10000);
  } else if(dueSoon.length > 1){
    toast(`⚠ ${dueSoon.length} số điện thoại sắp hết hạn trong 1 ngày tới`, 10000);
  }
}

// ---------- PROXY RENEWAL BANNER (top-center, persistent until dismissed) ----------
function checkProxyExpiryNotifications(){
  if(!state.key) return;
  const dueSoon = [];
  state.entries.filter(e => e.platform === 'proxy' && e.expiryDate).forEach(e => {
    const info = phoneExpiryInfo(e.expiryDate);
    if(!info) return;
    if(info.diffDays >= 0 && info.diffDays <= 1 && !state.proxyAlertDismissedIds.has(e.id)){
      dueSoon.push({ id: e.id, label: e.fbName || e.displayName || '(chưa có IP)', diffDays: info.diffDays });
    }
  });
  renderProxyAlertBar(dueSoon);
}

function renderProxyAlertBar(dueSoon){
  const bar = document.getElementById('proxyAlertBar');
  if(!bar) return;
  if(proxyExpiryNoticeTimer){ clearTimeout(proxyExpiryNoticeTimer); proxyExpiryNoticeTimer = null; }
  if(dueSoon.length === 0){
    bar.classList.remove('show');
    bar.innerHTML = '';
    return;
  }
  const msg = dueSoon.length === 1
    ? `⚠ Proxy ${escapeHtml(dueSoon[0].label)} ${dueSoon[0].diffDays === 0 ? 'đã hết hạn hôm nay' : 'sắp hết hạn (còn 1 ngày)'} — hãy gia hạn`
    : `⚠ ${dueSoon.length} proxy sắp hết hạn trong 1 ngày tới — hãy gia hạn`;
  bar.innerHTML = `<span>${msg}</span><button type="button" id="proxyAlertDismissBtn" title="Đóng">&times;</button>`;
  bar.classList.add('show');
  const dismiss = () => {
    dueSoon.forEach(d => state.proxyAlertDismissedIds.add(d.id));
    checkProxyExpiryNotifications();
  };
  document.getElementById('proxyAlertDismissBtn').onclick = dismiss;
  proxyExpiryNoticeTimer = setTimeout(dismiss, 10000);
}

tickClock();
setInterval(tickClock, 1000);

// ---------- AUTOMATIC NETWORK STATUS ----------
// Network access is always enabled. The local backend is the primary IP source;
// direct browser lookups are only a fallback for deployments without that route.
const IP_LOOKUP_SOURCES = [
  { url: 'https://api.ipify.org?format=json', parse: async (res) => (await res.json()).ip },
  { url: 'https://api64.ipify.org?format=json', parse: async (res) => (await res.json()).ip },
  { url: 'https://ipapi.co/json/', parse: async (res) => (await res.json()).ip },
  { url: 'https://icanhazip.com/', parse: async (res) => (await res.text()).trim() },
  { url: 'https://checkip.amazonaws.com/', parse: async (res) => (await res.text()).trim() },
];

function isValidIpAddress(value){
  const ip = String(value || '').trim();
  if(!ip || ip.includes('%')) return false;
  if(ip.includes('.')){
    const parts = ip.split('.');
    return parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
  }
  if(!/^[0-9a-f:]+$/i.test(ip) || !ip.includes(':')) return false;
  try{
    const hostname = new URL(`http://[${ip}]/`).hostname;
    return hostname.startsWith('[') && hostname.endsWith(']');
  }catch(error){
    return false;
  }
}

async function fetchMyIp(){
  for(const source of IP_LOOKUP_SOURCES){
    try{
      const res = await fetch(source.url, { cache: 'no-store' });
      if(!res.ok) continue;
      const ip = await source.parse(res);
      if(isValidIpAddress(ip)) return String(ip).trim();
    }catch(e){
      // try the next source
    }
  }
  return null;
}

// The IP line sits under the app name in the sidebar, which is re-rendered on
// every navigation, so the latest status is kept here and re-applied by
// sidebarBrandHtml().
let networkStatus = { state: 'loading', text: 'Đang kiểm tra mạng...' };

function setNetworkStatus(kind, text){
  networkStatus = { state: kind, text };
  const el = document.getElementById('networkIpText');
  if(el){ el.textContent = text; el.dataset.state = kind; }
}

async function refreshNetworkStatus(){
  if(typeof navigator !== 'undefined' && !navigator.onLine){
    setNetworkStatus('offline', 'Không có mạng');
    return;
  }
  setNetworkStatus('loading', 'Đang lấy địa chỉ IP...');
  let ip = null;
  try{
    const response = await fetch(`/hubaccounts-network-status?t=${Date.now()}`, {
      headers: { 'Accept': 'application/json' }, cache: 'no-store', credentials: 'same-origin'
    });
    const text = await response.text();
    const result = text ? JSON.parse(text) : null;
    if(response.ok && result?.online && isValidIpAddress(result.ip)) ip = String(result.ip).trim();
  }catch(e){}
  if(!ip) ip = await fetchMyIp();
  setNetworkStatus(ip ? 'online' : 'offline', ip ? `IP: ${ip}` : 'Không có mạng');
}

function initNetworkStatus(){
  // Delegated: the sidebar (and this button) is re-rendered on navigation.
  document.addEventListener('click', ev => {
    if(ev.target.closest('#networkIpText')) refreshNetworkStatus();
  });
  refreshNetworkStatus();
  setInterval(refreshNetworkStatus, 60 * 1000);
  window.addEventListener('online', refreshNetworkStatus);
  window.addEventListener('offline', () => setNetworkStatus('offline', 'Không có mạng'));
}
initNetworkStatus();

// ---------- APP SHELL: theme, header, sidebar brand, lock ----------
function applyTheme(theme){
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if(metaTheme) metaTheme.content = next === 'light' ? '#f2f2f7' : '#000000';
  
  const icon = document.getElementById('themeToggleIcon');
  const btn = document.getElementById('themeToggleBtn');
  if(icon){
    icon.className = next === 'light' ? 'ti ti-moon' : 'ti ti-sun';
  }
  if(btn){
    btn.title = next === 'light' 
      ? (state.lang === 'vi' ? 'Chuyển sang chế độ Tối' : 'Switch to Dark mode')
      : (state.lang === 'vi' ? 'Chuyển sang chế độ Sáng' : 'Switch to Light mode');
  }
}

function toggleTheme(){
  const current = document.documentElement.dataset.theme || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

// Page header kicker, e.g. "THỨ BẢY, 11 THÁNG 10" (upper-cased by CSS).
function headerDateKicker(){
  return new Date().toLocaleDateString(state.lang === 'en' ? 'en-US' : 'vi-VN', { weekday: 'long', day: 'numeric', month: 'long' });
}

// App identity at the top of the sidebar (same idea as the iNexus sidebar).
function sidebarBrandHtml(){
  return `<div class="sidebar-brand"><img src="icon-192.png" alt="" width="40" height="40"><div class="sidebar-brand-text"><b>HubAccounts</b><span>${state.lang === 'en' ? 'Encrypted account vault' : 'Kho tài khoản mã hoá'}</span><button type="button" class="sidebar-brand-ip" id="networkIpText" data-state="${networkStatus.state}" title="Bấm để lấy lại địa chỉ IP">${escapeHtml(networkStatus.text)}</button></div></div>`;
}

// Updates the breadcrumb + bottom status bar with real, live info (current tab,
// duplicate-account count, accounts nearing expiry) — not just decorative text.
function updateIdeChrome(){
  const breadcrumb = document.getElementById('ideBreadcrumb');
  if(breadcrumb){
    const label = state.activePlatform === 'other' ? t('platform_tools') : platformMeta(state.activePlatform).name;
    breadcrumb.innerHTML = `<span class="crumb-app">${escapeHtml(headerDateKicker())}</span><span class="crumb-current">${escapeHtml(label)}</span>`;
  }
  const bar = document.getElementById('ideStatusBar');
  if(!bar) return;
  if(!state.key){
    bar.innerHTML = `<span><span class="sb-dot" style="background:var(--text-muted);"></span>${t('status_locked')}</span><span class="sb-sep">AES-256-GCM · PBKDF2</span>`;
    return;
  }
  // Everything below is scoped to the CURRENT tab only — switching tabs shows
  // that tab's own numbers, not a running total across the whole vault.
  const isHome = state.activePlatform === 'home';
  const isNote = state.activePlatform === 'note';
  const isTools = state.activePlatform === 'other';
  const isLog = state.activePlatform === 'log';
  const isSpecialPage = isHome || isNote || isTools || isLog;
  const platformEntries = isSpecialPage ? [] : state.entries.filter(e => e.platform === state.activePlatform);

  let dupCount = 0;
  if(!isSpecialPage){
    dupCount = findAllDuplicateGroups(state.activePlatform).reduce((s, g) => s + (g.list.length - 1), 0);
  }
  let expiringCount = 0;
  platformEntries.forEach(e => {
    if((e.platform === 'phone' || e.platform === 'proxy') && e.expiryDate){
      const info = phoneExpiryInfo(e.expiryDate);
      if(info && info.diffDays >= 0 && info.diffDays <= 1) expiringCount++;
    }
  });
  const countLabel = isHome ? `${state.entries.length + state.notes.length} mục trong kho`
    : isNote ? state.notes.length + ' ' + t('comment_notes').replace('// ', '')
    : isTools ? ''
    : isLog ? `${state.logs.length} sự kiện`
    : state.activePlatform === 'link' ? `${platformEntries.length} liên kết`
    : `${platformEntries.length} ${t('status_accounts')}`;

  bar.innerHTML = `
    <span><span class="sb-dot" style="background:var(--success);"></span>${t('status_unlocked')}</span>
    <span>${escapeHtml(state.activePlatform === 'other' ? t('platform_tools') : platformMeta(state.activePlatform).name)}</span>
    ${!isSpecialPage ? `<span class="${dupCount>0?'sb-err':''}"><i class="ti ti-copy-check" style="font-size:11px;vertical-align:-1px;"></i> ${dupCount} ${t('status_duplicates')}</span>` : ''}
    ${!isSpecialPage && state.activePlatform !== 'link' ? `<span class="${expiringCount>0?'sb-warn':''}"><i class="ti ti-clock-exclamation" style="font-size:11px;vertical-align:-1px;"></i> ${expiringCount} ${t('status_expiring')}</span>` : ''}
    <span class="sb-sep">${countLabel}${countLabel ? ' · ' : ''}AES-256</span>
  `;
}

function renderLockedShellChrome(mode){
  const breadcrumb = document.getElementById('ideBreadcrumb');
  if(breadcrumb) breadcrumb.innerHTML = `<span class="crumb-app">${escapeHtml(headerDateKicker())}</span><span class="crumb-current">${mode === 'setup' ? t('breadcrumb_setup') : t('breadcrumb_unlock')}</span>`;
  const sidebar = document.getElementById('platformBar');
  if(sidebar) sidebar.innerHTML = `${sidebarBrandHtml()}<div class="ide-sidebar-label code-comment">${t('comment_status')}</div><div style="padding:8px 16px; font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:8px;"><i class="ti ti-lock"></i>${t('sidebar_locked')}</div>`;
  const statusBar = document.getElementById('ideStatusBar');
  if(statusBar) statusBar.innerHTML = `<span><span class="sb-dot" style="background:var(--text-muted);"></span>${t('status_locked')}</span><span class="sb-sep">AES-256-GCM · PBKDF2</span>`;
  syncGlobalSearchBar(null);
}

// Single lock routine: every page's "Khoá" button and the idle auto-lock.
// (Used directly as a click handler, so a non-string argument is the event.)
let vaultLocking = false; // the idle check runs every second while saveLogs() is awaited
async function lockVault(logMessage){
  if(vaultLocking || !state.key) return;
  vaultLocking = true;
  try{
    recordLog('info', 'system', typeof logMessage === 'string' ? logMessage : 'Đã khoá kho dữ liệu');
    await saveLogs();
    state.key = null; state.entries = []; state.folders = []; state.notes = []; state.logs = [];
    endSession(); renderApp();
  }finally{
    vaultLocking = false;
  }
}

function navigateToPlatform(platformId){
  if(!PLATFORMS.some(platform => platform.id === platformId)) return;
  state.activePlatform = platformId;
  state.activeFolder = 'all';
  state.selectMode = false;
  state.selectedIds = new Set();
  if(location.hash !== `#platform=${platformId}`) location.hash = `platform=${platformId}`;
  renderVault();
}

