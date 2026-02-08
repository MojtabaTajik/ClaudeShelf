// ClaudeShelf - Frontend Application
(function () {
  'use strict';

  // ===== State =====
  const state = {
    files: [],
    categories: [],
    activeCategory: '',
    activeFileId: null,
    originalContent: '',
    searchQuery: '',
  };

  // ===== DOM Refs =====
  const $ = (sel) => document.querySelector(sel);
  const categoryNav = $('#category-nav');
  const fileList = $('#file-list');
  const searchInput = $('#search-input');
  const rescanBtn = $('#rescan-btn');
  const editorPane = $('#editor-pane');
  const emptyState = $('#empty-state');
  const editorFilename = $('#editor-filename');
  const editorPath = $('#editor-path');
  const editorStatus = $('#editor-status');
  const editorTextarea = $('#editor-textarea');
  const saveBtn = $('#save-btn');
  const scanInfo = $('#scan-info');
  const badgeAll = $('#badge-all');

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

  async function fetchFiles(category = '', search = '') {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    const query = params.toString();
    return api('/api/files' + (query ? '?' + query : ''));
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

  async function rescan() {
    return api('/api/rescan', { method: 'POST' });
  }

  async function fetchCategories() {
    return api('/api/categories');
  }

  // ===== Rendering =====
  function renderCategories() {
    // Keep the "All" button, rebuild the rest
    const allBtn = categoryNav.querySelector('[data-category=""]');
    categoryNav.innerHTML = '';
    categoryNav.appendChild(allBtn);

    state.categories.forEach((cat) => {
      const count = state.files.filter(f => f.category === cat.id).length;
      if (count === 0) return; // hide empty categories

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

    // Update "All" badge and active state
    badgeAll.textContent = state.files.length;
    allBtn.classList.toggle('active', state.activeCategory === '');
  }

  function renderFileList(files) {
    fileList.innerHTML = '';

    if (files.length === 0) {
      fileList.innerHTML = '<li style="padding:20px;text-align:center;color:var(--text-muted);">No files found</li>';
      return;
    }

    // Sort: most recently modified first
    const sorted = [...files].sort((a, b) => new Date(b.modTime) - new Date(a.modTime));

    sorted.forEach((file) => {
      const li = document.createElement('li');
      li.className = 'file-item' + (state.activeFileId === file.id ? ' active' : '');
      li.dataset.id = file.id;

      const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
      const size = formatSize(file.size);
      const time = formatTime(file.modTime);

      li.innerHTML = `
        <div class="file-item-name">
          ${ext ? '<span class="file-ext">' + escapeHtml(ext) + '</span>' : ''}
          ${escapeHtml(file.name)}
        </div>
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
        f.relPath.toLowerCase().includes(q)
      );
    }
    return files;
  }

  function updateView() {
    const filtered = getFilteredFiles();
    renderCategories();
    renderFileList(filtered);
  }

  // ===== Editor =====
  async function openFile(id) {
    state.activeFileId = id;
    updateView();

    editorStatus.textContent = 'Loading...';
    editorStatus.className = 'editor-status';

    try {
      const file = await fetchFile(id);
      emptyState.style.display = 'none';
      editorPane.style.display = 'flex';

      editorFilename.textContent = file.name;
      editorPath.textContent = file.relPath;
      editorTextarea.value = file.content;
      editorTextarea.readOnly = file.readOnly;
      state.originalContent = file.content;

      saveBtn.style.display = file.readOnly ? 'none' : 'inline-flex';
      saveBtn.disabled = true;
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

      // Refresh file list to update metadata
      await loadFiles();
    } catch (err) {
      toast('Save failed: ' + err.message, 'error');
      editorStatus.textContent = 'Save failed';
      editorStatus.className = 'editor-status error';
      saveBtn.disabled = false;
    }
  }

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
    updateView();
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
