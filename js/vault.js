// HubAccounts — Account list rendering and multi-select delete.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- RENDER: VAULT ----------
// Older Facebook records contain only the proxy IP selected by the datalist.
// Keep those links readable; use the port when the account supplies one.
function proxyUsageEndpoint(value){
  let raw = String(value || '').trim().replace(/^(?:https?|socks[45]?):\/\//i, '');
  if(raw.includes('@')) raw = raw.slice(raw.lastIndexOf('@') + 1);
  raw = raw.replace(/\/$/, '');
  const bracketed = raw.match(/^\[([^\]]+)\](?::(\d+))?(?::.*)?$/);
  if(bracketed) return { host: bracketed[1].toLowerCase(), port: bracketed[2] ? String(Number(bracketed[2])) : '' };
  // Unbracketed IPv6 is an address, not a host:port pair.
  if((raw.match(/:/g) || []).length > 1 && /^[0-9a-f:]+$/i.test(raw)) return { host: raw.toLowerCase(), port: '' };
  const parts = raw.split(':');
  return { host: parts[0].trim().toLowerCase(), port: /^\d+$/.test(parts[1] || '') ? String(Number(parts[1])) : '' };
}

function facebookProxyUsage(entries){
  const byHost = new Map();
  for(const entry of entries){
    if(entry.platform !== 'facebook' || !entry.proxy) continue;
    const endpoint = proxyUsageEndpoint(entry.proxy);
    if(!endpoint.host) continue;
    if(!byHost.has(endpoint.host)) byHost.set(endpoint.host, { withoutPort: 0, ports: new Map() });
    const usage = byHost.get(endpoint.host);
    if(endpoint.port) usage.ports.set(endpoint.port, (usage.ports.get(endpoint.port) || 0) + 1);
    else usage.withoutPort += 1;
  }
  return byHost;
}

function proxyFacebookUsageHtml(entry, usageByHost){
  const endpoint = proxyUsageEndpoint(entry.fbName);
  const port = String(entry.port || endpoint.port || '').trim();
  const usage = usageByHost.get(endpoint.host);
  const withoutPort = usage ? usage.withoutPort : 0;
  const withPort = usage ? (port ? (usage.ports.get(String(Number(port))) || 0) : [...usage.ports.values()].reduce((sum, count) => sum + count, 0)) : 0;
  const count = withoutPort + withPort;
  const english = state.lang === 'en';
  const title = english
    ? 'Facebook accounts assigned to this proxy across the entire vault, regardless of account status.'
    : 'Số tài khoản Facebook được gán proxy này trong toàn bộ kho, không phụ thuộc trạng thái tài khoản.';
  const legacyNote = withoutPort
    ? (english ? `${withoutPort} matched by IP only (no port saved)` : `${withoutPort} tài khoản khớp theo IP, chưa lưu port`)
    : '';
  return `<span class="status-badge" style="color:${count ? 'var(--accent-text)' : 'var(--text-muted)'};background:${count ? 'rgba(59,130,246,.12)' : 'rgba(128,128,128,.1)'};" title="${escapeAttr(title)}">Facebook: ${count} ${english ? 'accounts' : 'tài khoản'}</span>${legacyNote ? `<span class="entry-created" title="${english ? 'IP-only assignments also count for other proxies with the same IP.' : 'Tài khoản chỉ lưu IP cũng được tính ở các proxy khác có cùng IP.'}">${legacyNote}</span>` : ''}`;
}

function renderVault(){
  if(state.activePlatform === 'home'){
    renderHomeVault();
    return;
  }
  if(state.activePlatform === 'log'){
    renderLogVault();
    return;
  }
  if(state.activePlatform === 'note'){
    renderNotesVault();
    return;
  }
  if(state.activePlatform === 'other'){
    renderToolsVault();
    return;
  }
  const app = document.getElementById('app');
  const platformEntries = state.entries.filter(e => e.platform === state.activePlatform);
  const filtered = platformEntries.filter(e => {
    if(state.activeFolder === NO_FOLDER_ID && e.folderId) return false;
    if(state.activeFolder !== 'all' && state.activeFolder !== NO_FOLDER_ID && e.folderId !== state.activeFolder) return false;
    if(state.hiddenStatuses.has(e.status || 'unknown')) return false;
    const q = state.search.toLowerCase();
    if(!q) return true;
    return (e.fbName||'').toLowerCase().includes(q) || (e.email||'').toLowerCase().includes(q) || (e.bankAccount||'').toLowerCase().includes(q) || (e.phone||'').toLowerCase().includes(q) || (e.displayName||'').toLowerCase().includes(q) || (e.other||'').toLowerCase().includes(q);
  });

  app.innerHTML = `
    <div class="code-comment" style="font-size:12px; margin-bottom:8px;">${state.activePlatform === 'link' ? 'Kho liên kết' : t('comment_input_data')}</div>
    <div class="topbar-actions">
      <button class="text-btn" id="lockBtn" title="${t('title_lock')}"><i class="ti ti-lock"></i>${t('btn_lock')}</button>
      <button class="text-btn ${state.selectMode ? 'primary' : ''}" id="selectModeBtn" title="${state.activePlatform === 'link' ? 'Chọn nhiều liên kết để xoá cùng lúc' : t('title_select_many')}"><i class="ti ti-checkbox"></i>${state.selectMode ? t('btn_select_done') : t('btn_select_many')}</button>
      <button class="text-btn" id="fileBackupBtn" title="${t('title_file_backup')}"><i class="ti ti-device-floppy"></i>${state.fileHandle ? t('btn_file_linked') : t('btn_file_backup')}</button>
      <button class="text-btn" id="toolsBtn" title="${t('title_tools')}"><i class="ti ti-tool"></i>${t('btn_tools')}</button>
      <button class="${state.activePlatform === 'link' ? 'text-btn' : 'primary'}" id="importExportBtn"><i class="ti ti-arrows-exchange" style="vertical-align:-2px;font-size:15px"></i> ${t('btn_import_export')}</button>
      ${state.activePlatform === 'link' ? '<button class="primary" id="addLinkBtn"><i class="ti ti-link-plus" style="vertical-align:-2px;font-size:15px"></i> Thêm link</button>' : ''}
    </div>
    <div class="folder-panel" id="folderBar"></div>
    ${STATUS_FILTER_PLATFORMS.includes(state.activePlatform) ? `
    <div class="code-comment" style="font-size:12px; margin:14px 0 8px;">${t('comment_status')}</div>
    <div class="status-filter-bar" id="statusFilterBar"></div>` : ''}
    ${state.selectMode ? `
    <div class="select-bar" id="selectBar">
      <span id="selectCountText">${t('select_selected')} 0</span>
      <div class="select-bar-actions">
        <button class="text-btn" id="selectAllBtn">${t('select_all')}</button>
        <button class="text-btn" id="clearSelectBtn">${t('select_clear')}</button>
        <button class="text-btn danger" id="deleteSelectedBtn" disabled>${t('select_delete')}</button>
      </div>
    </div>` : ''}
    <div class="code-comment" style="font-size:12px; margin:14px 0 8px;">${state.activePlatform === 'link' ? 'Danh sách liên kết' : t('comment_account_list')}</div>
    <div id="list"></div>
  `;

  renderPlatformBar();
  updateIdeChrome();

  document.getElementById('importExportBtn').onclick = openImportExportModal;
  const addLinkBtn = document.getElementById('addLinkBtn');
  if(addLinkBtn) addLinkBtn.onclick = () => { state.modalTab = 'manual'; openModal(null); };
  document.getElementById('fileBackupBtn').onclick = openFileBackupModal;
  document.getElementById('toolsBtn').onclick = openToolsModal;
  syncGlobalSearchBar(state.activePlatform === 'link' ? 'links' : 'accounts');
  document.getElementById('lockBtn').onclick = lockVault;
  document.getElementById('selectModeBtn').onclick = () => {
    state.selectMode = !state.selectMode;
    if(!state.selectMode) state.selectedIds = new Set();
    renderVault();
  };

  if(state.selectMode){
    document.getElementById('selectAllBtn').onclick = () => { selectAllVisibleEntries(); };
    document.getElementById('clearSelectBtn').onclick = () => { clearEntrySelection(); };
    document.getElementById('deleteSelectedBtn').onclick = () => { confirmDeleteSelected(); };
  }

  renderFolderBar();
  renderStatusFilterBar();

  const list = document.getElementById('list');
  if(filtered.length === 0){
    state.visibleEntries = [];
    list.innerHTML = `<div class="empty"><span class="platform-icon" style="width:40px;height:40px;margin:0 auto 8px;--pcolor:${platformMeta(state.activePlatform).color};">${platformSvg(state.activePlatform)}</span>${platformEntries.length===0 ? (state.activePlatform === 'link' ? 'Chưa có liên kết nào. Nhấn “Thêm link” để lưu website đầu tiên.' : `Chưa có tài khoản ${platformMeta(state.activePlatform).name} nào. Nhấn "Thêm" để lưu tài khoản đầu tiên.`) : 'Không tìm thấy kết quả phù hợp.'}</div>`;
    return;
  }

  const proxyUsage = state.activePlatform === 'proxy' ? facebookProxyUsage(state.entries) : null;
  list.innerHTML = filtered.map(e => {
    if(e.platform === 'link'){
      const href = normalizeHttpLink(e.fbName);
      let hostname = 'Website';
      try{ hostname = new URL(href).hostname.replace(/^www\./i, '') || hostname; }catch(_error){}
      return `
      <div class="entry link-entry" data-id="${e.id}">
        <div class="entry-top">
          <div class="entry-info">
            <p class="entry-name"><span class="platform-icon" style="width:20px;height:20px;--pcolor:${platformMeta('link').color};">${platformSvg('link')}</span><span class="link-entry-title">${escapeHtml(hostname)}</span></p>
            ${e.other ? `<p class="link-entry-description">${escapeHtml(e.other)}</p>` : ''}
            <a class="link-entry-url" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" title="Mở liên kết trong tab mới"><i class="ti ti-external-link"></i><span>${escapeHtml(e.fbName)}</span></a>
            <div class="entry-meta-row">
              ${folderName(e.folderId) ? `<span class="entry-folder"><i class="ti ti-folder" style="font-size:11px;vertical-align:-1px"></i> ${escapeHtml(folderName(e.folderId))}</span>` : ''}
              ${isNewEntry(e) ? `<span class="new-badge" title="Liên kết mới thêm — tự ẩn sau 24 giờ"><i class="ti ti-sparkles" style="font-size:10px;"></i> MỚI</span>` : ''}
              <span class="entry-created" title="Ngày lưu liên kết"><i class="ti ti-calendar-plus" style="font-size:11px;vertical-align:-1px"></i> ${formatDateDMY(new Date(e.createdAt || Date.now()))}</span>
            </div>
          </div>
          <div class="entry-actions">
            ${state.selectMode
              ? `<input type="checkbox" class="entry-checkbox" data-select-id="${e.id}" ${state.selectedIds.has(e.id) ? 'checked' : ''}>`
              : `<button class="text-btn" data-act="open-link" title="Mở website"><i class="ti ti-external-link"></i>Mở</button><button class="text-btn" data-act="edit" title="${t('btn_edit')}"><i class="ti ti-edit"></i>${t('btn_edit')}</button><button class="text-btn danger" data-act="delete" title="${t('btn_delete')}"><i class="ti ti-trash"></i>${t('btn_delete')}</button>`}
          </div>
        </div>
      </div>`;
    }
    const isPhoneOrProxy = e.platform === 'phone' || e.platform === 'proxy';
    const isMoney = e.platform === 'money';
    const isChecking = state.checkingIds.has(e.id);
    const displayedStatus = isChecking ? 'checking' : (e.status || 'unknown');
    const display = isPhoneOrProxy || isMoney ? null : buildEntryDisplayRows(e);
    const moneyFields = isMoney ? getPlatformFields('money').filter(f => f.key !== 'fbName' && !!e[f.key]) : [];
    const extraFields = isPhoneOrProxy || isMoney ? [] : getPlatformFields(e.platform).filter(f => {
      if(f.key === 'fbName' || display.used.has(f.key)) return false;
      return !!e[f.key];
    });
    return `
    <div class="entry ${state.expandedIds.has(e.id) ? 'expanded' : ''}" data-id="${e.id}">
      <div class="entry-top" data-act="toggle-expand">
        <div class="entry-info">
          <p class="entry-name"><i class="ti ti-chevron-right chevron"></i><span class="platform-icon" style="width:20px;height:20px;--pcolor:${platformMeta(e.platform).color};">${platformSvg(e.platform)}</span><span class="copy-inline" data-copy-field="fbName" title="Bấm để sao chép ${primaryIdentifierLabel(e.platform)}">${escapeHtml(e.fbName || '(Chưa đặt tên)')}</span>${isMoney ? '<span class="money-private-hint" title="Thông tin còn lại đang được ẩn"><i class="ti ti-lock" style="font-size:11px;letter-spacing:0"></i>•••</span>' : ''}${e.displayName && !isMoney ? ` <span style="color:var(--text-muted);">|</span> <span class="copy-inline" data-copy-field="displayName" style="color:${e.platform === 'facebook' && e.status === 'active' ? 'var(--tone-green)' : e.platform === 'facebook' && e.status === 'inactive' ? 'var(--tone-red)' : 'var(--text-muted)'};font-weight:${e.platform === 'facebook' && (e.status === 'active' || e.status === 'inactive') ? 600 : 400};" title="Bấm để sao chép tên">${escapeHtml(e.displayName)}</span>` : ''}</p>
          ${e.platform === 'phone'
            ? (e.expiryDate ? `<p class="entry-id"><i class="ti ti-calendar-due" style="font-size:13px;vertical-align:-1px"></i> Ngày hết hạn: <span class="copy-inline" data-copy-field="expiryDate" title="Bấm để sao chép">${escapeHtml(toDisplayDate(e.expiryDate))}</span></p>` : '')
            : e.platform === 'proxy'
            ? `<p class="entry-id"><i class="ti ti-plug" style="font-size:13px;vertical-align:-1px"></i> Port: <span class="copy-inline" data-copy-field="port" title="Bấm để sao chép port">${escapeHtml(e.port || '—')}</span>${e.username ? ` <span style="color:var(--text-muted);">| User:</span> <span class="copy-inline" data-copy-field="username" title="Bấm để sao chép user">${escapeHtml(e.username)}</span>` : ''}${e.password ? ` <span style="color:var(--text-muted);">| Pass:</span> <span class="copy-inline" data-copy-field="password" style="font-family:var(--mono); letter-spacing:2px;" title="Bấm để sao chép mật khẩu">••••••••</span>` : ''}</p>`
            : ''}
          <div class="entry-meta-row">
            ${folderName(e.folderId) ? `<span class="entry-folder"><i class="ti ti-folder" style="font-size:11px;vertical-align:-1px"></i> ${escapeHtml(folderName(e.folderId))}</span>` : ''}
            ${isPhoneOrProxy ? phoneExpiryBadgeHtml(e) : isMoney ? '' : `<span class="status-badge" style="color:${statusMeta(displayedStatus).color};background:${statusMeta(displayedStatus).bg};" title="Trạng thái: ${statusMeta(displayedStatus).label}${e.lastCheckedAt ? ` · Kiểm tra lúc ${new Date(e.lastCheckedAt).toLocaleString('vi-VN')}` : ''}">${statusMeta(displayedStatus).symbol} ${statusMeta(displayedStatus).label}</span>`}
            ${e.platform === 'proxy' ? proxyFacebookUsageHtml(e, proxyUsage) : ''}
            ${e.platform === 'proxy' && e.proxyLatency != null ? `<span class="proxy-latency-badge ${e.proxyLatency < 350 ? 'proxy-latency-good' : e.proxyLatency < 1200 ? 'proxy-latency-slow' : 'proxy-latency-bad'}" title="Độ trễ phản hồi"><i class="ti ti-bolt"></i> ${e.proxyLatency}ms</span>` : ''}
            ${isNewEntry(e) ? `<span class="new-badge" title="Tài khoản mới thêm — tự ẩn sau 24 giờ"><i class="ti ti-sparkles" style="font-size:10px;"></i> MỚI</span>` : ''}
            ${e.platform !== 'phone' ? `<span class="entry-created" title="Ngày nhập tài khoản"><i class="ti ti-calendar-plus" style="font-size:11px;vertical-align:-1px"></i> ${formatDateDMY(new Date(e.createdAt || Date.now()))}</span>` : ''}
          </div>
        </div>
        <div class="entry-actions">
          ${state.selectMode
            ? `<input type="checkbox" class="entry-checkbox" data-select-id="${e.id}" ${state.selectedIds.has(e.id) ? 'checked' : ''}>`
            : `${['facebook', 'gmail', 'hotmail'].includes(e.platform) && (e.fbName || e.email) ? `<button class="text-btn" data-act="check" title="Kiểm tra trạng thái tài khoản" ${isChecking ? 'disabled' : ''}><i class="ti ti-refresh"></i>${isChecking ? t('status_checking') : 'Kiểm tra'}</button>` : ''}
          ${e.platform === 'proxy' && (e.fbName || e.host) ? `<button class="text-btn" data-act="check-proxy" title="Kiểm tra Ping kết nối" ${isChecking ? 'disabled' : ''}><i class="ti ti-activity"></i>${isChecking ? 'Đang ping…' : 'Ping'}</button>` : ''}
          ${e.platform === 'ai' ? `<button class="text-btn" data-act="check-ai" title="Kiểm tra API Key / Quota" ${isChecking ? 'disabled' : ''}><i class="ti ti-key"></i>${isChecking ? 'Đang check…' : 'Check Key'}</button>` : ''}
          <button class="text-btn" data-act="edit" title="${t('btn_edit')}"><i class="ti ti-edit"></i>${t('btn_edit')}</button>
          <button class="text-btn danger" data-act="delete" title="${t('btn_delete')}"><i class="ti ti-trash"></i>${t('btn_delete')}</button>`}
        </div>
      </div>
      <div class="entry-details">
        ${isPhoneOrProxy ? '' : isMoney ? `<div class="money-private-fields">
          ${moneyFields.map(f => `<div class="pw-row">
            <i class="ti ${fieldMeta(f.key).icon}" style="color:var(--text-muted);font-size:15px"></i>
            <span class="pw-tag">${f.label}:</span>
            <span class="pw-val" data-pwmask="1" data-field="${f.key}">••••••••</span>
            <button class="text-btn" data-act="toggle-pw" data-field="${f.key}" title="Hiện/ẩn ${f.label}"><i class="ti ti-eye"></i>Hiện</button>
            <button class="text-btn" data-act="copy" data-field="${f.key}" title="Sao chép ${f.label}"><i class="ti ti-copy"></i>Sao chép</button>
          </div>`).join('')}
        </div>` : display.rows.map(row => `
        <div class="entry-fieldrow">${row.map((f, i) => {
          const sep = i > 0 ? `<span class="field-sep">|</span>` : '';
          if(f.isTotp){
            return `${sep}<span class="field-chip totp" id="totp-${e.id}" title="Mã 2FA hiện tại — bấm để sao chép"><span class="field-label">2FA:</span><span class="field-val" data-totp-val id="totp-val-${e.id}">------</span></span>`;
          }
          const shownVal = f.secret ? '••••••••' : escapeHtml(String(f.value));
          return `${sep}<span class="field-chip ${f.secret?'secret':''}" data-copy-field="${f.field}" title="Bấm để sao chép ${f.label}"><span class="field-label">${f.label}:</span><span class="field-val">${shownVal}</span></span>`;
        }).join('')}</div>`).join('')}
        ${extraFields.length > 0 ? `
        <div class="entry-extra-toggle" data-act="toggle-extra"><i class="ti ti-chevron-right"></i>Xem thêm (${extraFields.length})</div>
        <div class="entry-extra">
          ${extraFields.map(f => `
          <div class="pw-row">
            <i class="ti ${fieldMeta(f.key).icon}" style="color:var(--text-muted);font-size:15px"></i>
            <span class="pw-tag">${f.label}:</span>
            <span class="pw-val" data-pwmask="1" data-field="${f.key}">••••••••</span>
            <button class="text-btn" data-act="toggle-pw" data-field="${f.key}" title="Hiện/ẩn"><i class="ti ti-eye"></i>Hiện</button>
            <button class="text-btn" data-act="copy" data-field="${f.key}" title="Sao chép"><i class="ti ti-copy"></i>Sao chép</button>
          </div>`).join('')}
        </div>` : ''}
      </div>
    </div>
  `;
  }).join('');

  list.querySelectorAll('.entry').forEach(card => {
    const id = card.dataset.id;
    const entry = state.entries.find(x => x.id === id);
    const expandTarget = card.querySelector('[data-act=toggle-expand]');
    if(expandTarget) expandTarget.onclick = (ev) => {
      if(ev.target.closest('[data-act=edit]') || ev.target.closest('[data-act=delete]') || ev.target.closest('[data-act=check]') || ev.target.closest('[data-act=check-proxy]') || ev.target.closest('[data-act=check-ai]') || ev.target.closest('.entry-checkbox')) return;
      // toggle just this one card's class instead of rebuilding the whole list —
      // expand/collapse is the single most frequent interaction on a long list,
      // so re-rendering everything on each click was the main source of lag.
      if(state.expandedIds.has(id)) state.expandedIds.delete(id);
      else state.expandedIds.add(id);
      card.classList.toggle('expanded');
    };
    const editBtn = card.querySelector('[data-act=edit]');
    if(editBtn) editBtn.onclick = () => openModal(entry);
    const deleteBtn = card.querySelector('[data-act=delete]');
    if(deleteBtn) deleteBtn.onclick = () => confirmDeleteEntry(id, entry.fbName || entry.email || '(chưa đặt tên)');
    const openLinkBtn = card.querySelector('[data-act=open-link]');
    if(openLinkBtn) openLinkBtn.onclick = () => {
      const href = normalizeHttpLink(entry.fbName);
      if(href) window.open(href, '_blank', 'noopener,noreferrer');
    };
    const checkBtn = card.querySelector('[data-act=check]');
    if(checkBtn) checkBtn.onclick = () => checkAccountStatus(entry);
    const checkProxyBtn = card.querySelector('[data-act=check-proxy]');
    if(checkProxyBtn) checkProxyBtn.onclick = () => checkProxyOnline(entry);
    const checkAiBtn = card.querySelector('[data-act=check-ai]');
    if(checkAiBtn) checkAiBtn.onclick = () => checkAiOnline(entry);
    const selectCb = card.querySelector('.entry-checkbox');
    if(selectCb){
      selectCb.onclick = (ev) => ev.stopPropagation();
      selectCb.onchange = () => {
        if(selectCb.checked) state.selectedIds.add(id);
        else state.selectedIds.delete(id);
        updateSelectionBar();
      };
    }

    card.querySelectorAll('[data-act=copy]').forEach(btn => {
      btn.onclick = () => {
        const field = btn.dataset.field;
        const meta = getPlatformFields(entry.platform).find(f => f.key === field);
        copyText(entry[field], `Đã sao chép ${meta ? meta.label.toLowerCase() : 'nội dung'}`, true);
      };
    });

    card.querySelectorAll('[data-act=toggle-pw]').forEach(btn => {
      const field = btn.dataset.field;
      const span = card.querySelector(`[data-pwmask][data-field="${field}"]`);
      let shown = false;
      btn.onclick = () => {
        shown = !shown;
        span.textContent = shown ? (entry[field] || '') : '••••••••';
        btn.querySelector('i').className = shown ? 'ti ti-eye-off' : 'ti ti-eye';
        btn.lastChild.textContent = shown ? 'Ẩn' : 'Hiện';
      };
    });

    if(entry.twoFA){
      const totpSpan = card.querySelector(`#totp-${id}`);
      if(totpSpan){
        totpSpan.onclick = (ev) => {
          ev.stopPropagation();
          copyText(totpCodeCache[id], 'Đã sao chép mã 2FA', true);
        };
      }
    }

    card.querySelectorAll('[data-copy-field]').forEach(span => {
      span.onclick = (ev) => {
        ev.stopPropagation();
        const field = span.dataset.copyField;
        const labels = {
          fbName: primaryIdentifierLabel(entry.platform).toLowerCase(), displayName: 'tên', email: 'email', proxy: 'proxy', expiryDate: 'ngày hết hạn',
          port: 'port', username: 'user', password: 'mật khẩu', emailPassword: 'mật khẩu email',
          secondaryEmail: 'email phụ', secondaryEmailPassword: 'mật khẩu email phụ', phone: 'số điện thoại', bankAccount: 'số tài khoản',
        };
        const sensitiveFields = new Set(['password', 'emailPassword', 'secondaryEmailPassword']);
        const value = field === 'expiryDate' ? toDisplayDate(entry[field]) : entry[field];
        copyText(value, `Đã sao chép ${labels[field] || 'nội dung'}`, sensitiveFields.has(field));
      };
    });

    const extraToggle = card.querySelector('[data-act=toggle-extra]');
    if(extraToggle){
      extraToggle.onclick = (ev) => {
        ev.stopPropagation();
        const extraBox = card.querySelector('.entry-extra');
        const nowOpen = extraToggle.classList.toggle('open');
        if(extraBox) extraBox.classList.toggle('open', nowOpen);
      };
    }
  });

  state.visibleEntries = filtered;
  refreshTotpCodes();
}

function renderPlatformBar(){
  const bar = document.getElementById('platformBar');
  const platformLinkHtml = p => {
    const isTools = p.id === 'other';
    const c = homePlatformCount(p.id);
    const label = isTools ? t('platform_tools') : escapeHtml(p.name);
    // Real <a href> (not a <button>) so Ctrl/Cmd-click, middle-click, and
    // "open in new tab" all work exactly like a normal browser link — the
    // browser handles that natively, we only intercept a plain left-click.
    return `<a href="#platform=${p.id}" class="platform-chip ${state.activePlatform===p.id?'active':''}" data-platform="${p.id}" style="--pcolor:${p.color};"><span class="platform-icon">${platformSvg(p.id)}</span>${label}${c === null ? '' : `<span class="platform-chip-count">${c}</span>`}</a>`;
  };
  const homePlatform = PLATFORMS.find(platform => platform.id === 'home');
  const remainingPlatforms = PLATFORMS.filter(platform => platform.id !== 'home');
  bar.innerHTML = `${sidebarBrandHtml()}<div class="ide-sidebar-label code-comment">Tổng quan</div>${platformLinkHtml(homePlatform)}<div class="ide-sidebar-label code-comment" style="padding-top:14px;border-top:1px solid var(--border);margin-top:8px;">${t('sidebar_platforms')}</div>${remainingPlatforms.map(platformLinkHtml).join('')}`;
  bar.querySelectorAll('[data-platform]').forEach(link => {
    link.onclick = (ev) => {
      // Ctrl/Cmd/middle-click/shift-click: let the browser open it in a new
      // tab/window on its own — don't intercept, don't switch the tab here.
      if(ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1) return;
      ev.preventDefault();
      bar.classList.remove('open'); // close the mobile sidebar drawer after picking a tab
      navigateToPlatform(link.dataset.platform);
    };
  });
}

function renderStatusFilterBar(){
  const wrap = document.getElementById('statusFilterBar');
  if(!wrap) return;
  const platformEntries = state.entries.filter(e => e.platform === state.activePlatform);
  const counts = { active: 0, inactive: 0, unknown: 0 };
  platformEntries.forEach(e => { counts[e.status || 'unknown'] = (counts[e.status || 'unknown'] || 0) + 1; });

  const statusKeys = ['active', 'inactive', 'unknown'];
  wrap.innerHTML = statusKeys.map(key => {
    const meta = statusMeta(key);
    const hidden = state.hiddenStatuses.has(key);
    return `<button type="button" class="status-filter-chip ${hidden ? 'hidden-state' : ''}" data-status-key="${key}" style="--sc:${meta.color};" title="${hidden ? t('status_filter_hidden') : t('status_filter_shown')}">
      <i class="ti ${hidden ? 'ti-eye-off' : 'ti-eye'}"></i>
      <span>${meta.symbol} ${meta.label}</span>
      <span class="status-filter-count">${counts[key] || 0}</span>
    </button>`;
  }).join('');

  wrap.querySelectorAll('[data-status-key]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.statusKey;
      if(state.hiddenStatuses.has(key)) state.hiddenStatuses.delete(key);
      else state.hiddenStatuses.add(key);
      renderVault();
    };
  });
}

function renderFolderBar(){
  const wrap = document.getElementById('folderBar');
  const platformEntries = state.entries.filter(e => e.platform === state.activePlatform);
  const platformFolders = state.folders.filter(f => f.platformId === state.activePlatform);
  const countAll = platformEntries.length;
  const countNone = platformEntries.filter(e => !e.folderId).length;

  const activeLabel = state.activeFolder === 'all'
    ? t('folder_all')
    : state.activeFolder === NO_FOLDER_ID
    ? t('folder_uncategorized')
    : (folderName(state.activeFolder) || t('folder_all'));
  const activeCount = state.activeFolder === 'all'
    ? countAll
    : state.activeFolder === NO_FOLDER_ID
    ? countNone
    : platformEntries.filter(e => e.folderId === state.activeFolder).length;

  let listHtml = `<button type="button" class="folder-chip ${state.activeFolder==='all'?'active':''}" data-folder="all"><span>${t('folder_all')}</span><span>${countAll}</span></button>`;
  platformFolders.forEach(f => {
    const c = platformEntries.filter(e => e.folderId === f.id).length;
    listHtml += `<button type="button" class="folder-chip ${state.activeFolder===f.id?'active':''}" data-folder="${f.id}"><span>${escapeHtml(f.name)}</span><span>${c}</span></button>`;
  });
  listHtml += `<button type="button" class="folder-chip ${state.activeFolder===NO_FOLDER_ID?'active':''}" data-folder="${NO_FOLDER_ID}"><span>${t('folder_uncategorized')}</span><span>${countNone}</span></button>`;
  listHtml += `<button type="button" class="folder-chip folder-manage-btn" id="manageFoldersBtn" title="${t('folder_manage')}"><span><i class="ti ti-settings" style="font-size:13px;vertical-align:-1px"></i> ${t('folder_manage')}</span></button>`;

  wrap.className = `folder-panel ${state.folderPanelOpen ? 'open' : ''}`;
  wrap.innerHTML = `
    <button type="button" class="folder-toggle" id="folderToggleBtn">
      <span><i class="ti ti-folder" style="font-size:14px;vertical-align:-2px;margin-right:6px;"></i>${escapeHtml(activeLabel)}</span>
      <span class="folder-toggle-right"><span class="folder-toggle-count">${activeCount}</span><i class="ti ti-chevron-down"></i></span>
    </button>
    <div class="folder-list" id="folderList">${listHtml}</div>
  `;

  document.getElementById('folderToggleBtn').onclick = () => {
    state.folderPanelOpen = !state.folderPanelOpen;
    renderFolderBar();
  };

  const bar = document.getElementById('folderList');
  bar.querySelectorAll('[data-folder]').forEach(btn => {
    btn.onclick = () => { state.activeFolder = btn.dataset.folder; renderVault(); };
  });
  document.getElementById('manageFoldersBtn').onclick = openFolderManager;
}


// ---------- MULTI-SELECT DELETE ----------
function updateSelectionBar(){
  const countText = document.getElementById('selectCountText');
  const deleteBtn = document.getElementById('deleteSelectedBtn');
  if(countText) countText.textContent = `${t('select_selected')} ${state.selectedIds.size}`;
  if(deleteBtn) deleteBtn.disabled = state.selectedIds.size === 0;
}

function selectAllVisibleEntries(){
  state.visibleEntries.forEach(e => state.selectedIds.add(e.id));
  renderVault();
}

function clearEntrySelection(){
  state.selectedIds = new Set();
  renderVault();
}

function confirmDeleteSelected(){
  const count = state.selectedIds.size;
  if(count === 0) return;
  const isLink = state.activePlatform === 'link';
  showConfirm(
    isLink ? 'Xoá các liên kết đã chọn?' : 'Xoá các tài khoản đã chọn?',
    `Bạn có chắc chắn muốn xoá ${count} ${isLink ? 'liên kết' : 'tài khoản'} đã chọn? Hành động này không thể hoàn tác.`,
    async () => {
      const nextEntries = state.entries.filter(e => !state.selectedIds.has(e.id));
      if(!await commitCollection('entries', nextEntries, saveEntries)) return;
      recordLog('info', isLink ? 'link' : 'account', `Đã xoá ${count} ${isLink ? 'liên kết' : 'tài khoản'} được chọn`, platformMeta(state.activePlatform).name);
      state.selectedIds = new Set();
      state.selectMode = false;
      renderVault();
      toast(`Đã xoá ${count} ${isLink ? 'liên kết' : 'tài khoản'}`);
    }
  );
}

