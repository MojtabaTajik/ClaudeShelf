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

  async function fetchCleanup() {
    return api('/api/cleanup');
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

  // ===== Helpers =====
  function sumSize(files) {
    return files.reduce((sum, f) => sum + (f.size || 0), 0);
  }

  // Get files matching only the search query (no category filter).
  // Used so category counts reflect search results.
  function getSearchFilteredFiles() {
    let files = state.files;
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

  // ===== Rendering =====
  function renderCategories() {
    const allBtn = categoryNav.querySelector('[data-category=""]');
    categoryNav.innerHTML = '';
    categoryNav.appendChild(allBtn);

    // Use search-filtered files (but NOT category-filtered) so counts react to search
    const base = getSearchFilteredFiles();

    state.categories.forEach((cat) => {
      const catFiles = base.filter(f => f.category === cat.id);
      if (catFiles.length === 0) return;

      const totalSize = formatSize(sumSize(catFiles));
      const btn = document.createElement('button');
      btn.className = 'category-btn' + (state.activeCategory === cat.id ? ' active' : '');
      btn.dataset.category = cat.id;
      btn.innerHTML = `
        ${categoryIcons[cat.id] || categoryIcons.other}
        <span class="category-label">${cat.label}</span>
        <span class="category-size">${totalSize}</span>
        <span class="badge">${catFiles.length}</span>
      `;
      categoryNav.appendChild(btn);
    });

    const allSize = formatSize(sumSize(base));
    badgeAll.textContent = base.length;
    // Update the "All" button to include size
    const allLabel = allBtn.querySelector('.category-size');
    if (allLabel) {
      allLabel.textContent = allSize;
    } else {
      // First render — inject the size span
      const badgeEl = allBtn.querySelector('.badge');
      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'category-size';
      sizeSpan.textContent = allSize;
      allBtn.insertBefore(sizeSpan, badgeEl);
    }
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
    if (e.key === 'Escape') {
      if (cleanupOverlay.style.display !== 'none') {
        closeCleanup();
      } else if (modalOverlay.style.display !== 'none') {
        closeModal();
      }
    }
  });

  // ===== Cleanup Feature =====
  const cleanupBtn = $('#cleanup-btn');
  const cleanupOverlay = $('#cleanup-overlay');
  const cleanupClose = $('#cleanup-close');
  const cleanupLoading = $('#cleanup-loading');
  const cleanupContent = $('#cleanup-content');
  const cleanupSummary = $('#cleanup-summary');
  const cleanupTableWrap = $('#cleanup-table-wrap');
  const cleanupEmpty = $('#cleanup-empty');
  const cleanupFooter = $('#cleanup-footer');
  const cleanupCancel = $('#cleanup-cancel');
  const cleanupDelete = $('#cleanup-delete');
  const cleanupSelectedInfo = $('#cleanup-selected-info');

  const cleanupState = {
    items: [],
    selected: new Set(),
  };

  const reasonLabels = {
    empty_file: 'Empty Files',
    empty_content: 'Empty Content',
    stale: 'Stale Files',
  };

  const reasonDescriptions = {
    empty_file: 'Files with 0 bytes',
    empty_content: 'Files containing only [], {}, null, or whitespace',
    stale: 'Files not modified in 30+ days',
  };

  cleanupBtn.addEventListener('click', openCleanup);
  cleanupClose.addEventListener('click', closeCleanup);
  cleanupCancel.addEventListener('click', closeCleanup);
  cleanupOverlay.addEventListener('click', (e) => {
    if (e.target === cleanupOverlay) closeCleanup();
  });

  async function openCleanup() {
    cleanupOverlay.style.display = 'flex';
    cleanupLoading.style.display = 'flex';
    cleanupContent.style.display = 'none';
    cleanupFooter.style.display = 'none';
    cleanupState.items = [];
    cleanupState.selected.clear();

    try {
      const result = await fetchCleanup();
      cleanupState.items = result.items || [];
      renderCleanupResults(result);
    } catch (err) {
      toast('Cleanup analysis failed: ' + err.message, 'error');
      closeCleanup();
    }
  }

  function closeCleanup() {
    cleanupOverlay.style.display = 'none';
    cleanupState.items = [];
    cleanupState.selected.clear();
  }

  function renderCleanupResults(result) {
    cleanupLoading.style.display = 'none';
    cleanupContent.style.display = 'block';

    if (!result.items || result.items.length === 0) {
      cleanupEmpty.style.display = 'block';
      cleanupSummary.innerHTML = '';
      cleanupTableWrap.innerHTML = '';
      cleanupFooter.style.display = 'none';
      return;
    }

    cleanupEmpty.style.display = 'none';
    cleanupSummary.innerHTML =
      '<strong>' + result.totalCount + '</strong> file' + (result.totalCount !== 1 ? 's' : '') +
      ' suggested for cleanup (' + formatSize(result.totalSize) + ' total)';

    // Group items by reason
    const groups = {};
    result.items.forEach(item => {
      if (!groups[item.reason]) groups[item.reason] = [];
      groups[item.reason].push(item);
    });

    // Build table
    const order = ['empty_file', 'empty_content', 'stale'];
    let tableHtml = '<table class="cleanup-table">' +
      '<thead><tr>' +
        '<th><input type="checkbox" id="cleanup-select-all" checked></th>' +
        '<th>File</th>' +
        '<th>Reason</th>' +
      '</tr></thead><tbody>';

    order.forEach(reason => {
      const items = groups[reason];
      if (!items || items.length === 0) return;

      // Group header row
      tableHtml += '<tr class="cleanup-group-row">' +
        '<td><input type="checkbox" class="group-checkbox" data-reason="' + reason + '" checked></td>' +
        '<td colspan="2"><span class="group-label">' +
          (reasonLabels[reason] || reason) +
          ' <span class="badge">' + items.length + '</span>' +
        '</span><span class="group-desc">' + (reasonDescriptions[reason] || '') + '</span></td>' +
      '</tr>';

      items.forEach(item => {
        cleanupState.selected.add(item.id);
        const tags = buildTagsHtml(item);
        tableHtml += '<tr data-reason="' + reason + '" title="' + escapeHtml(item.relPath) + '">' +
          '<td><input type="checkbox" class="item-checkbox" data-id="' + item.id + '" checked></td>' +
          '<td><span class="cleanup-cell-name">' + escapeHtml(item.displayName || item.name) + '</span>' +
            '<span class="cleanup-cell-tags">' + tags + '</span></td>' +
          '<td><span class="cleanup-reason reason-' + item.reason + '">' + escapeHtml(item.reasonLabel) + '</span></td>' +
        '</tr>';
      });
    });

    tableHtml += '</tbody></table>';
    cleanupTableWrap.innerHTML = tableHtml;

    // Wire up checkboxes
    cleanupTableWrap.addEventListener('change', handleCleanupCheckChange);

    cleanupFooter.style.display = 'flex';
    updateCleanupSelectedInfo();
  }

  function handleCleanupCheckChange(e) {
    const target = e.target;
    const table = cleanupTableWrap.querySelector('table');

    if (target.id === 'cleanup-select-all') {
      // Toggle all items and group checkboxes
      table.querySelectorAll('.group-checkbox, .item-checkbox').forEach(cb => {
        cb.checked = target.checked;
      });
      if (target.checked) {
        cleanupState.items.forEach(item => cleanupState.selected.add(item.id));
      } else {
        cleanupState.selected.clear();
      }
    } else if (target.classList.contains('group-checkbox')) {
      const reason = target.dataset.reason;
      // Toggle all item rows belonging to this group
      table.querySelectorAll('tr[data-reason="' + reason + '"] .item-checkbox').forEach(cb => {
        cb.checked = target.checked;
        if (target.checked) {
          cleanupState.selected.add(cb.dataset.id);
        } else {
          cleanupState.selected.delete(cb.dataset.id);
        }
      });
      syncSelectAll(table);
    } else if (target.classList.contains('item-checkbox')) {
      if (target.checked) {
        cleanupState.selected.add(target.dataset.id);
      } else {
        cleanupState.selected.delete(target.dataset.id);
      }
      // Update group checkbox for this reason
      const reason = target.closest('tr').dataset.reason;
      const groupCb = table.querySelector('.group-checkbox[data-reason="' + reason + '"]');
      const itemBoxes = table.querySelectorAll('tr[data-reason="' + reason + '"] .item-checkbox');
      const allChecked = Array.from(itemBoxes).every(cb => cb.checked);
      const someChecked = Array.from(itemBoxes).some(cb => cb.checked);
      groupCb.checked = allChecked;
      groupCb.indeterminate = someChecked && !allChecked;
      syncSelectAll(table);
    }

    updateCleanupSelectedInfo();
  }

  function syncSelectAll(table) {
    const selectAll = table.querySelector('#cleanup-select-all');
    const allBoxes = table.querySelectorAll('.item-checkbox');
    const allChecked = Array.from(allBoxes).every(cb => cb.checked);
    const someChecked = Array.from(allBoxes).some(cb => cb.checked);
    selectAll.checked = allChecked;
    selectAll.indeterminate = someChecked && !allChecked;
  }

  function updateCleanupSelectedInfo() {
    const count = cleanupState.selected.size;
    const size = cleanupState.items
      .filter(item => cleanupState.selected.has(item.id))
      .reduce((sum, item) => sum + (item.size || 0), 0);
    cleanupSelectedInfo.textContent = count + ' file' + (count !== 1 ? 's' : '') + ' selected (' + formatSize(size) + ')';
    cleanupDelete.disabled = count === 0;
  }

  cleanupDelete.addEventListener('click', async () => {
    const ids = Array.from(cleanupState.selected);
    if (ids.length === 0) return;

    cleanupDelete.disabled = true;
    cleanupDelete.innerHTML = '<span class="spinner"></span> Deleting...';

    try {
      const result = await bulkDeleteApi(ids);
      toast('Cleaned up ' + result.deleted + ' file(s)', 'success');
      if (result.errors && result.errors.length > 0) {
        toast(result.errors.length + ' file(s) failed to delete', 'error');
      }
      closeCleanup();

      // If active file was deleted, clear editor
      if (state.activeFileId && ids.includes(state.activeFileId)) {
        state.activeFileId = null;
        state.activeFile = null;
        editorPane.style.display = 'none';
        emptyState.style.display = 'flex';
      }

      await loadFiles();
    } catch (err) {
      toast('Cleanup delete failed: ' + err.message, 'error');
    } finally {
      cleanupDelete.disabled = false;
      cleanupDelete.innerHTML = 'Delete Selected';
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
