// HubAccounts — Platform metadata, app state, crypto, encrypted persistence, activity log and shared UI helpers.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
const PLATFORMS = [
  { id: 'home',     name: 'Home',     color: '#60A5FA' },
  { id: 'facebook', name: 'Facebook', color: '#1877F2' },
  { id: 'gmail',    name: 'Gmail',    color: '#EA4335' },
  { id: 'hotmail',  name: 'Hotmail',  color: '#0078D4' },
  { id: 'ai',       name: 'AI',       color: '#10A37F' },
  { id: 'tiktok',   name: 'TikTok',   color: '#000000' },
  { id: 'steam',    name: 'Steam',    color: '#171a21' },
  { id: 'link',     name: 'Link',     color: '#8B5CF6' },
  { id: 'note',     name: 'Note',     color: '#F5A623' },
  { id: 'log',      name: 'Log',      color: '#22c55e' },
  { id: 'phone',    name: 'Phone',    color: '#9C27B0' },
  { id: 'money',    name: 'Money',    color: '#22C55E' },
  { id: 'proxy',    name: 'Proxy',    color: '#14b8a6' },
  { id: 'other',    name: 'Công cụ',  color: '#6b6b66' },
];
// Status filter (Hoạt động / Không hoạt động / Chưa xác định) only makes sense
// for platforms where "is this account still alive" is a meaningful question.
const STATUS_FILTER_PLATFORMS = ['facebook', 'gmail', 'hotmail', 'ai', 'tiktok', 'steam', 'phone'];
// Reads which platform tab the URL points to (e.g. after Ctrl/Cmd-clicking a
// sidebar tab opened this as a new browser tab/window) — lets that new
// window land on the right tab once the vault is unlocked, and also means
// reloading the page keeps you on whatever tab you were last viewing.
function getPlatformFromHash(){
  const m = location.hash.match(/platform=([a-z]+)/i);
  if(m && PLATFORMS.some(p => p.id === m[1])) return m[1];
  return null;
}
function platformMeta(id){
  return PLATFORMS.find(p => p.id === id) || PLATFORMS[0];
}

// inline SVG brand marks (self-contained, no external font dependency so they always render)
const PLATFORM_SVG_INNER = {
  home: `<path fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M3.5 11.2 12 4l8.5 7.2M5.5 10v10h13V10M9.5 20v-6h5v6"/>`,
  facebook: `<path fill="#ffffff" d="M13.5 21v-7.5h2.5l.4-3H13.5V8.5c0-.86.24-1.5 1.5-1.5h1.6V4.3C16.3 4.2 15.4 4 14.4 4 12.2 4 10.6 5.3 10.6 7.7v2.8H8v3h2.6V21h2.9z"/>`,
  ai: `<path fill="#ffffff" d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z"/><circle cx="19" cy="5" r="1.5" fill="#ffffff"/><circle cx="5" cy="19" r="1.5" fill="#ffffff"/>`,
  gmail: `<rect x="3.2" y="6" width="17.6" height="12" rx="1.8" fill="none" stroke="#ffffff" stroke-width="1.6"/><path d="M4 7l8 6 8-6" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  tiktok: `<path fill="#ffffff" d="M15.3 3.5c.5 2.1 1.9 3.6 4 3.9v3c-1.5 0-2.9-.4-4-1.2v6.1c0 3-2.4 5.4-5.4 5.4S4.5 17.3 4.5 14.3s2.4-5.4 5.4-5.4c.3 0 .6 0 .9.1v3.1c-.3-.1-.6-.2-.9-.2-1.3 0-2.4 1.1-2.4 2.4s1.1 2.4 2.4 2.4 2.4-1.1 2.4-2.4V3.5h3z"/>`,
  hotmail: `<rect x="3" y="4" width="8" height="8" fill="#ffffff"/><rect x="12" y="4" width="8" height="8" fill="#ffffff" opacity="0.75"/><rect x="3" y="13" width="8" height="8" fill="#ffffff" opacity="0.75"/><rect x="12" y="13" width="8" height="8" fill="#ffffff" opacity="0.5"/>`,
  steam: `<circle cx="9" cy="16" r="3.1" fill="none" stroke="#ffffff" stroke-width="1.6"/><circle cx="15.3" cy="8.2" r="3.6" fill="none" stroke="#ffffff" stroke-width="1.6"/><path d="M10.9 14.1l3-3.1" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>`,
  link: `<path fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M9.5 14.5 14.5 9.5M7.2 16.8l-1 1a3.5 3.5 0 0 1-5-5l3.2-3.2a3.5 3.5 0 0 1 5 0M16.8 7.2l1-1a3.5 3.5 0 0 1 5 5l-3.2 3.2a3.5 3.5 0 0 1-5 0" transform="translate(.4 .4) scale(.96)"/>`,
  other: `<path d="M14.7 6.3a3 3 0 0 1-3.9 3.9L6.4 14.6a1.5 1.5 0 0 1-2.1-2.1l4.4-4.4a3 3 0 0 1 3.9-3.9l-2 2 1.4 1.4 2-2z" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`,
  note: `<path fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round" d="M7 3.5h7l3.5 3.5V20.5H7z"/><path fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round" d="M14 3.5V7h3.5"/><path fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" d="M9.3 11h5.4M9.3 13.7h5.4M9.3 16.4h3.4"/>`,
  log: `<path fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M5 5h14v14H5zM8 9l2 2-2 2M12 14h4"/>`,
  phone: `<path fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round" d="M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" d="M11 18.3h2"/>`,
  money: `<path fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7zM4 9V6a2 2 0 0 1 2-2h10v3M15 12h5v4h-5a2 2 0 0 1 0-4z"/>`,
  proxy: `<path fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M4 8h13m0 0-3.2-3.2M17 8l-3.2 3.2M20 16H7m0 0 3.2-3.2M7 16l3.2 3.2"/>`,
};

function platformSvg(id){
  const inner = PLATFORM_SVG_INNER[id] || PLATFORM_SVG_INNER.other;
  return `<svg viewBox="0 0 24 24" class="pf-svg">${inner}</svg>`;
}

// account status: whether the account is currently active/working
const STATUS_META = {
  active:   { symbol: '✓', color: 'var(--tone-green)', bg: 'rgba(74,222,128,0.14)' },
  inactive: { symbol: '✕', color: 'var(--tone-red)', bg: 'rgba(248,113,113,0.14)' },
  unknown:  { symbol: '?', color: 'var(--tone-gray)', bg: 'rgba(154,154,149,0.14)' },
  checking: { symbol: '…', color: 'var(--tone-blue)', bg: 'rgba(96,165,250,0.14)' },
};
function statusMeta(status){
  const key = STATUS_META[status] ? status : 'unknown';
  return { ...STATUS_META[key], label: t('status_' + key) };
}

// shared field metadata (icon + input type). Which fields appear, in what order,
// and under what label depends on the platform — see PLATFORM_FIELDS below.
const FIELD_META = {
  fbName:                 { icon: 'ti-user',        kind: 'text' },
  password:               { icon: 'ti-key',         kind: 'text' },
  twoFA:                  { icon: 'ti-shield-lock', kind: 'text' },
  email:                  { icon: 'ti-mail',        kind: 'text' },
  emailPassword:          { icon: 'ti-mail-opened', kind: 'text' },
  secondaryEmail:         { icon: 'ti-mail-forward',kind: 'text' },
  secondaryEmailPassword: { icon: 'ti-mail-opened', kind: 'text' },
  phone:                  { icon: 'ti-phone',       kind: 'text' },
  bankAccount:            { icon: 'ti-building-bank', kind: 'text' },
  expiryDate:             { icon: 'ti-calendar-due', kind: 'date' },
  port:                   { icon: 'ti-plug',        kind: 'text' },
  username:               { icon: 'ti-user',        kind: 'text' },
  cookie:                 { icon: 'ti-cookie',      kind: 'area' },
  token:                  { icon: 'ti-key',         kind: 'area' },
  backupCodes:            { icon: 'ti-list-numbers',kind: 'area' },
  recoveryCode:           { icon: 'ti-lifebuoy',    kind: 'text' },
  appPassword:            { icon: 'ti-password',    kind: 'text' },
  steamId:                { icon: 'ti-id',          kind: 'text' },
  steamSharedSecret:      { icon: 'ti-shield-code', kind: 'area' },
  steamIdentitySecret:    { icon: 'ti-fingerprint', kind: 'area' },
  steamGuardRecoveryCode: { icon: 'ti-lifebuoy',    kind: 'text' },
  other:                  { icon: 'ti-dots',        kind: 'area' },
};
function fieldMeta(key){
  return FIELD_META[key] || { icon: 'ti-dots', kind: 'text' };
}

function primaryIdentifierLabel(platformId){
  if(platformId === 'link') return 'Link';
  if(platformId === 'gmail' || platformId === 'hotmail') return 'Email';
  if(platformId === 'tiktok' || platformId === 'steam') return 'User';
  if(platformId === 'phone') return 'SĐT';
  if(platformId === 'money') return 'Name';
  if(platformId === 'proxy') return 'IP';
  if(platformId === 'facebook') return 'UID';
  if(platformId === 'ai') return 'Tài khoản';
  return 'Định danh';
}

// Groups a credential account's fields into up to 3 compact, scannable rows:
//   1) UID/User/Email + Pass + Tên
//   2) Email + Pass Email (whichever email/password pair actually has data)
//   3) Proxy + mã 2FA (mã trực tiếp, đã giải — không phải secret thô)
// Anything left over (secondaryEmail when unused above, cookie, token, khác...)
// is returned separately so it can go in a small collapsible "extra" section
// instead of cluttering the main view.
function buildEntryDisplayRows(e){
  const rows = [];
  const used = new Set(['fbName']);

  const row1 = [];
  const primaryLabel = primaryIdentifierLabel(e.platform);
  row1.push({ label: primaryLabel, field: 'fbName', value: e.fbName, secret: false });
  if(e.password){ row1.push({ label: 'Pass', field: 'password', value: e.password, secret: true }); used.add('password'); }
  if(e.displayName){ row1.push({ label: 'Tên', field: 'displayName', value: e.displayName, secret: false }); used.add('displayName'); }
  rows.push(row1);

  const row2 = [];
  if(e.email){
    row2.push({ label: 'Email', field: 'email', value: e.email, secret: false });
    used.add('email');
    if(e.emailPassword){ row2.push({ label: 'Pass Email', field: 'emailPassword', value: e.emailPassword, secret: true }); used.add('emailPassword'); }
  } else if(e.secondaryEmail){
    row2.push({ label: 'Email phụ', field: 'secondaryEmail', value: e.secondaryEmail, secret: false });
    used.add('secondaryEmail');
    if(e.secondaryEmailPassword){ row2.push({ label: 'Pass', field: 'secondaryEmailPassword', value: e.secondaryEmailPassword, secret: true }); used.add('secondaryEmailPassword'); }
  }
  if(row2.length) rows.push(row2);

  const row3 = [];
  if(e.proxy){ row3.push({ label: 'Proxy', field: 'proxy', value: e.proxy, secret: false }); used.add('proxy'); }
  if(e.twoFA){
    // Steam Guard does not use the ordinary six-digit RFC TOTP calculation.
    // Keep its saved value masked/copyable instead of showing a misleading code.
    if(e.platform === 'steam') row3.push({ label: '2FA / Steam Guard', field: 'twoFA', value: e.twoFA, secret: true });
    else row3.push({ label: '2FA', field: 'twoFA', value: null, secret: false, isTotp: true });
    used.add('twoFA');
  }
  if(e.token && e.platform === 'ai'){
    row3.push({ label: 'API Key / Token', field: 'token', value: e.token, secret: true });
    used.add('token');
  }
  if(e.phone){ row3.push({ label: 'SĐT', field: 'phone', value: e.phone, secret: false }); used.add('phone'); }
  if(row3.length) rows.push(row3);

  return { rows, used };
}

// per-platform field sets: which fields show up (and their label/order) in the
// Add/Edit form, the auto-import pipe format, the expanded account details, and exports.
const PLATFORM_FIELDS = {
  facebook: [
    { key: 'fbName',        label: 'UID' },
    { key: 'password',      label: 'PASS' },
    { key: 'twoFA',         label: '2FA' },
    { key: 'email',         label: 'Email' },
    { key: 'emailPassword', label: 'Pass Email' },
    { key: 'secondaryEmail',label: 'Email phụ' },
    { key: 'cookie',        label: 'Cookie' },
    { key: 'token',         label: 'Token' },
    { key: 'other',         label: 'Khác' },
  ],
  gmail: [
    { key: 'fbName',                 label: 'Email' },
    { key: 'password',               label: 'Pass' },
    { key: 'twoFA',                  label: '2FA' },
    { key: 'secondaryEmail',         label: 'Email phụ' },
    { key: 'secondaryEmailPassword', label: 'Pass Email' },
    { key: 'other',                  label: 'Khác' },
    // Appended fields keep all legacy Gmail import columns unchanged.
    { key: 'phone',                  label: 'SĐT khôi phục' },
    { key: 'cookie',                 label: 'Cookie' },
    { key: 'token',                  label: 'Token' },
    { key: 'backupCodes',            label: 'Mã dự phòng' },
    { key: 'appPassword',            label: 'Mật khẩu ứng dụng' },
  ],
  hotmail: [
    { key: 'fbName',                 label: 'Email' },
    { key: 'password',               label: 'Pass' },
    { key: 'secondaryEmail',         label: 'Mail phụ' },
    { key: 'secondaryEmailPassword', label: 'Pass mail phụ' },
    { key: 'phone',                  label: 'SĐT' },
    { key: 'other',                  label: 'Khác' },
    // Appended fields keep all legacy Hotmail import columns unchanged.
    { key: 'twoFA',                  label: '2FA' },
    { key: 'cookie',                 label: 'Cookie' },
    { key: 'token',                  label: 'Token' },
    { key: 'recoveryCode',           label: 'Mã khôi phục' },
    { key: 'backupCodes',            label: 'Mã dự phòng' },
  ],
  ai: [
    { key: 'fbName',        label: 'Tài khoản' },
    { key: 'password',      label: 'Mật khẩu' },
    { key: 'twoFA',         label: '2FA' },
    { key: 'email',         label: 'Email liên kết' },
    { key: 'emailPassword', label: 'Pass Email' },
    { key: 'token',         label: 'API Key / Token' },
    { key: 'cookie',        label: 'Cookie' },
    { key: 'other',         label: 'Ghi chú / Model' },
  ],
  tiktok: [
    { key: 'fbName',        label: 'User' },
    { key: 'password',      label: 'Pass' },
    { key: 'twoFA',         label: '2FA' },
    { key: 'email',         label: 'Email' },
    { key: 'emailPassword', label: 'PassEmail' },
    { key: 'phone',         label: 'SĐT' },
    { key: 'cookie',        label: 'Cookie' },
    { key: 'token',         label: 'Token' },
    { key: 'other',         label: 'Khác' },
    { key: 'backupCodes',   label: 'Mã dự phòng' },
  ],
  steam: [
    { key: 'fbName',        label: 'User' },
    { key: 'password',      label: 'Pass' },
    { key: 'email',         label: 'Email' },
    { key: 'emailPassword', label: 'PassEmail' },
    { key: 'phone',         label: 'SĐT' },
    { key: 'other',         label: 'Khác' },
    // Steam-specific recovery data is deliberately separate from generic TOTP.
    { key: 'steamId',                label: 'Steam ID' },
    { key: 'twoFA',                  label: '2FA / Steam Guard' },
    { key: 'steamGuardRecoveryCode', label: 'Mã khôi phục Steam Guard' },
    { key: 'steamSharedSecret',       label: 'Shared Secret' },
    { key: 'steamIdentitySecret',     label: 'Identity Secret' },
    { key: 'cookie',                 label: 'Cookie' },
    { key: 'token',                  label: 'Token' },
  ],
  phone: [
    { key: 'fbName',     label: 'SĐT' },
    { key: 'expiryDate', label: 'Ngày hết hạn' },
    { key: 'other',      label: 'Khác' },
  ],
  money: [
    { key: 'fbName',      label: 'Name' },
    { key: 'bankAccount', label: 'STK' },
    { key: 'password',    label: 'Pass' },
    { key: 'phone',       label: 'SĐT' },
    { key: 'email',       label: 'Email' },
  ],
  proxy: [
    { key: 'fbName',     label: 'IP' },
    { key: 'port',       label: 'Port' },
    { key: 'username',   label: 'User' },
    { key: 'password',   label: 'Pass' },
    { key: 'expiryDate', label: 'Ngày hết hạn' },
  ],
  link: [
    { key: 'fbName', label: 'Link' },
    { key: 'other',  label: 'Mô tả' },
  ],
};

// Practical order used by the manual form and bulk-entry format. Storage and
// text-backup field order remain unchanged for backward compatibility.
const PLATFORM_INPUT_ORDER = {
  facebook: ['fbName', 'password', 'twoFA', 'email', 'emailPassword', 'secondaryEmail', 'cookie', 'token', 'other'],
  gmail: ['fbName', 'password', 'twoFA', 'secondaryEmail', 'secondaryEmailPassword', 'phone', 'backupCodes', 'appPassword', 'cookie', 'token', 'other'],
  hotmail: ['fbName', 'password', 'twoFA', 'secondaryEmail', 'secondaryEmailPassword', 'phone', 'recoveryCode', 'backupCodes', 'cookie', 'token', 'other'],
  ai: ['fbName', 'password', 'twoFA', 'email', 'emailPassword', 'token', 'cookie', 'other'],
  tiktok: ['fbName', 'password', 'twoFA', 'email', 'emailPassword', 'phone', 'backupCodes', 'cookie', 'token', 'other'],
  steam: ['fbName', 'password', 'steamId', 'email', 'emailPassword', 'phone', 'twoFA', 'steamGuardRecoveryCode', 'steamSharedSecret', 'steamIdentitySecret', 'cookie', 'token', 'other'],
  money: ['fbName', 'bankAccount', 'password', 'phone', 'email'],
  link: ['fbName', 'other'],
};

// which delimiter this platform's auto-import / export lines use between fields
function platformDelimiter(platformId){
  return platformId === 'proxy' ? ':' : '|';
}
function platformFormatHint(platformId){
  const fields = getPlatformInputFields(platformId);
  const labels = fields.map(f => f.label);
  if(['tiktok', 'gmail', 'hotmail', 'steam'].includes(platformId)){
    const otherIndex = fields.findIndex(field => field.key === 'other');
    labels.splice(otherIndex < 0 ? labels.length : otherIndex, 0, 'Proxy');
  }
  const d = platformDelimiter(platformId);
  if(platformId === 'link' || platformId === 'money') return labels.join(d);
  return d === ':' ? labels.join(d) : labels.join(d) + '|';
}
function backupPlatformFormatHint(platformId){
  const labels = getPlatformFields(platformId).map(f => f.label);
  const d = platformDelimiter(platformId);
  if(platformId === 'link') return labels.join(d);
  return d === ':' ? labels.join(d) : labels.join(d) + '|';
}
function getPlatformFields(platformId){
  return PLATFORM_FIELDS[platformId] || PLATFORM_FIELDS.facebook;
}
function getPlatformInputFields(platformId){
  const fields = getPlatformFields(platformId);
  const byKey = new Map(fields.map(f => [f.key, f]));
  const ordered = (PLATFORM_INPUT_ORDER[platformId] || []).map(key => byKey.get(key)).filter(Boolean);
  const used = new Set(ordered.map(f => f.key));
  const remaining = fields.filter(f => !used.has(f.key) && f.key !== 'other');
  const other = fields.find(f => f.key === 'other');
  return [...ordered.filter(f => f.key !== 'other'), ...remaining, ...(other ? [other] : [])];
}

// phone number expiry helper: how many days left until a phone's "Ngày hết hạn" (expiry) date
// accepts both the native date-picker format (YYYY-MM-DD) and Vietnamese-style DD/MM/YYYY
// (as typically typed when pasting via the "Tự động" bulk-import tab)
function parseFlexibleDate(str){
  if(!str) return null;
  let m = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(str).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
// Always show/store dates as dd/mm/yyyy in the UI (Vietnamese convention) — the
// native <input type="date"> widget renders in the OS/browser locale format
// (often mm/dd/yyyy) which we can't reliably override, so date fields use a
// plain text input with this fixed display format instead.
function formatDateDMY(dateObj){
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const yyyy = dateObj.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
// "MỚI" badge for accounts added less than 24h ago — purely a display check
// against the stored createdAt timestamp, so it naturally stops showing on
// its own once 24h have passed (re-evaluated on every render, no timer needed).
const NEW_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;
function isNewEntry(e){
  if(!e.createdAt) return false;
  return (Date.now() - e.createdAt) < NEW_BADGE_WINDOW_MS;
}
function toDisplayDate(raw){
  if(!raw) return '';
  const d = parseFlexibleDate(raw);
  return d ? formatDateDMY(d) : raw;
}
// suggested filename for new vault backup files, e.g. "Backup20-8.json"
function backupFileName(ext){
  const now = new Date();
  return `Backup${now.getDate()}-${now.getMonth() + 1}.${ext}`;
}
function phoneExpiryInfo(expiryDateStr){
  if(!expiryDateStr) return null;
  const exp = parseFlexibleDate(expiryDateStr);
  if(!exp) return null;
  const now = new Date();
  now.setHours(0,0,0,0);
  exp.setHours(0,0,0,0);
  const diffDays = Math.round((exp - now) / 86400000);
  if(diffDays < 0) return { label: `Hết hạn ${Math.abs(diffDays)} ngày trước`, color: 'var(--tone-red)', bg: 'rgba(248,113,113,0.16)', diffDays };
  if(diffDays === 0) return { label: 'Hết hạn hôm nay', color: 'var(--tone-red)', bg: 'rgba(248,113,113,0.16)', diffDays };
  if(diffDays === 1) return { label: 'Còn 1 ngày', color: 'var(--tone-yellow)', bg: 'rgba(250,204,21,0.16)', diffDays };
  return { label: `Còn ${diffDays} ngày`, color: 'var(--tone-green)', bg: 'rgba(74,222,128,0.14)', diffDays };
}
function phoneExpiryBadgeHtml(e){
  if((e.platform !== 'phone' && e.platform !== 'proxy') || !e.expiryDate) return '';
  const info = phoneExpiryInfo(e.expiryDate);
  if(!info) return '';
  return `<span class="status-badge" style="color:${info.color};background:${info.bg};" title="Ngày hết hạn: ${escapeHtml(toDisplayDate(e.expiryDate))}"><i class="ti ti-calendar-due" style="font-size:11px;vertical-align:-1px"></i> ${escapeHtml(info.label)}</span>`;
}

let state = {
  key: null,
  lang: 'vi',
  entries: [],
  folders: [], // {id, name}
  configExists: false,
  editingId: null,
  modalTab: 'manual',
  search: '',
  activeFolder: 'all', // 'all' | NO_FOLDER_ID | folder id
  folderPanelOpen: false,
  selectMode: false,
  hiddenStatuses: new Set(), // status keys ('active'|'inactive'|'unknown') currently hidden from the list
  selectedIds: new Set(),
  checkingIds: new Set(), // transient; never persisted as an account status
  activePlatform: getPlatformFromHash() || 'home',
  expandedIds: new Set(),
  visibleEntries: [],
  session: { loginTime: null, lastActivity: null },
  notes: [],
  logs: [], // encrypted local-only diagnostic/activity history; never synced to Drive
  logLevelFilter: 'all',
  logSearch: '',
  activeNoteId: null,
  phoneNotified: new Set(), // ids of phone entries we've already alerted about this session
  proxyAlertDismissedIds: new Set(), // ids of proxy entries the person has dismissed the renewal banner for
  fileHandle: null,     // linked FileSystemFileHandle for on-disk backup, or null
  fileHandleName: ''    // display name of the linked file
};

const AUTO_LOGOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity
let toastTimer = null;

function toast(msg, durationMs = 1800){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    toastTimer = null;
  }, durationMs);
}

function b64(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(str){
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}

// PBKDF2 iteration count — OWASP's 2023 minimum recommendation for
// PBKDF2-HMAC-SHA256 is 600,000; new vaults use this. Vaults created before
// this security upgrade used 250,000 — their own iteration count is stored in
// their config and honored on unlock so existing vaults keep working exactly
// as before (no forced re-encryption, no risk of locking anyone out).
const PBKDF2_ITERATIONS = 600000;
const PBKDF2_ITERATIONS_LEGACY = 250000;

// New vault: random salt, password-derived key and the encrypted verifier
// that later proves a password is correct. Used by setup and text restore.
async function createVaultCredentials(password){
  const saltB64 = b64(crypto.getRandomValues(new Uint8Array(16)));
  const key = await deriveKey(password, saltB64, PBKDF2_ITERATIONS);
  const verifier = await encryptStr(key, VERIFY_STRING);
  return { key, saltB64, config: { salt: saltB64, verifier, iterations: PBKDF2_ITERATIONS } };
}

async function deriveKey(password, saltB64, iterations){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt: unb64(saltB64), iterations: iterations || PBKDF2_ITERATIONS, hash:'SHA-256' },
    baseKey,
    { name:'AES-GCM', length:256 },
    true, // extractable — required so the optional "keep session across F5" feature can persist the derived key
    ['encrypt','decrypt']
  );
}

// ---------- OPTIONAL: keep session across page reload (F5) ----------
// Off by default. The derived AES key never touches localStorage/disk — it's
// exported to sessionStorage only, which the browser wipes the moment the tab
// is actually closed (unlike localStorage, which survives indefinitely).
// This trades a bit of security for convenience: while the key sits in
// sessionStorage, anyone with access to this exact browser tab (devtools, a
// malicious extension, someone sitting at an unlocked/unattended computer)
// could read it and unlock the vault without the password. Locking (manually
// or via the 30-minute idle timeout) always wipes it immediately, so a proper
// "Khoá" still really locks things even with this feature turned on.
const STORAGE_KEEP_SESSION_PREF_KEY = 'devic3-keep-session';
const SESSION_KEY_STORAGE_KEY = 'devic3-session-key';

async function getKeepSessionPref(){
  try{
    const res = await window.storage.get(STORAGE_KEEP_SESSION_PREF_KEY, false);
    return !!(res && res.value === '1');
  }catch(e){ return false; }
}
async function setKeepSessionPref(on){
  try{ await window.storage.set(STORAGE_KEEP_SESSION_PREF_KEY, on ? '1' : '0', false); }catch(e){}
}
async function persistSessionKey(key, saltB64){
  try{
    const raw = await crypto.subtle.exportKey('raw', key);
    sessionStorage.setItem(SESSION_KEY_STORAGE_KEY, JSON.stringify({ key: b64(new Uint8Array(raw)), salt: saltB64 }));
  }catch(e){ console.error(e); }
}
function clearPersistedSessionKey(){
  try{ sessionStorage.removeItem(SESSION_KEY_STORAGE_KEY); }catch(e){}
}
async function tryRestoreSessionKey(expectedSaltB64){
  try{
    const raw = sessionStorage.getItem(SESSION_KEY_STORAGE_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(parsed.salt !== expectedSaltB64) return null; // belongs to a different vault — don't reuse
    const keyBytes = unb64(parsed.key);
    return await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }catch(e){ return null; }
}

async function encryptStr(key, plaintext){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, enc.encode(plaintext));
  return { iv: b64(iv), data: b64(cipher) };
}
async function decryptStr(key, blob){
  if(!blob || typeof blob.iv !== 'string' || typeof blob.data !== 'string'){
    throw new Error('Dữ liệu mã hoá không đúng định dạng.');
  }
  const dec = new TextDecoder();
  const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv: unb64(blob.iv)}, key, unb64(blob.data));
  return dec.decode(plain);
}

function encryptedBlobLooksValid(blob){
  return !!blob && typeof blob === 'object' && typeof blob.iv === 'string' && typeof blob.data === 'string';
}

function configLooksValid(config){
  if(!config || typeof config.salt !== 'string' || !encryptedBlobLooksValid(config.verifier)) return false;
  if(config.iterations !== undefined && (!Number.isInteger(config.iterations) || config.iterations < 10000 || config.iterations > 10000000)) return false;
  try{
    return unb64(config.salt).byteLength >= 16 && unb64(config.verifier.iv).byteLength === 12 && unb64(config.verifier.data).byteLength > 16;
  }catch(e){
    return false;
  }
}

async function readStoredRaw(key){
  const res = await window.storage.get(key);
  return res && typeof res.value === 'string' ? res.value : null;
}

async function writeStoredRaw(key, value){
  if(value === null || value === undefined){
    const result = await window.storage.delete(key, false);
    if(!result) throw new Error(`Không thể xoá dữ liệu ${key}.`);
    return;
  }
  const result = await storageSetWithRetry(key, value);
  if(!result) throw new Error(`Không thể ghi dữ liệu ${key}.`);
}

// Replaces all encrypted vault records as one logical transaction. localStorage
// has no native transactions, so every previous value is snapshotted and restored
// if any write fails. This prevents a half-old/half-new vault.
async function replaceStoredVault(rawValues){
  const keys = [STORAGE_CONFIG_KEY, STORAGE_DATA_KEY, STORAGE_FOLDERS_KEY, STORAGE_NOTES_KEY];
  const before = {};
  for(const key of keys) before[key] = await readStoredRaw(key);
  try{
    for(const key of keys) await writeStoredRaw(key, rawValues[key] ?? null);
  }catch(error){
    const rollbackErrors = [];
    for(const key of keys){
      try{ await writeStoredRaw(key, before[key]); }
      catch(rollbackError){ rollbackErrors.push(rollbackError); }
    }
    if(rollbackErrors.length) throw new Error('Ghi kho thất bại và không thể khôi phục đầy đủ dữ liệu cũ. Hãy tải lại trang và dùng file sao lưu gần nhất.');
    throw error;
  }
}

async function buildEncryptedVaultRaw(config, key, entries, folders, notes){
  const [entriesBlob, foldersBlob, notesBlob] = await Promise.all([
    encryptStr(key, JSON.stringify(entries)),
    encryptStr(key, JSON.stringify(folders)),
    encryptStr(key, JSON.stringify(notes)),
  ]);
  return {
    [STORAGE_CONFIG_KEY]: JSON.stringify(config),
    [STORAGE_DATA_KEY]: JSON.stringify(entriesBlob),
    [STORAGE_FOLDERS_KEY]: JSON.stringify(foldersBlob),
    [STORAGE_NOTES_KEY]: JSON.stringify(notesBlob),
  };
}

async function loadConfig(){
  const res = await window.storage.get(STORAGE_CONFIG_KEY);
  if(res && res.value){
    let config;
    try{ config = JSON.parse(res.value); }
    catch(e){ throw new Error('Cấu hình kho lưu trữ không phải JSON hợp lệ.', { cause: e }); }
    if(!configLooksValid(config)) throw new Error('Cấu hình kho lưu trữ bị hỏng hoặc không đúng định dạng.');
    state.configExists = true;
    return config;
  }
  state.configExists = false;
  return null;
}

async function saveEntries(){
  const json = JSON.stringify(state.entries);
  const blob = await encryptStr(state.key, json);
  try{
    const result = await window.storage.set(STORAGE_DATA_KEY, JSON.stringify(blob));
    if(!result){
      toast('⚠ Lưu dữ liệu thất bại, thử lại');
      recordLog('error', 'storage', 'Không thể lưu thay đổi tài khoản');
      return false;
    }
    if(state.fileHandle) writeVaultFile();
    scheduleGoogleDriveSync();
    return true;
  }catch(e){
    toast('⚠ Lưu dữ liệu thất bại, thử lại');
    recordLog('error', 'storage', 'Không thể lưu thay đổi tài khoản');
    return false;
  }
}

async function loadEntries(){
  const res = await window.storage.get(STORAGE_DATA_KEY);
  if(res && res.value){
    try{
      const blob = JSON.parse(res.value);
      const json = await decryptStr(state.key, blob);
      state.entries = JSON.parse(json);
      if(!Array.isArray(state.entries)) throw new Error('Danh sách tài khoản không hợp lệ.');
      state.entries.forEach(e => { if(!e.platform) e.platform = 'facebook'; });
      // one-time migration: accounts saved before "ngày nhập tài khoản" existed
      // don't have a createdAt — best available fallback is their updatedAt
      // (or now, if even that's missing), so the date shown is never blank.
      let migratedDates = false;
      state.entries.forEach(e => {
        if(!e.createdAt){ e.createdAt = e.updatedAt || Date.now(); migratedDates = true; }
      });
      // one-time auto-repair: fix Facebook accounts whose Email field actually
      // holds a cookie/token dump (or an email/2FA/UID that landed in the wrong
      // column) from a previous bad paste, so old broken entries self-heal too.
      let repaired = false;
      state.entries.forEach(e => {
        if(e.platform !== 'facebook') return;
        const before = JSON.stringify([e.fbName, e.twoFA, e.email, e.secondaryEmail, e.cookie]);
        Object.assign(e, smartCorrectFacebookFields(e));
        const after = JSON.stringify([e.fbName, e.twoFA, e.email, e.secondaryEmail, e.cookie]);
        if(before !== after) repaired = true;
      });
      // one-time auto-repair: Gmail didn't have a dedicated 2FA field until
      // now — anyone who pasted a 2FA secret before this update had it land
      // in "Email phụ" instead (the next column over). If that field holds
      // something 2FA-secret-shaped rather than a real email, move it over.
      let gmailRepaired = false;
      state.entries.forEach(e => {
        if(e.platform !== 'gmail') return;
        if(!e.twoFA && e.secondaryEmail && !looksLikeEmail(e.secondaryEmail) && looksLike2FASecret(e.secondaryEmail)){
          e.twoFA = e.secondaryEmail;
          e.secondaryEmail = '';
          gmailRepaired = true;
        }
      });
      if(repaired || gmailRepaired || migratedDates){
        if(!await saveEntries()) throw new Error('Không thể lưu dữ liệu sau khi nâng cấp định dạng.');
        const repairMsgs = [];
        if(repaired) repairMsgs.push('dữ liệu bị lệch cột (email/cookie)');
        if(gmailRepaired) repairMsgs.push('mã 2FA Gmail bị lệch ô');
        if(repairMsgs.length) toast('Đã tự động sửa: ' + repairMsgs.join(', '));
      }
      return;
    }catch(e){
      throw new Error('Không thể đọc dữ liệu tài khoản đã mã hoá. Kho có thể bị hỏng; dữ liệu chưa bị ghi đè.', { cause: e });
    }
  }
  state.entries = [];
}

async function saveFolders(){
  const json = JSON.stringify(state.folders);
  const blob = await encryptStr(state.key, json);
  try{
    const result = await window.storage.set(STORAGE_FOLDERS_KEY, JSON.stringify(blob));
    if(!result){
      toast('⚠ Lưu thư mục thất bại, thử lại');
      recordLog('error', 'storage', 'Không thể lưu thay đổi thư mục');
      return false;
    }
    if(state.fileHandle) writeVaultFile();
    scheduleGoogleDriveSync();
    return true;
  }catch(e){
    toast('⚠ Lưu thư mục thất bại, thử lại');
    recordLog('error', 'storage', 'Không thể lưu thay đổi thư mục');
    return false;
  }
}

async function loadFolders(){
  const res = await window.storage.get(STORAGE_FOLDERS_KEY);
  if(res && res.value){
    try{
      const blob = JSON.parse(res.value);
      const json = await decryptStr(state.key, blob);
      state.folders = JSON.parse(json);
      if(!Array.isArray(state.folders)) throw new Error('Danh sách thư mục không hợp lệ.');
      // migrate old folders that have no platformId (were shared) -> assign to facebook
      state.folders.forEach(f => { if(!f.platformId) f.platformId = 'facebook'; });
      return;
    }catch(e){
      throw new Error('Không thể đọc dữ liệu thư mục đã mã hoá. Kho có thể bị hỏng; dữ liệu chưa bị ghi đè.', { cause: e });
    }
  }
  // default folders on first run (belong to Facebook only)
  state.folders = [
    { id: uid(), name: 'Tài khoản mới', platformId: 'facebook' },
    { id: uid(), name: 'Tài khoản cũ', platformId: 'facebook' }
  ];
}

async function saveNotes(){
  const json = JSON.stringify(state.notes);
  const blob = await encryptStr(state.key, json);
  try{
    const result = await window.storage.set(STORAGE_NOTES_KEY, JSON.stringify(blob));
    if(!result){
      toast('⚠ Lưu ghi chú thất bại, thử lại');
      recordLog('error', 'storage', 'Không thể lưu thay đổi ghi chú');
      return false;
    }
    if(state.fileHandle) writeVaultFile();
    scheduleGoogleDriveSync();
    return true;
  }catch(e){
    toast('⚠ Lưu ghi chú thất bại, thử lại');
    recordLog('error', 'storage', 'Không thể lưu thay đổi ghi chú');
    return false;
  }
}

async function loadNotes(){
  const res = await window.storage.get(STORAGE_NOTES_KEY);
  if(res && res.value){
    try{
      const blob = JSON.parse(res.value);
      const json = await decryptStr(state.key, blob);
      state.notes = JSON.parse(json);
      if(!Array.isArray(state.notes)) throw new Error('Danh sách ghi chú không hợp lệ.');
      return;
    }catch(e){
      throw new Error('Không thể đọc dữ liệu ghi chú đã mã hoá. Kho có thể bị hỏng; dữ liệu chưa bị ghi đè.', { cause: e });
    }
  }
  state.notes = [];
}

// Logs deliberately live in their own encrypted, device-local record. Keeping
// them out of the Drive vault avoids a feedback loop where "sync completed"
// creates another sync write, and prevents one device's diagnostics from
// overwriting another device's history.
const LOG_LIMIT = 500;
let logSaveTimer = null;
let logRenderTimer = null;
const pendingRuntimeLogs = [];

function sanitizeLogText(value, maxLength = 260){
  let text = String(value == null ? '' : value);
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]');
  text = text.replace(/([?&](?:token|key|code|secret|password|pass|cookie)=)[^&\s]+/gi, '$1[redacted]');
  text = text.replace(/\b[A-Za-z0-9_\-+/=]{32,}\b/g, '[redacted]');
  return text.trim().slice(0, maxLength);
}

function makeLogEntry(level, category, message, detail = ''){
  const safeLevel = ['info', 'warn', 'error'].includes(level) ? level : 'info';
  return {
    id: uid(),
    time: Date.now(),
    level: safeLevel,
    category: sanitizeLogText(category || 'system', 40) || 'system',
    message: sanitizeLogText(message || 'Hoạt động không có mô tả'),
    detail: sanitizeLogText(detail, 180),
    count: 1
  };
}

function scheduleLogSave(){
  clearTimeout(logSaveTimer);
  logSaveTimer = setTimeout(() => saveLogs(), 180);
}

function recordLog(level, category, message, detail = ''){
  const item = makeLogEntry(level, category, message, detail);
  if(!state.key){
    pendingRuntimeLogs.unshift(item);
    if(pendingRuntimeLogs.length > 30) pendingRuntimeLogs.length = 30;
    return;
  }
  const previous = state.logs[0];
  if(previous && previous.level === item.level && previous.category === item.category && previous.message === item.message && previous.detail === item.detail && item.time - previous.time < 30000){
    previous.time = item.time;
    previous.count = Number(previous.count || 1) + 1;
  }else{
    state.logs.unshift(item);
  }
  if(state.logs.length > LOG_LIMIT) state.logs.length = LOG_LIMIT;
  scheduleLogSave();
  if(state.activePlatform === 'log' && !logRenderTimer){
    logRenderTimer = setTimeout(() => {
      logRenderTimer = null;
      if(state.key && state.activePlatform === 'log') renderLogVault();
    }, 0);
  }
}

async function saveLogs(){
  if(!state.key) return false;
  try{
    const blob = await encryptStr(state.key, JSON.stringify(state.logs.slice(0, LOG_LIMIT)));
    const result = await window.storage.set(STORAGE_LOGS_KEY, JSON.stringify(blob));
    return !!result;
  }catch(_error){
    return false;
  }
}

async function loadLogs(){
  state.logs = [];
  try{
    const result = await window.storage.get(STORAGE_LOGS_KEY);
    if(result && result.value){
      const blob = JSON.parse(result.value);
      const decoded = JSON.parse(await decryptStr(state.key, blob));
      if(Array.isArray(decoded)) state.logs = decoded.slice(0, LOG_LIMIT);
    }
  }catch(_error){
    state.logs = [];
    pendingRuntimeLogs.unshift(makeLogEntry('warn', 'storage', 'Không đọc được log cũ của thiết bị; dữ liệu tài khoản không bị ảnh hưởng'));
  }
  if(pendingRuntimeLogs.length){
    state.logs = [...pendingRuntimeLogs.splice(0), ...state.logs].slice(0, LOG_LIMIT);
    await saveLogs();
  }
}

window.addEventListener('error', event => {
  const file = event.filename ? String(event.filename).split('/').pop() : 'HubAccounts.html';
  const locationText = [file, event.lineno || '', event.colno || ''].filter(Boolean).join(':');
  recordLog('error', 'source', event.message || 'Lỗi JavaScript không xác định', locationText);
});
window.addEventListener('unhandledrejection', event => {
  const reason = event.reason;
  const message = reason && reason.message ? reason.message : 'Promise bị từ chối nhưng chưa được xử lý';
  recordLog('error', 'source', message, 'unhandledrejection');
});

// ---------- SHARED UI HELPERS (escaping, ids, clipboard, downloads, dialogs, saving) ----------
function escapeHtml(s){
  const d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}

function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;'); }


function uid(){
  return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

function folderName(id){
  if(!id) return null;
  const f = state.folders.find(x => x.id === id);
  return f ? f.name : null;
}

function copyText(text, msg, sensitive){
  if(!text){ toast('Không có nội dung để sao chép'); return; }

  const fallbackCopy = () => {
    try{
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if(ok){
        toast(sensitive ? `${msg} (tự xoá khỏi clipboard sau 20s)` : msg);
        if(sensitive) scheduleClipboardAutoClear(text);
      } else {
        toast('Không thể sao chép tự động — hãy bôi đen và copy thủ công (Ctrl+C)');
      }
    }catch(err){
      toast('Không thể sao chép tự động — hãy bôi đen và copy thủ công (Ctrl+C)');
    }
  };

  if(navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext){
    navigator.clipboard.writeText(text).then(() => {
      toast(sensitive ? `${msg} (tự xoá khỏi clipboard sau 20s)` : msg);
      if(sensitive) scheduleClipboardAutoClear(text);
    }).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function downloadTextFile(content, filename){
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  recordLog('info', 'export', 'Đã xuất một file dữ liệu');
}

function showConfirm(title, message, onConfirm, confirmLabel, danger = true){
  const modalBg = document.getElementById('modalBg');
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <p style="font-size:14px; color:var(--text-2); line-height:1.6; margin:0 0 20px;">${escapeHtml(message)}</p>
    <div class="row">
      <button id="confirmCancelBtn" style="flex:1">${t('btn_cancel')}</button>
      <button class="text-btn ${danger ? 'danger' : 'primary'}" id="confirmOkBtn" data-primary-action style="flex:1; padding:9px 16px;">${escapeHtml(confirmLabel || t('btn_delete'))}</button>
    </div>
  `;
  modalBg.classList.add('show');
  document.getElementById('confirmCancelBtn').onclick = closeModal;
  document.getElementById('confirmOkBtn').onclick = () => {
    closeModal();
    onConfirm();
  };
}

let totpToolInterval = null; // tracks the live-refresh timer used by the 2FA decoder tool
function closeModal(){
  document.getElementById('modalBg').classList.remove('show');
  if(totpToolInterval){ clearInterval(totpToolInterval); totpToolInterval = null; }
}

async function commitCollection(property, nextValue, saveFn){
  const previousValue = state[property];
  state[property] = nextValue;
  const saved = await saveFn();
  if(!saved){
    state[property] = previousValue;
    return false;
  }
  return true;
}

async function commitCollections(changes){
  const previous = {};
  for(const change of changes){
    previous[change.property] = state[change.property];
    state[change.property] = change.nextValue;
  }
  const savedChanges = [];
  for(const change of changes){
    if(await change.saveFn()){
      savedChanges.push(change);
      continue;
    }
    for(const item of changes) state[item.property] = previous[item.property];
    for(const saved of savedChanges) await saved.saveFn();
    return false;
  }
  return true;
}

