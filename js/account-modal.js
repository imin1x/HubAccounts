// HubAccounts — Folder manager and add/edit account dialog.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- FOLDER MANAGER MODAL ----------
function openFolderManager(){
  const modalBg = document.getElementById('modalBg');
  modalBg.classList.add('show');
  renderFolderManagerBody();
}

function renderFolderManagerBody(){
  const modalBody = document.getElementById('modalBody');
  const platformName = platformMeta(state.activePlatform).name;
  modalBody.innerHTML = `
    <h2>Quản lý thư mục — ${escapeHtml(platformName)}</h2>
    <div id="folderRows"></div>
    <div class="row" style="margin-top:14px;">
      <input type="text" id="newFolderName" placeholder="Tên thư mục mới" style="margin-bottom:0;">
      <button class="primary" id="addFolderBtn" style="flex-shrink:0;"><i class="ti ti-plus" style="vertical-align:-2px;font-size:15px;margin-right:4px"></i>Thêm</button>
    </div>
    <p class="err" id="folderErr"></p>
    <div class="row" style="margin-top:18px;">
      <button id="closeFolderBtn" style="flex:1">Xong</button>
    </div>
  `;
  renderFolderRows();
  document.getElementById('addFolderBtn').onclick = addFolder;
  document.getElementById('newFolderName').addEventListener('keydown', e => { if(e.key === 'Enter') addFolder(); });
  document.getElementById('closeFolderBtn').onclick = () => { closeModal(); renderVault(); };
}

function renderFolderRows(){
  const wrap = document.getElementById('folderRows');
  const platformFolders = state.folders.filter(f => f.platformId === state.activePlatform);
  if(platformFolders.length === 0){
    wrap.innerHTML = `<p class="hint" style="margin-top:0;">Chưa có thư mục nào cho nền tảng này.</p>`;
    return;
  }
  wrap.innerHTML = platformFolders.map(f => `
    <div class="folder-list-row" data-id="${f.id}">
      <i class="ti ti-folder" style="color:var(--text-muted);font-size:16px"></i>
      <input type="text" value="${escapeAttr(f.name)}" data-rename="${f.id}">
      <button class="text-btn danger" data-delfolder="${f.id}" title="Delete folder"><i class="ti ti-trash"></i>${t('btn_delete')}</button>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-rename]').forEach(inp => {
    inp.addEventListener('change', async () => {
      const f = state.folders.find(x => x.id === inp.dataset.rename);
      const newName = inp.value.trim();
      if(!newName){ inp.value = f.name; return; }
      const nextFolders = state.folders.map(folder => folder.id === f.id ? { ...folder, name: newName } : folder);
      if(!await commitCollection('folders', nextFolders, saveFolders)){
        inp.value = f.name;
        return;
      }
      recordLog('info', 'folder', 'Đã đổi tên một thư mục', platformMeta(state.activePlatform).name);
      toast('Đã đổi tên thư mục');
    });
  });

  wrap.querySelectorAll('[data-delfolder]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.delfolder;
      const f = state.folders.find(x => x.id === id);
      showConfirm(
        'Xoá thư mục?',
        `Bạn có chắc chắn muốn xoá thư mục "${f ? f.name : ''}"? Các tài khoản trong thư mục này sẽ chuyển về "Chưa phân loại", không bị xoá.`,
        async () => {
          const nextFolders = state.folders.filter(x => x.id !== id);
          const nextEntries = state.entries.map(e => e.folderId === id ? { ...e, folderId: '' } : e);
          if(!await commitCollections([
            { property: 'folders', nextValue: nextFolders, saveFn: saveFolders },
            { property: 'entries', nextValue: nextEntries, saveFn: saveEntries },
          ])) return;
          recordLog('info', 'folder', 'Đã xoá một thư mục', platformMeta(state.activePlatform).name);
          if(state.activeFolder === id) state.activeFolder = 'all';
          openFolderManager();
          toast('Đã xoá thư mục');
        }
      );
    };
  });
}

async function addFolder(){
  const input = document.getElementById('newFolderName');
  const name = input.value.trim();
  const err = document.getElementById('folderErr');
  err.style.display = 'none';
  if(!name){
    err.textContent = 'Nhập tên thư mục.';
    err.style.display = 'block';
    return;
  }
  const nextFolders = [...state.folders, { id: uid(), name, platformId: state.activePlatform }];
  if(!await commitCollection('folders', nextFolders, saveFolders)) return;
  recordLog('info', 'folder', 'Đã thêm một thư mục', platformMeta(state.activePlatform).name);
  input.value = '';
  renderFolderRows();
}

// ---------- ACCOUNT MODAL ----------
function openModal(entry){
  state.editingId = entry ? entry.id : null;
  // editing always forced to manual; adding a new account keeps whatever tab
  // the caller pre-selected (e.g. the Phone quick-import jumps straight to
  // "Tự động"), defaulting to manual if nothing was set
  if(entry || !state.modalTab) state.modalTab = 'manual';
  const modalBg = document.getElementById('modalBg');
  modalBg.classList.add('show');
  renderModalBody(entry);
}

function folderOptionsHtml(selectedId, platformId){
  let html = `<option value="">Chưa phân loại</option>`;
  state.folders.filter(f => f.platformId === platformId).forEach(f => {
    html += `<option value="${f.id}" ${selectedId===f.id?'selected':''}>${escapeHtml(f.name)}</option>`;
  });
  return html;
}

function platformOptionsHtml(selectedId){
  return PLATFORMS.filter(p => !['home', 'note', 'log', 'other'].includes(p.id)).map(p => `<option value="${p.id}" ${selectedId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
}

// renders just the platform-specific input/textarea fields (the part that changes when
// the platform dropdown changes), given already-typed values to preserve where possible
function dynamicFieldsHtml(platformId, valuesObj){
  return getPlatformInputFields(platformId).map(f => {
    const meta = fieldMeta(f.key);
    const val = (valuesObj && valuesObj[f.key]) || '';
    const placeholder = platformId === 'link'
      ? (f.key === 'fbName' ? 'https://example.com' : 'Mô tả ngắn về website')
      : 'Không bắt buộc';
    if(meta.kind === 'area'){
      return `<label>${f.label}</label><textarea id="f_${f.key}" placeholder="${escapeAttr(placeholder)}">${escapeHtml(val)}</textarea>`;
    }
    if(meta.kind === 'date'){
      return `<label>${f.label}</label><input type="text" id="f_${f.key}" placeholder="dd/mm/yyyy" value="${escapeAttr(toDisplayDate(val))}">`;
    }
    if(meta.kind === 'secret'){
      return `<label>${f.label}</label><input type="password" id="f_${f.key}" placeholder="Không bắt buộc" value="${escapeAttr(val)}" autocomplete="off" spellcheck="false">`;
    }
    return `<label>${f.label}</label><input type="text" id="f_${f.key}" placeholder="${escapeAttr(placeholder)}" value="${escapeAttr(val)}">`;
  }).join('');
}

function manualFieldsHtml(entry){
  const currentPlatform = entry ? entry.platform : state.activePlatform;
  const isLink = currentPlatform === 'link';
  const platformSelect = `<label>Nền tảng</label><select id="f_platform">${platformOptionsHtml(currentPlatform)}</select>`;
  const folderSelect = `<label>Thư mục</label><select id="f_folderId">${folderOptionsHtml(entry ? entry.folderId : '', currentPlatform)}</select>`;
  // "Tên" (display name/nickname) can only be set while editing an existing account
  const nameField = entry && !isLink && currentPlatform !== 'money' ? `<label>Tên</label><input type="text" id="f_displayName" placeholder="Không bắt buộc" value="${escapeAttr(entry.displayName)}">` : '';
  // "Proxy" also only settable while editing — lets you type freely OR quickly
  // pick a saved proxy with its port so same-IP proxies remain distinguishable.
  const savedProxies = state.entries.filter(e => e.platform === 'proxy' && e.fbName);
  const proxyDatalistOptions = savedProxies.map(e => {
    const endpoint = proxyUsageEndpoint(e.fbName);
    const host = endpoint.host.includes(':') ? `[${endpoint.host}]` : endpoint.host;
    const port = String(e.port || endpoint.port || '').trim();
    const value = port ? `${host}:${port}` : e.fbName;
    return `<option value="${escapeAttr(value)}">${escapeAttr(value)}${e.username ? ' — ' + escapeAttr(e.username) : ''}</option>`;
  }).join('');
  const proxyField = entry && !isLink && currentPlatform !== 'money' ? `<label>Proxy</label><input type="text" id="f_proxy" list="proxyDatalist" placeholder="${savedProxies.length ? 'Gõ hoặc chọn từ danh sách Proxy đã lưu' : 'Không bắt buộc'}" value="${escapeAttr(entry.proxy)}"><datalist id="proxyDatalist">${proxyDatalistOptions}</datalist>` : '';
  // "Trạng thái" also only settable while editing
  const currentStatus = entry ? (entry.status || 'unknown') : 'unknown';
  const statusField = entry && !isLink && currentPlatform !== 'money' ? `<label>Trạng thái tài khoản</label><select id="f_status">
      <option value="unknown" ${currentStatus==='unknown'?'selected':''}>? Chưa xác định</option>
      <option value="active" ${currentStatus==='active'?'selected':''}>✓ Hoạt động</option>
      <option value="inactive" ${currentStatus==='inactive'?'selected':''}>✕ Không hoạt động</option>
    </select>` : '';
  const dynamicWrap = `<div id="dynamicFieldsWrap">${dynamicFieldsHtml(currentPlatform, entry || {})}</div>`;
  return platformSelect + folderSelect + nameField + proxyField + statusField + dynamicWrap;
}

function buildAutoFormatHintHtml(platformId){
  const fmt = platformFormatHint(platformId);
  const dateHint = getPlatformFields(platformId).some(f => fieldMeta(f.key).kind === 'date')
    ? `<br>Ngày viết theo dạng <code>dd/mm/yyyy</code> — VD: <code>${escapeHtml((() => { const d = new Date(); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); })())}</code>.`
    : '';
  const smartHint = ['ai', 'tiktok', 'gmail', 'hotmail', 'steam'].includes(platformId)
    ? '<br><b>Tự nhận dạng:</b> email, 2FA, cookie, token, proxy, số điện thoại có thể nằm khác thứ tự. Riêng Tài khoản và Pass nên giữ ở hai vị trí đầu vì hai chuỗi này không có dấu hiệu kỹ thuật đủ chắc chắn để phân biệt.'
    : '';
  return `Định dạng: <code id="autoFormatCode">${escapeHtml(fmt)}</code> — dán nhiều dòng để thêm hàng loạt tài khoản cùng lúc. Tất cả sẽ được gán vào thư mục chọn ở trên.<br>Nếu tài khoản thiếu trường nào thì có thể bỏ qua; dùng <code id="autoFormatDelim">${platformDelimiter(platformId)}</code><code>${platformDelimiter(platformId)}</code> khi muốn giữ chính xác một cột trống.${smartHint}${dateHint}`;
}

function renderModalBody(entry){
  const modalBody = document.getElementById('modalBody');
  const showAutoTab = !entry; // only offer bulk/auto import when adding a new account, not when editing
  const autoPlatform = state.activePlatform;
  const isLink = (entry ? entry.platform : autoPlatform) === 'link';
  const autoExampleFormat = platformFormatHint(autoPlatform);
  modalBody.innerHTML = `
    <h2>${entry ? (isLink ? 'Sửa liên kết' : 'Sửa tài khoản') : (isLink ? 'Thêm liên kết' : 'Thêm tài khoản')}</h2>
    ${entry ? `<div class="row" style="margin:-6px 0 16px;"><button type="button" class="text-btn" id="exportEntryBtn" style="flex:1;"><i class="ti ti-download"></i>${isLink ? 'Xuất liên kết này' : 'Xuất tài khoản này'}</button></div>` : ''}
    ${showAutoTab ? `
    <div class="tabs">
      <button type="button" class="tab-btn ${state.modalTab==='manual'?'active':''}" id="tabManual">Thủ công</button>
      <button type="button" class="tab-btn ${state.modalTab==='auto'?'active':''}" id="tabAuto">Tự động</button>
    </div>` : ''}
    <div id="manualPane" style="display:${state.modalTab==='manual'||!showAutoTab?'block':'none'}">
      ${manualFieldsHtml(entry)}
    </div>
    ${showAutoTab ? `
    <div id="autoPane" style="display:${state.modalTab==='auto'?'block':'none'}">
      <label>Nền tảng</label>
      <select id="f_auto_platform">${platformOptionsHtml(autoPlatform)}</select>
      <label>Thư mục</label>
      <select id="f_auto_folderId">${folderOptionsHtml('', autoPlatform)}</select>
      <label>Dán dữ liệu theo định dạng (mỗi dòng 1 ${isLink ? 'liên kết' : 'tài khoản'})</label>
      <textarea id="fAuto" class="mono-area" style="min-height:180px" placeholder="${escapeAttr(autoExampleFormat)}
${escapeAttr(autoExampleFormat)}
${escapeAttr(autoExampleFormat)}"></textarea>
      <p class="hint" id="autoFormatHint">${buildAutoFormatHintHtml(autoPlatform)}</p>
    </div>` : ''}
    <p class="err" id="modalErr"></p>
    <div class="row">
      <button id="cancelBtn" style="flex:1">Huỷ</button>
      <button class="primary" id="saveBtn" data-primary-action style="flex:1">Lưu</button>
    </div>
  `;
  if(showAutoTab){
    document.getElementById('tabManual').onclick = () => { state.modalTab = 'manual'; renderModalBody(entry); };
    document.getElementById('tabAuto').onclick = () => { state.modalTab = 'auto'; renderModalBody(entry); };
  }
  document.getElementById('cancelBtn').onclick = closeModal;
  document.getElementById('saveBtn').onclick = () => saveModal(entry);
  const exportEntryBtn = document.getElementById('exportEntryBtn');
  if(exportEntryBtn) exportEntryBtn.onclick = () => exportSingleEntry(entry);

  const platformSel = document.getElementById('f_platform');
  if(platformSel){
    platformSel.onchange = () => {
      const newPlatform = platformSel.value;
      // preserve whatever the person already typed for fields that still apply under the new platform
      const captured = {};
      document.querySelectorAll('#dynamicFieldsWrap [id^="f_"]').forEach(el => { captured[el.id.slice(2)] = el.value; });
      const wrap = document.getElementById('dynamicFieldsWrap');
      if(wrap) wrap.innerHTML = dynamicFieldsHtml(newPlatform, captured);
      const folderSel = document.getElementById('f_folderId');
      if(folderSel) folderSel.innerHTML = folderOptionsHtml('', newPlatform);
    };
  }
  const autoPlatformSel = document.getElementById('f_auto_platform');
  if(autoPlatformSel){
    autoPlatformSel.onchange = () => {
      const folderSel = document.getElementById('f_auto_folderId');
      folderSel.innerHTML = folderOptionsHtml('', autoPlatformSel.value);
      const fmt = platformFormatHint(autoPlatformSel.value);
      const hintEl = document.getElementById('autoFormatHint');
      if(hintEl) hintEl.innerHTML = buildAutoFormatHintHtml(autoPlatformSel.value);
      const ta = document.getElementById('fAuto');
      if(ta) ta.placeholder = `${fmt}\n${fmt}\n${fmt}`;
    };
  }
}

// finds an existing entry on the same platform with the same primary identifier (fbName),
// excluding the entry currently being edited (if any)
function findDuplicateEntry(platform, fbNameValue, excludeId){
  if(!fbNameValue) return null;
  return state.entries.find(e => e.platform === platform && e.fbName === fbNameValue && e.id !== excludeId) || null;
}

function stageBulkImport(platform, parsedLines, folderId, currentEntries){
  const nextEntries = currentEntries.map(e => ({ ...e }));
  const newOnes = [];
  const dupPairs = [];
  const seen = new Map();
  nextEntries.forEach(e => { if(e.platform === platform && e.fbName) seen.set(e.fbName, e); });
  parsedLines.forEach(fields => {
    const existing = fields.fbName ? seen.get(fields.fbName) : null;
    if(existing){
      dupPairs.push({ fields, existing });
      return;
    }
    const record = {
      id: uid(), createdAt: Date.now(), ...fields,
      folderId, platform, updatedAt: Date.now(),
    };
    newOnes.push(record);
    nextEntries.push(record);
    if(fields.fbName) seen.set(fields.fbName, record);
  });
  return { nextEntries, newOnes, dupPairs };
}

// Scans every entry in the current platform and groups any that share the same
// primary identifier (UID/Email/User...) — lets someone find and clean up
// duplicates left over from past bulk-imports, instead of stumbling into them
// one at a time while editing.
function findAllDuplicateGroups(platformId){
  const byName = {};
  state.entries.filter(e => e.platform === platformId && e.fbName).forEach(e => {
    if(!byName[e.fbName]) byName[e.fbName] = [];
    byName[e.fbName].push(e);
  });
  return Object.entries(byName).filter(([, list]) => list.length > 1).map(([name, list]) => ({ name, list }));
}

function openDuplicateScanModal(){
  const modalBg = document.getElementById('modalBg');
  modalBg.classList.add('show');
  renderDuplicateScanModal();
}

function renderDuplicateScanModal(){
  const modalBody = document.getElementById('modalBody');
  const meta = platformMeta(state.activePlatform);
  const entityName = state.activePlatform === 'link' ? 'liên kết' : 'tài khoản';
  const groups = findAllDuplicateGroups(state.activePlatform);
  modalBody.innerHTML = `
    <h2>Quét trùng lặp — ${escapeHtml(meta.name)}</h2>
    ${groups.length === 0
      ? `<p style="font-size:14px; color:var(--text-2);">Không tìm thấy ${entityName} nào bị trùng định danh trong ${escapeHtml(meta.name)}.</p>`
      : `<p class="hint" style="margin-top:-4px;">Tìm thấy ${groups.length} định danh bị trùng (tổng ${groups.reduce((s,g)=>s+g.list.length,0)} bản ghi). Chọn bản ghi muốn giữ lại — các bản còn lại trong cùng nhóm sẽ bị xoá.</p>
      <div style="display:flex; flex-direction:column; gap:12px; max-height:360px; overflow-y:auto;">
        ${groups.map((g, gi) => `
          <div style="border:0.5px solid var(--border); border-radius:10px; padding:10px 12px;">
            <div style="font-size:13px; color:var(--text-2); margin-bottom:8px;">Trùng "<b style="color:var(--text);">${escapeHtml(g.name)}</b>" (${g.list.length} bản ghi)</div>
            ${g.list.map((e, ei) => `
              <label style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:13px; cursor:pointer;">
                <input type="radio" name="dupgroup-${gi}" value="${e.id}" ${ei===0?'checked':''}>
                <span>${escapeHtml(e.displayName || '(chưa có tên)')} — ${e.updatedAt ? new Date(e.updatedAt).toLocaleString('vi-VN') : 'không rõ thời gian sửa'}</span>
              </label>
            `).join('')}
          </div>
        `).join('')}
      </div>
      <button id="dupScanCleanBtn" class="danger" style="width:100%; margin-top:14px;">Xoá các bản trùng, chỉ giữ bản đã chọn</button>
      `}
    <button id="dupScanCloseBtn" style="width:100%; margin-top:10px;">Đóng</button>
  `;
  document.getElementById('dupScanCloseBtn').onclick = closeModal;
  const cleanBtn = document.getElementById('dupScanCleanBtn');
  if(cleanBtn){
    cleanBtn.onclick = () => {
      const keepIds = new Set();
      groups.forEach((g, gi) => {
        const checked = modalBody.querySelector(`input[name="dupgroup-${gi}"]:checked`);
        keepIds.add(checked ? checked.value : g.list[0].id);
      });
      const idsToDelete = new Set();
      groups.forEach(g => g.list.forEach(e => { if(!keepIds.has(e.id)) idsToDelete.add(e.id); }));
      showConfirm(
        'Xoá các bản trùng?',
        `Sẽ xoá ${idsToDelete.size} bản ghi trùng lặp, chỉ giữ lại 1 bản cho mỗi định danh đã chọn. Hành động này không thể hoàn tác.`,
        async () => {
          const nextEntries = state.entries.filter(e => !idsToDelete.has(e.id));
          if(!await commitCollection('entries', nextEntries, saveEntries)) return;
          recordLog('info', state.activePlatform === 'link' ? 'link' : 'account', `Đã xoá ${idsToDelete.size} bản ghi trùng lặp`, platformMeta(state.activePlatform).name);
          closeModal();
          renderVault();
          toast(`Đã xoá ${idsToDelete.size} ${entityName} trùng lặp`);
        }
      );
    };
  }
}

function showDuplicateChoice(label, platformId, onOverwrite, onSkip){
  const modalBg = document.getElementById('modalBg');
  const modalBody = document.getElementById('modalBody');
  const identifierLabel = primaryIdentifierLabel(platformId);
  const entityName = platformId === 'link' ? 'liên kết' : 'tài khoản';
  modalBody.innerHTML = `
    <h2>${platformId === 'link' ? 'Liên kết' : 'Tài khoản'} đã tồn tại</h2>
    <p style="font-size:14px; color:var(--text-2); line-height:1.6; margin:0 0 8px;">Đã có ${entityName} trùng ${escapeHtml(identifierLabel)} trong hệ thống:</p>
    <div class="duplicate-id-list" style="max-height:none;">
      <div class="duplicate-id-row"><span class="duplicate-id-index">1.</span><span class="duplicate-id-value"><span style="color:var(--text-muted)">${escapeHtml(identifierLabel)}:</span> ${escapeHtml(label)}</span><button type="button" class="text-btn duplicate-copy-btn" id="singleDuplicateCopyBtn" title="Sao chép ${escapeAttr(identifierLabel)}"><i class="ti ti-copy"></i>Sao chép</button></div>
    </div>
    <p style="font-size:13px; color:var(--text-2); line-height:1.55; margin:0 0 16px;">Bạn muốn xử lý ${entityName} này như thế nào?</p>
    <div style="display:flex; flex-direction:column; gap:8px;">
      <button type="button" id="dupOverwriteBtn" class="text-btn danger" style="width:100%; justify-content:center;">Ghi đè bằng bản mới</button>
      <button type="button" id="dupSkipBtn" style="width:100%; justify-content:center;">Giữ ${entityName} cũ, bỏ qua bản mới</button>
    </div>
  `;
  modalBg.classList.add('show');
  document.getElementById('singleDuplicateCopyBtn').onclick = () => copyText(label, `Đã sao chép ${identifierLabel}`, false);
  document.getElementById('dupOverwriteBtn').onclick = onOverwrite;
  document.getElementById('dupSkipBtn').onclick = onSkip;
}

function showBulkDuplicateChoice(dupPairs, platformId, newAccountCount, onChoice){
  const modalBg = document.getElementById('modalBg');
  const modalBody = document.getElementById('modalBody');
  const count = dupPairs.length;
  const identifierLabel = primaryIdentifierLabel(platformId);
  const entityName = platformId === 'link' ? 'liên kết' : 'tài khoản';
  const duplicateIds = dupPairs.map(({ fields, existing }) => String(fields.fbName || fields.email || existing.fbName || existing.email || '(trống)'));
  modalBody.innerHTML = `
    <h2>Phát hiện tài khoản trùng</h2>
    <p style="font-size:14px; color:var(--text-2); line-height:1.6; margin:0 0 6px;">${count} ${entityName} trong danh sách vừa dán đã tồn tại sẵn. Danh sách ${escapeHtml(identifierLabel)} bị trùng:</p>
    <div class="duplicate-id-list">
      ${duplicateIds.map((value, index) => `<div class="duplicate-id-row"><span class="duplicate-id-index">${index + 1}.</span><span class="duplicate-id-value"><span style="color:var(--text-muted)">${escapeHtml(identifierLabel)}:</span> ${escapeHtml(value)}</span><button type="button" class="text-btn duplicate-copy-btn" data-copy-duplicate="${index}" title="Sao chép ${escapeAttr(identifierLabel)}"><i class="ti ti-copy"></i>Sao chép</button></div>`).join('')}
    </div>
    <p style="font-size:13px; color:var(--text-2); line-height:1.55; margin:0 0 8px;">Bạn muốn xử lý các tài khoản trùng này như thế nào?</p>
    <div class="info-note" style="margin-bottom:14px;"><i class="ti ti-info-circle" style="color:var(--tone-blue)"></i> Dù chọn phương án nào, <b>${newAccountCount}</b> ${entityName} mới không trùng vẫn được nhập.</div>
    <div style="display:flex; flex-direction:column; gap:8px;">
      <button type="button" id="bulkOverwriteBtn" class="text-btn danger" style="width:100%; justify-content:center;">Ghi đè ${count} ${entityName} trùng</button>
      <button type="button" id="bulkSkipBtn" style="width:100%; justify-content:center;">Giữ bản cũ, bỏ qua ${count} ${entityName} trùng</button>
    </div>
  `;
  modalBg.classList.add('show');
  modalBody.querySelectorAll('[data-copy-duplicate]').forEach(button => {
    button.onclick = () => copyText(duplicateIds[Number(button.dataset.copyDuplicate)], `Đã sao chép ${identifierLabel}`, false);
  });
  document.getElementById('bulkOverwriteBtn').onclick = () => onChoice(true);
  document.getElementById('bulkSkipBtn').onclick = () => onChoice(false);
}

async function saveModal(entry){
  const err = document.getElementById('modalErr');
  err.style.display = 'none';

  if(state.modalTab === 'manual'){
    const platform = document.getElementById('f_platform').value;
    const isLinkPlatform = platform === 'link';
    const fields = {};
    getPlatformFields(platform).forEach(f => {
      const el = document.getElementById('f_' + f.key);
      if(el) fields[f.key] = el.value.trim();
    });
    fields.folderId = document.getElementById('f_folderId').value;
    fields.platform = platform;
    const displayNameInput = document.getElementById('f_displayName');
    if(displayNameInput) fields.displayName = displayNameInput.value.trim();
    const proxyInput = document.getElementById('f_proxy');
    if(proxyInput) fields.proxy = proxyInput.value.trim();
    const statusInput = document.getElementById('f_status');
    if(statusInput) fields.status = statusInput.value;
    if(platform === 'link'){
      fields.fbName = normalizeHttpLink(fields.fbName);
      if(!fields.fbName){
        err.textContent = 'Nhập link website hợp lệ, ví dụ: https://example.com';
        err.style.display = 'block';
        return;
      }
    }
    if(!fields.fbName && !fields.email){
      err.textContent = platform === 'link' ? 'Nhập link website.' : platform === 'money' ? 'Nhập Name của tài khoản.' : 'Nhập ít nhất UID hoặc Email.';
      err.style.display = 'block';
      return;
    }
    fields.updatedAt = Date.now();

    const commitManual = async () => {
      const wasEditing = !!state.editingId;
      const nextEntries = state.editingId
        ? state.entries.map(e => e.id === state.editingId ? { ...e, ...fields } : e)
        : [...state.entries, { id: uid(), createdAt: Date.now(), ...fields }];
      if(!await commitCollection('entries', nextEntries, saveEntries)) return;
      recordLog('info', isLinkPlatform ? 'link' : 'account', wasEditing ? `Đã cập nhật một ${isLinkPlatform ? 'liên kết' : 'tài khoản'}` : `Đã thêm một ${isLinkPlatform ? 'liên kết' : 'tài khoản'}`, platformMeta(platform).name);
      closeModal();
      renderVault();
      toast('Đã lưu');
    };

    const dup = findDuplicateEntry(platform, fields.fbName, state.editingId);
    if(dup){
      showDuplicateChoice(
        dup.fbName,
        platform,
        async () => {
          // While editing A into B's identifier, replace B and remove A;
          // otherwise both records would remain duplicated.
          const nextEntries = state.entries
            .filter(e => !state.editingId || e.id !== state.editingId || e.id === dup.id)
            .map(e => e.id === dup.id ? { ...e, ...fields } : e);
          if(!await commitCollection('entries', nextEntries, saveEntries)) return;
          recordLog('info', isLinkPlatform ? 'link' : 'account', `Đã ghi đè một ${isLinkPlatform ? 'liên kết' : 'tài khoản'} trùng`, platformMeta(platform).name);
          closeModal(); renderVault(); toast(`Đã ghi đè ${isLinkPlatform ? 'liên kết' : 'tài khoản'}`);
        },
        () => { closeModal(); toast(`Đã giữ ${isLinkPlatform ? 'liên kết' : 'tài khoản'} cũ, bỏ qua bản mới`); }
      );
      return;
    }
    await commitManual();
  } else {
    const folderId = document.getElementById('f_auto_folderId').value;
    const platform = document.getElementById('f_auto_platform').value;
    const isLinkPlatform = platform === 'link';
    const raw = document.getElementById('fAuto').value;
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if(lines.length === 0){
      err.textContent = `Dán nội dung theo định dạng ${platformFormatHint(platform)}`;
      err.style.display = 'block';
      return;
    }
    if(state.editingId){
      const fields = parseAutoLine(lines[0], platform);
      if(!fields.fbName && !fields.email){
        err.textContent = 'Không đọc được trường định danh chính từ dữ liệu dán vào.';
        err.style.display = 'block';
        return;
      }
      fields.folderId = folderId;
      fields.platform = platform;
      fields.updatedAt = Date.now();

      const dup = findDuplicateEntry(platform, fields.fbName, state.editingId);
      if(dup){
        showDuplicateChoice(
          dup.fbName,
          platform,
          async () => {
            const nextEntries = state.entries
              .filter(e => e.id !== state.editingId || e.id === dup.id)
              .map(e => e.id === dup.id ? { ...e, ...fields } : e);
            if(!await commitCollection('entries', nextEntries, saveEntries)) return;
            recordLog('info', isLinkPlatform ? 'link' : 'account', `Đã ghi đè một ${isLinkPlatform ? 'liên kết' : 'tài khoản'} trùng`, platformMeta(platform).name);
            closeModal(); renderVault(); toast(`Đã ghi đè ${isLinkPlatform ? 'liên kết' : 'tài khoản'}`);
          },
          () => { closeModal(); toast(`Đã giữ ${isLinkPlatform ? 'liên kết' : 'tài khoản'} cũ, bỏ qua bản mới`); }
        );
        return;
      }
      const nextEntries = state.entries.map(e => e.id === state.editingId ? { ...e, ...fields } : e);
      if(!await commitCollection('entries', nextEntries, saveEntries)) return;
      recordLog('info', isLinkPlatform ? 'link' : 'account', `Đã cập nhật một ${isLinkPlatform ? 'liên kết' : 'tài khoản'}`, platformMeta(platform).name);
      closeModal();
      renderVault();
      toast('Đã lưu');
    } else {
      const parsedLines = lines.map(line => parseAutoLine(line, platform)).filter(f => f.fbName || f.email);
      const skippedCount = lines.length - parsedLines.length;
      if(parsedLines.length === 0){
        err.textContent = 'Không đọc được dữ liệu hợp lệ. Kiểm tra lại định dạng.';
        err.style.display = 'block';
        return;
      }

      const { nextEntries, newOnes, dupPairs } = stageBulkImport(platform, parsedLines, folderId, state.entries);

      const finishBulk = async (overwrittenCount) => {
        if(!await commitCollection('entries', nextEntries, saveEntries)) return;
        recordLog('info', 'import', `Đã nhập ${newOnes.length} ${isLinkPlatform ? 'liên kết' : 'tài khoản'} mới`, `${platformMeta(platform).name} · ghi đè ${overwrittenCount} · bỏ qua ${dupPairs.length && !overwrittenCount ? dupPairs.length : 0} trùng · ${skippedCount} dòng lỗi`);
        closeModal();
        renderVault();
        const parts = [];
        if(newOnes.length > 0) parts.push(`thêm ${newOnes.length} ${isLinkPlatform ? 'liên kết' : 'tài khoản'} mới`);
        if(overwrittenCount) parts.push(`ghi đè ${overwrittenCount} ${isLinkPlatform ? 'liên kết' : 'tài khoản'} trùng`);
        if(dupPairs.length && !overwrittenCount) parts.push(`bỏ qua ${dupPairs.length} ${isLinkPlatform ? 'liên kết' : 'tài khoản'} trùng`);
        if(skippedCount > 0) parts.push(`bỏ qua ${skippedCount} dòng không hợp lệ`);
        toast(`Đã ${parts.join(', ')}`);
      };

      if(dupPairs.length === 0){
        await finishBulk(0);
        return;
      }

      showBulkDuplicateChoice(dupPairs, platform, newOnes.length, async (overwriteAll) => {
        if(overwriteAll){
          dupPairs.forEach(({ fields, existing }) => {
            fields.folderId = folderId;
            fields.platform = platform;
            fields.updatedAt = Date.now();
            Object.assign(existing, fields);
          });
        }
        await finishBulk(overwriteAll ? dupPairs.length : 0);
      });
    }
  }
}

document.getElementById('modalBg').addEventListener('click', (e) => {
  if(e.target.id === 'modalBg') closeModal();
});

// Enter key confirms the modal's primary action, wherever focus is inside it —
// except inside a <textarea>, where Enter should just insert a new line as usual.
document.getElementById('modalBg').addEventListener('keydown', (e) => {
  if(e.key !== 'Enter') return;
  if(e.target.tagName === 'TEXTAREA') return;
  const primaryBtn = document.querySelector('#modalBody [data-primary-action]');
  if(primaryBtn && !primaryBtn.disabled){
    e.preventDefault();
    primaryBtn.click();
  }
});

