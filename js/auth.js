// HubAccounts — Setup, text restore, biometric (WebAuthn PRF) and unlock screens.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- RENDER: SETUP ----------
function renderSetup(){
  renderLockedShellChrome('setup');
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="lock-wrap">
      <div class="lock-icon"><i class="ti ti-shield-lock"></i></div>
      <div class="code-comment" style="font-size:12px; margin-bottom:14px;">${t('setup_comment')}</div>
      <div class="center-form">
        <label>${t('label_create_pw')}</label>
        <input type="password" id="pw1" placeholder="${t('placeholder_min6')}">
        <label>${t('label_confirm_pw')}</label>
        <input type="password" id="pw2" placeholder="${t('placeholder_confirm')}">
        <p class="err" id="setupErr"></p>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:400; margin:-4px 0 4px;">
          <input type="checkbox" id="keepSessionCheckSetup">
          <span>${t('keep_session_label')}</span>
        </label>
        <p class="hint" style="margin:0 0 16px;">${t('keep_session_hint')}</p>
        <p class="hint"><i class="ti ti-info-circle" style="vertical-align:-2px;font-size:14px"></i> ${t('hint_pw_not_saved')}</p>
        <button class="primary" id="setupBtn" style="width:100%">${t('btn_create_vault')}</button>
        <button id="googleDriveRestoreSetupBtn" style="width:100%; margin-top:10px;"><i class="ti ti-brand-google-drive" style="vertical-align:-2px;font-size:15px;margin-right:4px"></i>Khôi phục kho mã hoá từ Google Drive</button>
        <button id="universalImportSetupBtn" style="width:100%; margin-top:10px;"><i class="ti ti-shield-lock" style="vertical-align:-2px;font-size:15px;margin-right:4px"></i>Mở / nhập file kho mã hoá (.json)</button>
        <button id="restoreBtn" style="width:100%; margin-top:10px;"><i class="ti ti-upload" style="vertical-align:-2px;font-size:15px;margin-right:4px"></i>${t('btn_restore_backup')}</button>
      </div>
    </div>
  `;
  document.getElementById('restoreBtn').onclick = openRestoreModal;
  document.getElementById('googleDriveRestoreSetupBtn').onclick = openGoogleDriveRestoreModal;
  document.getElementById('universalImportSetupBtn').onclick = openVaultFileAnyBrowser;
  document.getElementById('setupBtn').onclick = async () => {
    const btn = document.getElementById('setupBtn');
    const pw1 = document.getElementById('pw1').value;
    const pw2 = document.getElementById('pw2').value;
    const err = document.getElementById('setupErr');
    err.style.display = 'none';
    if(pw1.length < 6){
      err.textContent = 'Mật khẩu cần ít nhất 6 ký tự.';
      err.style.display = 'block';
      return;
    }
    if(pw1 !== pw2){
      err.textContent = 'Hai mật khẩu không khớp nhau.';
      err.style.display = 'block';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Đang tạo...';
    try{
      if(!window.storage || typeof window.storage.set !== 'function'){
        throw new Error('Không tìm thấy bộ nhớ lưu trữ (window.storage). Hãy thử mở lại file này bằng trình duyệt, hoặc tải lại trang.');
      }
      const { key, saltB64, config } = await createVaultCredentials(pw1);
      const defaultFolders = [
        { id: uid(), name: 'Tài khoản mới', platformId: 'facebook' },
        { id: uid(), name: 'Tài khoản cũ', platformId: 'facebook' }
      ];
      const rawVault = await buildEncryptedVaultRaw(config, key, [], defaultFolders, []);
      await replaceStoredVault(rawVault);
      state.key = key;
      const keepChecked = !!(document.getElementById('keepSessionCheckSetup') || {}).checked;
      await setKeepSessionPref(keepChecked);
      if(keepChecked) await persistSessionKey(key, saltB64);
      state.entries = [];
      state.folders = defaultFolders;
      state.notes = [];
      state.logs = [];
      recordLog('info', 'system', 'Đã tạo kho dữ liệu mới');
      await saveLogs();
      startSession();
      renderVault();
    }catch(e){
      console.error(e);
      err.textContent = 'Tạo kho lưu trữ thất bại: ' + (e.message || 'lỗi không xác định.');
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Tạo kho lưu trữ';
    }
  };
}

// ---------- RESTORE FROM EXPORTED BACKUP TEXT ----------
// Parses the .txt produced by "Xuất" (buildExportContent) back into entries/folders.
// Lets someone whose local storage looks empty (new device, fresh download, cleared
// browser data...) get back into a vault they already have a backup file for.
function parseBackupLine(line, platformId){
  const fields = getPlatformFields(platformId);
  const delim = platformDelimiter(platformId);
  let baseFields, suffixParts;
  if(delim === '|'){
    const parts = line.split('|');
    // Text backups include three trailing metadata columns. Detect backups made
    // before the new security fields were appended so Folder/Name/Proxy do not shift.
    const historicFieldCounts = { facebook: [9], ai: [8], gmail: [6], tiktok: [9], hotmail: [6, 11], steam: [6] };
    const possibleLegacyCount = parts.length - 3;
    const baseCount = (historicFieldCounts[platformId] || []).includes(possibleLegacyCount)
      ? possibleLegacyCount
      : fields.length;
    baseFields = parts.slice(0, baseCount);
    suffixParts = parts.slice(baseCount);
  } else {
    const pipeParts = line.split('|');
    baseFields = (pipeParts[0] || '').split(delim);
    suffixParts = pipeParts.slice(1);
  }
  const obj = {};
  fields.forEach((f, i) => { obj[f.key] = (baseFields[i] || '').trim(); });
  if(platformId === 'link') obj.fbName = normalizeHttpLink(obj.fbName);
  obj.__folderName = (suffixParts[0] || '').trim();
  obj.displayName = (suffixParts[1] || '').trim();
  obj.proxy = (suffixParts[2] || '').trim();
  return obj;
}

function parseBackupText(text){
  const platformNameToId = {};
  PLATFORMS.forEach(p => { platformNameToId[p.name] = p.id; });
  let currentPlatformId = null;
  const results = [];
  text.split('\n').forEach(raw => {
    const line = raw.trim();
    if(!line) return;
    if(line.startsWith('##')){
      const m = line.match(/^##\s*([^(]+)/);
      currentPlatformId = m ? (platformNameToId[m[1].trim()] || null) : null;
      return;
    }
    if(line.startsWith('#')) return;
    if(!currentPlatformId) return;
    const parsed = parseBackupLine(line, currentPlatformId);
    if(parsed.fbName || parsed.email){
      results.push({ platformId: currentPlatformId, fields: parsed });
    }
  });
  return results;
}

// Deletes the ENTIRE current vault — config, entries, folders, notes, the
// "keep session" preference, and any live session key — so the app goes
// back to the fresh "create a new vault" screen, as if nothing had ever been
// set up. Irreversible, so it's gated behind a type-to-confirm modal rather
// than a plain Yes/No, matching how severe this action actually is.
function openDeleteVaultModal(){
  const modalBg = document.getElementById('modalBg');
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h2 style="color:var(--danger-text);">Xoá toàn bộ kho lưu trữ?</h2>
    <p style="font-size:14px; color:var(--text-2); line-height:1.6; margin:0 0 16px;">
      Hành động này sẽ xoá <b>vĩnh viễn</b> toàn bộ tài khoản, ghi chú, thư mục đã lưu trên thiết bị này — không thể khôi phục lại được nếu bạn chưa có bản sao lưu.
      Nếu bạn có file sao lưu (.txt) hoặc file trên ổ cứng, hãy đảm bảo đã lưu lại trước khi tiếp tục.
    </p>
    <label>Gõ chữ <code>XOA</code> để xác nhận</label>
    <input type="text" id="deleteVaultConfirmInput" placeholder="XOA" autocomplete="off" autocapitalize="characters">
    <div class="row" style="margin-top:6px;">
      <button id="deleteVaultCancelBtn" style="flex:1">Huỷ</button>
      <button class="text-btn danger" id="deleteVaultConfirmBtn" style="flex:1; padding:9px 16px;" disabled>Xoá vĩnh viễn</button>
    </div>
  `;
  modalBg.classList.add('show');
  const input = document.getElementById('deleteVaultConfirmInput');
  const confirmBtn = document.getElementById('deleteVaultConfirmBtn');
  input.oninput = () => {
    confirmBtn.disabled = input.value.trim().toUpperCase() !== 'XOA';
  };
  document.getElementById('deleteVaultCancelBtn').onclick = closeModal;
  confirmBtn.onclick = async () => {
    if(!await deleteEntireVault()) return;
    closeModal();
    toast('Đã xoá kho lưu trữ');
    renderApp();
  };
}
async function deleteEntireVault(){
  try{
    await replaceStoredVault({
      [STORAGE_CONFIG_KEY]: null,
      [STORAGE_DATA_KEY]: null,
      [STORAGE_FOLDERS_KEY]: null,
      [STORAGE_NOTES_KEY]: null,
    });
  }catch(e){
    console.error(e);
    toast('Không thể xoá kho; dữ liệu hiện tại được giữ nguyên');
    return false;
  }
  // These supplemental local records contain no vault payload. Their removal
  // is best-effort after the transactional vault deletion has succeeded.
  try{ await window.storage.delete(STORAGE_KEEP_SESSION_PREF_KEY, false); }catch(_error){}
  try{ await window.storage.delete(STORAGE_LOGS_KEY, false); }catch(_error){}
  clearPersistedSessionKey();
  state.key = null;
  state.entries = [];
  state.folders = [];
  state.notes = [];
  state.logs = [];
  state.fileHandle = null;
  state.fileHandleName = null;
  endSession();
  return true;
}

function openRestoreModal(){
  const modalBg = document.getElementById('modalBg');
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h2>Khôi phục từ file sao lưu</h2>
    <p class="hint" style="margin-top:-4px;">Mở file <code>.txt</code> đã tải khi bấm "Xuất" trước đây, copy toàn bộ nội dung và dán vào đây.</p>
    <label>Nội dung file sao lưu</label>
    <textarea id="restoreText" class="mono-area" style="min-height:180px" placeholder="# HubAccounts - Sao lưu tài khoản..."></textarea>
    <label>Đặt mật khẩu chính mới cho kho khôi phục</label>
    <input type="password" id="restorePw1" placeholder="Ít nhất 6 ký tự">
    <label>Nhập lại mật khẩu</label>
    <input type="password" id="restorePw2" placeholder="Nhập lại để xác nhận">
    <p class="err" id="restoreErr"></p>
    <div class="row">
      <button id="restoreCancelBtn" style="flex:1">Huỷ</button>
      <button class="primary" id="restoreSubmitBtn" data-primary-action style="flex:1">Khôi phục</button>
    </div>
  `;
  modalBg.classList.add('show');
  document.getElementById('restoreCancelBtn').onclick = closeModal;
  document.getElementById('restoreSubmitBtn').onclick = async () => {
    const btn = document.getElementById('restoreSubmitBtn');
    const err = document.getElementById('restoreErr');
    err.style.display = 'none';
    const text = document.getElementById('restoreText').value;
    const pw1 = document.getElementById('restorePw1').value;
    const pw2 = document.getElementById('restorePw2').value;
    if(!text.trim()){
      err.textContent = 'Dán nội dung file sao lưu vào ô trên.';
      err.style.display = 'block';
      return;
    }
    if(pw1.length < 6){
      err.textContent = 'Mật khẩu cần ít nhất 6 ký tự.';
      err.style.display = 'block';
      return;
    }
    if(pw1 !== pw2){
      err.textContent = 'Hai mật khẩu không khớp nhau.';
      err.style.display = 'block';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Đang khôi phục...';
    try{
      if(!window.storage || typeof window.storage.set !== 'function'){
        throw new Error('Không tìm thấy bộ nhớ lưu trữ (window.storage) trong trình duyệt này.');
      }
      const parsedList = parseBackupText(text);
      if(parsedList.length === 0){
        throw new Error('Không đọc được tài khoản nào từ nội dung đã dán. Kiểm tra lại đã copy đủ nội dung file chưa.');
      }
      const { key, saltB64, config } = await createVaultCredentials(pw1);
      const nextFolders = [];
      const nextNotes = [];
      const nextEntries = [];
      for(const item of parsedList){
        const folderName = item.fields.__folderName;
        let folderId = '';
        if(folderName){
          let folder = nextFolders.find(x => x.platformId === item.platformId && x.name === folderName);
          if(!folder){
            folder = { id: uid(), name: folderName, platformId: item.platformId };
            nextFolders.push(folder);
          }
          folderId = folder.id;
        }
        const fields = { ...item.fields };
        delete fields.__folderName;
        fields.platform = item.platformId;
        fields.folderId = folderId;
        fields.updatedAt = Date.now();
        fields.createdAt = Date.now();
        nextEntries.push({ id: uid(), ...fields });
      }
      const rawVault = await buildEncryptedVaultRaw(config, key, nextEntries, nextFolders, nextNotes);
      await replaceStoredVault(rawVault);
      state.key = key;
      state.entries = nextEntries;
      state.folders = nextFolders;
      state.notes = nextNotes;
      state.logs = [];
      recordLog('info', 'backup', `Đã khôi phục ${parsedList.length} tài khoản từ file sao lưu`);
      await saveLogs();
      startSession();
      closeModal();
      renderVault();
      toast(`Đã khôi phục ${parsedList.length} tài khoản từ bản sao lưu`);
    }catch(e){
      console.error(e);
      err.textContent = 'Khôi phục thất bại: ' + (e.message || 'lỗi không xác định.');
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Khôi phục';
    }
  };
}

// ---------- BIOMETRIC UNLOCK (WebAuthn: Face ID / Touch ID / Windows Hello) ----------
const WEBAUTHN_STORAGE_KEY = 'devic3_webauthn_cred'; // legacy key name kept; holds the PRF-wrapped biometric record

async function isBiometricAvailable(){
  return !!(window.PublicKeyCredential &&
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function' &&
    await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
}

// The vault key is never stored in the clear. It is wrapped (AES-GCM) with a
// key derived from the authenticator's WebAuthn PRF output, which the
// Secure Enclave / TPM only releases after Face ID, Touch ID or Windows Hello
// succeeds. Without PRF support biometric unlock is refused, not faked.
// Records written by older versions stored the raw key (`keyB64`): they are
// deleted on sight and the user is asked to enable biometrics again.
const BIOMETRIC_RECORD_VERSION = 2;
const BIOMETRIC_HKDF_INFO = 'HubAccounts biometric vault key v2';
let biometricLegacyRecordRemoved = false;

function readBiometricRecord(){
  try{
    const raw = localStorage.getItem(WEBAUTHN_STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || parsed.version !== BIOMETRIC_RECORD_VERSION || !parsed.credId || !parsed.prfSalt || !parsed.wrapped){
      localStorage.removeItem(WEBAUTHN_STORAGE_KEY);
      biometricLegacyRecordRemoved = true;
      return null;
    }
    return parsed;
  }catch(e){ return null; }
}
function hasBiometricUnlock(){ return !!readBiometricRecord(); }
function clearBiometricUnlock(){ try{ localStorage.removeItem(WEBAUTHN_STORAGE_KEY); }catch(e){} }

async function biometricWrappingKey(prfOutput){
  const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode(BIOMETRIC_HKDF_INFO) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Runs one Face ID / Windows Hello prompt and returns the PRF secret for prfSalt.
async function biometricPrfOutput(credIdBytes, prfSalt){
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: credIdBytes, type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: prfSalt } } }
    }
  });
  const output = assertion && assertion.getClientExtensionResults().prf?.results?.first;
  if(!output) throw new Error('PRF_UNSUPPORTED');
  return output;
}

async function setupBiometricUnlock(key, salt){
  if(!await isBiometricAvailable()){
    toast('Thiết bị không hỗ trợ Face ID / Touch ID / Windows Hello');
    return false;
  }
  try{
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'HubAccounts' },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'owner', displayName: 'HubAccounts Owner' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
        extensions: { prf: {} }
      }
    });
    if(!cred) return false;
    if(!cred.getClientExtensionResults().prf?.enabled) throw new Error('PRF_UNSUPPORTED');
    const credIdBytes = new Uint8Array(cred.rawId);
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const wrapKey = await biometricWrappingKey(await biometricPrfOutput(credIdBytes, prfSalt));
    const rawKey = await crypto.subtle.exportKey('raw', key);
    const wrapped = await encryptStr(wrapKey, b64(rawKey));
    localStorage.setItem(WEBAUTHN_STORAGE_KEY, JSON.stringify({
      version: BIOMETRIC_RECORD_VERSION,
      credId: b64(credIdBytes),
      prfSalt: b64(prfSalt),
      salt,
      wrapped,
      enabledAt: Date.now()
    }));
    toast('Đã kích hoạt Face ID / Vân tay thành công!');
    recordLog('info', 'system', 'Đã kích hoạt mở khoá sinh trắc học (WebAuthn PRF)');
    return true;
  }catch(e){
    toast(e && e.message === 'PRF_UNSUPPORTED'
      ? 'Trình duyệt/thiết bị này chưa hỗ trợ khoá sinh trắc học an toàn (WebAuthn PRF). Hãy tiếp tục dùng mật khẩu chính.'
      : 'Không thể bật sinh trắc học: ' + ((e && e.message) || 'Huỷ bởi người dùng'), 5000);
    return false;
  }
}

async function unlockWithBiometrics(config){
  const record = readBiometricRecord();
  if(!record || record.salt !== config.salt) return null;
  try{
    const wrapKey = await biometricWrappingKey(await biometricPrfOutput(new Uint8Array(unb64(record.credId)), new Uint8Array(unb64(record.prfSalt))));
    const rawKey = unb64(await decryptStr(wrapKey, record.wrapped));
    // Extractable like a password-derived key, so "keep session" and
    // re-enabling biometrics keep working after a biometric unlock.
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    const check = await decryptStr(key, config.verifier);
    if(check !== VERIFY_STRING) throw new Error('BIOMETRIC_KEY_MISMATCH');
    return key;
  }catch(e){
    console.warn('Biometric unlock failed:', e);
    return null;
  }
}

// ---------- RENDER: UNLOCK ----------
function renderUnlock(config){
  renderLockedShellChrome('unlock');
  const app = document.getElementById('app');
  const hasBio = hasBiometricUnlock();
  if(biometricLegacyRecordRemoved){
    biometricLegacyRecordRemoved = false;
    setTimeout(() => toast('Đã gỡ cấu hình Face ID / Vân tay cũ (không an toàn). Mở khoá bằng mật khẩu rồi bật lại trong Công cụ.', 7000), 300);
  }
  app.innerHTML = `
    <div class="lock-wrap">
      <div class="lock-icon"><i class="ti ti-lock"></i></div>
      <div class="code-comment" style="font-size:12px; margin-bottom:14px;">${t('unlock_comment')}</div>
      <div class="center-form">
        ${hasBio ? `<button type="button" class="biometric-btn" id="biometricUnlockBtn"><i class="ti ti-fingerprint" style="font-size:18px;"></i> Mở khoá bằng Face ID / Vân tay</button>` : ''}
        <label>${t('label_master_pw')}</label>
        <input type="password" id="pwUnlock" placeholder="${t('placeholder_enter_pw')}">
        <p class="err" id="unlockErr"></p>
        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:400; margin:-4px 0 4px;">
          <input type="checkbox" id="keepSessionCheck">
          <span>${t('keep_session_label')}</span>
        </label>
        <p class="hint" style="margin:0 0 16px;">${t('keep_session_hint')}</p>
        <button class="primary" id="unlockBtn" style="width:100%">${t('btn_unlock')}</button>
        <button id="googleDriveRestoreUnlockBtn" style="width:100%;margin-top:10px;"><i class="ti ti-brand-google-drive" style="vertical-align:-2px;font-size:15px;margin-right:4px"></i>Thay kho này bằng bản trên Google Drive</button>
        <button type="button" id="deleteVaultLink" style="width:100%; margin-top:16px; background:transparent; border:none; color:var(--text-muted); font-size:12px; text-decoration:underline; cursor:pointer; padding:4px;">Quên mật khẩu? Xoá kho hiện tại và tạo kho mới</button>
      </div>
    </div>
  `;
  getKeepSessionPref().then(on => {
    const cb = document.getElementById('keepSessionCheck');
    if(cb) cb.checked = on;
  });
  const bioBtn = document.getElementById('biometricUnlockBtn');
  if(bioBtn){
    bioBtn.onclick = async () => {
      bioBtn.disabled = true;
      bioBtn.innerHTML = '<i class="ti ti-loader"></i> Đang xác thực sinh trắc học…';
      const key = await unlockWithBiometrics(config);
      if(key){
        state.key = key;
        state.vaultSalt = config.salt;
        await loadEntries();
        await loadFolders();
        await loadNotes();
        await loadLogs();
        recordLog('info', 'system', 'Đã mở kho dữ liệu bằng Face ID / Vân tay (WebAuthn)');
        startSession();
        renderVault();
        toast('Mở khoá thành công bằng Face ID / Vân tay!');
      }else{
        bioBtn.disabled = false;
        bioBtn.innerHTML = '<i class="ti ti-fingerprint" style="font-size:18px;"></i> Mở khoá bằng Face ID / Vân tay';
        toast('Xác thực sinh trắc học không thành công');
      }
    };
  }
  document.getElementById('deleteVaultLink').onclick = openDeleteVaultModal;
  document.getElementById('googleDriveRestoreUnlockBtn').onclick = openGoogleDriveRestoreModal;
  const doUnlock = async () => {
    const btn = document.getElementById('unlockBtn');
    const pw = document.getElementById('pwUnlock').value;
    const err = document.getElementById('unlockErr');
    err.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Đang mở...';
    let key;
    try{
      // honor the vault's own stored iteration count — older vaults (created
      // before the PBKDF2 security upgrade) still used a lower count, and
      // must keep using it or the derived key won't match at all
      key = await deriveKey(pw, config.salt, config.iterations || PBKDF2_ITERATIONS_LEGACY);
      const check = await decryptStr(key, config.verifier);
      if(check !== VERIFY_STRING) throw new Error('WRONG_PASSWORD');
    }catch(e){
      err.textContent = 'Sai mật khẩu, thử lại.';
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Mở khoá';
      return;
    }
    try{
      state.key = key;
      state.vaultSalt = config.salt;
      const keepChecked = !!(document.getElementById('keepSessionCheck') || {}).checked;
      await setKeepSessionPref(keepChecked);
      if(keepChecked) await persistSessionKey(key, config.salt);
      else clearPersistedSessionKey();
      await loadEntries();
      await loadFolders();
      await loadNotes();
      await loadLogs();
      recordLog('info', 'system', 'Đã mở kho dữ liệu');
      startSession();
      renderVault();
    }catch(e){
      console.error(e);
      state.key = null;
      state.logs = [];
      err.textContent = 'Mở khoá thất bại: ' + (e.message || 'không đọc được dữ liệu đã lưu.');
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Mở khoá';
    }
  };
  document.getElementById('unlockBtn').onclick = doUnlock;
  document.getElementById('pwUnlock').addEventListener('keydown', e => { if(e.key === 'Enter') doUnlock(); });
}

