// ClaudeShelf - Frontend Application
(function () {
  'use strict';

  // ===== State =====
  const state = {
    files: [],
    categories: [],
    activeCategory: '',
    activeFileId: null,
    activeFile: null,
    originalContent: '',
    searchQuery: '',
  };

  // ===== DOM Refs =====
  const $ = (sel) => document.querySelector(sel);
  const categoryNav = $('#category-nav');
  const fileList = $('#file-list');
  const searchInput = $('#search-input');
  const rescanBtn = $('#rescan-btn');
  const deleteAllBtn = $('#delete-all-btn');
  const editorPane = $('#editor-pane');
  const emptyState = $('#empty-state');
  const editorFilename = $('#editor-filename');
  const editorTags = $('#editor-tags');
  const editorPath = $('#editor-path');
  const editorStatus = $('#editor-status');
  const editorTextarea = $('#editor-textarea');
  const saveBtn = $('#save-btn');
  const deleteBtn = $('#delete-btn');
  const scanInfo = $('#scan-info');
  const badgeAll = $('#badge-all');

  // Modal refs
  const modalOverlay = $('#modal-overlay');
  const modalTitle = $('#modal-title');
  const modalMessage = $('#modal-message');
  const modalFileList = $('#modal-file-list');
  const modalToggleList = $('#modal-toggle-list');
  const modalCancel = $('#modal-cancel');
  const modalConfirm = $('#modal-confirm');
  const modalClose = $('#modal-close');

  // Category label map
  const categoryLabels = {
    memory: 'Memory',
    settings: 'Settings',
    todos: 'Todos',
    plans: 'Plans',
    skills: 'Skills',
    project: 'Project',
    other: 'Other',
  };

  // ===== Category icons (SVG paths) =====
  const categoryIcons = {
    memory: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>',
    settings: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
    todos: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    plans: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
    skills: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    project: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    other: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  };

  // ===== API Layer =====
  async function api(path, options = {}) {
    const res = await fetch(path, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || res.statusText);
    }
    return res.json();
  }

  async function fetchFiles() {
    return api('/api/files');
  }

  async function fetchFile(id) {
    return api('/api/files/' + id);
  }

  async function saveFile(id, content) {
    return api('/api/files/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  }

  async function deleteFileApi(id) {
    return api('/api/files/' + id, { method: 'DELETE' });
  }

  async function bulkDeleteApi(ids) {
    return api('/api/files/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
  }

  async function rescan() {
    return api('/api/rescan', { method: 'POST' });
  }

  async function fetchCategories() {
    return api('/api/categories');
  }

  // ===== Tag HTML Builder =====
  function buildTagsHtml(file) {
    let html = '';
    // Scope tag
    if (file.scope === 'global') {
      html += '<span class="tag tag-scope-global">Global</span>';
    } else if (file.scope === 'project') {
      html += '<span class="tag tag-scope-project">Project</span>';
    }
    // Project name tag
    if (file.projectName) {
      html += '<span class="tag tag-project-name">' + escapeHtml(file.projectName) + '</span>';
    }
    // Category tag
    if (file.category && categoryLabels[file.category]) {
      html += '<span class="tag tag-category">' + categoryLabels[file.category] + '</span>';
    }
    return html;
  }

  // ===== Rendering =====
  function renderCategories() {
    const allBtn = categoryNav.querySelector('[data-category=""]');
    categoryNav.innerHTML = '';
    categoryNav.appendChild(allBtn);

    state.categories.forEach((cat) => {
      const count = state.files.filter(f => f.category === cat.id).length;
      if (count === 0) return;

      const btn = document.createElement('button');
      btn.className = 'category-btn' + (state.activeCategory === cat.id ? ' active' : '');
      btn.dataset.category = cat.id;
      btn.innerHTML = `
        ${categoryIcons[cat.id] || categoryIcons.other}
        ${cat.label}
        <span class="badge">${count}</span>
      `;
      categoryNav.appendChild(btn);
    });

    badgeAll.textContent = state.files.length;
    allBtn.classList.toggle('active', state.activeCategory === '');
  }

  function renderFileList(files) {
    fileList.innerHTML = '';

    if (files.length === 0) {
      fileList.innerHTML = '<li style="padding:20px;text-align:center;color:var(--text-muted);">No files found</li>';
      deleteAllBtn.style.display = 'none';
      return;
    }

    // Show/hide "Delete All" based on visible list
    deleteAllBtn.style.display = (state.searchQuery || state.activeCategory) ? 'inline-flex' : 'none';

    const sorted = [...files].sort((a, b) => new Date(b.modTime) - new Date(a.modTime));

    sorted.forEach((file) => {
      const li = document.createElement('li');
      li.className = 'file-item' + (state.activeFileId === file.id ? ' active' : '');
      li.dataset.id = file.id;

      const size = formatSize(file.size);
      const time = formatTime(file.modTime);

      li.innerHTML = `
        <div class="file-item-title">${escapeHtml(file.displayName || file.name)}</div>
        <div class="file-item-tags">${buildTagsHtml(file)}</div>
        <div class="file-item-path">${escapeHtml(file.relPath)}</div>
        <div class="file-item-meta">
          <span>${size}</span>
          <span>${time}</span>
        </div>
      `;
      fileList.appendChild(li);
    });
  }

  function getFilteredFiles() {
    let files = state.files;
    if (state.activeCategory) {
      files = files.filter(f => f.category === state.activeCategory);
    }
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      files = files.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.relPath.toLowerCase().includes(q) ||
        (f.displayName && f.displayName.toLowerCase().includes(q)) ||
        (f.projectName && f.projectName.toLowerCase().includes(q))
      );
    }
    return files;
  }

  function updateView() {
    const filtered = getFilteredFiles();
    renderCategories();
    renderFileList(filtered);
  }

  // Auto-select first file after filtering
  function autoSelectFirst() {
    const filtered = getFilteredFiles();
    const sorted = [...filtered].sort((a, b) => new Date(b.modTime) - new Date(a.modTime));
    if (sorted.length > 0) {
      openFile(sorted[0].id);
    } else {
      // No files in this category — show empty state
      state.activeFileId = null;
      state.activeFile = null;
      editorPane.style.display = 'none';
      emptyState.style.display = 'flex';
      updateView();
    }
  }

  // ===== Editor =====
  async function openFile(id) {
    state.activeFileId = id;
    updateView();

    editorStatus.textContent = 'Loading...';
    editorStatus.className = 'editor-status';

    try {
      const file = await fetchFile(id);
      state.activeFile = file;
      emptyState.style.display = 'none';
      editorPane.style.display = 'flex';

      editorFilename.textContent = file.displayName || file.name;
      editorTags.innerHTML = buildTagsHtml(file);
      editorPath.textContent = file.relPath;
      editorTextarea.value = file.content;
      editorTextarea.readOnly = file.readOnly;
      state.originalContent = file.content;

      saveBtn.style.display = file.readOnly ? 'none' : 'inline-flex';
      saveBtn.disabled = true;
      deleteBtn.style.display = file.readOnly ? 'none' : 'inline-flex';
      editorStatus.textContent = file.readOnly ? 'Read-only' : '';
      editorStatus.className = 'editor-status';
    } catch (err) {
      toast('Failed to load file: ' + err.message, 'error');
      editorStatus.textContent = 'Error';
      editorStatus.className = 'editor-status error';
    }
  }

  async function handleSave() {
    if (!state.activeFileId) return;
    saveBtn.disabled = true;
    editorStatus.textContent = 'Saving...';
    editorStatus.className = 'editor-status';

    try {
      await saveFile(state.activeFileId, editorTextarea.value);
      state.originalContent = editorTextarea.value;
      editorStatus.textContent = 'Saved';
      editorStatus.className = 'editor-status saved';
      toast('File saved successfully', 'success');
      await loadFiles();
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
      editorStatus.textContent = 'Save failed';
      editorStatus.className = 'editor-status error';
      saveBtn.disabled = false;
    }
  }

  // ===== Delete Single File =====
  async function handleDeleteCurrent() {
    if (!state.activeFile) return;
    const file = state.activeFile;

    showConfirmModal(
      'Delete File',
      'Are you sure you want to delete this file?',
      [file],
      async () => {
        try {
          await deleteFileApi(file.id);
          toast('Deleted: ' + (file.displayName || file.name), 'success');
          state.activeFileId = null;
          state.activeFile = null;
          editorPane.style.display = 'none';
          emptyState.style.display = 'flex';
          // Remove from local state
          state.files = state.files.filter(f => f.id !== file.id);
          updateView();
        } catch (err) {
          toast('Delete failed: ' + err.message, 'error');
        }
      }
    );
  }

  // ===== Bulk Delete =====
  async function handleDeleteAll() {
    const filtered = getFilteredFiles();
    const deletable = filtered.filter(f => !f.readOnly);

    if (deletable.length === 0) {
      toast('No deletable files in current view', 'info');
      return;
    }

    showConfirmModal(
      'Delete All Visible Files',
      'This will permanently delete <strong>' + deletable.length + ' file' + (deletable.length !== 1 ? 's' : '') + '</strong> matching your current filter.',
      deletable,
      async () => {
        try {
          const ids = deletable.map(f => f.id);
          const result = await bulkDeleteApi(ids);
          toast('Deleted ' + result.deleted + ' file(s)', 'success');
          if (result.errors && result.errors.length > 0) {
            toast(result.errors.length + ' file(s) failed to delete', 'error');
          }
          // Refresh
          state.activeFileId = null;
          state.activeFile = null;
          editorPane.style.display = 'none';
          emptyState.style.display = 'flex';
          await loadFiles();
        } catch (err) {
          toast('Bulk delete failed: ' + err.message, 'error');
        }
      }
    );
  }

  // ===== Modal =====
  let modalCallback = null;

  function showConfirmModal(title, message, files, onConfirm) {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message;
    modalCallback = onConfirm;

    // Build file list
    modalFileList.innerHTML = '';
    files.forEach(f => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="mfl-name">' + escapeHtml(f.displayName || f.name) + '</span>' + escapeHtml(f.relPath);
      modalFileList.appendChild(li);
    });

    modalFileList.style.display = 'none';
    modalToggleList.textContent = 'Show file list (' + files.length + ')';

    modalOverlay.style.display = 'flex';
  }

  function closeModal() {
    modalOverlay.style.display = 'none';
    modalCallback = null;
  }

  modalCancel.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  modalToggleList.addEventListener('click', () => {
    const visible = modalFileList.style.display !== 'none';
    modalFileList.style.display = visible ? 'none' : 'block';
    modalToggleList.textContent = (visible ? 'Show' : 'Hide') + ' file list (' + modalFileList.children.length + ')';
  });

  modalConfirm.addEventListener('click', () => {
    if (modalCallback) {
      modalCallback();
    }
    closeModal();
  });

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.style.display !== 'none') {
      closeModal();
    }
  });

  // ===== Data Loading =====
  async function loadFiles() {
    try {
      const [files, categories] = await Promise.all([
        fetchFiles(),
        fetchCategories(),
      ]);
      state.files = files || [];
      state.categories = categories || [];
      scanInfo.textContent = state.files.length + ' file' + (state.files.length !== 1 ? 's' : '') + ' found';
      updateView();
    } catch (err) {
      toast('Failed to load files: ' + err.message, 'error');
    }
  }

  async function handleRescan() {
    rescanBtn.disabled = true;
    rescanBtn.innerHTML = '<span class="spinner"></span> Scanning...';
    try {
      const result = await rescan();
      state.files = result.files || [];
      state.categories = result.categories || [];
      scanInfo.textContent = state.files.length + ' file' + (state.files.length !== 1 ? 's' : '') + ' found';
      updateView();
      toast('Scan complete: ' + state.files.length + ' files found', 'success');
    } catch (err) {
      toast('Rescan failed: ' + err.message, 'error');
    } finally {
      rescanBtn.disabled = false;
      rescanBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Rescan
      `;
    }
  }

  // ===== Event Handlers =====
  categoryNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.category-btn');
    if (!btn) return;
    state.activeCategory = btn.dataset.category;
    autoSelectFirst();
  });

  fileList.addEventListener('click', (e) => {
    const item = e.target.closest('.file-item');
    if (!item) return;
    openFile(item.dataset.id);
  });

  searchInput.addEventListener('input', debounce((e) => {
    state.searchQuery = e.target.value;
    updateView();
  }, 200));

  rescanBtn.addEventListener('click', handleRescan);
  saveBtn.addEventListener('click', handleSave);
  deleteBtn.addEventListener('click', handleDeleteCurrent);
  deleteAllBtn.addEventListener('click', handleDeleteAll);

  editorTextarea.addEventListener('input', () => {
    const modified = editorTextarea.value !== state.originalContent;
    saveBtn.disabled = !modified;
    if (modified) {
      editorStatus.textContent = 'Modified';
      editorStatus.className = 'editor-status modified';
    } else {
      editorStatus.textContent = '';
      editorStatus.className = 'editor-status';
    }
  });

  // Ctrl+S / Cmd+S to save
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (!saveBtn.disabled && state.activeFileId) {
        handleSave();
      }
    }
  });

  // ===== Utilities =====
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatTime(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';

    return d.toLocaleDateString();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = message;
    container.appendChild(el);

    setTimeout(() => {
      el.style.animation = 'slideOut 200ms ease forwards';
      setTimeout(() => el.remove(), 200);
    }, 3000);
  }

  // ===== Init =====
  loadFiles();
})();
