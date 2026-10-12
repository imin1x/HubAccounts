// HubAccounts — Home dashboard and activity-log pages.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
const LOG_LEVEL_META = {
  info:  { label: 'Thông tin', color: 'var(--tone-blue)', icon: 'ti-info-circle' },
  warn:  { label: 'Cảnh báo',  color: 'var(--tone-yellow)', icon: 'ti-alert-triangle' },
  error: { label: 'Lỗi',       color: 'var(--tone-red)', icon: 'ti-bug' }
};

function renderLogVault(){
  const app = document.getElementById('app');
  const query = state.logSearch.trim().toLowerCase();
  const filtered = state.logs.filter(item => {
    if(state.logLevelFilter !== 'all' && item.level !== state.logLevelFilter) return false;
    if(!query) return true;
    return `${item.category} ${item.message} ${item.detail}`.toLowerCase().includes(query);
  });
  const errorCount = state.logs.filter(item => item.level === 'error').length;
  const warnCount = state.logs.filter(item => item.level === 'warn').length;
  const sourceErrorCount = state.logs.filter(item => item.level === 'error' && item.category === 'source').length;
  app.innerHTML = `
    <div class="code-comment" style="font-size:12px;margin-bottom:8px;">Nhật ký hoạt động và chẩn đoán</div>
    <div class="log-toolbar">
      <button class="text-btn" id="logLockBtn" title="Khoá lại"><i class="ti ti-lock"></i>Khoá</button>
      <input class="log-search" id="logSearchInput" type="search" placeholder="Tìm trong log..." value="${escapeAttr(state.logSearch)}">
      <button class="text-btn danger" id="clearLogsBtn" ${state.logs.length ? '' : 'disabled'}><i class="ti ti-trash"></i>Xoá log</button>
    </div>
    <div class="log-summary">
      <div class="log-summary-card"><span class="log-summary-label">Tổng sự kiện</span><span class="log-summary-value">${state.logs.length}</span></div>
      <div class="log-summary-card"><span class="log-summary-label">Cảnh báo</span><span class="log-summary-value" style="color:var(--tone-yellow)">${warnCount}</span></div>
      <div class="log-summary-card"><span class="log-summary-label">Lỗi source</span><span class="log-summary-value" style="color:${sourceErrorCount ? 'var(--tone-red)' : 'var(--tone-green)'}">${sourceErrorCount}</span></div>
    </div>
    <div class="info-note" style="border-color:${sourceErrorCount ? 'rgba(248,113,113,.35)' : 'rgba(74,222,128,.28)'};background:${sourceErrorCount ? 'rgba(248,113,113,.06)' : 'rgba(74,222,128,.06)'};margin-bottom:14px;">
      <i class="ti ${sourceErrorCount ? 'ti-bug' : 'ti-circle-check'}" style="color:${sourceErrorCount ? 'var(--tone-red)' : 'var(--tone-green)'}"></i>
      ${sourceErrorCount ? `Đã ghi nhận ${sourceErrorCount} lỗi JavaScript trên thiết bị này. Chọn bộ lọc “Lỗi” để xem.` : 'Chưa ghi nhận lỗi JavaScript nào trên thiết bị này.'}
      <br><span style="color:var(--text-muted)">Log được mã hoá và chỉ lưu cục bộ; không ghi mật khẩu, cookie, token hay secret 2FA.</span>
    </div>
    <div class="log-filters">
      ${[
        ['all', 'Tất cả', state.logs.length],
        ['info', 'Thông tin', state.logs.filter(item => item.level === 'info').length],
        ['warn', 'Cảnh báo', warnCount],
        ['error', 'Lỗi', errorCount]
      ].map(([key, label, count]) => `<button class="text-btn log-filter ${state.logLevelFilter === key ? 'active' : ''}" data-log-level="${key}">${label} · ${count}</button>`).join('')}
    </div>
    <div class="log-list">
      ${filtered.length ? filtered.map(item => {
        const meta = LOG_LEVEL_META[item.level] || LOG_LEVEL_META.info;
        const date = new Date(Number(item.time) || Date.now());
        return `<div class="log-item" style="--log-color:${meta.color}">
          <div class="log-level-icon"><i class="ti ${meta.icon}"></i></div>
          <div>
            <div class="log-item-head"><span class="log-level">${meta.label}</span><span class="log-category">${escapeHtml(item.category)}</span>${Number(item.count || 1) > 1 ? `<span class="log-category">×${Number(item.count)}</span>` : ''}<span class="log-time">${escapeHtml(date.toLocaleString('vi-VN'))}</span></div>
            <div class="log-message">${escapeHtml(item.message)}</div>
            ${item.detail ? `<div class="log-detail">${escapeHtml(item.detail)}</div>` : ''}
          </div>
        </div>`;
      }).join('') : `<div class="empty"><i class="ti ti-list-search" style="font-size:30px;display:block;margin-bottom:8px"></i>${state.logs.length ? 'Không có log phù hợp với bộ lọc.' : 'Chưa có hoạt động nào được ghi lại.'}</div>`}
    </div>`;

  renderPlatformBar();
  updateIdeChrome();
  syncGlobalSearchBar(null);
  document.getElementById('logLockBtn').onclick = lockVault;
  document.getElementById('logSearchInput').oninput = debounce(event => {
    state.logSearch = event.target.value;
    renderLogVault();
  }, 180);
  document.querySelectorAll('[data-log-level]').forEach(button => {
    button.onclick = () => { state.logLevelFilter = button.dataset.logLevel; renderLogVault(); };
  });
  document.getElementById('clearLogsBtn').onclick = () => {
    showConfirm('Xoá toàn bộ log?', 'Chỉ nhật ký hoạt động trên thiết bị này bị xoá. Dữ liệu tài khoản, thư mục và ghi chú không bị ảnh hưởng.', async () => {
      state.logs = [];
      clearTimeout(logSaveTimer);
      await saveLogs();
      renderLogVault();
      toast('Đã xoá log trên thiết bị này');
    }, 'Xoá log');
  };
}

function normalizeHttpLink(value){
  const raw = String(value || '').trim();
  if(!raw) return '';
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try{
    const parsed = new URL(candidate);
    if(!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return '';
    return parsed.href;
  }catch(_error){
    return '';
  }
}

function homePlatformCount(platformId){
  if(platformId === 'note') return state.notes.length;
  if(platformId === 'log') return state.logs.length;
  if(platformId === 'home' || platformId === 'other') return null;
  return state.entries.filter(entry => entry.platform === platformId).length;
}

function renderHomeVault(){
  const app = document.getElementById('app');
  const accountPlatformIds = new Set(['facebook', 'gmail', 'hotmail', 'ai', 'tiktok', 'steam', 'money']);
  const totalAccounts = state.entries.filter(entry => accountPlatformIds.has(entry.platform)).length;
  const linkCount = state.entries.filter(entry => entry.platform === 'link').length;
  const duplicateCount = PLATFORMS
    .filter(platform => !['home', 'note', 'log', 'other'].includes(platform.id))
    .reduce((sum, platform) => sum + findAllDuplicateGroups(platform.id).reduce((groupSum, group) => groupSum + group.list.length - 1, 0), 0);
  const unknownCount = state.entries.filter(entry => STATUS_FILTER_PLATFORMS.includes(entry.platform) && (entry.status || 'unknown') === 'unknown').length;
  const expiringCount = state.entries.filter(entry => {
    if(!['phone', 'proxy'].includes(entry.platform) || !entry.expiryDate) return false;
    const info = phoneExpiryInfo(entry.expiryDate);
    return info && info.diffDays <= 7;
  }).length;
  const settings = driveSettings || { enabled: false, clientId: '', lastSyncedAt: 0 };
  const syncText = driveStatusText(settings);
  const syncHealthy = ['synced', 'connected'].includes(driveRuntimeStatus) || (!!driveAccessToken && settings.enabled);
  const syncProblem = ['error', 'conflict', 'reauth'].includes(driveRuntimeStatus);
  const syncColor = syncProblem ? 'var(--tone-red)' : syncHealthy ? 'var(--tone-green)' : settings.enabled || settings.clientId ? 'var(--tone-yellow)' : 'var(--tone-gray)';
  const quickPlatforms = PLATFORMS.filter(platform => platform.id !== 'home');
  const platformDescriptions = {
    facebook: 'UID và phiên Facebook', gmail: 'Tài khoản Google', hotmail: 'Outlook / Microsoft', ai: 'ChatGPT, Claude, Gemini, Grok',
    tiktok: 'Tài khoản TikTok', steam: 'Steam và Guard', link: 'Kho liên kết website',
    note: 'Ghi chú mã hóa', phone: 'Số điện thoại', money: 'Tài khoản tài chính', proxy: 'Proxy và thời hạn',
    other: 'Bộ công cụ tiện ích', log: 'Nhật ký hoạt động',
  };
  const recentLogs = state.logs.slice(0, 4);
  const logColors = { info: 'var(--tone-blue)', warn: 'var(--tone-yellow)', error: 'var(--tone-red)' };

  app.innerHTML = `
    <div class="home-shell">
      <section class="home-hero">
        <div class="home-hero-head">
          <div>
            <div class="home-kicker"><i class="ti ti-layout-dashboard"></i> Trung tâm điều hành</div>
            <h1 class="home-title">Mọi dữ liệu quan trọng, trong một kho an toàn.</h1>
            <p class="home-subtitle">Theo dõi nhanh tài khoản, liên kết, ghi chú và những mục cần xử lý. Toàn bộ nội dung vẫn nằm trong kho mã hóa hiện tại của HubAccounts.</p>
          </div>
          <div class="home-sync-pill" style="--home-sync-color:${syncColor}" title="Trạng thái Google Drive">
            <span class="home-sync-dot"></span><span>${escapeHtml(syncText)}</span>
          </div>
        </div>
        <div class="home-stats">
          <div class="home-stat"><span class="home-stat-label">Tài khoản</span><span class="home-stat-value">${totalAccounts}</span></div>
          <div class="home-stat"><span class="home-stat-label">Liên kết</span><span class="home-stat-value">${linkCount}</span></div>
          <div class="home-stat"><span class="home-stat-label">Ghi chú</span><span class="home-stat-value">${state.notes.length}</span></div>
          <div class="home-stat"><span class="home-stat-label">Thư mục</span><span class="home-stat-value">${state.folders.length}</span></div>
        </div>
      </section>

      <section class="home-section">
        <div class="home-section-head">
          <h2 class="home-section-title"><i class="ti ti-bolt" style="color:var(--tone-yellow)"></i> Thao tác nhanh</h2>
          <span class="home-section-note">Các lệnh dùng thường xuyên</span>
        </div>
        <div class="home-quick-actions">
          <button type="button" class="primary" id="homeAddAccountBtn"><i class="ti ti-user-plus"></i> Thêm tài khoản</button>
          <button type="button" id="homeAddLinkBtn"><i class="ti ti-link-plus"></i> Thêm link</button>
          <button type="button" id="homeAddNoteBtn"><i class="ti ti-note"></i> Ghi chú mới</button>
          <button type="button" id="homeBackupBtn"><i class="ti ti-cloud-upload"></i> Sao lưu / Đồng bộ</button>
          <button type="button" id="homeLockBtn"><i class="ti ti-lock"></i> Khoá kho</button>
        </div>
      </section>

      <section class="home-section">
        <div class="home-section-head">
          <h2 class="home-section-title"><i class="ti ti-apps" style="color:var(--tone-blue)"></i> Không gian làm việc</h2>
          <span class="home-section-note">Mở nhanh từng khu vực</span>
        </div>
        <div class="home-nav-grid">
          ${quickPlatforms.map(platform => {
            const count = homePlatformCount(platform.id);
            const metaText = count === null ? platformDescriptions[platform.id] : `${count} mục · ${platformDescriptions[platform.id]}`;
            return `<button type="button" class="home-nav-card" data-home-platform="${platform.id}" style="--home-color:${platform.color}">
              <span class="home-nav-icon" style="--pcolor:${platform.color}">${platformSvg(platform.id)}</span>
              <span class="home-nav-copy"><span class="home-nav-name">${platform.id === 'other' ? t('platform_tools') : escapeHtml(platform.name)}</span><span class="home-nav-meta">${escapeHtml(metaText)}</span></span>
              <i class="ti ti-chevron-right home-nav-arrow"></i>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="home-section">
        <div class="home-section-head">
          <h2 class="home-section-title"><i class="ti ti-activity-heartbeat" style="color:var(--tone-green)"></i> Sức khỏe dữ liệu</h2>
          <span class="home-section-note">Ưu tiên những mục cần kiểm tra</span>
        </div>
        <div class="home-health-grid">
          <div class="home-health-card" style="--health-color:${duplicateCount ? 'var(--tone-red)' : 'var(--tone-green)'}"><div class="home-health-top"><span class="home-health-label">Bản ghi trùng</span><i class="ti ti-copy-check home-health-icon"></i></div><div class="home-health-number">${duplicateCount}</div><div class="home-health-hint">${duplicateCount ? 'Nên rà soát và giữ lại bản chính xác nhất.' : 'Không phát hiện dữ liệu trùng lặp.'}</div></div>
          <div class="home-health-card" style="--health-color:${expiringCount ? 'var(--tone-yellow)' : 'var(--tone-green)'}"><div class="home-health-top"><span class="home-health-label">Hết hạn / trong 7 ngày</span><i class="ti ti-calendar-due home-health-icon"></i></div><div class="home-health-number">${expiringCount}</div><div class="home-health-hint">Theo dõi thời hạn Phone và Proxy.</div></div>
          <div class="home-health-card" style="--health-color:${unknownCount ? 'var(--tone-gray)' : 'var(--tone-green)'}"><div class="home-health-top"><span class="home-health-label">Chưa xác định</span><i class="ti ti-help-hexagon home-health-icon"></i></div><div class="home-health-number">${unknownCount}</div><div class="home-health-hint">Tài khoản chưa có trạng thái xác nhận.</div></div>
        </div>
      </section>

      <section class="home-section">
        <div class="home-section-head">
          <h2 class="home-section-title"><i class="ti ti-terminal-2" style="color:var(--tone-green)"></i> Hoạt động gần đây</h2>
          <button type="button" class="text-btn" id="homeOpenLogBtn">Xem tất cả</button>
        </div>
        <div class="home-log-list">
          ${recentLogs.length ? recentLogs.map(item => `<div class="home-log-row" style="--log-dot:${logColors[item.level] || 'var(--tone-gray)'}"><span class="home-log-dot"></span><span class="home-log-message">${escapeHtml(item.message || 'Hoạt động hệ thống')}</span><span class="home-log-time">${item.time ? escapeHtml(new Date(item.time).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })) : ''}</span></div>`).join('') : '<div class="empty" style="padding:18px 0;">Chưa có hoạt động nào được ghi nhận.</div>'}
        </div>
      </section>
    </div>`;

  renderPlatformBar();
  updateIdeChrome();
  syncGlobalSearchBar(null);
  document.getElementById('homeAddAccountBtn').onclick = () => { navigateToPlatform('facebook'); state.modalTab = 'manual'; openModal(null); };
  document.getElementById('homeAddLinkBtn').onclick = () => { navigateToPlatform('link'); state.modalTab = 'manual'; openModal(null); };
  document.getElementById('homeAddNoteBtn').onclick = () => { navigateToPlatform('note'); openNoteModal(null); };
  document.getElementById('homeBackupBtn').onclick = openFileBackupModal;
  document.getElementById('homeOpenLogBtn').onclick = () => navigateToPlatform('log');
  document.querySelectorAll('[data-home-platform]').forEach(button => {
    button.onclick = () => navigateToPlatform(button.dataset.homePlatform);
  });
  document.getElementById('homeLockBtn').onclick = lockVault;
}

