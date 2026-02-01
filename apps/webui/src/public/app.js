// apps/webui/src/public/app.js
// memextend Web UI Frontend
// Copyright (c) 2026 ZodTTD LLC. MIT License.

const API_BASE = '/api';

// State
const state = {
  currentView: 'dashboard',
  memories: [],
  projects: [],
  globalProfiles: [],
  stats: null,
  settings: null,
  pagination: {
    limit: 50,
    offset: 0,
    total: 0
  },
  filters: {
    projectId: '',
    type: '',
    tool: '',
    startDate: '',
    endDate: ''
  },
  selectedMemory: null
};

// API Helpers
async function api(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'API Error');
    }

    return await response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// Toast Notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Format date
function formatDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Format short date
function formatShortDate(isoDate) {
  const date = new Date(isoDate);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}

// Truncate text
function truncate(text, maxLength = 150) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Navigation
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(view) {
  state.currentView = view;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Update views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${view}`);
  });

  // Load view data
  switch (view) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'memories':
      loadMemories();
      loadProjects();
      break;
    case 'search':
      loadProjects();
      break;
    case 'global':
      loadGlobalProfiles();
      break;
    case 'settings':
      loadSettings();
      break;
  }
}

// Dashboard
async function loadDashboard() {
  try {
    const stats = await api('/stats');
    state.stats = stats;
    renderDashboard(stats);
  } catch (error) {
    showToast('Failed to load dashboard', 'error');
  }
}

function renderDashboard(stats) {
  // Stats cards
  document.getElementById('stat-memories').textContent = stats.overview.totalMemories.toLocaleString();
  document.getElementById('stat-vectors').textContent = stats.overview.totalVectors.toLocaleString();
  document.getElementById('stat-projects').textContent = stats.overview.totalProjects.toLocaleString();
  document.getElementById('stat-storage').textContent = stats.storage.total.sizeFormatted;

  // Activity chart
  const chartContainer = document.getElementById('activity-chart');
  const dates = Object.keys(stats.activity.dateDistribution).sort();
  const maxCount = Math.max(...Object.values(stats.activity.dateDistribution), 1);

  chartContainer.innerHTML = dates.map(date => {
    const count = stats.activity.dateDistribution[date];
    const height = (count / maxCount) * 100;
    return `<div class="activity-bar" style="height: ${Math.max(height, 4)}%" data-count="${count}" title="${formatShortDate(date)}: ${count}"></div>`;
  }).join('');

  // Type breakdown
  const typeBreakdown = document.getElementById('type-breakdown');
  typeBreakdown.innerHTML = Object.entries(stats.breakdowns.byType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `
      <div class="breakdown-item">
        <span class="breakdown-label">${type}</span>
        <span class="breakdown-value">${count}</span>
      </div>
    `).join('') || '<div class="empty-state">No data</div>';

  // Source breakdown
  const sourceBreakdown = document.getElementById('source-breakdown');
  sourceBreakdown.innerHTML = Object.entries(stats.breakdowns.bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([source, count]) => `
      <div class="breakdown-item">
        <span class="breakdown-label">${source}</span>
        <span class="breakdown-value">${count}</span>
      </div>
    `).join('') || '<div class="empty-state">No data</div>';

  // Recent memories
  const recentMemories = document.getElementById('recent-memories');
  if (stats.recentMemories.length === 0) {
    recentMemories.innerHTML = '<div class="empty-state">No memories yet</div>';
  } else {
    recentMemories.innerHTML = stats.recentMemories.map(m => `
      <div class="memory-item" data-id="${m.id}">
        <div class="memory-item-header">
          <div class="memory-item-meta">
            <span class="memory-type-badge ${m.type}">${m.type}</span>
          </div>
          <span class="memory-date">${formatDate(m.createdAt)}</span>
        </div>
        <div class="memory-content">${escapeHtml(m.preview)}</div>
      </div>
    `).join('');
  }

  // Model status
  const modelStatus = document.getElementById('model-status');
  modelStatus.innerHTML = `
    <div class="model-status-indicator ${stats.embedding.modelAvailable ? 'available' : 'unavailable'}"></div>
    <div class="model-status-text">
      <strong>${stats.embedding.modelName}</strong>
      <span style="color: var(--text-secondary);">
        - ${stats.embedding.modelAvailable ? 'Ready' : 'Not downloaded (using fallback)'}
      </span>
    </div>
  `;
}

// Memories
async function loadMemories() {
  try {
    const params = new URLSearchParams({
      limit: state.pagination.limit,
      offset: state.pagination.offset
    });

    if (state.filters.projectId) params.append('projectId', state.filters.projectId);
    if (state.filters.type) params.append('type', state.filters.type);
    if (state.filters.tool) params.append('tool', state.filters.tool);
    if (state.filters.startDate) params.append('startDate', state.filters.startDate);
    if (state.filters.endDate) params.append('endDate', state.filters.endDate);

    const result = await api(`/memories?${params}`);
    state.memories = result.memories;
    state.pagination = { ...state.pagination, ...result.pagination };

    renderMemories();
  } catch (error) {
    showToast('Failed to load memories', 'error');
  }
}

function renderMemories() {
  const container = document.getElementById('memories-list');

  if (state.memories.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No memories found</h3>
        <p>Try adjusting your filters or search criteria.</p>
      </div>
    `;
    document.getElementById('memories-pagination').innerHTML = '';
    return;
  }

  container.innerHTML = state.memories.map(m => `
    <div class="memory-item" data-id="${m.id}">
      <div class="memory-item-header">
        <div class="memory-item-meta">
          <span class="memory-type-badge ${m.type}">${m.type}</span>
          ${m.sourceTool ? `<span class="memory-source">${m.sourceTool}</span>` : ''}
        </div>
        <span class="memory-date">${formatDate(m.createdAt)}</span>
      </div>
      <div class="memory-content">${escapeHtml(truncate(m.content, 200))}</div>
      <div class="memory-id">ID: ${m.id}</div>
    </div>
  `).join('');

  // Pagination
  const paginationContainer = document.getElementById('memories-pagination');
  const totalPages = Math.ceil(state.pagination.total / state.pagination.limit);
  const currentPage = Math.floor(state.pagination.offset / state.pagination.limit) + 1;

  paginationContainer.innerHTML = `
    <button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">Previous</button>
    <span class="page-info">Page ${currentPage} of ${totalPages} (${state.pagination.total} total)</span>
    <button ${!state.pagination.hasMore ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">Next</button>
  `;
}

function goToPage(page) {
  state.pagination.offset = (page - 1) * state.pagination.limit;
  loadMemories();
}

// Projects
async function loadProjects() {
  try {
    const result = await api('/projects');
    state.projects = result.projects;
    populateProjectSelectors();
  } catch (error) {
    console.error('Failed to load projects:', error);
  }
}

function populateProjectSelectors() {
  const selectors = [
    document.getElementById('filter-project'),
    document.getElementById('search-project')
  ];

  selectors.forEach(selector => {
    if (!selector) return;

    const currentValue = selector.value;
    selector.innerHTML = `<option value="">${selector.id === 'filter-project' ? 'All Projects' : 'Select Project'}</option>`;

    state.projects.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = `${p.name} (${p.memoryCount})`;
      selector.appendChild(option);
    });

    selector.value = currentValue;
  });
}

// Filters
function setupFilters() {
  const filterProject = document.getElementById('filter-project');
  const deleteProjectBtn = document.getElementById('delete-project-btn');

  document.getElementById('apply-filters').addEventListener('click', () => {
    state.filters.projectId = filterProject.value;
    state.filters.type = document.getElementById('filter-type').value;
    state.filters.tool = document.getElementById('filter-tool').value;
    state.filters.startDate = document.getElementById('filter-start-date').value;
    state.filters.endDate = document.getElementById('filter-end-date').value;
    state.pagination.offset = 0;
    loadMemories();
  });

  document.getElementById('clear-filters').addEventListener('click', () => {
    filterProject.value = '';
    document.getElementById('filter-type').value = '';
    document.getElementById('filter-tool').value = '';
    document.getElementById('filter-start-date').value = '';
    document.getElementById('filter-end-date').value = '';
    state.filters = { projectId: '', type: '', tool: '', startDate: '', endDate: '' };
    state.pagination.offset = 0;
    deleteProjectBtn.style.display = 'none';
    loadMemories();
  });

  // Show/hide delete project button when project is selected
  filterProject.addEventListener('change', () => {
    deleteProjectBtn.style.display = filterProject.value ? 'inline-block' : 'none';
  });

  // Delete project button
  deleteProjectBtn.addEventListener('click', () => {
    const projectId = filterProject.value;
    if (!projectId) return;

    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;

    document.getElementById('delete-project-name').textContent = project.name;
    document.getElementById('delete-project-count').textContent = project.memoryCount;
    document.getElementById('delete-project-modal').classList.add('active');
    state.selectedProjectToDelete = projectId;
  });
}

// Setup delete project modal
function setupDeleteProjectModal() {
  const modal = document.getElementById('delete-project-modal');

  document.getElementById('cancel-delete-project').addEventListener('click', closeModals);

  document.getElementById('confirm-delete-project').addEventListener('click', async () => {
    if (state.selectedProjectToDelete) {
      await deleteProject(state.selectedProjectToDelete);
      state.selectedProjectToDelete = null;
      document.getElementById('filter-project').value = '';
      document.getElementById('delete-project-btn').style.display = 'none';
      state.filters.projectId = '';
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModals();
  });
}

// Setup clear global profile modal
function setupClearGlobalModal() {
  const modal = document.getElementById('clear-global-modal');
  const clearBtn = document.getElementById('clear-global-btn');

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      document.getElementById('clear-global-count').textContent = state.globalProfiles.length;
      modal.classList.add('active');
    });
  }

  document.getElementById('cancel-clear-global').addEventListener('click', closeModals);

  document.getElementById('confirm-clear-global').addEventListener('click', clearAllGlobalProfiles);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModals();
  });
}

// Search
function setupSearch() {
  const searchBtn = document.getElementById('search-btn');
  const searchInput = document.getElementById('search-input');

  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
}

async function performSearch() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) {
    showToast('Please enter a search query', 'info');
    return;
  }

  const scope = document.querySelector('input[name="search-scope"]:checked').value;
  const projectId = document.getElementById('search-project').value;

  const container = document.getElementById('search-results');
  const infoContainer = document.getElementById('search-info');

  container.innerHTML = '<div class="loading">Searching...</div>';
  infoContainer.innerHTML = '';

  try {
    const params = new URLSearchParams({ q: query, scope, limit: 20 });
    if (scope === 'project' && projectId) {
      params.append('projectId', projectId);
    }

    const result = await api(`/search?${params}`);

    if (result.results.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No results found</h3>
          <p>Try a different search query or scope.</p>
        </div>
      `;
    } else {
      container.innerHTML = result.results.map(r => {
        if (r.type === 'global_profile') {
          return `
            <div class="global-item">
              <div class="global-item-header">
                <span class="global-key-badge">${r.item.key}</span>
                <span class="memory-date">${formatDate(r.item.createdAt)}</span>
              </div>
              <div class="global-content">${escapeHtml(r.item.content)}</div>
            </div>
          `;
        }

        return `
          <div class="memory-item" data-id="${r.item.id}">
            <div class="memory-item-header">
              <div class="memory-item-meta">
                <span class="memory-type-badge ${r.item.type}">${r.item.type}</span>
                <span class="search-score">Score: ${r.score.toFixed(3)}</span>
                <span class="memory-source">${r.source}</span>
              </div>
              <span class="memory-date">${formatDate(r.item.createdAt)}</span>
            </div>
            <div class="memory-content">${escapeHtml(truncate(r.item.content, 200))}</div>
            <div class="memory-id">ID: ${r.item.id}</div>
          </div>
        `;
      }).join('');
    }

    infoContainer.innerHTML = `
      Found ${result.total} results for "<strong>${escapeHtml(query)}</strong>"
      (Scope: ${scope}${result.usingRealEmbeddings ? '' : ' - using fallback embeddings'})
    `;
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><h3>Search failed</h3><p>${error.message}</p></div>`;
    showToast('Search failed', 'error');
  }
}

// Global Profiles
async function loadGlobalProfiles() {
  try {
    const result = await api('/stats/global');
    state.globalProfiles = result.profiles;
    renderGlobalProfiles();
  } catch (error) {
    showToast('Failed to load global profiles', 'error');
  }
}

function renderGlobalProfiles() {
  const container = document.getElementById('global-profiles');
  const clearBtn = document.getElementById('clear-global-btn');

  // Show/hide clear button based on whether there are profiles
  if (clearBtn) {
    clearBtn.style.display = state.globalProfiles.length > 0 ? 'inline-block' : 'none';
  }

  if (state.globalProfiles.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>No global profiles yet</h3>
        <p>Use Claude's memextend_save_global tool to add cross-project preferences.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.globalProfiles.map(p => `
    <div class="global-item" data-global-id="${p.id}">
      <div class="global-item-header">
        <span class="global-key-badge">${p.key}</span>
        <span class="memory-date">${formatDate(p.createdAt)}</span>
        <button class="btn btn-danger btn-tiny delete-global-item" data-id="${p.id}" title="Delete this entry">×</button>
      </div>
      <div class="global-content">${escapeHtml(p.content)}</div>
      <div class="memory-id">ID: ${p.id}</div>
    </div>
  `).join('');

  // Add click handlers for individual delete buttons
  container.querySelectorAll('.delete-global-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('Delete this global profile entry?')) {
        await deleteGlobalProfile(id);
      }
    });
  });
}

// Delete a single global profile
async function deleteGlobalProfile(id) {
  try {
    await api(`/stats/global/${id}`, { method: 'DELETE' });
    showToast('Global profile entry deleted', 'success');
    loadGlobalProfiles();
  } catch (error) {
    showToast('Failed to delete global profile entry', 'error');
  }
}

// Clear all global profiles
async function clearAllGlobalProfiles() {
  try {
    const result = await api('/stats/global', { method: 'DELETE' });
    showToast(`Cleared ${result.deleted} global profile entries`, 'success');
    closeModals();
    loadGlobalProfiles();
  } catch (error) {
    showToast('Failed to clear global profiles', 'error');
  }
}

// Delete a project and all its memories
async function deleteProject(projectId) {
  try {
    const result = await api(`/projects/${projectId}`, { method: 'DELETE' });
    showToast(`Deleted project with ${result.memoriesDeleted} memories`, 'success');
    closeModals();
    loadProjects();
    loadMemories();
    if (state.currentView === 'dashboard') {
      loadDashboard();
    }
  } catch (error) {
    showToast('Failed to delete project', 'error');
  }
}

// Memory Modal
function setupModal() {
  const modal = document.getElementById('memory-modal');
  const deleteModal = document.getElementById('delete-modal');

  // Close buttons
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeModals);
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModals);
  document.getElementById('cancel-delete').addEventListener('click', closeModals);

  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModals();
  });
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) closeModals();
  });

  // Save button
  document.getElementById('modal-save').addEventListener('click', saveMemory);

  // Delete button
  document.getElementById('modal-delete').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('active');
  });

  // Confirm delete
  document.getElementById('confirm-delete').addEventListener('click', deleteMemory);

  // Create memory buttons
  document.getElementById('create-memory-btn').addEventListener('click', () => openCreateModal(false));
  document.getElementById('create-global-btn').addEventListener('click', () => openCreateModal(true));

  // Create modal events
  document.getElementById('create-cancel').addEventListener('click', closeModals);
  document.getElementById('create-save').addEventListener('click', createMemory);

  const createModal = document.getElementById('create-modal');
  createModal.addEventListener('click', (e) => {
    if (e.target === createModal) closeModals();
  });

  // Scope toggle in create modal
  document.getElementById('create-scope').addEventListener('change', (e) => {
    const projectGroup = document.getElementById('create-project-group');
    projectGroup.style.display = e.target.value === 'project' ? 'block' : 'none';
  });

  // Memory item clicks
  document.addEventListener('click', (e) => {
    const memoryItem = e.target.closest('.memory-item');
    if (memoryItem && memoryItem.dataset.id) {
      openMemoryModal(memoryItem.dataset.id);
    }
  });
}

async function openMemoryModal(id) {
  try {
    const memory = await api(`/memories/${id}`);
    state.selectedMemory = memory;

    document.getElementById('modal-id').textContent = memory.id;
    document.getElementById('modal-type').textContent = memory.type;
    document.getElementById('modal-type').className = `memory-type-badge ${memory.type}`;
    document.getElementById('modal-date').textContent = formatDate(memory.createdAt);
    document.getElementById('modal-content').value = memory.content;
    document.getElementById('modal-source').textContent = memory.sourceTool || (memory.type === 'reasoning' ? 'reasoning' : 'manual');
    document.getElementById('modal-project').textContent = memory.projectId || 'global';

    document.getElementById('memory-modal').classList.add('active');
  } catch (error) {
    showToast('Failed to load memory details', 'error');
  }
}

function closeModals() {
  document.getElementById('memory-modal').classList.remove('active');
  document.getElementById('delete-modal').classList.remove('active');
  document.getElementById('create-modal').classList.remove('active');
  document.getElementById('delete-project-modal').classList.remove('active');
  document.getElementById('clear-global-modal').classList.remove('active');
  state.selectedMemory = null;
}

// Create memory modal
function openCreateModal(isGlobal = false) {
  const scopeSelect = document.getElementById('create-scope');
  const projectGroup = document.getElementById('create-project-group');
  const projectSelect = document.getElementById('create-project');
  const contentArea = document.getElementById('create-content');

  // Reset form
  contentArea.value = '';

  if (isGlobal) {
    scopeSelect.value = 'global';
    projectGroup.style.display = 'none';
  } else {
    scopeSelect.value = 'project';
    projectGroup.style.display = 'block';
  }

  // Populate project dropdown
  projectSelect.innerHTML = '';
  if (state.projects && state.projects.length > 0) {
    state.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p.length > 40 ? p.slice(0, 40) + '...' : p;
      projectSelect.appendChild(opt);
    });
  }

  document.getElementById('create-modal').classList.add('active');
}

async function createMemory() {
  const scope = document.getElementById('create-scope').value;
  const content = document.getElementById('create-content').value.trim();

  if (!content) {
    showToast('Content cannot be empty', 'error');
    return;
  }

  let projectId = null;
  if (scope === 'project') {
    projectId = document.getElementById('create-project').value;
    if (!projectId) {
      showToast('Please select a project', 'error');
      return;
    }
  }

  try {
    await api('/memories', {
      method: 'POST',
      body: JSON.stringify({
        content,
        projectId,
        type: projectId ? 'manual' : 'global'
      })
    });

    showToast('Memory created successfully', 'success');
    closeModals();

    // Refresh current view
    if (state.currentView === 'dashboard') {
      loadDashboard();
    } else if (state.currentView === 'memories') {
      loadMemories();
    } else if (state.currentView === 'global') {
      loadGlobalProfiles();
    }
  } catch (error) {
    showToast('Failed to create memory', 'error');
  }
}

async function saveMemory() {
  if (!state.selectedMemory) return;

  const content = document.getElementById('modal-content').value.trim();
  if (!content) {
    showToast('Content cannot be empty', 'error');
    return;
  }

  try {
    await api(`/memories/${state.selectedMemory.id}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });

    showToast('Memory updated successfully', 'success');
    closeModals();

    // Refresh current view
    if (state.currentView === 'dashboard') {
      loadDashboard();
    } else if (state.currentView === 'memories') {
      loadMemories();
    }
  } catch (error) {
    showToast('Failed to update memory', 'error');
  }
}

async function deleteMemory() {
  if (!state.selectedMemory) return;

  try {
    await api(`/memories/${state.selectedMemory.id}`, {
      method: 'DELETE'
    });

    showToast('Memory deleted successfully', 'success');
    closeModals();

    // Refresh current view
    if (state.currentView === 'dashboard') {
      loadDashboard();
    } else if (state.currentView === 'memories') {
      loadMemories();
    }
  } catch (error) {
    showToast('Failed to delete memory', 'error');
  }
}

// Settings
async function loadSettings() {
  try {
    const config = await api('/config');
    state.settings = config;
    populateSettingsForm(config);
  } catch (error) {
    showToast('Failed to load settings', 'error');
  }
}

function populateSettingsForm(config) {
  // Capture settings
  document.getElementById('setting-capture-reasoning').checked = config.capture?.captureReasoning ?? true;
  document.getElementById('setting-max-reasoning').value = config.capture?.maxReasoningLength ?? 10000;
  document.getElementById('setting-max-tool').value = config.capture?.maxToolOutputLength ?? 2000;

  // Tool toggles
  document.getElementById('setting-tool-edit').checked = config.capture?.tools?.Edit ?? false;
  document.getElementById('setting-tool-write').checked = config.capture?.tools?.Write ?? false;
  document.getElementById('setting-tool-bash').checked = config.capture?.tools?.Bash ?? false;
  document.getElementById('setting-tool-task').checked = config.capture?.tools?.Task ?? false;

  // Retrieval settings
  document.getElementById('setting-auto-inject').checked = config.retrieval?.autoInject ?? true;
  document.getElementById('setting-max-memories').value = config.retrieval?.maxMemories ?? 0;
  document.getElementById('setting-recent-days').value = config.retrieval?.recentDays ?? 0;
  document.getElementById('setting-include-global').checked = config.retrieval?.includeGlobal ?? true;
  document.getElementById('setting-dedup-threshold').value = config.retrieval?.deduplicationThreshold ?? 0.85;
  document.getElementById('setting-session-max-chars').value = config.retrieval?.sessionMaxChars ?? 10000;
  document.getElementById('setting-compact-max-chars').value = config.retrieval?.compactMaxChars ?? 2000;

  // Storage limits
  document.getElementById('setting-max-per-project').value = config.storage?.maxMemoriesPerProject ?? 500;
  document.getElementById('setting-max-total').value = config.storage?.maxTotalMemories ?? 5000;
  document.getElementById('setting-dedupe-on-prune').checked = config.storage?.deduplicateOnPrune ?? true;

  // System settings
  document.getElementById('setting-debug').checked = config.debug ?? false;
}

function getSettingsFromForm() {
  return {
    capture: {
      captureReasoning: document.getElementById('setting-capture-reasoning').checked,
      maxReasoningLength: parseInt(document.getElementById('setting-max-reasoning').value, 10),
      maxToolOutputLength: parseInt(document.getElementById('setting-max-tool').value, 10),
      tools: {
        Edit: document.getElementById('setting-tool-edit').checked,
        Write: document.getElementById('setting-tool-write').checked,
        Bash: document.getElementById('setting-tool-bash').checked,
        Task: document.getElementById('setting-tool-task').checked
      }
    },
    retrieval: {
      autoInject: document.getElementById('setting-auto-inject').checked,
      maxMemories: parseInt(document.getElementById('setting-max-memories').value, 10),
      recentDays: parseInt(document.getElementById('setting-recent-days').value, 10),
      includeGlobal: document.getElementById('setting-include-global').checked,
      deduplicationThreshold: parseFloat(document.getElementById('setting-dedup-threshold').value),
      sessionMaxChars: parseInt(document.getElementById('setting-session-max-chars').value, 10),
      compactMaxChars: parseInt(document.getElementById('setting-compact-max-chars').value, 10)
    },
    storage: {
      maxMemoriesPerProject: parseInt(document.getElementById('setting-max-per-project').value, 10),
      maxTotalMemories: parseInt(document.getElementById('setting-max-total').value, 10),
      deduplicateOnPrune: document.getElementById('setting-dedupe-on-prune').checked
    },
    debug: document.getElementById('setting-debug').checked
  };
}

async function saveSettings() {
  const config = getSettingsFromForm();

  // Validation
  if (config.capture.maxReasoningLength < 100 || config.capture.maxReasoningLength > 100000) {
    showToast('Max reasoning length must be between 100 and 100,000', 'error');
    return;
  }
  if (config.capture.maxToolOutputLength < 100 || config.capture.maxToolOutputLength > 50000) {
    showToast('Max tool output length must be between 100 and 50,000', 'error');
    return;
  }
  if (config.retrieval.maxMemories < 0 || config.retrieval.maxMemories > 100) {
    showToast('Max memories must be between 0 and 100 (0 = unlimited)', 'error');
    return;
  }
  if (config.retrieval.recentDays < 0 || config.retrieval.recentDays > 365) {
    showToast('Recent days must be between 0 and 365 (0 = unlimited)', 'error');
    return;
  }
  if (config.retrieval.deduplicationThreshold < 0 || config.retrieval.deduplicationThreshold > 1) {
    showToast('Deduplication threshold must be between 0 and 1', 'error');
    return;
  }

  try {
    await api('/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    });
    state.settings = config;
    showToast('Settings saved successfully', 'success');
  } catch (error) {
    showToast('Failed to save settings', 'error');
  }
}

async function resetSettings() {
  try {
    const defaults = await api('/config/defaults');
    populateSettingsForm(defaults);
    showToast('Settings reset to defaults (not saved yet)', 'info');
  } catch (error) {
    showToast('Failed to load defaults', 'error');
  }
}

function setupSettings() {
  const saveBtn = document.getElementById('settings-save');
  const resetBtn = document.getElementById('settings-reset');

  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', resetSettings);
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupFilters();
  setupSearch();
  setupModal();
  setupSettings();
  setupDeleteProjectModal();
  setupClearGlobalModal();

  // Load initial view
  loadDashboard();
});
