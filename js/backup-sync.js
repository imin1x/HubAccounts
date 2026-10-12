// HubAccounts — On-disk file backup, Google Drive sync and universal .json backup.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- ON-DISK FILE BACKUP (File System Access API — Chrome/Edge) ----------
// Lets the vault live in one file the person picks on their own hard drive, instead
// of only inside the browser's storage. That file can be copied to a USB drive,
// synced folder, or opened directly on a different computer to log back in —
// so a Windows reinstall / cleared browser data doesn't mean losing everything.
function fileSystemAccessSupported(){
  return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
}

function backupLocationPickerSupported(){
  return typeof window.showSaveFilePicker === 'function';
}

async function assembleVaultBundle(){
  const configRes = await window.storage.get(STORAGE_CONFIG_KEY);
  const entriesRes = await window.storage.get(STORAGE_DATA_KEY);
  const foldersRes = await window.storage.get(STORAGE_FOLDERS_KEY);
  const notesRes = await window.storage.get(STORAGE_NOTES_KEY);
  return {
    app: 'devic3', // legacy file-format marker: keeps old and new backups mutually importable
    version: 2,
    savedAt: Date.now(),
    config: configRes && configRes.value ? JSON.parse(configRes.value) : null,
    entries: entriesRes && entriesRes.value ? JSON.parse(entriesRes.value) : null,
    folders: foldersRes && foldersRes.value ? JSON.parse(foldersRes.value) : null,
    notes: notesRes && notesRes.value ? JSON.parse(notesRes.value) : null,
  };
}

// ---------- GOOGLE DRIVE SYNC (encrypted bundle in appDataFolder) ----------
// The OAuth access token exists only in memory. The Drive file contains the
// same already-encrypted vault blobs as a manual backup; no password, account
// plaintext credentials or a Google client secret are sent or stored here.
// Legacy `devic3` names kept on purpose: other devices look for this exact
// Drive file and the existing settings key holds the user's Client ID.
const DRIVE_SETTINGS_KEY = 'devic3-google-drive-sync';
const DRIVE_FILE_NAME = 'devic3-vault-sync.json';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
let driveSettings = null;
let driveAccessToken = '';
let driveTokenClient = null;
let driveScriptPromise = null;
let driveSyncTimer = null;
let driveSyncQueue = Promise.resolve();
let driveRealtimeTimer = null;
let driveApplyingRemote = false;
let driveRuntimeStatus = 'idle';
let driveRuntimeMessage = '';
const DRIVE_REALTIME_POLL_MS = 5000;

function newDeviceId(){
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function loadDriveSettings(){
  if(driveSettings) return driveSettings;
  let parsed = {};
  try{
    const result = await window.storage.get(DRIVE_SETTINGS_KEY);
    if(result && result.value) parsed = JSON.parse(result.value);
  }catch(error){ console.warn('Cannot read Google Drive sync settings.', error); }
  driveSettings = {
    clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
    enabled: parsed.enabled === true,
    fileId: typeof parsed.fileId === 'string' ? parsed.fileId : '',
    deviceId: typeof parsed.deviceId === 'string' && parsed.deviceId ? parsed.deviceId : newDeviceId(),
    lastRemoteRevision: Number.isInteger(parsed.lastRemoteRevision) ? parsed.lastRemoteRevision : 0,
    lastRemoteModifiedTime: typeof parsed.lastRemoteModifiedTime === 'string' ? parsed.lastRemoteModifiedTime : '',
    lastSyncedFingerprint: typeof parsed.lastSyncedFingerprint === 'string' ? parsed.lastSyncedFingerprint : '',
    lastSyncedAt: Number.isFinite(parsed.lastSyncedAt) ? parsed.lastSyncedAt : 0,
  };
  await saveDriveSettings();
  return driveSettings;
}

async function saveDriveSettings(){
  if(!driveSettings) return;
  const result = await window.storage.set(DRIVE_SETTINGS_KEY, JSON.stringify(driveSettings));
  if(!result) throw new Error('Không thể lưu cấu hình Google Drive trên thiết bị.');
}

function loadGoogleIdentityScript(){
  if(window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if(driveScriptPromise) return driveScriptPromise;
  driveScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-hubaccounts-google-identity]');
    const script = existing || document.createElement('script');
    const timer = setTimeout(() => reject(new Error('Không tải được Google Identity Services. Kiểm tra kết nối mạng hoặc trình chặn nội dung.')), 15000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); reject(new Error('Không tải được dịch vụ đăng nhập Google.')); };
    if(!existing){
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.hubaccountsGoogleIdentity = '1';
      document.head.appendChild(script);
    }
  }).catch(error => { driveScriptPromise = null; throw error; });
  return driveScriptPromise;
}

// IMPORTANT: Safari/iOS only allows the OAuth popup when requestAccessToken()
// runs synchronously in the original click event. Do not add `await` before
// this function is called from a button handler.
function requestGoogleDriveAccessFromGesture(settings){
  if(!settings.clientId) throw new Error('Chưa có Google OAuth Client ID.');
  if(!window.google || !window.google.accounts || !window.google.accounts.oauth2){
    throw new Error('Dịch vụ đăng nhập Google chưa tải xong. Kiểm tra mạng, đợi vài giây rồi bấm lại.');
  }
  driveRuntimeStatus = 'connecting';
  return new Promise((resolve, reject) => {
    const finishError = detail => {
      driveRuntimeStatus = 'error';
      const code = detail && (detail.error || detail.type);
      let message = detail && detail.message ? detail.message : 'Đăng nhập Google bị huỷ hoặc thất bại.';
      if(code === 'access_denied'){
        message = 'Google từ chối quyền (403). Nếu OAuth đang ở chế độ Testing, vào Google Cloud → Google Auth Platform → Audience → Test users và thêm đúng Gmail đang đăng nhập.';
      }else if(code === 'popup_closed'){
        message = 'Cửa sổ Google đã đóng. Nếu cửa sổ vừa báo lỗi 403, hãy thêm Gmail đang đăng nhập vào Google Auth Platform → Audience → Test users rồi thử lại.';
      }else if(code === 'popup_failed_to_open'){
        message = 'Trình duyệt đã chặn cửa sổ Google. Hãy cho phép popup cho trang này rồi thử lại.';
      }
      reject(new Error(message));
    };
    driveTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: settings.clientId,
      scope: DRIVE_SCOPE,
      callback: response => {
        if(response && response.access_token){
          driveAccessToken = response.access_token;
          driveRuntimeStatus = 'connected';
          resolve(response.access_token);
        }else finishError(response);
      },
      error_callback: finishError,
    });
    driveTokenClient.requestAccessToken({ prompt: settings.enabled ? '' : 'consent' });
  });
}

async function driveFetch(url, options = {}){
  if(!driveAccessToken) throw new Error('Cần kết nối lại tài khoản Google.');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${driveAccessToken}`);
  const response = await fetch(url, { ...options, headers, cache: 'no-store' });
  if(response.status === 401){
    driveAccessToken = '';
    driveRuntimeStatus = 'reauth';
    throw new Error('Phiên Google đã hết hạn. Bấm Kết nối / Đồng bộ để đăng nhập lại.');
  }
  if(!response.ok){
    let message = `Google Drive trả lỗi ${response.status}.`;
    try{
      const body = await response.json();
      if(body && body.error && body.error.message) message += ` ${body.error.message}`;
    }catch(error){}
    throw new Error(message);
  }
  return response;
}

async function findDriveVaultFile(){
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
    fields: 'files(id,name,modifiedTime,size)',
    orderBy: 'modifiedTime desc',
    pageSize: '10',
  });
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
  const body = await response.json();
  return Array.isArray(body.files) && body.files.length ? body.files[0] : null;
}

function driveEnvelopeLooksValid(envelope){
  return !!envelope && envelope.app === 'devic3-drive-sync' && envelope.version === 1 &&
    Number.isInteger(envelope.revision) && envelope.revision > 0 && envelope.vault &&
    envelope.vault.app === 'devic3' && configLooksValid(envelope.vault.config) &&
    ['entries', 'folders', 'notes'].every(name => envelope.vault[name] == null || encryptedBlobLooksValid(envelope.vault[name]));
}

async function downloadDriveEnvelope(fileId){
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
  const envelope = await response.json();
  if(!driveEnvelopeLooksValid(envelope)) throw new Error('Bản đồng bộ trên Drive không đúng định dạng HubAccounts hoặc đã bị hỏng.');
  return envelope;
}

async function vaultFingerprint(bundle){
  const stable = JSON.stringify({
    app: bundle.app,
    version: bundle.version,
    config: bundle.config,
    entries: bundle.entries,
    folders: bundle.folders,
    notes: bundle.notes,
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
  return b64(digest);
}

async function uploadDriveEnvelope(fileId, bundle, revision){
  const settings = await loadDriveSettings();
  const writeId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const envelope = {
    app: 'devic3-drive-sync',
    version: 1,
    revision,
    deviceId: settings.deviceId,
    writeId,
    savedAt: Date.now(),
    vault: bundle,
  };
  const content = JSON.stringify(envelope);
  if(fileId){
    const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: content,
    });
    const body = await response.json();
    return { fileId: body.id || fileId, modifiedTime: body.modifiedTime || '', envelope };
  }
  const boundary = `hubaccounts_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' })}\r\n`,
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n`,
    `--${boundary}--`,
  ].join('');
  const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  const body = await response.json();
  if(!body.id) throw new Error('Google Drive không trả về mã file sau khi tải lên.');
  return { fileId: body.id, modifiedTime: body.modifiedTime || '', envelope };
}

class DriveWriteConflictError extends Error {
  constructor(remote, message = 'Dữ liệu Drive vừa được thay đổi từ thiết bị khác.'){
    super(message);
    this.name = 'DriveWriteConflictError';
    this.remote = remote;
  }
}

// Drive API v3 does not expose a compare-and-swap operation for media uploads.
// Re-read immediately before writing and verify our unique writeId afterwards.
// A simultaneous writer is therefore surfaced as a conflict instead of causing
// this device to silently pull over (and lose) its unsynchronised local change.
async function uploadDriveEnvelopeChecked(fileId, bundle, revision, expectedRemote){
  const expectedFingerprint = await vaultFingerprint(expectedRemote.vault);
  const freshBefore = await downloadDriveEnvelope(fileId);
  const freshBeforeFingerprint = await vaultFingerprint(freshBefore.vault);
  if(freshBefore.revision !== expectedRemote.revision || freshBeforeFingerprint !== expectedFingerprint){
    throw new DriveWriteConflictError(freshBefore);
  }
  const saved = await uploadDriveEnvelope(fileId, bundle, revision);
  const verified = await downloadDriveEnvelope(saved.fileId);
  const [wantedFingerprint, verifiedFingerprint] = await Promise.all([
    vaultFingerprint(bundle), vaultFingerprint(verified.vault),
  ]);
  if(verified.revision !== revision || verified.writeId !== saved.envelope.writeId || verifiedFingerprint !== wantedFingerprint){
    throw new DriveWriteConflictError(verified, 'Một thiết bị khác đã ghi dữ liệu cùng lúc. Bản trên thiết bị này vẫn được giữ nguyên.');
  }
  return { ...saved, remote: verified };
}

async function recordDriveSync(fileId, revision, fingerprint, modifiedTime = ''){
  const settings = await loadDriveSettings();
  settings.enabled = true;
  settings.fileId = fileId;
  settings.lastRemoteRevision = revision;
  if(modifiedTime) settings.lastRemoteModifiedTime = modifiedTime;
  settings.lastSyncedFingerprint = fingerprint;
  settings.lastSyncedAt = Date.now();
  await saveDriveSettings();
  driveRuntimeStatus = 'synced';
  driveRuntimeMessage = 'Đã đồng bộ';
}

async function applyRemoteDriveVaultLive(bundle){
  // Decrypt everything before replacing local storage. A wrong/different vault
  // therefore cannot partially overwrite the session currently being used.
  const verifier = await decryptStr(state.key, bundle.config.verifier);
  if(verifier !== VERIFY_STRING) throw new Error('Bản Drive dùng kho hoặc mật khẩu chính khác. Hãy khoá ứng dụng rồi khôi phục bản Drive riêng.');
  const decodeList = async blob => {
    if(!blob) return [];
    const value = JSON.parse(await decryptStr(state.key, blob));
    if(!Array.isArray(value)) throw new Error('Bản Drive chứa danh sách không hợp lệ.');
    return value;
  };
  const [entries, folders, notes] = await Promise.all([
    decodeList(bundle.entries), decodeList(bundle.folders), decodeList(bundle.notes),
  ]);
  entries.forEach(entry => { if(!entry.platform) entry.platform = 'facebook'; });
  folders.forEach(folder => { if(!folder.platformId) folder.platformId = 'facebook'; });
  await replaceStoredVault({
    [STORAGE_CONFIG_KEY]: JSON.stringify(bundle.config),
    [STORAGE_DATA_KEY]: bundle.entries == null ? null : JSON.stringify(bundle.entries),
    [STORAGE_FOLDERS_KEY]: bundle.folders == null ? null : JSON.stringify(bundle.folders),
    [STORAGE_NOTES_KEY]: bundle.notes == null ? null : JSON.stringify(bundle.notes),
  });
  state.entries = entries;
  state.folders = folders;
  state.notes = notes;
  state.selectedIds.clear();
  if(state.activeFolder !== 'all' && state.activeFolder !== NO_FOLDER_ID && !folders.some(folder => folder.id === state.activeFolder)) state.activeFolder = 'all';
  renderVault();
  return true;
}

async function useRemoteDriveVault(remote, fileId, modifiedTime = ''){
  const fingerprint = await vaultFingerprint(remote.vault);
  driveApplyingRemote = true;
  try{
    const applied = state.key
      ? await applyRemoteDriveVaultLive(remote.vault)
      : await applyVaultBundleAndSwitch(remote.vault, 'Google Drive');
    if(applied) await recordDriveSync(fileId, remote.revision, fingerprint, modifiedTime);
    if(applied && state.key) toast('Đã nhận thay đổi mới từ thiết bị khác');
    return applied;
  }finally{
    driveApplyingRemote = false;
  }
}

function openDriveConflictModal(localBundle, localFingerprint, remote, remoteFingerprint, fileId){
  const modalBg = document.getElementById('modalBg');
  const modalBody = document.getElementById('modalBody');
  modalBg.classList.add('show');
  modalBody.innerHTML = `
    <h2>Phát hiện hai phiên bản dữ liệu</h2>
    <p class="hint" style="line-height:1.65;margin-bottom:16px;">Dữ liệu trên thiết bị và Google Drive đều đã thay đổi. HubAccounts không tự ghi đè để tránh mất tài khoản. Hãy chọn phiên bản muốn giữ.</p>
    <button class="primary" id="driveUseRemoteBtn" style="width:100%;"><i class="ti ti-cloud-download" style="vertical-align:-2px;margin-right:5px;"></i>Dùng bản trên Google Drive</button>
    <p class="hint" style="margin:4px 0 14px;">Thay kho trên thiết bị bằng bản Drive (sau đó nhập lại mật khẩu chính).</p>
    <button id="driveUseLocalBtn" style="width:100%;"><i class="ti ti-cloud-upload" style="vertical-align:-2px;margin-right:5px;"></i>Giữ bản trên thiết bị</button>
    <p class="hint" style="margin:4px 0 14px;">Ghi bản đang có trên thiết bị lên Drive.</p>
    <button id="driveConflictCancelBtn" style="width:100%;">Huỷ, không thay đổi</button>`;
  document.getElementById('driveConflictCancelBtn').onclick = closeModal;
  document.getElementById('driveUseRemoteBtn').onclick = async event => {
    event.currentTarget.disabled = true;
    try{
      await useRemoteDriveVault(remote, fileId);
      closeModal();
    }
    catch(error){ console.error(error); toast(error.message || 'Không khôi phục được bản Drive', 5000); event.currentTarget.disabled = false; }
  };
  document.getElementById('driveUseLocalBtn').onclick = async event => {
    event.currentTarget.disabled = true;
    try{
      const nextRevision = remote.revision + 1;
      const saved = await uploadDriveEnvelopeChecked(fileId, localBundle, nextRevision, remote);
      await recordDriveSync(saved.fileId, nextRevision, localFingerprint, saved.modifiedTime);
      closeModal();
      toast('Đã giữ bản trên thiết bị và cập nhật Google Drive');
    }catch(error){
      console.error(error);
      if(error instanceof DriveWriteConflictError && error.remote){
        const newestFingerprint = await vaultFingerprint(error.remote.vault);
        openDriveConflictModal(localBundle, localFingerprint, error.remote, newestFingerprint, fileId);
        toast('Drive vừa thay đổi. Hãy chọn lại phiên bản cần giữ.', 6000);
      }else{
        toast(error.message || 'Không cập nhật được Google Drive', 5000);
        event.currentTarget.disabled = false;
      }
    }
  };
}

function reportDriveConflict(localBundle, localFingerprint, remote, remoteFingerprint, fileId, allowConflictUi, alreadyReported = false){
  driveRuntimeStatus = 'conflict';
  driveRuntimeMessage = 'Có xung đột dữ liệu';
  if(allowConflictUi){
    openDriveConflictModal(localBundle, localFingerprint, remote, remoteFingerprint, fileId);
  }else if(!alreadyReported){
    toast('Google Drive có xung đột. Mở Sao lưu / Đồng bộ để chọn bản cần giữ.', 6000);
  }
  return 'conflict';
}

async function performGoogleDriveSync({ allowConflictUi = false, restoreOnly = false, polling = false } = {}){
  const settings = await loadDriveSettings();
  const statusBeforeSync = driveRuntimeStatus;
  driveRuntimeStatus = 'syncing';
  driveRuntimeMessage = 'Đang kiểm tra Google Drive...';
  const file = await findDriveVaultFile();
  if(polling && file && file.modifiedTime && file.modifiedTime === settings.lastRemoteModifiedTime){
    driveRuntimeStatus = 'synced';
    driveRuntimeMessage = 'Đồng bộ hai chiều đang bật';
    return 'unchanged';
  }
  const localBundle = await assembleVaultBundle();
  const hasLocalVault = !!localBundle.config;
  const localFingerprint = hasLocalVault ? await vaultFingerprint(localBundle) : '';

  if(!file){
    if(restoreOnly || !hasLocalVault) throw new Error('Chưa có bản đồng bộ HubAccounts trong Google Drive này.');
    const saved = await uploadDriveEnvelope('', localBundle, 1);
    await recordDriveSync(saved.fileId, 1, localFingerprint, saved.modifiedTime);
    return 'uploaded';
  }

  const remote = await downloadDriveEnvelope(file.id);
  const remoteFingerprint = await vaultFingerprint(remote.vault);
  if(!hasLocalVault){
    await useRemoteDriveVault(remote, file.id, file.modifiedTime || '');
    return 'restored';
  }
  if(localFingerprint === remoteFingerprint){
    await recordDriveSync(file.id, remote.revision, remoteFingerprint, file.modifiedTime || '');
    return 'same';
  }

  const localUnchanged = !!settings.lastSyncedFingerprint && localFingerprint === settings.lastSyncedFingerprint;
  const remoteUnchanged = !!settings.lastSyncedFingerprint && remoteFingerprint === settings.lastSyncedFingerprint;
  if(remoteUnchanged && !restoreOnly){
    const nextRevision = remote.revision + 1;
    try{
      const saved = await uploadDriveEnvelopeChecked(file.id, localBundle, nextRevision, remote);
      await recordDriveSync(saved.fileId, nextRevision, localFingerprint, saved.modifiedTime);
    }catch(error){
      if(!(error instanceof DriveWriteConflictError) || !error.remote) throw error;
      const newestFingerprint = await vaultFingerprint(error.remote.vault);
      return reportDriveConflict(localBundle, localFingerprint, error.remote, newestFingerprint, file.id, allowConflictUi, statusBeforeSync === 'conflict');
    }
    return 'uploaded';
  }
  if(localUnchanged && (state.key || allowConflictUi)){
    // A changed payload with the same/older revision is a concurrent-write
    // collision, not a legitimate newer version to apply automatically.
    if(remote.revision <= Number(settings.lastRemoteRevision || 0)){
      return reportDriveConflict(localBundle, localFingerprint, remote, remoteFingerprint, file.id, allowConflictUi, statusBeforeSync === 'conflict');
    }
    await useRemoteDriveVault(remote, file.id, file.modifiedTime || '');
    return 'restored';
  }
  return reportDriveConflict(localBundle, localFingerprint, remote, remoteFingerprint, file.id, allowConflictUi, statusBeforeSync === 'conflict');
}

function connectAndSyncGoogleDrive(clientId, options = {}){
  // driveSettings and the GIS script are prepared while the modal opens. This
  // synchronous section must reach requestAccessToken before yielding control.
  const settings = driveSettings;
  if(!settings) throw new Error('Cấu hình đồng bộ chưa tải xong. Đợi vài giây rồi bấm lại.');
  const normalized = String(clientId || settings.clientId || '').trim();
  if(!/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(normalized)){
    throw new Error('Google OAuth Client ID không đúng định dạng (*.apps.googleusercontent.com).');
  }
  settings.clientId = normalized;
  const accessPromise = requestGoogleDriveAccessFromGesture(settings);
  return (async () => {
    await saveDriveSettings();
    await accessPromise;
    const outcome = await performGoogleDriveSync({ allowConflictUi: true, restoreOnly: !!options.restoreOnly });
    settings.enabled = true;
    await saveDriveSettings();
    startGoogleDriveRealtimeSync();
    return outcome;
  })();
}

function scheduleGoogleDriveSync(){
  if(driveApplyingRemote || !driveSettings || !driveSettings.enabled || !driveAccessToken) return;
  clearTimeout(driveSyncTimer);
  driveSyncTimer = setTimeout(() => {
    driveSyncQueue = driveSyncQueue.catch(() => {}).then(() => performGoogleDriveSync()).catch(error => {
      console.warn('Automatic Google Drive sync paused.', error);
      driveRuntimeStatus = 'error';
      driveRuntimeMessage = error.message || 'Đồng bộ tự động tạm dừng';
      toast(driveRuntimeMessage, 5000);
    });
  }, 200);
}

function stopGoogleDriveRealtimeSync(){
  if(driveRealtimeTimer){ clearInterval(driveRealtimeTimer); driveRealtimeTimer = null; }
}

function pollGoogleDriveNow(){
  if(!driveAccessToken || !driveSettings || !driveSettings.enabled || driveRuntimeStatus === 'conflict') return;
  if(document.visibilityState === 'hidden') return;
  const modalBg = document.getElementById('modalBg');
  if(modalBg && modalBg.classList.contains('show')) return; // never replace a form with unsaved typing
  driveSyncQueue = driveSyncQueue.catch(() => {}).then(() => performGoogleDriveSync({ polling: true })).catch(error => {
    console.warn('Google Drive realtime polling paused.', error);
    driveRuntimeStatus = 'error';
    driveRuntimeMessage = error.message || 'Không kiểm tra được thay đổi mới';
  });
}

function startGoogleDriveRealtimeSync(){
  stopGoogleDriveRealtimeSync();
  if(!driveAccessToken || !driveSettings || !driveSettings.enabled) return;
  if(driveRuntimeStatus !== 'conflict'){
    driveRuntimeStatus = 'synced';
    driveRuntimeMessage = 'Đồng bộ hai chiều đang bật';
  }
  driveRealtimeTimer = setInterval(pollGoogleDriveNow, DRIVE_REALTIME_POLL_MS);
}

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible') pollGoogleDriveNow();
});
window.addEventListener('online', pollGoogleDriveNow);

async function disconnectGoogleDrive(){
  const settings = await loadDriveSettings();
  if(driveAccessToken && window.google && google.accounts && google.accounts.oauth2){
    try{ google.accounts.oauth2.revoke(driveAccessToken, () => {}); }catch(error){}
  }
  driveAccessToken = '';
  stopGoogleDriveRealtimeSync();
  driveTokenClient = null;
  settings.enabled = false;
  settings.fileId = '';
  settings.lastRemoteRevision = 0;
  settings.lastRemoteModifiedTime = '';
  settings.lastSyncedFingerprint = '';
  settings.lastSyncedAt = 0;
  await saveDriveSettings();
  driveRuntimeStatus = 'idle';
  driveRuntimeMessage = 'Đã ngắt kết nối trên thiết bị này';
}

function driveStatusText(settings){
  if(driveRuntimeMessage) return driveRuntimeMessage;
  if(driveAccessToken && settings.enabled) return 'Đã kết nối trong phiên này';
  if(settings.enabled) return 'Đã cấu hình — cần kết nối lại sau khi tải trang';
  if(settings.clientId) return 'Đã lưu Client ID — chưa kết nối';
  return 'Chưa cấu hình';
}

async function openGoogleDriveRestoreModal(){
  const modalBg = document.getElementById('modalBg');
  const modalBody = document.getElementById('modalBody');
  modalBg.classList.add('show');
  modalBody.innerHTML = '<h2>Khôi phục từ Google Drive</h2><p class="hint">Đang chuẩn bị đăng nhập Google...</p>';
  const settings = await loadDriveSettings();
  let identityLoadError = '';
  try{ await loadGoogleIdentityScript(); }
  catch(error){ identityLoadError = error.message || 'Không tải được dịch vụ đăng nhập Google.'; }
  modalBody.innerHTML = `
    <h2>Khôi phục từ Google Drive</h2>
    <p class="hint" style="line-height:1.6;">Nhập OAuth Client ID của dự án Google Cloud. HubAccounts chỉ xin quyền truy cập thư mục ẩn riêng của ứng dụng và chỉ tải về file JSON đã mã hoá.</p>
    <label>Google OAuth Client ID</label>
    <input id="driveRestoreClientId" autocomplete="off" placeholder="123456789-abc.apps.googleusercontent.com">
    <p class="err" id="driveRestoreErr"${identityLoadError ? ' style="display:block;"' : ''}>${escapeHtml(identityLoadError)}</p>
    <button class="primary" id="driveRestoreNowBtn" style="width:100%;"><i class="ti ti-brand-google-drive" style="vertical-align:-2px;margin-right:5px;"></i>Kết nối và khôi phục</button>
    <button id="driveRestoreCancelBtn" style="width:100%;margin-top:10px;">Huỷ</button>`;
  document.getElementById('driveRestoreClientId').value = settings.clientId;
  document.getElementById('driveRestoreCancelBtn').onclick = closeModal;
  document.getElementById('driveRestoreNowBtn').onclick = async event => {
    const button = event.currentTarget;
    const errorBox = document.getElementById('driveRestoreErr');
    errorBox.style.display = 'none';
    button.disabled = true;
    button.textContent = 'Đang kết nối...';
    try{
      const outcome = await connectAndSyncGoogleDrive(document.getElementById('driveRestoreClientId').value, { restoreOnly: true });
      if(outcome !== 'conflict'){
        recordLog('info', 'sync', 'Đã khôi phục kho mã hoá từ Google Drive');
        toast('Đã tải kho mã hoá từ Google Drive');
      }
    }catch(error){
      console.error(error);
      recordLog('error', 'sync', 'Không thể khôi phục dữ liệu từ Google Drive', error.message || 'Lỗi không xác định');
      errorBox.textContent = error.message || 'Không kết nối được Google Drive.';
      errorBox.style.display = 'block';
      button.disabled = false;
      button.innerHTML = '<i class="ti ti-brand-google-drive" style="vertical-align:-2px;margin-right:5px;"></i>Kết nối và khôi phục';
    }
  };
}

let vaultFileWriteQueue = Promise.resolve();
function writeVaultFile(){
  // FileSystemWritableFileStream instances must not overlap. Queue writes so
  // rapid edits cannot race and truncate/corrupt the linked backup file.
  vaultFileWriteQueue = vaultFileWriteQueue.catch(() => {}).then(async () => {
    const handle = state.fileHandle;
    if(!handle) return true;
    try{
      const bundle = await assembleVaultBundle();
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(bundle, null, 2));
      await writable.close();
      return true;
    }catch(e){
      console.error(e);
      toast('⚠ Không ghi được vào file trên ổ cứng — dữ liệu vẫn an toàn trong trình duyệt');
      return false;
    }
  });
  return vaultFileWriteQueue;
}

// Links a NEW file to mirror whatever vault is *currently open* (does not
// touch the vault's data or password — for someone who just wants an existing
// vault to also start writing to a file going forward).
async function linkNewVaultFile(){
  if(!fileSystemAccessSupported()){
    toast('Trình duyệt này không hỗ trợ lưu trực tiếp ra file (chỉ Chrome/Edge trên máy tính — không dùng được trên Safari/iPad). Hãy dùng "Nhập/Xuất" để sao lưu thủ công thay thế.');
    return false;
  }
  try{
    const handle = await window.showSaveFilePicker({
      suggestedName: backupFileName('json'),
      types: [{ description: 'HubAccounts Vault', accept: { 'application/json': ['.json'] } }]
    });
    state.fileHandle = handle;
    state.fileHandleName = handle.name;
    if(!await writeVaultFile()){
      state.fileHandle = null;
      state.fileHandleName = '';
      return false;
    }
    return true;
  }catch(e){
    if(e.name !== 'AbortError'){ console.error(e); toast('Không thể tạo file'); }
    return false;
  }
}

// Opens an EXISTING vault file and fully loads it — cleanly replacing whatever
// vault/session is currently active, then always landing on the Unlock screen
// for that file's password (this used to silently patch localStorage without
// updating what was on screen, which looked like "nothing happened").
// Shared by both the File-System-Access "open file" flow (Chrome/Edge only)
// AND the universal file-input flow (works everywhere, including Safari) —
// takes an already-parsed bundle and switches the app over to it.
async function applyVaultBundleAndSwitch(bundle, sourceName){
  const configValid = bundle && configLooksValid(bundle.config);
  const blobsValid = ['entries', 'folders', 'notes'].every(name => bundle[name] == null || encryptedBlobLooksValid(bundle[name]));
  if(!bundle || bundle.app !== 'devic3' || !configValid || !blobsValid){
    toast('File không đúng định dạng kho HubAccounts');
    return false;
  }
  try{
    await replaceStoredVault({
      [STORAGE_CONFIG_KEY]: JSON.stringify(bundle.config),
      [STORAGE_DATA_KEY]: bundle.entries == null ? null : JSON.stringify(bundle.entries),
      [STORAGE_FOLDERS_KEY]: bundle.folders == null ? null : JSON.stringify(bundle.folders),
      [STORAGE_NOTES_KEY]: bundle.notes == null ? null : JSON.stringify(bundle.notes),
    });
  }catch(e){
    console.error(e);
    toast('Không thể nhập file; kho hiện tại đã được giữ nguyên');
    return false;
  }

  state.key = null;
  state.entries = [];
  state.folders = [];
  state.notes = [];
  state.logs = [];
  endSession();

  closeModal();
  toast(sourceName ? `Đã nhập "${sourceName}" — nhập mật khẩu chính để mở khoá` : 'Đã nhập file sao lưu — nhập mật khẩu chính để mở khoá');
  renderUnlock(bundle.config);
  return true;
}

// Chrome/Edge only — called through openVaultFileAnyBrowser().
async function openExistingVaultFileAndSwitch(){
  try{
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'HubAccounts Vault', accept: { 'application/json': ['.json'] } }]
    });
    const file = await handle.getFile();
    const text = await file.text();
    const bundle = JSON.parse(text);
    const ok = await applyVaultBundleAndSwitch(bundle, handle.name);
    if(ok){
      state.fileHandle = handle;
      state.fileHandleName = handle.name;
    }
  }catch(e){
    if(e.name !== 'AbortError'){ console.error(e); toast('Không thể mở file — kiểm tra lại đúng file kho chưa'); }
  }
}

// ---------- UNIVERSAL encrypted backup (.json) — works on every browser,
// including Safari/iOS where the File System Access API above doesn't exist
// at all. Same encrypted bundle format, just exported/imported via a plain
// download link and <input type="file"> instead of native file pickers, so
// PC and iPhone can use the exact same backup file interchangeably. ----------
async function exportEncryptedBackupUniversal(){
  try{
    const bundle = await assembleVaultBundle();
    const json = JSON.stringify(bundle);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName('json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    recordLog('info', 'backup', 'Đã tải file sao lưu mã hoá về thiết bị');
    toast('Đã tải file sao lưu mã hoá — dùng được để nhập lại trên mọi thiết bị');
  }catch(e){
    console.error(e);
    toast('Không thể tạo file sao lưu, thử lại');
  }
}

// Chrome/Edge: open the native Save As window so the person can choose the
// destination folder and file name. The picker must be the first awaited call
// after the click or the browser can reject it for lacking user activation.
async function backupCurrentVault(){
  if(!backupLocationPickerSupported()){
    await exportEncryptedBackupUniversal();
    return;
  }
  let handle;
  try{
    handle = await window.showSaveFilePicker({
      id: 'devic3-encrypted-backup', // legacy picker id: browser remembers the chosen backup folder by it
      suggestedName: backupFileName('json'),
      types: [{ description: 'HubAccounts Backup mã hoá', accept: { 'application/json': ['.json'] } }]
    });
  }catch(error){
    if(error && error.name !== 'AbortError'){
      console.error(error);
      toast('Không mở được cửa sổ chọn nơi lưu');
    }
    return;
  }
  try{
    const bundle = await assembleVaultBundle();
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(bundle));
    await writable.close();
    recordLog('info', 'backup', 'Đã lưu file sao lưu mã hoá vào vị trí đã chọn');
    toast(`Đã lưu ${handle.name || 'file sao lưu'} vào thư mục đã chọn`);
  }catch(error){
    console.error(error);
    toast('Không thể ghi file vào vị trí đã chọn');
  }
}

function openImportEncryptedBackupUniversal(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const file = input.files && input.files[0];
    document.body.removeChild(input);
    if(!file) return;
    try{
      const text = await file.text();
      const bundle = JSON.parse(text);
      await applyVaultBundleAndSwitch(bundle, file.name);
    }catch(e){
      console.error(e);
      toast('Không đọc được file — kiểm tra lại đúng file sao lưu .json chưa');
    }
  };
  input.click();
}

// Single entry point for opening an encrypted vault file. Chrome/Edge keep a
// link to the chosen file (later changes are written back to it); other
// browsers (Safari/iPhone) import a copy through a regular file input.
function openVaultFileAnyBrowser(){
  if(fileSystemAccessSupported()) return openExistingVaultFileAndSwitch();
  return openImportEncryptedBackupUniversal();
}

function unlinkVaultFile(){
  state.fileHandle = null;
  state.fileHandleName = '';
}

function openFileBackupModal(){
  const modalBg = document.getElementById('modalBg');
  modalBg.classList.add('show');
  document.getElementById('modalBody').innerHTML = '<h2>Sao lưu / Khôi phục</h2><p class="hint">Đang tải cấu hình...</p>';
  renderFileBackupModal();
}

async function renderFileBackupModal(){
  const modalBody = document.getElementById('modalBody');
  const supported = fileSystemAccessSupported();
  const canChooseBackupLocation = backupLocationPickerSupported();
  const linked = !!state.fileHandle;
  const drive = await loadDriveSettings();
  let identityLoadError = '';
  try{ await loadGoogleIdentityScript(); }
  catch(error){ identityLoadError = error.message || 'Không tải được dịch vụ đăng nhập Google.'; }
  modalBody.innerHTML = `
    <h2>Sao lưu / Khôi phục</h2>
    <p class="hint" style="margin-top:-4px; margin-bottom:18px;"><i class="ti ti-shield-lock" style="vertical-align:-2px;font-size:14px;color:var(--tone-green);"></i> File sao lưu được <b style="color:var(--text);">mã hoá AES-256</b> — không lộ nội dung tài khoản, dùng được để khôi phục trên bất kỳ thiết bị nào (Windows, iPhone/Safari...).</p>

    <button id="fbCreateNewBtn" style="width:100%;">Tạo kho mới</button>
    <p class="hint" style="margin:4px 0 14px;">Bắt đầu lại từ đầu trên thiết bị này, không giữ dữ liệu cũ</p>

    <button id="fbOpenSavedBtn" style="width:100%;">Mở file đã lưu</button>
    <p class="hint" style="margin:4px 0 14px;">Thay dữ liệu hiện tại bằng nội dung trong 1 file sao lưu đã có</p>

    <button id="fbBackupNowBtn" class="primary" style="width:100%;"><i class="ti ${canChooseBackupLocation ? 'ti-folder-down' : 'ti-download'}" style="vertical-align:-2px;font-size:15px;margin-right:4px;"></i>Backup</button>
    <p class="hint" style="margin:4px 0 4px;">${canChooseBackupLocation
      ? 'Chrome/Edge sẽ mở cửa sổ để bạn chọn thư mục và tên file .json. Trình duyệt sẽ ghi nhớ thư mục đã chọn gần nhất.'
      : 'Safari/iPhone chưa hỗ trợ chọn thư mục trực tiếp; file sẽ được tải xuống để bạn lưu hoặc chia sẻ qua AirDrop, Files, email, Drive...'}</p>

    <div style="border-top:1px solid var(--border);margin:20px 0 16px;padding-top:16px;">
      <div class="code-comment" style="font-size:12px;margin-bottom:10px;">Đồng bộ nhiều thiết bị</div>
      <label>Google OAuth Client ID</label>
      <input id="driveClientIdInput" autocomplete="off" placeholder="123456789-abc.apps.googleusercontent.com">
      <p class="hint" style="margin:5px 0 10px;line-height:1.55;"><i class="ti ti-shield-lock" style="vertical-align:-2px;color:var(--tone-green);"></i> Chỉ dùng quyền <code>drive.appdata</code>. File trên Drive là JSON đã mã hoá AES-256; access token chỉ giữ trong bộ nhớ của tab.</p>
      <p class="hint" style="margin:0 0 10px;line-height:1.55;"><i class="ti ti-refresh" style="vertical-align:-2px;color:var(--tone-blue);"></i> Khi hai thiết bị đang mở và đã kết nối, thay đổi được đẩy ngay và thiết bị kia tự cập nhật trong tối đa khoảng 5 giây.</p>
      <p style="font-size:12px;color:var(--text-2);margin:0 0 10px;"><i class="ti ti-cloud" style="vertical-align:-2px;"></i> ${escapeHtml(driveStatusText(drive))}${drive.lastSyncedAt ? ` · ${escapeHtml(new Date(drive.lastSyncedAt).toLocaleString('vi-VN'))}` : ''}</p>
      <div class="row" style="gap:8px;flex-wrap:wrap;">
        <button class="primary" id="driveSyncNowBtn" style="flex:1 1 190px;"><i class="ti ti-brand-google-drive" style="vertical-align:-2px;margin-right:4px;"></i>Kết nối / Đồng bộ ngay</button>
        ${drive.clientId ? '<button id="driveDisconnectBtn" style="flex:1 1 120px;">Ngắt kết nối</button>' : ''}
      </div>
      <p class="err" id="driveSyncErr" style="margin-top:10px;${identityLoadError ? 'display:block;' : ''}">${escapeHtml(identityLoadError)}</p>
    </div>

    ${supported ? `
    <div class="entry-extra-toggle" id="fbAdvancedToggle"><i class="ti ti-chevron-right"></i>Nâng cao: tự động lưu mỗi khi có thay đổi (chỉ Chrome/Edge)</div>
    <div class="entry-extra" id="fbAdvancedBox">
      ${linked ? `
      <p style="font-size:13px; color:var(--text-2); margin:10px 0;"><i class="ti ti-file-check" style="color:${STATUS_META.active.color}; vertical-align:-2px;"></i> Đang liên kết: <b style="color:var(--text);">${escapeHtml(state.fileHandleName)}</b></p>
      <div class="row" style="margin-bottom:10px;">
        <button id="fileSaveNowBtn" style="flex:1">Lưu ngay</button>
        <button id="fileUnlinkBtn" class="danger" style="flex:1">Bỏ liên kết</button>
      </div>
      ` : `
      <button id="fbLinkBtn" style="width:100%; margin-top:10px;">Liên kết 1 file để tự lưu</button>
      <p class="hint" style="margin:4px 0 10px;">Mỗi thay đổi sẽ tự ghi vào đúng file đó, không cần bấm "Backup" thủ công nữa</p>
      `}
    </div>
    ` : ''}

    <button id="fileCloseBtn" style="width:100%; margin-top:10px;">Đóng</button>
  `;
  document.getElementById('driveClientIdInput').value = drive.clientId;
  document.getElementById('fileCloseBtn').onclick = closeModal;

  document.getElementById('fbCreateNewBtn').onclick = () => {
    showConfirm(
      'Tạo kho mới?',
      'Kho hiện tại trên thiết bị này sẽ được thay bằng 1 kho trống. Nếu chưa sao lưu, hãy bấm "Backup dữ liệu hiện tại" trước khi tiếp tục.',
      async () => {
        if(!await deleteEntireVault()) return;
        closeModal();
        renderApp();
      },
      'Tạo kho mới'
    );
  };
  document.getElementById('fbOpenSavedBtn').onclick = openVaultFileAnyBrowser;
  document.getElementById('fbBackupNowBtn').onclick = backupCurrentVault;

  document.getElementById('driveSyncNowBtn').onclick = async event => {
    const button = event.currentTarget;
    const errorBox = document.getElementById('driveSyncErr');
    errorBox.style.display = 'none';
    button.disabled = true;
    button.textContent = 'Đang kết nối...';
    try{
      const outcome = await connectAndSyncGoogleDrive(document.getElementById('driveClientIdInput').value);
      if(outcome !== 'conflict'){
        recordLog('info', 'sync', 'Đồng bộ Google Drive thành công', outcome);
        toast(outcome === 'restored' ? 'Đã nhận dữ liệu mới từ Google Drive' : 'Đồng bộ Google Drive thành công');
        if(document.getElementById('modalBg').classList.contains('show')) renderFileBackupModal();
      }
    }catch(error){
      console.error(error);
      recordLog('error', 'sync', 'Không thể đồng bộ Google Drive', error.message || 'Lỗi không xác định');
      errorBox.textContent = error.message || 'Không đồng bộ được Google Drive.';
      errorBox.style.display = 'block';
      button.disabled = false;
      button.innerHTML = '<i class="ti ti-brand-google-drive" style="vertical-align:-2px;margin-right:4px;"></i>Kết nối / Đồng bộ ngay';
    }
  };
  const driveDisconnectBtn = document.getElementById('driveDisconnectBtn');
  if(driveDisconnectBtn) driveDisconnectBtn.onclick = async () => {
    await disconnectGoogleDrive();
    recordLog('info', 'sync', 'Đã ngắt kết nối Google Drive trên thiết bị này');
    toast('Đã ngắt Google Drive trên thiết bị này; file trên Drive không bị xoá');
    renderFileBackupModal();
  };

  const advToggle = document.getElementById('fbAdvancedToggle');
  if(advToggle){
    advToggle.onclick = () => {
      const box = document.getElementById('fbAdvancedBox');
      const nowOpen = advToggle.classList.toggle('open');
      if(box) box.classList.toggle('open', nowOpen);
    };
  }
  const linkBtn = document.getElementById('fbLinkBtn');
  if(linkBtn){
    linkBtn.onclick = async () => {
      const ok = await linkNewVaultFile();
      if(ok){ recordLog('info', 'backup', 'Đã liên kết file sao lưu cục bộ'); toast('Đã liên kết file — từ giờ tự lưu mỗi khi có thay đổi'); }
      renderFileBackupModal();
    };
  }
  const saveNowBtn = document.getElementById('fileSaveNowBtn');
  if(saveNowBtn) saveNowBtn.onclick = async () => { if(await writeVaultFile()){ recordLog('info', 'backup', 'Đã lưu kho vào file cục bộ'); toast('Đã lưu vào file'); } };
  const unlinkBtn = document.getElementById('fileUnlinkBtn');
  if(unlinkBtn) unlinkBtn.onclick = () => { unlinkVaultFile(); recordLog('info', 'backup', 'Đã bỏ liên kết file cục bộ'); toast('Đã bỏ liên kết file'); renderFileBackupModal(); };
}


// small debounce helper — avoids a full list re-render on every single keystroke
// while typing in the search box, which was the main source of noticeable lag
// on accounts with a large number of entries.
function debounce(fn, wait){
  let t = null;
  return function(...args){
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// The search box lives permanently in the title bar now (not inside #app),
// so it survives every re-render untouched — no more losing focus/cursor
// position on each keystroke like when it used to get destroyed and
// recreated inside the scrollable content area. `context` is 'accounts',
// 'links', 'notes', or null (hides the box entirely — locked screens, Tools/Home).
function syncGlobalSearchBar(context){
  const wrap = document.getElementById('titlebarSearchWrap');
  const input = document.getElementById('globalSearchInput');
  if(!wrap || !input) return;
  if(!context){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';
  input.placeholder = context === 'notes' ? t('placeholder_search_notes') : context === 'links' ? 'Tìm theo link hoặc mô tả' : t('placeholder_search');
  if(document.activeElement !== input && input.value !== state.search) input.value = state.search;
  input.oninput = debounce((e) => {
    state.search = e.target.value;
    if(context === 'notes') renderNotesVault();
    else renderVault();
  }, 180);
}

// small retry helper — storage.set can occasionally fail transiently (e.g. a
// brief hiccup in the host's storage backend); retries once after a short
// delay before giving up, since a single retry resolves most transient blips
// without making the user re-type their password.
async function storageSetWithRetry(key, value){
  try{
    const result = await window.storage.set(key, value);
    if(result) return result;
  }catch(e){}
  await new Promise(r => setTimeout(r, 400));
  return window.storage.set(key, value);
}

