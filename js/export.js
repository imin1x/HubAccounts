// HubAccounts — Plain-text export of accounts.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- EXPORT ----------
function buildEntryLine(e){
  const base = getPlatformFields(e.platform).map(f => {
    if(fieldMeta(f.key).kind === 'date') return toDisplayDate(e[f.key]) || '';
    return e[f.key] || '';
  }).join(platformDelimiter(e.platform));
  const folder = folderName(e.folderId) || '';
  return `${base}|${folder}|${e.displayName || ''}|${e.proxy || ''}`;
}

function getSelectableExportFields(platformId){
  const fields = getPlatformFields(platformId).map(field => ({ key: field.key, label: field.label }));
  if(platformId === 'money') return [...fields, { key: 'folderId', label: 'Thư mục' }];
  return [...fields, { key: 'folderId', label: 'Thư mục' }, { key: 'displayName', label: 'Tên' }, { key: 'proxy', label: 'Proxy' }];
}

function exportFieldValue(entry, key){
  if(key === 'folderId') return folderName(entry.folderId) || '';
  if(fieldMeta(key).kind === 'date') return toDisplayDate(entry[key]) || '';
  return entry[key] || '';
}

function buildSelectedExportLines(entries, selectedFields){
  return entries
    .map(entry => selectedFields.map(field => exportFieldValue(entry, field.key)).join(platformDelimiter(entry.platform)))
    .filter(line => line.split('|').some(value => value.trim()));
}

function exportSelectionFilename(platformId, selectedFields){
  const date = new Date();
  const ds = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}-${String(date.getHours()).padStart(2,'0')}${String(date.getMinutes()).padStart(2,'0')}`;
  const fieldPart = selectedFields.map(field => field.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()).filter(Boolean).join('-').slice(0, 70) || 'du-lieu';
  return `hubaccounts-${platformId}-${fieldPart}-${ds}.txt`;
}

function openExportFieldModal(platformId){
  const list = state.entries.filter(entry => entry.platform === platformId);
  const meta = platformMeta(platformId);
  if(list.length === 0){
    toast(`Chưa có tài khoản ${meta.name} nào để xuất`);
    return;
  }
  const fields = getSelectableExportFields(platformId);
  const modalBg = document.getElementById('modalBg');
  const modalBody = document.getElementById('modalBody');
  modalBg.classList.add('show');
  modalBody.innerHTML = `
    <h2>Chọn dữ liệu xuất — ${escapeHtml(meta.name)}</h2>
    <p class="hint" style="line-height:1.6;margin-top:-5px;">Chọn đúng những trường muốn đưa vào file. Mỗi tài khoản là một dòng và các trường được ngăn bằng dấu <code>${platformDelimiter(platformId)}</code>.</p>
    <div class="row" style="margin-bottom:8px;">
      <button type="button" id="exportSelectAllBtn" style="flex:1;padding:7px 9px;">Chọn tất cả</button>
      <button type="button" id="exportClearFieldsBtn" style="flex:1;padding:7px 9px;">Bỏ chọn</button>
    </div>
    <div class="export-field-grid">
      ${fields.map(field => `<label class="export-field-option"><input type="checkbox" data-export-field="${escapeAttr(field.key)}" checked><span>${escapeHtml(field.label)}</span></label>`).join('')}
    </div>
    <label class="export-field-option" style="margin-bottom:14px;"><input type="checkbox" id="exportIncludeHeader"><span>Kèm tiêu đề và dòng định dạng</span></label>
    <p class="err" id="exportFieldErr"></p>
    <p class="hint" style="color:var(--danger-text);line-height:1.55;">File xuất là chữ rõ, không mã hoá. Chỉ lưu ở nơi an toàn và không chia sẻ cho người khác.</p>
    <div class="row">
      <button type="button" id="exportFieldsBackBtn" style="flex:1;">Quay lại</button>
      <button type="button" class="primary" id="exportSelectedFieldsBtn" style="flex:1;"><i class="ti ti-download"></i>Xuất file</button>
    </div>`;

  const checkboxes = () => [...modalBody.querySelectorAll('[data-export-field]')];
  document.getElementById('exportSelectAllBtn').onclick = () => checkboxes().forEach(input => { input.checked = true; });
  document.getElementById('exportClearFieldsBtn').onclick = () => checkboxes().forEach(input => { input.checked = false; });
  document.getElementById('exportFieldsBackBtn').onclick = renderImportExportModal;
  document.getElementById('exportSelectedFieldsBtn').onclick = () => {
    const selectedKeys = checkboxes().filter(input => input.checked).map(input => input.dataset.exportField);
    const selectedFields = fields.filter(field => selectedKeys.includes(field.key));
    const err = document.getElementById('exportFieldErr');
    if(!selectedFields.length){
      err.textContent = 'Hãy chọn ít nhất một trường để xuất.';
      err.style.display = 'block';
      return;
    }
    const dataLines = buildSelectedExportLines(list, selectedFields);
    if(!dataLines.length){
      err.textContent = 'Các trường đã chọn không có dữ liệu để xuất.';
      err.style.display = 'block';
      return;
    }
    const includeHeader = document.getElementById('exportIncludeHeader').checked;
    const content = includeHeader
      ? [`# HubAccounts - ${meta.name}`, `# Xuất lúc: ${new Date().toLocaleString('vi-VN')}`, `# Định dạng: ${selectedFields.map(field => field.label).join(platformDelimiter(platformId))}`, '', ...dataLines].join('\n')
      : dataLines.join('\n');
    downloadTextFile(content, exportSelectionFilename(platformId, selectedFields));
    closeModal();
    toast(platformId === 'link' ? `Đã xuất ${dataLines.length} liên kết` : `Đã xuất ${dataLines.length} tài khoản ${meta.name}`);
  };
}

function buildExportContent(){
  const lines = [
    `# HubAccounts - Sao lưu dữ liệu`,
    `# Xuất lúc: ${new Date().toLocaleString('vi-VN')}`,
    `# Mỗi nền tảng có định dạng cột riêng, xem dòng "Định dạng:" ngay trên từng nhóm bên dưới.`,
    ``
  ];
  PLATFORMS.forEach(p => {
    const list = state.entries.filter(e => e.platform === p.id);
    if(list.length === 0) return;
    const fmt = backupPlatformFormatHint(p.id) + '|Thư mục|Tên|Proxy';
    lines.push(`## ${p.name} (${list.length}) — Định dạng: ${fmt}`);
    list.forEach(e => lines.push(buildEntryLine(e)));
    lines.push('');
  });
  return lines.join('\n');
}

function exportAccounts(){
  if(state.entries.length === 0){
    toast('Chưa có dữ liệu nào để xuất');
    return;
  }
  showConfirm(
    'Xuất tài khoản?',
    `File xuất ra sẽ chứa toàn bộ ${state.entries.length} bản ghi (tài khoản, liên kết và các trường liên quan) ở dạng chữ rõ, không mã hoá. Hãy lưu file này ở nơi an toàn và không chia sẻ cho người khác.`,
    () => {
      const content = buildExportContent();
      const date = new Date();
      const ds = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}-${String(date.getHours()).padStart(2,'0')}${String(date.getMinutes()).padStart(2,'0')}`;
      downloadTextFile(content, `hubaccounts-accounts-${ds}.txt`);
      closeModal();
      toast('Đã xuất file tài khoản');
    },
    'Xuất file',
    false
  );
}

function exportPlatformAccounts(platformId){
  openExportFieldModal(platformId);
}

function openImportExportModal(){
  const modalBg = document.getElementById('modalBg');
  modalBg.classList.add('show');
  renderImportExportModal();
}

function renderImportExportModal(){
  const modalBody = document.getElementById('modalBody');
  const exportablePlatforms = PLATFORMS.filter(p => !['home', 'note', 'log', 'other'].includes(p.id));
  modalBody.innerHTML = `
    <h2>Nhập / Xuất</h2>
    <button type="button" id="ieAddBtn" class="primary" style="width:100%; margin-bottom:12px; justify-content:center;"><i class="ti ti-plus" style="vertical-align:-2px;font-size:15px;margin-right:4px"></i>${state.activePlatform === 'link' ? 'Thêm link mới' : 'Nhập tài khoản mới'}</button>
    ${(state.activePlatform !== 'note' && state.activePlatform !== 'other' && state.activePlatform !== 'phone') ? `<button type="button" id="ieDupScanBtn" style="width:100%; margin-bottom:18px;"><i class="ti ti-copy-check" style="vertical-align:-2px;font-size:15px;margin-right:4px"></i>${state.activePlatform === 'link' ? 'Quét liên kết trùng lặp' : `Quét tài khoản trùng lặp (${platformMeta(state.activePlatform).name})`}</button>` : ''}
    <label>Chọn nền tảng và các trường cần xuất</label>
    <p class="hint" style="margin:0 0 10px;color:var(--tone-yellow);"><i class="ti ti-alert-triangle" style="vertical-align:-2px;font-size:14px"></i> File .txt xuất ra <b>không mã hoá</b> — chứa mật khẩu, 2FA, cookie ở dạng đọc được. Chỉ lưu ở nơi an toàn và xoá sau khi dùng. Để sao lưu, hãy dùng "Sao lưu / Đồng bộ" (file .json mã hoá).</p>
    <div class="export-platform-list">
      ${exportablePlatforms.map(p => {
        const c = state.entries.filter(e => e.platform === p.id).length;
        return `<button type="button" class="folder-chip" data-export-platform="${p.id}"><span>${escapeHtml(p.name)}</span><span>${c}</span></button>`;
      }).join('')}
    </div>
    <button type="button" id="ieExportAllBtn" style="width:100%; margin-top:12px;">Xuất toàn bộ dữ liệu (${state.entries.length})</button>
    <button id="ieCloseBtn" style="width:100%; margin-top:10px;">Đóng</button>
  `;
  document.getElementById('ieCloseBtn').onclick = closeModal;
  document.getElementById('ieAddBtn').onclick = () => {
    closeModal();
    // Phone only has 2 meaningful fields (SĐT + Ngày hết hạn), so jump straight
    // to the bulk-paste "Tự động" tab instead of the manual form — that's the
    // fastest way to add phone numbers in bulk.
    state.modalTab = state.activePlatform === 'phone' ? 'auto' : 'manual';
    openModal(null);
  };
  document.getElementById('ieExportAllBtn').onclick = exportAccounts;
  const dupScanBtn = document.getElementById('ieDupScanBtn');
  if(dupScanBtn) dupScanBtn.onclick = openDuplicateScanModal;
  modalBody.querySelectorAll('[data-export-platform]').forEach(btn => {
    btn.onclick = () => exportPlatformAccounts(btn.dataset.exportPlatform);
  });
}

