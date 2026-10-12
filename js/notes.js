// HubAccounts — Encrypted notes.
// Classic script: shares the global scope with the other js/*.js files,
// loaded in the order listed in HubAccounts.html.
// ---------- NOTES (free-form documents, like Word notes) ----------
function renderNotesVault(){
  const app = document.getElementById('app');
  const q = state.search.toLowerCase();
  const filtered = state.notes
    .filter(n => !q || (n.title||'').toLowerCase().includes(q) || (n.content||'').toLowerCase().includes(q))
    .sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));

  app.innerHTML = `
    <div class="code-comment" style="font-size:12px; margin-bottom:8px;">${t('comment_notes')}</div>
    <div class="topbar">
      <button class="text-btn" id="lockBtn" title="${t('title_lock')}"><i class="ti ti-lock"></i>${t('btn_lock')}</button>
      <button class="text-btn" id="toolsBtn" title="${t('title_tools')}"><i class="ti ti-tool"></i>${t('btn_tools')}</button>
      <button class="text-btn" id="exportAllNotesBtn" title="Export all notes"><i class="ti ti-download"></i>${t('btn_export')}</button>
      <button class="primary" id="addNoteBtn"><i class="ti ti-plus" style="vertical-align:-2px;font-size:15px"></i> ${t('btn_add_note')}</button>
    </div>
    <div id="list"></div>
  `;

  renderPlatformBar();
  updateIdeChrome();
  document.getElementById('toolsBtn').onclick = openToolsModal;
  syncGlobalSearchBar('notes');
  document.getElementById('lockBtn').onclick = lockVault;
  document.getElementById('exportAllNotesBtn').onclick = exportAllNotes;
  document.getElementById('addNoteBtn').onclick = () => openNoteModal(null);

  const list = document.getElementById('list');
  if(filtered.length === 0){
    list.innerHTML = `<div class="empty"><span class="platform-icon" style="width:40px;height:40px;margin:0 auto 8px;--pcolor:${platformMeta('note').color};">${platformSvg('note')}</span>${state.notes.length===0 ? 'Chưa có ghi chú nào. Nhấn "Ghi chú mới" để bắt đầu.' : 'Không tìm thấy kết quả phù hợp.'}</div>`;
    return;
  }

  list.innerHTML = filtered.map(n => {
    const preview = (n.content || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    const dt = n.updatedAt ? new Date(n.updatedAt) : null;
    const dtStr = dt ? `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` : '';
    return `
    <div class="entry" data-id="${n.id}">
      <div class="entry-top" data-act="open-note" style="cursor:pointer;">
        <div class="entry-info">
          <p class="entry-name"><span class="platform-icon" style="width:20px;height:20px;--pcolor:${platformMeta('note').color};">${platformSvg('note')}</span>${escapeHtml(n.title || '(Chưa có tiêu đề)')}</p>
          <p class="entry-id">${escapeHtml(preview)}${(n.content||'').length > 140 ? '…' : ''}</p>
          ${dtStr ? `<span class="entry-folder"><i class="ti ti-clock" style="font-size:11px;vertical-align:-1px"></i> ${dtStr}</span>` : ''}
        </div>
        <div class="entry-actions">
          <button class="text-btn" data-act="export-note" title="Xuất ghi chú này"><i class="ti ti-download"></i>Xuất</button>
          <button class="text-btn" data-act="edit-note" title="${t('btn_edit')}"><i class="ti ti-edit"></i>${t('btn_edit')}</button>
          <button class="text-btn danger" data-act="delete-note" title="${t('btn_delete')}"><i class="ti ti-trash"></i>${t('btn_delete')}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.entry').forEach(card => {
    const id = card.dataset.id;
    const note = state.notes.find(x => x.id === id);
    card.querySelector('[data-act=open-note]').onclick = (ev) => {
      if(ev.target.closest('[data-act=export-note]') || ev.target.closest('[data-act=edit-note]') || ev.target.closest('[data-act=delete-note]')) return;
      openNoteModal(note);
    };
    card.querySelector('[data-act=edit-note]').onclick = () => openNoteModal(note);
    card.querySelector('[data-act=export-note]').onclick = () => exportSingleNote(note);
    card.querySelector('[data-act=delete-note]').onclick = () => confirmDeleteNote(note);
  });
}

function openNoteModal(note){
  const modalBg = document.getElementById('modalBg');
  modalBg.classList.add('show');
  const modalBody = document.getElementById('modalBody');
  modalBody.innerHTML = `
    <h2>${note ? 'Sửa ghi chú' : 'Ghi chú mới'}</h2>
    <label>Tiêu đề</label>
    <input type="text" id="noteTitle" placeholder="Tiêu đề ghi chú" value="${escapeAttr(note ? note.title : '')}">
    <label>Nội dung</label>
    <textarea id="noteContent" style="min-height:280px; font-family:inherit; line-height:1.6;" placeholder="Nhập nội dung...">${escapeHtml(note ? note.content : '')}</textarea>
    <p class="err" id="noteErr"></p>
    <div class="row">
      <button id="noteCancelBtn" style="flex:1">Huỷ</button>
      <button class="primary" id="noteSaveBtn" data-primary-action style="flex:1">Lưu</button>
    </div>
  `;
  document.getElementById('noteCancelBtn').onclick = closeModal;
  document.getElementById('noteSaveBtn').onclick = async () => {
    const title = document.getElementById('noteTitle').value.trim();
    const content = document.getElementById('noteContent').value;
    const err = document.getElementById('noteErr');
    err.style.display = 'none';
    if(!title && !content.trim()){
      err.textContent = 'Nhập ít nhất tiêu đề hoặc nội dung.';
      err.style.display = 'block';
      return;
    }
    const nextNotes = note
      ? state.notes.map(n => n.id === note.id ? { ...n, title, content, updatedAt: Date.now() } : n)
      : [...state.notes, { id: uid(), title, content, updatedAt: Date.now() }];
    if(!await commitCollection('notes', nextNotes, saveNotes)) return;
    recordLog('info', 'note', note ? 'Đã cập nhật một ghi chú' : 'Đã thêm một ghi chú');
    closeModal();
    renderVault();
    toast('Đã lưu ghi chú');
  };
}

function confirmDeleteNote(note){
  showConfirm(
    'Xoá ghi chú?',
    `Bạn có chắc chắn muốn xoá ghi chú "${note.title || '(chưa có tiêu đề)'}"? Hành động này không thể hoàn tác.`,
    async () => {
      const nextNotes = state.notes.filter(n => n.id !== note.id);
      if(!await commitCollection('notes', nextNotes, saveNotes)) return;
      recordLog('info', 'note', 'Đã xoá một ghi chú');
      renderVault();
      toast('Đã xoá ghi chú');
    }
  );
}

function exportSingleNote(note){
  showConfirm(
    'Xuất ghi chú này?',
    `Tải ghi chú "${note.title || '(chưa có tiêu đề)'}" ra file văn bản.`,
    () => {
      const content = `${note.title || '(Chưa có tiêu đề)'}\n${'='.repeat(30)}\n\n${note.content || ''}`;
      const safeName = (note.title || 'ghi-chu').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40) || 'ghi-chu';
      downloadTextFile(content, `hubaccounts-note-${safeName}.txt`);
      toast('Đã xuất ghi chú');
    },
    'Xuất file',
    false
  );
}

function exportAllNotes(){
  if(state.notes.length === 0){
    toast('Chưa có ghi chú nào để xuất');
    return;
  }
  showConfirm(
    'Xuất toàn bộ ghi chú?',
    `File xuất ra sẽ chứa toàn bộ ${state.notes.length} ghi chú.`,
    () => {
      const lines = [`# HubAccounts - Ghi chú`, `# Xuất lúc: ${new Date().toLocaleString('vi-VN')}`, ''];
      state.notes.slice().sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0)).forEach(n => {
        lines.push(`## ${n.title || '(Chưa có tiêu đề)'}`);
        lines.push(n.content || '');
        lines.push('');
        lines.push('---');
        lines.push('');
      });
      const date = new Date();
      const ds = `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}-${String(date.getHours()).padStart(2,'0')}${String(date.getMinutes()).padStart(2,'0')}`;
      downloadTextFile(lines.join('\n'), `hubaccounts-notes-${ds}.txt`);
      toast('Đã xuất toàn bộ ghi chú');
    },
    'Xuất file',
    false
  );
}


// SECURITY: auto-clears the clipboard a short while after copying sensitive
// data (passwords, cookies, tokens, 2FA codes) — a copied secret doesn't
// linger on the clipboard indefinitely where another app or a shared/public
// computer's next user could accidentally paste it somewhere. Only clears if
// the clipboard still holds exactly what we copied (so it never wipes
// something else the person copied afterwards).
const CLIPBOARD_AUTOCLEAR_MS = 20000;
function scheduleClipboardAutoClear(text){
  if(!(navigator.clipboard && navigator.clipboard.readText && navigator.clipboard.writeText && window.isSecureContext)) return;
  setTimeout(async () => {
    try{
      const current = await navigator.clipboard.readText();
      if(current === text){
        await navigator.clipboard.writeText('');
      }
    }catch(e){
      // clipboard read can be denied/unavailable (e.g. tab lost focus) — nothing to do
    }
  }, CLIPBOARD_AUTOCLEAR_MS);
}

