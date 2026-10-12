// HubAccounts — Tools page: password generator, 2FA decoder and biometrics settings.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- TOOLS: password generator, 2FA and appearance ----------
// ---------- TOOLS TAB PAGE (the renamed "Khác" platform) ----------
// A dedicated landing page for the tools, instead of a generic account list —
// each card opens the same underlying tool already built for the topbar
// "Công cụ" modal, so there's a single source of truth for the tool logic.
function renderToolsVault(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="code-comment" style="font-size:12px; margin-bottom:8px;">${t('comment_tools')}</div>
    <div class="topbar">
      <button class="text-btn" id="lockBtn" title="${t('title_lock')}"><i class="ti ti-lock"></i>${t('btn_lock')}</button>
    </div>
    <div style="display:flex; flex-direction:column; gap:12px; max-width:560px;">
      <button type="button" class="tools-card" id="toolsPage2faBtn">
        <i class="ti ti-shield-lock"></i>
        <div>
          <div class="tools-card-title">${t('tool_2fa_title')}</div>
        </div>
        <i class="ti ti-chevron-right tools-card-arrow"></i>
      </button>
      <button type="button" class="tools-card" id="toolsPagePwGenBtn">
        <i class="ti ti-key"></i>
        <div>
          <div class="tools-card-title">${t('tool_pwgen_title')}</div>
        </div>
        <i class="ti ti-chevron-right tools-card-arrow"></i>
      </button>
    </div>
  `;
  document.getElementById('lockBtn').onclick = lockVault;
  syncGlobalSearchBar(null);
  const openTool = (renderFn) => {
    document.getElementById('modalBg').classList.add('show');
    renderFn();
  };
  document.getElementById('toolsPage2faBtn').onclick = () => openTool(renderTotpDecoderTool);
  document.getElementById('toolsPagePwGenBtn').onclick = () => openTool(renderPasswordGeneratorTool);
  renderPlatformBar();
  updateIdeChrome();
}

function openToolsModal(){
  const modalBg = document.getElementById('modalBg');
  modalBg.classList.add('show');
  renderToolsChooser();
}

function renderToolsChooser(){
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h2>${t('btn_tools')}</h2>
    <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:14px;">
      <button type="button" id="toolPwGenBtn" style="width:100%; justify-content:flex-start; text-align:left;"><i class="ti ti-key" style="margin-right:8px;"></i>${t('tool_pwgen_title')}</button>
      <button type="button" id="tool2faBtn" style="width:100%; justify-content:flex-start; text-align:left;"><i class="ti ti-shield-lock" style="margin-right:8px;"></i>${t('tool_2fa_title')}</button>
      <button type="button" id="toolCommandPaletteBtn" style="width:100%; justify-content:flex-start; text-align:left;"><i class="ti ti-command" style="margin-right:8px;color:var(--accent);"></i>Trợ lý tìm kiếm & Copy nhanh (Ctrl+K)</button>
      <button type="button" id="toolBiometricBtn" style="width:100%; justify-content:flex-start; text-align:left;"><i class="ti ti-fingerprint" style="margin-right:8px;color:#10b981;"></i>${hasBiometricUnlock() ? 'Quản lý Face ID / Vân tay (Đã bật)' : 'Kích hoạt Face ID / Touch ID mở khoá nhanh'}</button>
    </div>
    <button id="toolsCloseBtn" style="width:100%;">${t('btn_close')}</button>
  `;
  document.getElementById('toolsCloseBtn').onclick = closeModal;
  document.getElementById('toolPwGenBtn').onclick = renderPasswordGeneratorTool;
  document.getElementById('tool2faBtn').onclick = renderTotpDecoderTool;
  document.getElementById('toolCommandPaletteBtn').onclick = () => { closeModal(); openCommandPalette(); };
  document.getElementById('toolBiometricBtn').onclick = async () => {
    if(hasBiometricUnlock()){
      showConfirm(
        'Tắt Face ID / Vân tay?',
        'Bạn có muốn hủy mở khóa bằng sinh trắc học trên thiết bị này không?',
        () => {
          clearBiometricUnlock();
          toast('Đã tắt mở khoá bằng Face ID / Vân tay');
          openToolsModal();
        },
        'Tắt ngay'
      );
    }else{
      if(!state.key || !state.vaultSalt){
        toast('Không tìm thấy khoá bảo mật để liên kết sinh trắc học');
        return;
      }
      const ok = await setupBiometricUnlock(state.key, state.vaultSalt);
      if(ok) renderToolsChooser();
    }
  };
}

// --- secure random password generator (crypto.getRandomValues, not Math.random) ---
function secureRandomInt(max){
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] % max;
}

const PW_POOLS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

function generateSecurePassword(length, sets){
  const pools = Object.keys(PW_POOLS).filter(k => sets[k]).map(k => PW_POOLS[k]);
  if(pools.length === 0) pools.push(PW_POOLS.lower);
  const combined = pools.join('');
  const chars = [];
  // guarantee at least one char from every selected set
  pools.forEach(pool => chars.push(pool[secureRandomInt(pool.length)]));
  while(chars.length < length){
    chars.push(combined[secureRandomInt(combined.length)]);
  }
  // Fisher-Yates shuffle using the same secure randomness source
  for(let i = chars.length - 1; i > 0; i--){
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, length).join('');
}

function estimatePasswordStrength(length, sets){
  let poolSize = 0;
  if(sets.upper) poolSize += 26;
  if(sets.lower) poolSize += 26;
  if(sets.digits) poolSize += 10;
  if(sets.symbols) poolSize += PW_POOLS.symbols.length;
  if(poolSize === 0) poolSize = 26;
  const bits = Math.round(Math.log2(poolSize) * length);
  if(bits >= 100) return { label: 'Rất mạnh', color: 'var(--tone-green)', bits };
  if(bits >= 70) return { label: 'Mạnh', color: 'var(--tone-green)', bits };
  if(bits >= 50) return { label: 'Khá', color: 'var(--tone-yellow)', bits };
  return { label: 'Yếu — nên tăng độ dài hoặc thêm loại ký tự', color: 'var(--tone-red)', bits };
}

function renderPasswordGeneratorTool(){
  const modalBody = document.getElementById('modalBody');
  const state_ = { length: 20, upper: true, lower: true, digits: true, symbols: true, current: '' };
  state_.current = generateSecurePassword(state_.length, state_);

  const draw = () => {
    const strength = estimatePasswordStrength(state_.length, state_);
    modalBody.innerHTML = `
      <h2>Tạo mật khẩu ngẫu nhiên</h2>
      <p class="hint" style="margin-top:-4px;">Dùng bộ sinh số ngẫu nhiên mật mã học của trình duyệt (Web Crypto API) — không dùng Math.random() vốn không đủ an toàn cho mật khẩu.</p>
      <div class="pw-row" style="margin-bottom:14px;">
        <span class="pw-val" id="pwGenResult" style="font-family:monospace; font-size:16px; letter-spacing:0.5px; color:var(--tone-yellow); font-weight:600;">${escapeHtml(state_.current)}</span>
        <button class="text-btn" id="pwCopyBtn" title="Sao chép"><i class="ti ti-copy"></i>Sao chép</button>
      </div>
      <p style="font-size:12px; color:${strength.color}; margin:-8px 0 16px; font-weight:500;">Độ mạnh: ${strength.label} (~${strength.bits} bit)</p>
      <label>Độ dài: <span id="pwLenValue">${state_.length}</span> ký tự</label>
      <input type="range" id="pwLenSlider" min="8" max="64" value="${state_.length}" style="width:100%; margin-bottom:16px;">
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px; font-size:14px;">
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="pwUpper" ${state_.upper?'checked':''}> Chữ hoa (A-Z)</label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="pwLower" ${state_.lower?'checked':''}> Chữ thường (a-z)</label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="pwDigits" ${state_.digits?'checked':''}> Số (0-9)</label>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer;"><input type="checkbox" id="pwSymbols" ${state_.symbols?'checked':''}> Ký tự đặc biệt (!@#$...)</label>
      </div>
      <div class="row">
        <button id="pwBackBtn" style="flex:1">Quay lại</button>
        <button class="primary" id="pwRegenBtn" data-primary-action style="flex:1">Tạo mã mới</button>
      </div>
    `;
    document.getElementById('pwBackBtn').onclick = renderToolsChooser;
    document.getElementById('pwCopyBtn').onclick = () => copyText(state_.current, 'Đã sao chép mật khẩu', true);
    document.getElementById('pwLenSlider').oninput = (e) => {
      state_.length = parseInt(e.target.value, 10);
      document.getElementById('pwLenValue').textContent = state_.length;
    };
    ['upper','lower','digits','symbols'].forEach(key => {
      document.getElementById('pw' + key[0].toUpperCase() + key.slice(1)).onchange = (e) => {
        state_[key] = e.target.checked;
      };
    });
    document.getElementById('pwRegenBtn').onclick = () => {
      if(!state_.upper && !state_.lower && !state_.digits && !state_.symbols){
        toast('Chọn ít nhất 1 loại ký tự');
        return;
      }
      state_.current = generateSecurePassword(state_.length, state_);
      draw();
    };
  };
  draw();
}

// --- 2FA decoder: paste a base32 TOTP secret, get the live 6-digit code ---
// (reuses the same computeTotp/base32Decode already used for saved accounts)
function renderTotpDecoderTool(){
  if(totpToolInterval){ clearInterval(totpToolInterval); totpToolInterval = null; }
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h2>${t('tool_2fa_title')}</h2>
    <p class="hint" style="margin-top:-4px;">Dán mã bí mật 2FA (Base32, dạng chữ hoa A-Z và số 2-7) để xem ngay mã 6 số hiện tại — xử lý hoàn toàn trong trình duyệt, không gửi đi đâu cả.</p>
    <label>Mã bí mật 2FA</label>
    <input type="text" id="totpSecretInput" placeholder="VD: GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ" style="font-family:var(--mono);" autocomplete="off">
    <p class="err" id="totpErr"></p>
    <div class="pw-row" id="totpResultRow" style="display:none; margin-bottom:10px;">
      <span class="pw-val" id="totpResultCode" data-totp-val style="font-family:var(--mono); font-size:26px; letter-spacing:4px; font-weight:700; color:var(--tone-yellow); transition:color .3s ease;"></span>
      <button class="text-btn" id="totpCopyBtn" title="Sao chép"><i class="ti ti-copy"></i>Sao chép</button>
    </div>
    <div id="totpCountdownWrap" style="display:none; margin-bottom:16px;">
      <div style="height:4px; background:var(--button-bg); border-radius:999px; overflow:hidden;">
        <div id="totpCountdownBar" style="height:100%; background:var(--accent); width:100%;"></div>
      </div>
    </div>
    <button id="totp2faBackBtn" style="width:100%;">Quay lại</button>
  `;
  document.getElementById('totp2faBackBtn').onclick = () => {
    if(totpToolInterval){ clearInterval(totpToolInterval); totpToolInterval = null; }
    renderToolsChooser();
  };

  const input = document.getElementById('totpSecretInput');
  const err = document.getElementById('totpErr');
  const resultRow = document.getElementById('totpResultRow');
  const codeSpan = document.getElementById('totpResultCode');
  const countdownWrap = document.getElementById('totpCountdownWrap');
  const countdownBar = document.getElementById('totpCountdownBar');
  let lastCode = '';

  const refresh = async () => {
    const secret = input.value.trim();
    if(!secret){
      err.style.display = 'none';
      resultRow.style.display = 'none';
      countdownWrap.style.display = 'none';
      return;
    }
    const code = await computeTotp(secret);
    if(!code){
      err.textContent = 'Mã bí mật không hợp lệ — chỉ chấp nhận ký tự Base32 (chữ A-Z và số 2-7).';
      err.style.display = 'block';
      resultRow.style.display = 'none';
      countdownWrap.style.display = 'none';
      return;
    }
    err.style.display = 'none';
    lastCode = code;
    codeSpan.textContent = code;
    resultRow.style.display = 'flex';
    countdownWrap.style.display = 'block';
    const secsLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
    const totpColor = totpColorForSecondsLeft(secsLeft);
    if(countdownBar){ countdownBar.style.width = (secsLeft / 30 * 100) + '%'; countdownBar.style.background = totpColor; }
    codeSpan.style.color = totpColor;
  };

  document.getElementById('totpCopyBtn').onclick = () => { if(lastCode) copyText(lastCode, 'Đã sao chép mã 2FA', true); };
  input.oninput = refresh;
  refresh();
  totpToolInterval = setInterval(refresh, 1000);
}

function exportSingleEntry(entry){
  const label = entry.fbName || entry.displayName || entry.email || 'account';
  showConfirm(
    'Xuất tài khoản này?',
    `File xuất ra sẽ chứa thông tin đầy đủ của tài khoản "${label}" (mật khẩu, 2FA, cookie, token...) ở dạng chữ rõ, không mã hoá. Hãy lưu file này ở nơi an toàn.`,
    () => {
      const content = buildEntryLine(entry);
      const safeName = (entry.fbName || entry.email || 'account').replace(/[^a-zA-Z0-9]/g, '_');
      downloadTextFile(content, `hubaccounts-${safeName}.txt`);
      toast('Đã xuất tài khoản');
    },
    'Xuất file',
    false
  );
}

async function deleteEntry(id){
  const removed = state.entries.find(e => e.id === id);
  const isLink = removed && removed.platform === 'link';
  const nextEntries = state.entries.filter(e => e.id !== id);
  if(!await commitCollection('entries', nextEntries, saveEntries)) return;
  recordLog('info', isLink ? 'link' : 'account', isLink ? 'Đã xoá một liên kết' : `Đã xoá một tài khoản ${removed ? platformMeta(removed.platform).name : ''}`.trim());
  state.expandedIds.delete(id);
  renderVault();
  toast(isLink ? 'Đã xoá liên kết' : 'Đã xoá tài khoản');
}

function confirmDeleteEntry(id, name){
  const isLink = state.entries.some(entry => entry.id === id && entry.platform === 'link');
  showConfirm(
    isLink ? 'Xoá liên kết?' : 'Xoá tài khoản?',
    `Bạn có chắc chắn muốn xoá ${isLink ? 'liên kết' : 'tài khoản'} "${name}"? Hành động này không thể hoàn tác.`,
    () => deleteEntry(id)
  );
}

