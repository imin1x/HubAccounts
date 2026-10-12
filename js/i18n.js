// HubAccounts — Vietnamese / English strings and language switching.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- i18n (Vietnamese / English) ----------
const STORAGE_LANG_KEY = 'devic3-lang';
const I18N = {
  // shell / chrome
  sidebar_platforms:      { vi: 'Nền tảng',              en: 'Platforms' },
  sidebar_locked:         { vi: 'Chưa mở khoá',              en: 'Locked' },
  status_locked:          { vi: 'Chưa mở khoá',              en: 'Locked' },
  status_unlocked:        { vi: 'Đã mở khoá',                en: 'Unlocked' },
  status_duplicates:      { vi: 'trùng lặp',                 en: 'duplicates' },
  status_expiring:        { vi: 'sắp hết hạn',                en: 'expiring soon' },
  status_accounts:        { vi: 'tài khoản',                 en: 'accounts' },
  // setup / unlock screens
  setup_comment:          { vi: 'Tạo kho lưu trữ mới, mã hoá AES-256', en: 'Create a new vault, AES-256 encrypted' },
  unlock_comment:         { vi: 'Nhập mật khẩu chính để mở khoá', en: 'Enter your master password to unlock' },
  breadcrumb_setup:       { vi: 'Tạo kho mới',                en: 'Create vault' },
  breadcrumb_unlock:      { vi: 'Mở khoá',                    en: 'Unlock' },
  label_create_pw:        { vi: 'Tạo mật khẩu chính',          en: 'Create master password' },
  label_confirm_pw:       { vi: 'Nhập lại mật khẩu',           en: 'Confirm password' },
  placeholder_min6:       { vi: 'Ít nhất 6 ký tự',             en: 'At least 6 characters' },
  placeholder_confirm:    { vi: 'Nhập lại để xác nhận',        en: 'Re-enter to confirm' },
  hint_pw_not_saved:      { vi: 'Mật khẩu này không được lưu ở đâu cả — nếu quên, dữ liệu đã lưu sẽ không thể khôi phục.', en: "This password isn't stored anywhere — if you forget it, saved data can't be recovered." },
  btn_create_vault:       { vi: 'Tạo kho lưu trữ',             en: 'Create vault' },
  btn_restore_backup:     { vi: 'Đã có kho lưu trữ? Khôi phục từ file sao lưu', en: 'Already have a vault? Restore from a backup file' },
  label_master_pw:        { vi: 'Mật Khẩu',                    en: 'Password' },
  placeholder_enter_pw:   { vi: 'Nhập mật khẩu',               en: 'Enter password' },
  btn_unlock:             { vi: 'Mở khoá',                     en: 'Unlock' },
  keep_session_label:     { vi: 'Giữ đăng nhập khi tải lại trang (F5)', en: 'Keep me signed in across page reload (F5)' },
  keep_session_hint:      { vi: 'Chỉ áp dụng cho tab này — tự xoá khi bạn đóng tab hoặc bấm "Khoá". Người dùng chung máy trong lúc bạn chưa khoá vẫn xem được dữ liệu, hãy cân nhắc trước khi bật.', en: 'Only applies to this browser tab — cleared the moment you close the tab or press "Lock". Anyone using this computer before you lock it could still see your data, so consider this before turning it on.' },
  // main vault topbar
  comment_input_data:     { vi: 'Nhập dữ liệu',             en: 'Input data' },
  comment_status:         { vi: 'Trạng thái',               en: 'Status' },
  comment_account_list:   { vi: 'Danh sách tài khoản',      en: 'Account list' },
  comment_notes:          { vi: 'Ghi chú',                  en: 'Notes' },
  placeholder_search:     { vi: 'Tìm theo tên hoặc email',     en: 'Search by name or email' },
  placeholder_search_notes: { vi: 'Tìm trong ghi chú',          en: 'Search notes' },
  btn_lock:                { vi: 'Khoá',                        en: 'Lock' },
  btn_select_many:         { vi: 'Chọn nhiều',                  en: 'Select' },
  btn_select_done:         { vi: 'Xong',                        en: 'Done' },
  btn_file_backup:         { vi: 'Sao lưu / Đồng bộ',           en: 'Backup / Sync' },
  btn_file_linked:         { vi: 'Sao lưu / Đồng bộ',           en: 'Backup / Sync' },
  btn_tools:               { vi: 'Công cụ',                     en: 'Tools' },
  btn_import_export:       { vi: 'Nhập/Xuất',                   en: 'Import/Export' },
  btn_add_note:            { vi: 'Ghi chú mới',                 en: 'New note' },
  btn_export:              { vi: 'Xuất',                        en: 'Export' },
  // folders
  folder_all:              { vi: 'Tất cả',                      en: 'All' },
  folder_uncategorized:    { vi: 'Chưa phân loại',              en: 'Uncategorized' },
  folder_manage:           { vi: 'Quản lý thư mục',             en: 'Manage folders' },
  // status filter
  status_checking:          { vi: 'Đang kiểm tra',                 en: 'Checking' },
  // entry actions
  btn_edit:                 { vi: 'Sửa',                          en: 'Edit' },
  btn_delete:               { vi: 'Xoá',                          en: 'Delete' },
  // common modal buttons
  btn_close:                { vi: 'Đóng',                         en: 'Close' },
  btn_cancel:               { vi: 'Huỷ',                          en: 'Cancel' },
  select_selected:          { vi: 'Đã chọn',                      en: 'Selected' },
  select_all:               { vi: 'Chọn tất cả',                  en: 'Select all' },
  select_clear:             { vi: 'Bỏ chọn',                      en: 'Clear' },
  select_delete:            { vi: 'Xoá đã chọn',                  en: 'Delete selected' },
  title_lock:               { vi: 'Khoá lại',                     en: 'Lock' },
  title_select_many:        { vi: 'Chọn nhiều tài khoản để xoá cùng lúc', en: 'Select multiple accounts to delete at once' },
  title_file_backup:        { vi: 'Sao lưu file và đồng bộ Google Drive', en: 'File backup and Google Drive sync' },
  title_tools:              { vi: 'Công cụ: tạo mật khẩu, mã 2FA', en: 'Tools: password generator, 2FA codes' },
  status_filter_hidden:     { vi: 'Đang ẩn — bấm để hiện lại',      en: 'Hidden — click to show' },
  status_filter_shown:      { vi: 'Đang hiện — bấm để ẩn',          en: 'Shown — click to hide' },
  platform_tools:           { vi: 'Công cụ',                       en: 'Tools' },
  // Read indirectly by statusMeta() as t('status_' + status).
  status_active:            { vi: 'Hoạt động',                    en: 'Active' },
  status_inactive:          { vi: 'Không hoạt động',              en: 'Inactive' },
  status_unknown:           { vi: 'Chưa xác định',                en: 'Unknown' },
  comment_tools:            { vi: 'Công cụ',                    en: 'Tools' },
  tool_pwgen_title:         { vi: 'Tạo mật khẩu ngẫu nhiên',        en: 'Generate random password' },
  tool_2fa_title:           { vi: 'Giải mã mã 2FA',                 en: 'Decode 2FA code' },
};
function t(key){
  const entry = I18N[key];
  if(!entry) return key;
  return entry[state.lang] || entry.vi;
}
async function loadLangPref(){
  try{
    const res = await window.storage.get(STORAGE_LANG_KEY);
    if(res && res.value === 'en') return 'en';
  }catch(e){}
  return 'vi';
}
async function setLangPref(lang){
  state.lang = lang;
  try{ await window.storage.set(STORAGE_LANG_KEY, lang); }catch(e){}
  updateLangSwitchUI();
  // re-render whatever is currently on screen in the new language
  if(state.key){
    renderVault();
  } else {
    renderApp();
  }
}
function updateLangSwitchUI(){
  document.querySelectorAll('.ide-lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === state.lang);
  });
  const themeBtn = document.getElementById('themeToggleBtn');
  if(themeBtn){
    const currentTheme = document.documentElement.dataset.theme || 'dark';
    themeBtn.title = currentTheme === 'light'
      ? (state.lang === 'vi' ? 'Chuyển sang chế độ Tối' : 'Switch to Dark mode')
      : (state.lang === 'vi' ? 'Chuyển sang chế độ Sáng' : 'Switch to Light mode');
  }
}

const STORAGE_CONFIG_KEY = 'fb-vault-config';
const STORAGE_DATA_KEY = 'fb-vault-entries';
const STORAGE_FOLDERS_KEY = 'fb-vault-folders';
const STORAGE_NOTES_KEY = 'fb-vault-notes';
const STORAGE_LOGS_KEY = 'fb-vault-logs-local';
const VERIFY_STRING = 'vault-ok-v1';
const NO_FOLDER_ID = '__none__';

// platforms supported
