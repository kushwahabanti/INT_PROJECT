/* ═══════════════════════════════════════════════════════════════
   CodeCollab - Main Application Logic v2 (Fixed)
   ═══════════════════════════════════════════════════════════════ */
// const API_URL = "https://int-project-92ou.onrender.com";
const API_URL = "http://localhost:3000";

(() => {
  'use strict';

  // ─── State ───────────────────────────────────────────  ───────
  const state = {
    currentUser: null,
    currentRoom: null,
    rooms: [],
    editor: null,
    recordingEditor: null,
    reviewEditor: null,
    socket: null,
    participants: [],
    versions: [],
    isRemoteChange: false,
    typingTimer: null,
    playbackInterval: null,
    currentRecording: null,
    currentSnapshotIndex: 0,
    selectedRating: 0,
    reviewRoomId: null,
    completedRecordings: [], // FIX #3: moved from DOM element to state
    cursorColors: [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA'
    ]
  };

  // ─── Initialize Socket ─────────────────────────────────────
  // const socket = io("https://int-project-92ou.onrender.com", {
  const socket = io("http://localhost:3000", {
    auth: { token: localStorage.getItem('codecollab_token') }
  });
  state.socket = socket;

  // ─── DOM References ─────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Screens
  const loginScreen = $('#login-screen');
  const dashboardScreen = $('#dashboard-screen');
  const editorScreen = $('#editor-screen');
  const recordingScreen = $('#recording-screen');

  // ─── Utility Functions ──────────────────────────────────────
  function getAuthHeaders() {
    const token = localStorage.getItem('codecollab_token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }

  // FIX #1: Consistent API URL helper so all fetches use API_URL
  function apiFetch(path, options = {}) {
    const url = path.startsWith('http') ? path : `${API_URL}${path}`;
    return fetch(url, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...(options.headers || {})
      }
    });
  }

  function showScreen(screen) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    if (isNaN(diff)) return '';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function getLangIcon(lang) {
    const icons = {
      javascript: '🟨', python: '🐍', java: '☕',
      cpp: '⚡', html: '🌐', css: '🎨'
    };
    return icons[lang] || '📄';
  }

  function getLangMode(lang) {
    const modes = {
      javascript: 'javascript',
      python: 'python',
      java: 'text/x-java',
      cpp: 'text/x-c++src',
      html: 'htmlmixed',
      css: 'css'
    };
    return modes[lang] || 'javascript';
  }

  function getFileExt(lang) {
    const exts = {
      javascript: 'main.js', python: 'main.py', java: 'Main.java',
      cpp: 'main.cpp', html: 'index.html', css: 'style.css'
    };
    return exts[lang] || 'main.js';
  }

  function getCursorColor(userId) {
    const idx = Math.abs(hashCode(userId)) % state.cursorColors.length;
    return state.cursorColors[idx];
  }

  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash |= 0;
    }
    return hash;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showLoading(container) {
    container.innerHTML = `
      <div class="loading-overlay">
        <div class="loading-spinner"></div>
      </div>
    `;
  }

  // ─── LOGIN / REGISTER ────────────────────────────────────────
  function initLogin() {
    const authTabs = $$('.auth-tab');
    const loginForm = $('#login-form');
    const registerForm = $('#register-form');
    let selectedRole = 'student';

    function switchAuthMode(mode) {
      authTabs.forEach(t => {
        t.classList.toggle('active', t.dataset.mode === mode);
      });
      loginForm.classList.toggle('active', mode === 'login');
      registerForm.classList.toggle('active', mode === 'register');
      $('#login-error').style.display = 'none';
      $('#register-error').style.display = 'none';
    }

    authTabs.forEach(tab => {
      tab.addEventListener('click', () => switchAuthMode(tab.dataset.mode));
    });

    $('#switch-to-register').addEventListener('click', (e) => {
      e.preventDefault();
      switchAuthMode('register');
    });

    $('#switch-to-login').addEventListener('click', (e) => {
      e.preventDefault();
      switchAuthMode('login');
    });

    $$('#role-tabs .role-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('#role-tabs .role-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedRole = tab.dataset.role;
      });
    });

    function handleAuthSuccess(data) {
      if (data.token) {
        localStorage.setItem('codecollab_token', data.token);
        // Reconnect socket with new auth token
        socket.auth = { token: data.token };
        socket.disconnect().connect();
      }
      state.currentUser = data.user;
      socket.emit('user:identify', data.user.id);

      if (data.user.role === 'instructor') {
        document.body.classList.add('role-instructor');
      }

      // 🧹 Clear the forms so sensitive data doesn't stick around on logout
      $('#login-form').reset();
      $('#register-form').reset();

      renderAvatar('#nav-avatar', data.user.avatar);
      $('#nav-username').textContent = data.user.name;
      $('#nav-role').textContent = data.user.role;

      showScreen(dashboardScreen);
      loadDashboard();
      initProfileLogic();
      showToast(`Welcome, ${data.user.name}!`, 'success');
    }

    function showAuthError(containerId, message) {
      const el = $(containerId);
      el.textContent = '⚠ ' + message;
      el.style.display = 'flex';
    }

    // ── LOGIN ──
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#login-error').style.display = 'none';

      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;

      if (!email || !password) {
        showAuthError('#login-error', 'Please fill in all fields');
        return;
      }

      const loginBtn = $('#login-btn');
      loginBtn.disabled = true;
      loginBtn.querySelector('span').textContent = 'Signing in...';

      try {
        // FIX #1: use API_URL consistently
        const res = await apiFetch('/api/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();

        if (!res.ok) {
          showAuthError('#login-error', data.error || 'Login failed');
          return;
        }

        handleAuthSuccess(data);
      } catch (err) {
        showAuthError('#login-error', 'Network error — please try again');
      } finally {
        loginBtn.disabled = false;
        loginBtn.querySelector('span').textContent = 'Sign In';
      }
    });

    // ── REGISTER ──
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#register-error').style.display = 'none';

      const name = $('#register-name').value.trim();
      const email = $('#register-email').value.trim();
      const password = $('#register-password').value;

      if (!name || !email || !password) {
        showAuthError('#register-error', 'Please fill in all fields');
        return;
      }

      const regBtn = $('#register-btn');
      regBtn.disabled = true;
      regBtn.querySelector('span').textContent = 'Creating account...';

      try {
        // FIX #1: use API_URL consistently
        const res = await apiFetch('/api/register', {
          method: 'POST',
          body: JSON.stringify({ name, email, password, role: selectedRole })
        });
        const data = await res.json();

        if (!res.ok) {
          showAuthError('#register-error', data.error || 'Registration failed');
          return;
        }

        registerForm.reset();
        switchAuthMode('login');
        showToast('Account created successfully! Please login.', 'success');
      } catch (err) {
        showAuthError('#register-error', 'Network error — please try again');
      } finally {
        regBtn.disabled = false;
        regBtn.querySelector('span').textContent = 'Create Account';
      }
    });
  }

  // ─── DASHBOARD ──────────────────────────────────────────────
  function loadDashboard() {
    loadRooms();
    loadRecordings();
    if (state.currentUser?.role === 'instructor') {
      loadReviewView();
    }
  }

  function loadRooms() {
    const grid = $('#room-grid');
    showLoading(grid);

    // FIX #1: use apiFetch
    apiFetch('/api/rooms')
      .then(r => r.json())
      .then(rooms => {
        state.rooms = rooms;
        renderRoomGrid(rooms);
        updateStats(rooms);
      })
      .catch(() => {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">⚠️</div><h3>Failed to load rooms</h3><p>Please check your connection and try again.</p></div>`;
      });
  }

  function updateStats(rooms) {
    $('#stat-total-rooms').textContent = rooms.length;
    $('#stat-active-rooms').textContent = rooms.filter(r => r.isActive).length;
    const totalRecs = rooms.reduce((s, r) => s + r.recordingCount, 0);
    $('#stat-recordings').textContent = totalRecs;
    $('#stat-participants').textContent = rooms.reduce((s, r) => s + r.participantCount, 0);
  }

  function renderRoomGrid(rooms) {
    const grid = $('#room-grid');
    if (rooms.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1">
          <div class="empty-state-icon">📭</div>
          <h3>No Coding Rooms Yet</h3>
          <p>Create a new room to start a collaborative coding session.</p>
        </div>
      `;
      return;
    }

    const canDelete = (room) => {
      if (!state.currentUser) return false;
      return room.createdBy === state.currentUser.id || state.currentUser.role === 'instructor';
    };

    grid.innerHTML = rooms.map(room => `
      <div class="room-card" data-room-id="${escapeHtml(room.id)}">
        <div class="room-card-header">
          <span class="room-card-title">${escapeHtml(room.name)}</span>
          <div class="room-card-header-right">
            <span class="room-card-status ${room.isActive ? 'active' : 'ended'}">
              <span class="status-dot ${room.isActive ? 'active' : 'ended'}"></span>
              ${room.isActive ? 'Live' : 'Ended'}
            </span>
            ${canDelete(room) ? `
              <button class="btn-delete-room" data-room-id="${escapeHtml(room.id)}" data-room-name="${escapeHtml(room.name)}" title="Delete Room">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="room-card-meta">
          <span class="room-lang-tag">${getLangIcon(room.language)} ${escapeHtml(room.language)}</span>
          <span>Created ${timeAgo(room.createdAt)}</span>
        </div>
        <div class="room-card-footer">
          <span class="room-creator">by ${escapeHtml(room.creatorName)}</span>
          <div class="room-stats">
            <span class="room-stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              ${room.participantCount}
            </span>
            <span class="room-stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${room.versionCount}
            </span>
            <span class="room-stat">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              ${room.feedbackCount}
            </span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Delete room
  async function deleteRoom(roomId, roomName) {
    if (!confirm(`Are you sure you want to delete "${roomName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/rooms/${roomId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Failed to delete room', 'error');
        return;
      }
      showToast(`Room "${roomName}" deleted`, 'success');
      loadDashboard();
    } catch (err) {
      showToast('Failed to delete room', 'error');
    }
  }

  // Event delegation for room grid (avoids memory leaks)
  $('#room-grid').addEventListener('click', (e) => {
    // Handle delete button click
    const deleteBtn = e.target.closest('.btn-delete-room');
    if (deleteBtn) {
      e.stopPropagation();
      deleteRoom(deleteBtn.dataset.roomId, deleteBtn.dataset.roomName);
      return;
    }
    const card = e.target.closest('.room-card');
    if (card) joinRoom(card.dataset.roomId);
  });

  // ─── Sidebar Nav Items ──────────────────────────────────────
  $$('.sidebar-nav-item').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.sidebar-nav-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      $$('.dashboard-view').forEach(v => v.classList.remove('active'));
      $(`#view-${view}`).classList.add('active');

      if (view === 'recordings') {
        loadRecordings();
      }
    });
  });

  // ─── CREATE ROOM ────────────────────────────────────────────
  function initCreateRoom() {
    const modal = $('#create-room-modal');
    const nameInput = $('#room-name-input');
    let selectedLang = 'javascript';

    $('#create-room-btn')?.addEventListener('click', () => {
      modal.classList.add('active');
      nameInput.value = '';
      nameInput.focus();
    });

    $('#close-create-modal').addEventListener('click', () => modal.classList.remove('active'));
    $('#cancel-create-room').addEventListener('click', () => modal.classList.remove('active'));

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    $$('.lang-option').forEach(opt => {
      opt.addEventListener('click', () => {
        $$('.lang-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        selectedLang = opt.dataset.lang;
      });
    });

    $('#confirm-create-room').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        showToast('Please enter a room name', 'error');
        return;
      }

      // FIX #1: use apiFetch
      apiFetch('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ name, language: selectedLang })
      })
        .then(r => r.json())
        .then(room => {
          modal.classList.remove('active');
          showToast(`Room "${room.name}" created!`, 'success');
          loadDashboard();
        })
        .catch(() => showToast('Failed to create room', 'error'));
    });
  }

  // ─── JOIN ROOM ──────────────────────────────────────────────
  function joinRoom(roomId) {
    // FIX #1: use apiFetch
    apiFetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(room => {
        state.currentRoom = room;
        showScreen(editorScreen);

        $('#room-title').textContent = room.name;
        $('#room-lang-badge').textContent = room.language;
        $('#code-filename').textContent = getFileExt(room.language);

        if (!room.isActive) {
          $('#room-status-badge').innerHTML = `<span class="status-dot ended"></span> Ended`;
          $('#room-status-badge').style.color = 'var(--text-muted)';
        } else {
          $('#room-status-badge').innerHTML = `<span class="status-dot active"></span> Live`;
          $('#room-status-badge').style.color = '';
        }

        initEditor(room);

        socket.emit('room:join', {
          roomId: room.id,
          userId: state.currentUser.id
        });
      })
      .catch(() => showToast('Failed to join room', 'error'));
  }

  function initEditor(room) {
    const editorEl = $('#code-editor');

    // FIX #7: properly destroy previous CodeMirror instance before reinitializing
    if (state.editor) {
      try {
        state.editor.toTextArea();
      } catch (e) {
        // ignore if already destroyed
      }
      state.editor = null;
    }
    editorEl.innerHTML = '';

    state.editor = CodeMirror(editorEl, {
      value: room.code || '',
      mode: getLangMode(room.language),
      theme: 'material-darker',
      lineNumbers: true,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      autofocus: true,
      matchBrackets: true,
      readOnly: !room.isActive
    });

    state.editor.on('change', (cm, change) => {
      if (state.isRemoteChange) return;
      const code = cm.getValue();
      socket.emit('code:change', {
        roomId: room.id,
        code,
        userId: state.currentUser.id
      });
    });

    // Cursor tracking
    state.editor.on('cursorActivity', (cm) => {
      const pos = cm.getCursor();
      socket.emit('cursor:move', {
        roomId: room.id,
        userId: state.currentUser.id,
        position: { line: pos.line, ch: pos.ch },
        userName: state.currentUser.name,
        color: getCursorColor(state.currentUser.id)
      });
    });

    setTimeout(() => state.editor.refresh(), 100);
  }

  // ─── SOCKET EVENT HANDLERS ─────────────────────────────────
  socket.on('room:state', (data) => {
    if (state.editor && data.code) {
      state.isRemoteChange = true;
      state.editor.setValue(data.code);
      state.isRemoteChange = false;
    }
    state.participants = data.participants || [];
    state.versions = data.versions || [];
    renderParticipants(data.participants);
    renderVersions(data.versions);
    renderContributions();

    if (data.feedback) {
      data.feedback.forEach(fb => appendFeedbackToChat(fb));
    }
  });

  socket.on('code:update', (data) => {
    if (state.editor) {
      const cursor = state.editor.getCursor();
      const scrollInfo = state.editor.getScrollInfo();
      state.isRemoteChange = true;
      state.editor.setValue(data.code);
      state.editor.setCursor(cursor);
      state.editor.scrollTo(scrollInfo.left, scrollInfo.top);
      state.isRemoteChange = false;

      const user = state.participants.find(p => p.id === data.userId);
      if (user) {
        showTypingIndicator(user.name);
      }
    }
  });

  socket.on('cursor:update', (data) => {
    renderContributions();
  });

  socket.on('participants:update', (participants) => {
    state.participants = participants;
    renderParticipants(participants);
    renderContributions();
  });

  socket.on('participant:joined', (user) => {
    addChatSystemMessage(`${user.avatar} ${user.name} joined the room`);
    showToast(`${user.name} joined the room`, 'info');
  });

  socket.on('participant:left', (user) => {
    addChatSystemMessage(`${user.name} left the room`);
  });

  socket.on('version:saved', (version) => {
    state.versions.push(version);
    renderVersions(state.versions);
    showToast(`Version saved by ${version.authorName}`, 'success');
  });

  socket.on('chat:message', (msg) => {
    appendChatMessage(msg);
  });

  socket.on('feedback:new', (fb) => {
    showToast(`New feedback from ${fb.authorName}`, 'info');
  });

  socket.on('room:ended', () => {
    showToast('Session has been ended by the instructor', 'info');
    if (state.editor) {
      state.editor.setOption('readOnly', true);
    }
    $('#room-status-badge').innerHTML = `<span class="status-dot ended"></span> Ended`;
    $('#room-status-badge').style.color = 'var(--text-muted)';
  });

  socket.on('room:created', () => {
    if (dashboardScreen.classList.contains('active')) {
      loadDashboard();
    }
  });

  socket.on('room:deleted', ({ roomId }) => {
    // If we're inside the deleted room, go back to dashboard
    if (state.currentRoom && state.currentRoom.id === roomId) {
      state.currentRoom = null;
      state.participants = [];
      state.versions = [];
      showScreen(dashboardScreen);
      showToast('This room has been deleted', 'info');
    }
    if (dashboardScreen.classList.contains('active')) {
      loadDashboard();
    }
  });

  socket.on('rooms:update', () => {
    if (dashboardScreen.classList.contains('active')) {
      loadDashboard();
    }
  });

  // ─── PARTICIPANTS & CONTRIBUTIONS ──────────────────────────
  function renderParticipants(participants) {
    const row = $('#participants-row');
    if (!participants || !participants.length) {
      row.innerHTML = '<span style="font-size:0.8rem;color:var(--text-muted)">No participants</span>';
      return;
    }

    row.innerHTML = participants.map(p => `
      <div class="participant-avatar" style="background: ${getCursorColor(p.id)}20; border-color: ${getCursorColor(p.id)}">
        ${p.avatar}
        <span class="tooltip">${escapeHtml(p.name)} (${escapeHtml(p.role)})</span>
      </div>
    `).join('');
  }

  // FIX #6: use actual contribution data when available, fall back to equal split
  function renderContributions() {
    const tracks = $('#contrib-tracks');
    if (!state.participants.length) {
      tracks.innerHTML = '';
      return;
    }

    // Try to use real contribution percentages if available
    const hasContribData = state.participants.some(p => p.contributionPct !== undefined);

    tracks.innerHTML = state.participants.map(p => {
      const color = getCursorColor(p.id);
      const pct = hasContribData
        ? (p.contributionPct || 0)
        : (100 / state.participants.length);
      return `<div class="contrib-track" style="width:${pct}%;background:${color}" title="${escapeHtml(p.name)}: ${Math.round(pct)}%"></div>`;
    }).join('');
  }

  function showTypingIndicator(name) {
    const indicator = $('#typing-indicator');
    indicator.style.display = 'flex';
    indicator.querySelector('.typing-user').textContent = name;
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(() => {
      indicator.style.display = 'none';
    }, 1500);
  }

  // ─── VERSION HISTORY ────────────────────────────────────────
  function renderVersions(versions) {
    const list = $('#versions-list');
    if (!versions || !versions.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>No Versions Yet</h3>
          <p>Save a version to track your progress</p>
        </div>
      `;
      return;
    }

    list.innerHTML = [...versions].reverse().map(v => `
      <div class="version-item" data-version-id="${v.id || v._id}">
        <div class="v-header">
          <span class="v-author">${escapeHtml(v.authorName)}</span>
          <span class="v-time">${timeAgo(v.timestamp || v.createdAt)}</span>
        </div>
        <div class="v-message">${escapeHtml(v.message)}</div>
      </div>
    `).join('');

    list.querySelectorAll('.version-item').forEach(item => {
      item.addEventListener('click', () => {
        const version = versions.find(v => (v.id || v._id) === item.dataset.versionId);
        if (version && state.editor) {
          state.isRemoteChange = true;
          state.editor.setValue(version.code);
          state.isRemoteChange = false;
          showToast(`Loaded version: ${version.message}`, 'info');
        }
      });
    });
  }

  // ─── CHAT ───────────────────────────────────────────────────
  function appendChatMessage(msg) {
    const container = $('#chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-msg-avatar">${msg.avatar}</span>
        <span class="chat-msg-name">${escapeHtml(msg.userName)}</span>
        <span class="chat-msg-time">${timeAgo(msg.timestamp)}</span>
      </div>
      <div class="chat-msg-body">${escapeHtml(msg.message)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addChatSystemMessage(text) {
    const container = $('#chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-system-msg';
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function appendFeedbackToChat(fb) {
    const container = $('#chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-message';
    const stars = '★'.repeat(fb.rating) + '☆'.repeat(5 - fb.rating);
    div.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-msg-avatar">📝</span>
        <span class="chat-msg-name">${escapeHtml(fb.authorName)}</span>
        <span class="chat-msg-time">${timeAgo(fb.timestamp)}</span>
      </div>
      <div class="chat-msg-body" style="color:var(--accent-warning)">
        [Feedback] ${stars}<br>${escapeHtml(fb.content)}
      </div>
    `;
    container.appendChild(div);
  }

  // ─── EDITOR PANEL TOGGLES ──────────────────────────────────
  function initEditorPanels() {
    $('#toggle-versions-panel').addEventListener('click', () => {
      const panel = $('#versions-panel');
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        $('#chat-panel').classList.remove('open');
      }
    });

    $('#toggle-chat-panel').addEventListener('click', () => {
      const panel = $('#chat-panel');
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) {
        $('#versions-panel').classList.remove('open');
      }
    });

    $$('.panel-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const panel = btn.dataset.panel;
        $(`#${panel}-panel`).classList.remove('open');
      });
    });

    // Send chat
    $('#send-chat-btn').addEventListener('click', sendChatMessage);
    $('#chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });

    function sendChatMessage() {
      const input = $('#chat-input');
      const message = input.value.trim();
      if (!message || !state.currentRoom) return;

      socket.emit('chat:message', {
        roomId: state.currentRoom.id,
        userId: state.currentUser.id,
        message
      });
      input.value = '';
    }

    // Save version — modal instead of prompt()
    $('#save-version-btn').addEventListener('click', () => {
      if (!state.currentRoom) return;
      const modal = $('#version-modal');
      modal.classList.add('active');
      const input = $('#version-message-input');
      input.value = '';
      input.focus();
    });

    $('#close-version-modal')?.addEventListener('click', () => {
      $('#version-modal').classList.remove('active');
    });

    $('#cancel-version-save')?.addEventListener('click', () => {
      $('#version-modal').classList.remove('active');
    });

    $('#version-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'version-modal') {
        $('#version-modal').classList.remove('active');
      }
    });

    $('#confirm-version-save')?.addEventListener('click', () => {
      const message = $('#version-message-input').value.trim() || 'Manual save';
      socket.emit('version:save', {
        roomId: state.currentRoom.id,
        userId: state.currentUser.id,
        message
      });
      $('#version-modal').classList.remove('active');
    });

    // Run Code
    $('#run-code-btn').addEventListener('click', async () => {
      if (!state.currentRoom || !state.editor) return;

      const btn = $('#run-code-btn');
      const outputPanel = $('#output-panel');
      const outputContent = $('#output-content');

      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="spin"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-dasharray="32" stroke-dashoffset="32"/></svg> Running...`;
      btn.disabled = true;
      outputPanel.style.display = 'flex';
      outputContent.className = 'output-content';
      outputContent.textContent = 'Running code...';

      try {
        // FIX #1: use apiFetch
        const res = await apiFetch('/api/run', {
          method: 'POST',
          body: JSON.stringify({
            code: state.editor.getValue(),
            language: state.currentRoom.language
          })
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Execution failed');
        }

        if (data.error) {
          outputContent.className = 'output-content error';
          outputContent.textContent = data.error;
        } else {
          outputContent.textContent = data.output || 'Code executed successfully with no output.';
        }
      } catch (err) {
        outputContent.className = 'output-content error';
        outputContent.textContent = err.message;
      } finally {
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Code`;
        btn.disabled = false;
      }
    });

    $('#close-output-btn').addEventListener('click', () => {
      $('#output-panel').style.display = 'none';
    });

    // End session
    $('#end-session-btn')?.addEventListener('click', () => {
      if (!state.currentRoom) return;
      if (confirm('Are you sure you want to end this session?')) {
        socket.emit('room:end', { roomId: state.currentRoom.id });
      }
    });

    // Back to dashboard — emit room:leave
    $('#back-to-dashboard').addEventListener('click', () => {
      if (state.currentRoom) {
        socket.emit('room:leave');
        state.currentRoom = null;
        state.participants = [];
        state.versions = [];
        $('#chat-messages').innerHTML = '';
        $('#versions-panel').classList.remove('open');
        $('#chat-panel').classList.remove('open');
        $('#output-panel').style.display = 'none';
      }
      showScreen(dashboardScreen);
      loadDashboard();
    });
  }

  // ─── RECORDINGS (uses aggregated endpoint) ──────────────────
  function loadRecordings() {
    const recordingsList = $('#recordings-list');
    showLoading(recordingsList);

    // FIX #1: use apiFetch
    apiFetch('/api/recordings')
      .then(r => r.json())
      .then(allRecordings => {
        const completed = allRecordings.filter(r => r.endTime && r.snapshots && r.snapshots.length > 1);

        if (completed.length === 0) {
          recordingsList.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">🎬</div>
              <h3>No Recordings Yet</h3>
              <p>Completed sessions will appear here for review and playback.</p>
            </div>
          `;
          return;
        }

        // FIX #3: store in state instead of on DOM element
        state.completedRecordings = completed;

        recordingsList.innerHTML = completed.map(rec => `
          <div class="recording-card" data-room-id="${rec.roomId}" data-recording-id="${rec._id}">
            <div class="recording-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polygon points="10 8 16 12 10 16 10 8"/>
              </svg>
            </div>
            <div class="recording-details">
              <h3>${escapeHtml(rec.roomName)}</h3>
              <div class="rec-meta">
                <span>📅 ${new Date(rec.startTime).toLocaleDateString()}</span>
                <span>⏱️ ${formatDuration(rec.duration)}</span>
                <span>👥 ${rec.participantNames ? rec.participantNames.length : 0} participants</span>
                <span>📸 ${rec.snapshots.length} snapshots</span>
              </div>
            </div>
            <div class="recording-participants">
              ${(rec.participantNames || []).map(() => `<span class="rec-avatar">👤</span>`).join('')}
            </div>
            <div class="recording-actions">
              <button class="btn btn-primary btn-sm play-recording-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Play
              </button>
            </div>
          </div>
        `).join('');
      })
      .catch(() => {
        recordingsList.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Failed to load recordings</h3></div>`;
      });
  }

  // FIX #3: Event delegation reads from state instead of DOM element
  $('#recordings-list').addEventListener('click', (e) => {
    const card = e.target.closest('.recording-card');
    if (!card) return;
    const recId = card.dataset.recordingId;
    const rec = state.completedRecordings.find(r => String(r._id) === String(recId));
    if (rec) openRecordingPlayer(rec);
  });

  // ─── RECORDING PLAYER ──────────────────────────────────────
  function openRecordingPlayer(recording) {
    state.currentRecording = recording;
    state.currentSnapshotIndex = 0;

    showScreen(recordingScreen);

    $('#recording-title').textContent = recording.roomName;
    $('#recording-duration').textContent = `Duration: ${formatDuration(recording.duration)}`;

    const editorEl = $('#recording-editor');

    // FIX #7: destroy old recordingEditor instance before reinitializing
    if (state.recordingEditor) {
      try {
        state.recordingEditor.toTextArea();
      } catch (e) {
        // ignore
      }
      state.recordingEditor = null;
    }
    editorEl.innerHTML = '';

    state.recordingEditor = CodeMirror(editorEl, {
      value: recording.snapshots[0]?.code || '',
      mode: getLangMode(recording.language || 'javascript'),
      theme: 'material-darker',
      lineNumbers: true,
      lineWrapping: true,
      readOnly: true
    });

    setTimeout(() => state.recordingEditor.refresh(), 100);

    renderTimeline(recording);
    updateSnapshotDisplay(0);
    renderRecordingInfo(recording);
    updateSnapshotCounter();
  }

  function renderTimeline(recording) {
    const markers = $('#timeline-markers');
    const total = recording.duration || 1;

    markers.innerHTML = recording.snapshots.map((snap, i) => {
      const pct = (snap.time / total) * 100;
      return `<div class="timeline-marker" style="left:${pct}%" data-index="${i}" title="Snapshot ${i + 1} - ${formatDuration(snap.time)}"></div>`;
    }).join('');

    $('#timeline-total').textContent = formatDuration(total);

    markers.querySelectorAll('.timeline-marker').forEach(marker => {
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(marker.dataset.index);
        updateSnapshotDisplay(idx);
      });
    });

    $('#playback-timeline .timeline-track').addEventListener('click', (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const targetTime = pct * total;
      let closest = 0;
      let minDiff = Infinity;
      recording.snapshots.forEach((snap, i) => {
        const diff = Math.abs(snap.time - targetTime);
        if (diff < minDiff) {
          minDiff = diff;
          closest = i;
        }
      });
      updateSnapshotDisplay(closest);
    });
  }

  function updateSnapshotDisplay(index) {
    const recording = state.currentRecording;
    if (!recording || index < 0 || index >= recording.snapshots.length) return;

    state.currentSnapshotIndex = index;
    const snap = recording.snapshots[index];

    if (state.recordingEditor) {
      state.recordingEditor.setValue(snap.code || '');
    }

    const total = recording.duration || 1;
    const pct = (snap.time / total) * 100;
    $('#timeline-progress').style.width = `${pct}%`;
    $('#timeline-current').textContent = formatDuration(snap.time);

    updateSnapshotCounter();
  }

  function updateSnapshotCounter() {
    const rec = state.currentRecording;
    if (!rec) return;
    $('#snapshot-counter').textContent = `${state.currentSnapshotIndex + 1} / ${rec.snapshots.length}`;
  }

  function renderRecordingInfo(recording) {
    const info = $('#recording-info');
    const stats = recording.contributionStats || {};

    let participantsHtml = '';
    if (recording.participantNames && recording.participantNames.length) {
      participantsHtml = recording.participantNames.map(name => `
        <div class="contrib-item">
          <span>👤</span>
          <span class="name">${escapeHtml(name)}</span>
        </div>
      `).join('');
    }

    let contribHtml = '';
    Object.entries(stats).forEach(([userId, stat]) => {
      contribHtml += `
        <div class="contrib-item">
          <span>👤</span>
          <span class="name">${escapeHtml(stat.name || userId)}</span>
          <span class="pct">${stat.percentage}%</span>
          <div class="bar"><div class="bar-fill" style="width:${stat.percentage}%"></div></div>
        </div>
      `;
    });

    info.innerHTML = `
      <div class="recording-info-section">
        <h4>Session Details</h4>
        <div class="contrib-item">
          <span>📅</span>
          <span class="name">Start</span>
          <span class="pct" style="color:var(--text-secondary)">${new Date(recording.startTime).toLocaleString()}</span>
        </div>
        <div class="contrib-item">
          <span>⏱️</span>
          <span class="name">Duration</span>
          <span class="pct" style="color:var(--text-secondary)">${formatDuration(recording.duration)}</span>
        </div>
        <div class="contrib-item">
          <span>📸</span>
          <span class="name">Snapshots</span>
          <span class="pct" style="color:var(--text-secondary)">${recording.snapshots.length}</span>
        </div>
      </div>
      <div class="recording-info-section">
        <h4>Participants</h4>
        ${participantsHtml || '<p style="font-size:0.8rem;color:var(--text-muted)">No participants recorded</p>'}
      </div>
      <div class="recording-info-section">
        <h4>Contributions</h4>
        ${contribHtml || '<p style="font-size:0.8rem;color:var(--text-muted)">No contribution data</p>'}
      </div>
    `;
  }

  // Playback controls
  function initPlaybackControls() {
    let isPlaying = false;

    $('#playback-play').addEventListener('click', () => {
      if (isPlaying) {
        clearInterval(state.playbackInterval);
        isPlaying = false;
        $('#playback-play').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      } else {
        isPlaying = true;
        $('#playback-play').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        state.playbackInterval = setInterval(() => {
          const rec = state.currentRecording;
          if (!rec) return;
          if (state.currentSnapshotIndex < rec.snapshots.length - 1) {
            updateSnapshotDisplay(state.currentSnapshotIndex + 1);
          } else {
            clearInterval(state.playbackInterval);
            isPlaying = false;
            $('#playback-play').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
          }
        }, 1500);
      }
    });

    $('#playback-prev').addEventListener('click', () => {
      if (state.currentSnapshotIndex > 0) {
        updateSnapshotDisplay(state.currentSnapshotIndex - 1);
      }
    });

    $('#playback-next').addEventListener('click', () => {
      const rec = state.currentRecording;
      if (rec && state.currentSnapshotIndex < rec.snapshots.length - 1) {
        updateSnapshotDisplay(state.currentSnapshotIndex + 1);
      }
    });

    $('#back-from-recording').addEventListener('click', () => {
      clearInterval(state.playbackInterval);
      state.currentRecording = null;
      showScreen(dashboardScreen);
    });
  }

  // ─── REVIEW VIEW (Instructor) ──────────────────────────────
  function loadReviewView() {
    const container = $('#review-container');
    showLoading(container);

    // FIX #1: use apiFetch
    apiFetch('/api/rooms')
      .then(r => r.json())
      .then(rooms => {
        if (rooms.length === 0) {
          container.innerHTML = `
            <div class="empty-state">
              <div class="empty-state-icon">📋</div>
              <h3>No Sessions to Review</h3>
              <p>Sessions will appear here once created.</p>
            </div>
          `;
          return;
        }

        container.innerHTML = rooms.map(room => `
          <div class="review-card" data-room-id="${escapeHtml(room.id)}">
            <div class="review-card-header">
              <div class="review-card-info">
                <h3>${escapeHtml(room.name)}</h3>
                <p>${getLangIcon(room.language)} ${escapeHtml(room.language)} • Created ${timeAgo(room.createdAt)} • by ${escapeHtml(room.creatorName)}</p>
              </div>
              <div class="review-card-stats">
                <div class="review-stat">
                  <div class="value">${room.versionCount}</div>
                  <div class="label">Versions</div>
                </div>
                <div class="review-stat">
                  <div class="value">${room.feedbackCount}</div>
                  <div class="label">Feedback</div>
                </div>
                <div class="review-stat">
                  <div class="value">${room.participantCount}</div>
                  <div class="label">Students</div>
                </div>
              </div>
            </div>
            <div class="review-card-actions">
              <button class="btn btn-primary btn-sm review-btn" data-room-id="${escapeHtml(room.id)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Review & Feedback
              </button>
              <button class="btn btn-ghost btn-sm join-room-btn" data-room-id="${escapeHtml(room.id)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                Join Room
              </button>
            </div>
          </div>
        `).join('');

        container.querySelectorAll('.review-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openReviewModal(btn.dataset.roomId);
          });
        });

        container.querySelectorAll('.join-room-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            joinRoom(btn.dataset.roomId);
          });
        });
      })
      .catch(() => {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Failed to load reviews</h3></div>`;
      });
  }

  function openReviewModal(roomId) {
    state.reviewRoomId = roomId;

    // FIX #1: use apiFetch
    apiFetch(`/api/rooms/${roomId}`)
      .then(r => r.json())
      .then(room => {
        const modal = $('#review-modal');
        modal.classList.add('active');

        $('#review-modal-title').textContent = `Review: ${room.name}`;

        const editorEl = $('#review-editor');

        // FIX #7: destroy old reviewEditor before reinitializing
        if (state.reviewEditor) {
          try {
            state.reviewEditor.toTextArea();
          } catch (e) {
            // ignore
          }
          state.reviewEditor = null;
        }
        editorEl.innerHTML = '';

        state.reviewEditor = CodeMirror(editorEl, {
          value: room.code || '',
          mode: getLangMode(room.language),
          theme: 'material-darker',
          lineNumbers: true,
          lineWrapping: true,
          readOnly: true
        });
        setTimeout(() => state.reviewEditor.refresh(), 100);

        renderExistingFeedback(room.feedback || []);

        state.selectedRating = 0;
        $$('.rating-input .star').forEach(s => s.classList.remove('active'));
        $('#feedback-text').value = '';
      })
      .catch(() => showToast('Failed to load room for review', 'error'));
  }

  function renderExistingFeedback(feedbackList) {
    const container = $('#existing-feedback');
    if (!feedbackList.length) {
      container.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted);padding:8px">No feedback yet</p>';
      return;
    }

    container.innerHTML = feedbackList.map(fb => {
      const stars = '★'.repeat(fb.rating) + '☆'.repeat(5 - fb.rating);
      return `
        <div class="feedback-item">
          <div class="fb-header">
            <span class="fb-author">${escapeHtml(fb.authorName)}</span>
            <span class="fb-time">${timeAgo(fb.timestamp)}</span>
          </div>
          <div class="fb-content">${escapeHtml(fb.content)}</div>
          <div class="fb-rating">${stars}</div>
        </div>
      `;
    }).join('');
  }

  function initReviewModal() {
    $('#close-review-modal').addEventListener('click', () => {
      $('#review-modal').classList.remove('active');
    });

    $('#review-modal').addEventListener('click', (e) => {
      if (e.target.id === 'review-modal') {
        $('#review-modal').classList.remove('active');
      }
    });

    $$('.rating-input .star').forEach(star => {
      star.addEventListener('click', () => {
        state.selectedRating = parseInt(star.dataset.rating);
        $$('.rating-input .star').forEach(s => {
          s.classList.toggle('active', parseInt(s.dataset.rating) <= state.selectedRating);
        });
      });

      star.addEventListener('mouseenter', () => {
        const rating = parseInt(star.dataset.rating);
        $$('.rating-input .star').forEach(s => {
          s.classList.toggle('active', parseInt(s.dataset.rating) <= rating);
        });
      });

      star.addEventListener('mouseleave', () => {
        $$('.rating-input .star').forEach(s => {
          s.classList.toggle('active', parseInt(s.dataset.rating) <= state.selectedRating);
        });
      });
    });

    // FIX #5: Submit feedback and re-fetch using the same room endpoint for consistency
    $('#submit-feedback-btn').addEventListener('click', () => {
      const content = $('#feedback-text').value.trim();
      if (!content) {
        showToast('Please write some feedback', 'error');
        return;
      }

      apiFetch(`/api/rooms/${state.reviewRoomId}/feedback`, {
        method: 'POST',
        body: JSON.stringify({
          content,
          type: 'general',
          rating: state.selectedRating || 3
        })
      })
        .then(r => r.json())
        .then(() => {
          showToast('Feedback submitted!', 'success');
          $('#feedback-text').value = '';
          state.selectedRating = 0;
          $$('.rating-input .star').forEach(s => s.classList.remove('active'));

          // FIX #5: re-fetch the full room to stay consistent with openReviewModal
          apiFetch(`/api/rooms/${state.reviewRoomId}`)
            .then(r => r.json())
            .then(room => renderExistingFeedback(room.feedback || []))
            .catch(() => {});
        })
        .catch(() => showToast('Failed to submit feedback', 'error'));
    });
  }

  // ─── LOGOUT ─────────────────────────────────────────────────
  function initLogout() {
    $('#logout-btn').addEventListener('click', () => {
      localStorage.removeItem('codecollab_token');
      state.currentUser = null;
      state.currentRoom = null;
      state.completedRecordings = [];
      document.body.classList.remove('role-instructor');

      // Explicitly wipe the fields on logout as well
      $('#login-form').reset();
      $('#register-form').reset();
      if ($('#login-email')) $('#login-email').value = '';
      if ($('#login-password')) $('#login-password').value = '';

      showScreen(loginScreen);
      showToast('Logged out successfully', 'info');
    });
  }

  // ─── PROFILE ────────────────────────────────────────────────
  function renderAvatar(selector, avatarData) {
    const el = $(selector);
    if (!el) return;
    if (avatarData && avatarData.startsWith('data:image')) {
      el.innerHTML = `<img src="${avatarData}" alt="avatar">`;
    } else {
      el.innerHTML = avatarData || '👤';
    }
  }

  function initProfileLogic() {
    const uploadInput = $('#avatar-upload');
    const avatarWrapper = $('.profile-avatar-wrapper');

    if (avatarWrapper && uploadInput) {
      uploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 200;
            const MAX_HEIGHT = 200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const base64Avatar = canvas.toDataURL('image/jpeg', 0.8);

            try {
              // FIX #1: use apiFetch
              const res = await apiFetch('/api/users/avatar', {
                method: 'PUT',
                body: JSON.stringify({ avatar: base64Avatar })
              });

              if (res.ok) {
                const data = await res.json();
                state.currentUser.avatar = data.avatar;
                loadProfile();
                renderAvatar('#nav-avatar', data.avatar);
                showToast('Profile picture updated!', 'success');
              } else {
                const errData = await res.json().catch(() => ({}));
                showToast(errData.error || 'Failed to update profile picture', 'error');
              }
            } catch(err) {
              showToast('Error uploading avatar: it might be too large.', 'error');
            }
          };
          img.onerror = () => {
            showToast('Failed to load image client-side', 'error');
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    const badge = $('#current-user-badge');
    const modal = $('#profile-modal');
    if (badge && modal) {
      badge.addEventListener('click', () => {
        loadProfile();
        modal.classList.add('active');
      });
      $('#close-profile-modal')?.addEventListener('click', () => {
        modal.classList.remove('active');
      });
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
      });
    }
  }

  async function loadProfile() {
    if (!state.currentUser) return;

    $('#profile-name').textContent = state.currentUser.name;

    // FIX #4: use regex to replace all spaces in email fallback
    const emailFallback = state.currentUser.name.toLowerCase().replace(/\s+/g, '.') + '@codecollab.com';
    $('#profile-email').textContent = state.currentUser.email || emailFallback;

    $('#profile-role').textContent = state.currentUser.role;
    renderAvatar('#profile-avatar', state.currentUser.avatar);

    try {
      // FIX #1: use apiFetch
      const res = await apiFetch('/api/rooms');
      const rooms = await res.json();

      const managed = rooms.filter(r => r.createdBy === state.currentUser.id);

      $('#profile-stat-rooms').textContent = managed.length;

      const versionsMade = 'Level ' + (managed.length > 5 ? 'Pro' : 'Starter');
      $('#profile-stat-versions').textContent = versionsMade;
    } catch (e) {
      console.error(e);
    }
  }

  // ─── INITIALIZE ─────────────────────────────────────────────
  async function init() {
    initLogin();
    initCreateRoom();
    initEditorPanels();
    initPlaybackControls();
    initReviewModal();
    initLogout();

    const token = localStorage.getItem('codecollab_token');
    if (token) {
      try {
        // FIX #1: use apiFetch
        const res = await apiFetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          state.currentUser = data.user;
          socket.emit('user:identify', data.user.id);
          if (data.user.role === 'instructor') {
            document.body.classList.add('role-instructor');
          }
          renderAvatar('#nav-avatar', data.user.avatar);
          $('#nav-username').textContent = data.user.name;
          $('#nav-role').textContent = data.user.role;
          showScreen(dashboardScreen);
          loadDashboard();
          initProfileLogic();
        } else {
          localStorage.removeItem('codecollab_token');
        }
      } catch (e) {
        console.error('Auto login failed', e);
      }
    }
  }

  init();
})();