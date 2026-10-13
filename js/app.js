// HubAccounts — Boot, navigation wiring, command palette (Ctrl+K) and service worker.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- BOOT ----------
async function renderApp(){
    let config;
  try{
    config = await loadConfig();
  }catch(e){
    console.error(e);
    renderLockedShellChrome('unlock');
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="lock-wrap">
        <div class="lock-icon" style="color:var(--danger-text);"><i class="ti ti-alert-triangle"></i></div>
        <div class="center-form">
          <h1>Không thể đọc kho lưu trữ</h1>
          <p class="hint" style="line-height:1.6;">${escapeHtml(e.message || 'Bộ nhớ trình duyệt không truy cập được hoặc cấu hình kho đã bị hỏng.')} Dữ liệu chưa bị ghi đè. Hãy tải lại trang hoặc khôi phục từ file sao lưu.</p>
          <button class="primary" id="reloadAfterStorageErrorBtn" style="width:100%;">Tải lại trang</button>
        </div>
      </div>`;
    document.getElementById('reloadAfterStorageErrorBtn').onclick = () => location.reload();
    return;
  }
  if(!config){
    renderSetup();
    return;
  }
  // if "keep session across F5" was turned on and this tab still has a live
  // session key for THIS exact vault, skip the unlock screen entirely
  if(await getKeepSessionPref()){
    const restoredKey = await tryRestoreSessionKey(config.salt);
    if(restoredKey){
      try{
        state.key = restoredKey;
        await loadEntries();
        await loadFolders();
        await loadNotes();
        await loadLogs();
        recordLog('info', 'system', 'Đã khôi phục phiên và mở kho dữ liệu');
        startSession();
        renderVault();
        return;
      }catch(e){
        console.error(e);
        state.key = null;
        state.logs = [];
        clearPersistedSessionKey();
      }
    }
  }
  renderUnlock(config);
}
const sidebarToggleBtnEl = document.getElementById('sidebarToggleBtn');
if(sidebarToggleBtnEl){
  sidebarToggleBtnEl.onclick = () => {
    const sb = document.getElementById('platformBar');
    if(sb) sb.classList.toggle('open');
  };
}
document.querySelectorAll('.ide-lang-btn').forEach(btn => {
  btn.onclick = () => setLangPref(btn.dataset.lang);
});
const themeToggleBtnEl = document.getElementById('themeToggleBtn');
if(themeToggleBtnEl){
  themeToggleBtnEl.onclick = () => toggleTheme();
  applyTheme(document.documentElement.dataset.theme || 'dark');
}
// Supports the browser's Back/Forward buttons switching between tabs (since
// each tab click pushes a URL hash), and keeps things in sync if the same
// vault is ever open in two windows side by side.
window.addEventListener('hashchange', () => {
  const p = getPlatformFromHash();
  if(p && state.key && p !== state.activePlatform){
    state.activePlatform = p;
    state.activeFolder = 'all';
    renderVault();
  }
});
// ---------- COMMAND PALETTE (CTRL+K / CMD+K) ----------
let commandPaletteActiveIndex = 0;
let commandPaletteFilteredEntries = [];

function openCommandPalette(){
  if(!state.key){
    toast('Hãy mở khoá dữ liệu trước');
    return;
  }
  const modal = document.getElementById('commandPaletteModal');
  const input = document.getElementById('paletteSearchInput');
  modal.style.display = 'flex';
  input.value = '';
  input.focus();
  commandPaletteActiveIndex = 0;
  renderCommandPaletteResults('');
}

function closeCommandPalette(){
  const modal = document.getElementById('commandPaletteModal');
  if(modal) modal.style.display = 'none';
}

function renderCommandPaletteResults(query){
  const list = document.getElementById('paletteResultsList');
  const q = String(query || '').trim().toLowerCase();
  commandPaletteFilteredEntries = state.entries.filter(e => {
    if(!q) return true;
    return (e.fbName || '').toLowerCase().includes(q) ||
           (e.email || '').toLowerCase().includes(q) ||
           (e.platform || '').toLowerCase().includes(q) ||
           (e.displayName || '').toLowerCase().includes(q);
  }).slice(0, 15);

  if(!commandPaletteFilteredEntries.length){
    list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">Không tìm thấy kết quả phù hợp với "${escapeHtml(query)}"</div>`;
    return;
  }

  if(commandPaletteActiveIndex >= commandPaletteFilteredEntries.length){
    commandPaletteActiveIndex = 0;
  }

  list.innerHTML = commandPaletteFilteredEntries.map((e, idx) => {
    const isAct = idx === commandPaletteActiveIndex;
    return `
      <div class="palette-item ${isAct ? 'active' : ''}" data-idx="${idx}" data-entry-id="${e.id}">
        <div class="palette-item-left">
          <span class="platform-icon" style="width:20px;height:20px;--pcolor:${platformMeta(e.platform).color};">${platformSvg(e.platform)}</span>
          <div style="min-width:0;">
            <div class="palette-item-title">${escapeHtml(e.fbName || '(Chưa đặt tên)')} <span style="font-size:11px;color:var(--text-muted);font-weight:400;">(${platformMeta(e.platform).name})</span></div>
            <div class="palette-item-sub">${escapeHtml(e.displayName || e.email || e.other || '')}</div>
          </div>
        </div>
        <div class="palette-quick-actions">
          <button type="button" class="palette-btn" data-copy-slot="1" title="Phím 1: Sao chép User/Email"><i class="ti ti-user"></i> 1</button>
          <button type="button" class="palette-btn" data-copy-slot="2" title="Phím 2: Sao chép Mật khẩu"><i class="ti ti-key"></i> 2</button>
          ${e.twoFA ? `<button type="button" class="palette-btn" data-copy-slot="3" title="Phím 3: Sao chép Mã 2FA OTP"><i class="ti ti-shield-check"></i> 3</button>` : ''}
          ${e.cookie ? `<button type="button" class="palette-btn" data-copy-slot="4" title="Phím 4: Sao chép Cookie"><i class="ti ti-cookie"></i> 4</button>` : ''}
          ${e.token ? `<button type="button" class="palette-btn" data-copy-slot="5" title="Phím 5: Sao chép Token/Key"><i class="ti ti-code"></i> 5</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.palette-item').forEach(el => {
    el.onmouseenter = () => {
      commandPaletteActiveIndex = Number(el.dataset.idx);
      list.querySelectorAll('.palette-item').forEach((item, i) => item.classList.toggle('active', i === commandPaletteActiveIndex));
    };
    el.querySelectorAll('.palette-btn').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const slot = Number(btn.dataset.copySlot);
        const entry = commandPaletteFilteredEntries[Number(el.dataset.idx)];
        executePaletteCopySlot(entry, slot);
      };
    });
  });
}

async function executePaletteCopySlot(entry, slot){
  if(!entry) return;
  if(slot === 1){
    copyText(entry.fbName || entry.email, 'Đã sao chép User / Email', false);
  }else if(slot === 2){
    copyText(entry.password, 'Đã sao chép Mật khẩu', true);
  }else if(slot === 3){
    if(entry.twoFA){
      const otp = await computeTotp(entry.twoFA);
      copyText(otp, 'Đã sao chép mã 2FA OTP', true);
    }else{
      toast('Tài khoản này chưa cài 2FA');
    }
  }else if(slot === 4){
    if(entry.cookie) copyText(entry.cookie, 'Đã sao chép Cookie', false);
    else toast('Tài khoản không có Cookie');
  }else if(slot === 5){
    if(entry.token) copyText(entry.token, 'Đã sao chép Token / API Key', false);
    else toast('Tài khoản không có Token / API Key');
  }
}

const palInput = document.getElementById('paletteSearchInput');
if(palInput){
  palInput.oninput = () => {
    commandPaletteActiveIndex = 0;
    renderCommandPaletteResults(palInput.value);
  };
}
const palModalEl = document.getElementById('commandPaletteModal');
if(palModalEl){
  palModalEl.onclick = (e) => {
    if(e.target.id === 'commandPaletteModal') closeCommandPalette();
  };
}

// Esc closes whichever modal is currently open, from anywhere on the page.
// Ctrl+K / Cmd+K opens Command Palette.
document.addEventListener('keydown', (e) => {
  const palModal = document.getElementById('commandPaletteModal');
  const isPalOpen = palModal && palModal.style.display !== 'none';

  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    if(isPalOpen) closeCommandPalette();
    else openCommandPalette();
    return;
  }

  if(e.key === 'Escape'){
    if(isPalOpen){ closeCommandPalette(); return; }
    const modalBg = document.getElementById('modalBg');
    if(modalBg && modalBg.classList.contains('show')) closeModal();
    return;
  }

  if(isPalOpen){
    const palInputEl = document.getElementById('paletteSearchInput');
    const isTyping = document.activeElement === palInputEl;

    if(e.key === 'ArrowDown'){
      e.preventDefault();
      if(commandPaletteFilteredEntries.length){
        commandPaletteActiveIndex = (commandPaletteActiveIndex + 1) % commandPaletteFilteredEntries.length;
        renderCommandPaletteResults(palInputEl.value);
      }
      return;
    }
    if(e.key === 'ArrowUp'){
      e.preventDefault();
      if(commandPaletteFilteredEntries.length){
        commandPaletteActiveIndex = (commandPaletteActiveIndex - 1 + commandPaletteFilteredEntries.length) % commandPaletteFilteredEntries.length;
        renderCommandPaletteResults(palInputEl.value);
      }
      return;
    }
    if(e.key === 'Enter'){
      e.preventDefault();
      const currentEntry = commandPaletteFilteredEntries[commandPaletteActiveIndex];
      if(currentEntry) executePaletteCopySlot(currentEntry, 1);
      return;
    }
    if(!isTyping && ['1','2','3','4','5'].includes(e.key)){
      e.preventDefault();
      const currentEntry = commandPaletteFilteredEntries[commandPaletteActiveIndex];
      if(currentEntry) executePaletteCopySlot(currentEntry, Number(e.key));
      return;
    }
    if(isTyping && (e.ctrlKey || e.altKey) && ['1','2','3','4','5'].includes(e.key)){
      e.preventDefault();
      const currentEntry = commandPaletteFilteredEntries[commandPaletteActiveIndex];
      if(currentEntry) executePaletteCopySlot(currentEntry, Number(e.key));
      return;
    }
  }

  if(e.key === '/' && state.key){
    const active = document.activeElement;
    const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
    if(isTyping) return;
    e.preventDefault();
    openCommandPalette();
  }
});
(async () => {
  state.lang = await loadLangPref();
  await loadDriveSettings();
  updateLangSwitchUI();
  renderApp();
})();

// PWA: registers the offline service worker when the app is actually served
// over http(s) (GitHub Pages, Netlify, a local dev server, etc.), which is
// what makes the browser's "Install app" prompt available. Opening the file
// directly from disk (file://) doesn't support service workers at all — this
// silently no-ops in that case instead of throwing, so it's always safe to
// leave in regardless of how the file is being used.
if('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
