// ─── State ────────────────────────────────────────────────────────────────
let state = {
  user: null,
  goals: [],
  habits: [],
  supplements: [],
  physique: null,
  pendingImages: [],
  chatBusy: false,
  selectedGoalType: 'daily',
  selectedColor: '#a78bfa',
  habitFormType: 'check',
  habitFormFreq: 'daily',
  selectedMood: null,
  hasApiKey: false,
  model: 'claude-sonnet-4-6',
  activityChart: null,
  xpChart: null
};

const PROMPTS = [
  "Qu'est-ce qui t'a rendu fier aujourd'hui, même quelque chose de minuscule ?",
  "Quel obstacle as-tu traversé sans céder ?",
  "Comment ton état d'esprit a-t-il changé entre ce matin et maintenant ?",
  "Qu'aurais-tu fait différemment si tu recommençais cette journée ?",
  "Cite une chose précise dont tu peux être reconnaissant.",
  "Quel est ton état réel en ce moment — sans filtre, sans excuse ?",
  "Qu'as-tu appris sur toi-même aujourd'hui ?",
  "Qu'est-ce qui te donnera la force de te lever demain ?",
  "Décris ta journée en trois mots, sans hésiter.",
  "Qu'est-ce qui t'a vidé d'énergie ? Qu'est-ce qui t'en a donné ?",
  "Si tu pouvais parler à toi-même il y a un an, que dirais-tu ?",
  "Quelle est la version de toi que tu veux atteindre dans 6 mois ?",
  "Quel est le pas le plus petit que tu peux faire maintenant ?",
  "Qu'est-ce que tu repousses sans cesse — et pourquoi ?"
];

// ─── Icon helper ──────────────────────────────────────────────────────────
function icon(name, cls = 'icon') {
  return `<svg class="${cls}"><use href="#i-${name}"/></svg>`;
}

// ─── Init ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  spawnStars();
  setupNav();
  setupGoalModal();
  setupHabitModal();
  setupMoodSelector();
  await loadUser();
  await loadConfig();
  await loadDashboard();
  setDateDisplays();
  setDailyPrompt();
  document.getElementById('m-date').value = todayStr();
});

// ─── Starfield ────────────────────────────────────────────────────────────
function spawnStars() {
  const container = document.getElementById('stars');
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('div');
    const big = Math.random() > 0.85;
    s.className = 'star' + (big ? ' large' : '');
    const size = big ? Math.random() * 2 + 1.5 : Math.random() * 1.2 + 0.5;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      top:${Math.random() * 100}%;
      --d:${Math.random() * 5 + 3}s;
      --delay:-${Math.random() * 8}s;
    `;
    container.appendChild(s);
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  if (page === 'habits') loadHabits();
  if (page === 'journal') loadJournalPage();
  if (page === 'fitness') loadFitnessPage();
  if (page === 'goals') loadGoalsPage();
  if (page === 'stats') loadStatsPage();
  if (page === 'achievements') loadAchievements();
  if (page === 'dashboard') loadDashboard();
}

// ─── Dates ────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }

function setDateDisplays() {
  const now = new Date();
  const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const dateStr = now.toLocaleDateString('fr-FR', opts);
  const el = document.getElementById('today-date');
  if (el) el.textContent = dateStr;
  const jl = document.getElementById('journal-date-label');
  if (jl) jl.textContent = dateStr;
  if (state.user) {
    document.getElementById('greeting-name').textContent = state.user.name;
    const hour = now.getHours();
    let sub;
    if (hour < 6) sub = "Il est tard. La nuit appartient à ceux qui veulent.";
    else if (hour < 12) sub = "Une nouvelle journée. Que vas-tu en faire ?";
    else if (hour < 18) sub = "L'après-midi est un bon moment pour ne pas lâcher.";
    else if (hour < 22) sub = "La soirée arrive. Bilan, repos, recommencer demain.";
    else sub = "La nuit appartient à ceux qui veulent.";
    document.getElementById('greeting-sub').textContent = sub;
  }
}

// ─── User / Sidebar ───────────────────────────────────────────────────────
async function loadUser() {
  const res = await fetch('/api/user');
  state.user = await res.json();
  updateSidebar();
}

function updateSidebar() {
  const u = state.user;
  if (!u) return;
  const initial = (u.name || 'P')[0].toUpperCase();
  const xpPct = `${Math.min((u.currentXp / u.xpNeeded) * 100, 100)}%`;
  // Desktop sidebar
  document.getElementById('nav-name').textContent = u.name;
  document.getElementById('nav-level').textContent = `Niveau ${u.level}`;
  document.getElementById('nav-avatar').textContent = initial;
  document.getElementById('nav-xp-text').textContent = `${u.currentXp} / ${u.xpNeeded}`;
  document.getElementById('nav-xp-bar').style.width = xpPct;
  document.getElementById('nav-streak-count').textContent = u.streak;
  // Mobile sticky header
  const mAv = document.getElementById('mobile-avatar');
  const mLv = document.getElementById('mobile-level');
  const mBar = document.getElementById('mobile-xp-bar');
  const mSt = document.getElementById('mobile-streak');
  if (mAv) mAv.textContent = initial;
  if (mLv) mLv.textContent = `Niveau ${u.level}`;
  if (mBar) mBar.style.width = xpPct;
  if (mSt) mSt.textContent = u.streak;
}

async function loadConfig() {
  const res = await fetch('/api/config');
  const c = await res.json();
  state.hasApiKey = c.hasApiKey;
  state.model = c.model;
}

// ─── Dashboard ────────────────────────────────────────────────────────────
async function loadDashboard() {
  await loadUser();
  const u = state.user;
  document.getElementById('dash-xp').textContent = u.xp.toLocaleString();
  document.getElementById('dash-streak').textContent = u.streak;
  document.getElementById('dash-goals').textContent = u.totalGoalsCompleted;
  document.getElementById('dash-habits').textContent = u.totalHabitsCompleted || 0;
  setDateDisplays();

  // Activity-based CTA
  const stats = await (await fetch('/api/stats')).json();
  const today = stats.last30[stats.last30.length - 1];
  document.getElementById('today-cta').style.display = today && today.hasEntry ? 'none' : 'block';

  await loadActivityCalendar(stats);
  await loadRecentBadges();
  await loadHadith();
}

async function loadHadith() {
  try {
    const res = await fetch('/api/hadith/today');
    const h = await res.json();
    const textEl = document.getElementById('hadith-text');
    const srcEl = document.getElementById('hadith-source');
    if (textEl) textEl.textContent = h.text;
    if (srcEl) srcEl.textContent = h.source;
  } catch (e) {}
}

async function loadActivityCalendar(stats) {
  if (!stats) stats = await (await fetch('/api/stats')).json();
  const container = document.getElementById('activity-calendar');
  container.innerHTML = '';
  const t = todayStr();
  stats.last30.forEach(day => {
    const el = document.createElement('div');
    el.className = 'cal-day' + (day.hasEntry ? ' has-entry' : '') + (day.date === t ? ' today' : '');
    el.title = formatDate(day.date) + (day.habitsCompleted ? ` — ${day.habitsCompleted} rituel(s)` : '');
    container.appendChild(el);
  });
}

async function loadRecentBadges() {
  const badges = await (await fetch('/api/badges')).json();
  const unlocked = badges.filter(b => b.unlocked).slice(-3);
  const container = document.getElementById('recent-badges');
  if (!unlocked.length) {
    container.innerHTML = '<p class="empty-state">Aucun succès débloqué pour l\'instant.</p>';
    return;
  }
  container.innerHTML = unlocked.map(b => `
    <div class="recent-badge-item">
      <div class="recent-badge-mark">${icon(b.icon || 'star')}</div>
      <div>
        <div class="recent-badge-name">${esc(b.name)}</div>
        <div class="recent-badge-desc">${esc(b.desc)}</div>
      </div>
    </div>
  `).join('');
}

// ─── Habits ───────────────────────────────────────────────────────────────
async function loadHabits() {
  const res = await fetch('/api/habits');
  state.habits = await res.json();
  renderHabits();
}

function renderHabits() {
  const container = document.getElementById('habits-grid');
  if (!state.habits.length) {
    container.innerHTML = '<p class="empty-state">Aucun rituel. Crée ton premier.</p>';
    return;
  }
  container.innerHTML = state.habits.map(h => {
    const log = h.todayLog;
    const done = h.type === 'check' ? !!log : (log && log.targetHit);
    const value = log ? log.value : '';

    let body = '';
    if (h.type === 'check') {
      body = `<button class="habit-check-btn" onclick="toggleHabit('${h.id}')">
        ${done ? icon('check') : ''}
        ${done ? "Fait aujourd'hui" : 'Marquer comme fait'}
      </button>`;
    } else {
      const numVal = log ? log.value : 0;
      const pct = h.target ? Math.min((numVal / h.target) * 100, 100) : 0;
      const step = h.unit === 'L' ? '0.1' : '1';
      const fmtVal = h.unit === 'L' ? numVal.toFixed(1) : numVal.toLocaleString();
      const fmtTarget = h.unit === 'L' ? h.target.toFixed(1) : h.target.toLocaleString();
      body = `
        <div class="habit-number-input">
          <div class="habit-number-row">
            <input type="number" step="${step}" id="hi-${h.id}" placeholder="0" value="${value || ''}" min="0" onkeydown="if(event.key==='Enter')logNumberHabit('${h.id}')">
            <span class="unit">${esc(h.unit || '')}</span>
          </div>
          <button class="habit-number-save" onclick="logNumberHabit('${h.id}')">Enregistrer</button>
        </div>
        ${h.target ? `
          <div>
            <div class="habit-target-bar"><div class="habit-target-fill" style="width:${pct}%"></div></div>
            <div class="habit-target-text"><span>${fmtVal} ${esc(h.unit || '')}</span><span>Cible : ${fmtTarget}</span></div>
          </div>
        ` : ''}
      `;
    }

    return `
      <div class="habit-card ${done ? 'done' : ''}">
        ${!h.builtin ? `<button class="habit-delete" onclick="deleteHabit('${h.id}')" title="Supprimer">${icon('trash')}</button>` : ''}
        <div class="habit-header">
          <div>
            <div class="habit-name">${esc(h.name)}</div>
            <div class="habit-desc">${esc(h.desc || '')}</div>
          </div>
          <span class="habit-freq">${h.frequency === 'daily' ? 'Jour' : 'Semaine'}</span>
        </div>
        ${body}
        <div class="habit-xp">Récompense : +${h.xp} XP</div>
      </div>
    `;
  }).join('');
}

async function toggleHabit(id) {
  const res = await fetch(`/api/habits/${id}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const data = await res.json();
  await loadUser();
  if (data.xpEarned > 0) {
    showToast('xp', 'sparkle', `+${data.xpEarned} XP`, 'Rituel accompli');
  }
  handleLevelUpAndBadges(data);
  await loadHabits();
}

async function logNumberHabit(id) {
  const input = document.getElementById(`hi-${id}`);
  const value = parseFloat(input.value) || 0;
  const res = await fetch(`/api/habits/${id}/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })
  });
  const data = await res.json();
  await loadUser();
  if (data.xpEarned > 0) {
    showToast('xp', 'sparkle', `+${data.xpEarned} XP`, data.completed ? 'Objectif atteint' : 'Progression enregistrée');
  }
  handleLevelUpAndBadges(data);
  await loadHabits();
}

async function deleteHabit(id) {
  if (!confirm('Supprimer ce rituel ?')) return;
  await fetch(`/api/habits/${id}`, { method: 'DELETE' });
  await loadHabits();
}

function setupHabitModal() {
  document.querySelectorAll('[data-htype]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-htype]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.habitFormType = btn.dataset.htype;
      document.getElementById('habit-target-group').style.display = btn.dataset.htype === 'number' ? 'block' : 'none';
    });
  });
  document.querySelectorAll('[data-hfreq]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-hfreq]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.habitFormFreq = btn.dataset.hfreq;
    });
  });
}

function openHabitModal() {
  document.getElementById('habit-modal').style.display = 'flex';
  document.getElementById('habit-name').value = '';
  document.getElementById('habit-desc').value = '';
  document.getElementById('habit-target').value = '';
  document.getElementById('habit-unit').value = '';
  document.getElementById('habit-name').focus();
}

function closeHabitModal() {
  document.getElementById('habit-modal').style.display = 'none';
}

async function createHabit() {
  const name = document.getElementById('habit-name').value.trim();
  if (!name) { document.getElementById('habit-name').focus(); return; }
  await fetch('/api/habits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      desc: document.getElementById('habit-desc').value.trim(),
      type: state.habitFormType,
      frequency: state.habitFormFreq,
      target: parseFloat(document.getElementById('habit-target').value) || null,
      unit: document.getElementById('habit-unit').value.trim(),
      xp: state.habitFormType === 'check' ? 50 : 40
    })
  });
  closeHabitModal();
  await loadHabits();
  showToast('success', 'check', 'Rituel créé', name);
}

// ─── COACH ────────────────────────────────────────────────────────────────
async function loadCoachPage() {
  await loadConfig();
  document.getElementById('coach-no-key').style.display = state.hasApiKey ? 'none' : 'block';
  await loadChatHistory();
  await loadSupplements();
  await loadTargetSummary();
}

async function loadChatHistory() {
  const res = await fetch('/api/coach/history');
  const history = await res.json();
  const container = document.getElementById('chat-messages');
  if (!history.length) {
    container.innerHTML = `
      <div class="chat-empty">
        ${icon('message', 'icon icon-xl')}
        <p>Présente-toi, partage tes objectifs, envoie une photo de ton physique actuel ou de tes compléments.</p>
      </div>`;
    return;
  }
  container.innerHTML = history.map(m => renderMessage(m)).join('');
  scrollChatToBottom();
}

function renderMessage(m) {
  const textBlocks = m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  const imageBlocks = m.content.filter(c => c.type === 'image');
  let bodyHtml = '';
  if (imageBlocks.length) {
    bodyHtml += `<div class="msg-images">${imageBlocks.map(img =>
      `<img src="${img.url}" alt="" onclick="openLightbox('${img.url}')">`
    ).join('')}</div>`;
  }
  if (textBlocks) {
    if (m.role === 'assistant' && window.marked) {
      bodyHtml += `<div>${marked.parse(textBlocks)}</div>`;
    } else {
      bodyHtml += textBlocks.split('\n').map(p => `<p>${esc(p)}</p>`).join('');
    }
  }
  return `<div class="chat-message ${m.role}"><div class="msg-bubble">${bodyHtml}</div></div>`;
}

function scrollChatToBottom() {
  const c = document.getElementById('chat-messages');
  c.scrollTop = c.scrollHeight;
}

function handleChatKey(e) {
  // Auto-resize
  const input = e.target;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';
  // Send on Enter (not shift+enter)
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

async function handleImageSelect(e) {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const resized = await resizeImage(file, 1600);
    state.pendingImages.push(resized);
  }
  e.target.value = '';
  renderPendingImages();
}

function resizeImage(file, maxSize = 1600) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round(height * (maxSize / width)); width = maxSize; }
          else { width = Math.round(width * (maxSize / height)); height = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          const r = new FileReader();
          r.onload = () => resolve({
            base64: r.result.split(',')[1],
            media_type: 'image/jpeg',
            preview: r.result
          });
          r.readAsDataURL(blob);
        }, 'image/jpeg', 0.85);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderPendingImages() {
  const container = document.getElementById('chat-pending-images');
  container.innerHTML = state.pendingImages.map((img, i) => `
    <div class="chat-pending-image">
      <img src="${img.preview}" alt="">
      <button class="remove" onclick="removePendingImage(${i})">×</button>
    </div>
  `).join('');
}

function removePendingImage(idx) {
  state.pendingImages.splice(idx, 1);
  renderPendingImages();
}

async function sendChatMessage() {
  if (state.chatBusy) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text && !state.pendingImages.length) return;
  if (!state.hasApiKey) {
    showToast('warning', 'settings', 'Clé API manquante', 'Configure-la dans les paramètres.');
    openSettingsModal();
    return;
  }

  state.chatBusy = true;
  document.getElementById('chat-send-btn').disabled = true;

  // Optimistic UI: add user message
  const container = document.getElementById('chat-messages');
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();

  const userContent = [];
  if (text) userContent.push({ type: 'text', text });
  for (const img of state.pendingImages) {
    userContent.push({ type: 'image', url: img.preview, media_type: img.media_type });
  }
  container.insertAdjacentHTML('beforeend', renderMessage({ role: 'user', content: userContent }));
  scrollChatToBottom();

  // Typing indicator
  const typing = document.createElement('div');
  typing.className = 'chat-typing';
  typing.id = 'chat-typing-indicator';
  typing.innerHTML = '<span></span><span></span><span></span>';
  container.appendChild(typing);
  scrollChatToBottom();

  // Clear input + pending
  const imagesPayload = state.pendingImages.map(img => ({ base64: img.base64, media_type: img.media_type }));
  input.value = '';
  input.style.height = 'auto';
  state.pendingImages = [];
  renderPendingImages();

  try {
    const res = await fetch('/api/coach/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, images: imagesPayload })
    });
    const data = await res.json();
    document.getElementById('chat-typing-indicator')?.remove();
    if (!res.ok) {
      showToast('warning', 'close', 'Erreur', data.message || 'Échec de l\'envoi');
      // Remove the optimistic user msg? leave it.
      return;
    }
    container.insertAdjacentHTML('beforeend', renderMessage({
      role: 'assistant',
      content: [{ type: 'text', text: data.reply }]
    }));
    scrollChatToBottom();
  } catch (err) {
    document.getElementById('chat-typing-indicator')?.remove();
    showToast('warning', 'close', 'Erreur réseau', err.message);
  } finally {
    state.chatBusy = false;
    document.getElementById('chat-send-btn').disabled = false;
  }
}

function openLightbox(url) {
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.innerHTML = `<img src="${url}">`;
  box.onclick = () => box.remove();
  document.body.appendChild(box);
}

// ─── Supplements ──────────────────────────────────────────────────────────
async function loadSupplements() {
  const res = await fetch('/api/supplements');
  state.supplements = await res.json();
  renderSupplements();
}

function renderSupplements() {
  const container = document.getElementById('supplements-list');
  if (!state.supplements.length) {
    container.innerHTML = '<p class="empty-state">Aucun complément déclaré.</p>';
    return;
  }
  container.innerHTML = state.supplements.map(s => `
    <div class="supplement-item">
      <div class="supp-info">
        <div class="supp-name">${esc(s.name)}</div>
        <div class="supp-meta">${[s.dose, s.timing, s.notes].filter(Boolean).map(esc).join(' • ')}</div>
      </div>
      <button class="supp-delete" onclick="deleteSupplement('${s.id}')" title="Supprimer">×</button>
    </div>
  `).join('');
}

function openSupplementModal() {
  document.getElementById('supplement-modal').style.display = 'flex';
  ['name','dose','timing','notes'].forEach(k => document.getElementById('supp-' + k).value = '');
  document.getElementById('supp-name').focus();
}

function closeSupplementModal() {
  document.getElementById('supplement-modal').style.display = 'none';
}

async function createSupplement() {
  const name = document.getElementById('supp-name').value.trim();
  if (!name) { document.getElementById('supp-name').focus(); return; }
  await fetch('/api/supplements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      dose: document.getElementById('supp-dose').value.trim(),
      timing: document.getElementById('supp-timing').value.trim(),
      notes: document.getElementById('supp-notes').value.trim()
    })
  });
  closeSupplementModal();
  await loadSupplements();
  showToast('success', 'check', 'Complément ajouté', name);
}

async function deleteSupplement(id) {
  await fetch(`/api/supplements/${id}`, { method: 'DELETE' });
  await loadSupplements();
}

// ─── Target physique summary on Coach sidebar ─────────────────────────────
async function loadTargetSummary() {
  const res = await fetch('/api/physique');
  state.physique = await res.json();
  const t = state.physique;
  const container = document.getElementById('target-summary');
  const parts = [];
  if (t.targetDescription) parts.push(`<p>${esc(t.targetDescription)}</p>`);
  const stats = [];
  if (t.targetWeight) stats.push(`<strong>${t.targetWeight}kg</strong>`);
  if (t.targetBodyfat) stats.push(`<strong>${t.targetBodyfat}% MG</strong>`);
  if (t.targetDeadline) stats.push(`<strong>${esc(t.targetDeadline)}</strong>`);
  if (stats.length) parts.push(`<p>${stats.join(' • ')}</p>`);
  if (!parts.length) {
    container.innerHTML = '<p class="empty-state">Aucun objectif défini.</p>';
  } else {
    container.innerHTML = parts.join('');
  }
}

// ─── Goals ────────────────────────────────────────────────────────────────
async function loadGoalsPage() {
  const res = await fetch('/api/goals');
  state.goals = await res.json();
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'daily';
  renderGoals(activeTab);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGoals(btn.dataset.tab);
    };
  });
}

function renderGoals(type) {
  const filtered = state.goals.filter(g => g.type === type && !g.archived);
  const container = document.getElementById('goals-list');
  const t = todayStr();
  if (!filtered.length) {
    const label = type === 'daily' ? 'quotidien' : type === 'weekly' ? 'hebdomadaire' : 'long terme';
    container.innerHTML = `<div class="card"><p class="empty-state">Aucun objectif ${label}. Crée-en un.</p></div>`;
    return;
  }
  container.innerHTML = filtered.map(g => {
    const doneToday = (g.completedDates || []).includes(t);
    return `
    <div class="goal-item" style="--goal-color: ${g.color}">
      <div class="goal-info">
        <div class="goal-title-text">${esc(g.title)}</div>
        ${g.description ? `<div class="goal-desc-text">${esc(g.description)}</div>` : ''}
      </div>
      <div class="goal-meta">
        <span class="goal-type-badge">${g.type === 'daily' ? 'Quotidien' : g.type === 'weekly' ? 'Hebdo' : 'Long terme'}</span>
        <span class="goal-xp-badge">+${g.xpReward} XP</span>
        ${doneToday
          ? `<button class="btn btn-ghost" disabled style="opacity: 0.6;">Fait aujourd'hui</button>`
          : `<button class="btn btn-primary" onclick="completeGoal('${g.id}')">Marquer fait</button>`}
        <button class="goal-delete-btn" onclick="deleteGoal('${g.id}')" title="Supprimer">${icon('trash')}</button>
      </div>
    </div>
  `;}).join('');
}

async function completeGoal(id) {
  const res = await fetch(`/api/goals/${id}/complete`, { method: 'POST' });
  const data = await res.json();
  if (data.alreadyDone) {
    showToast('warning', 'check', 'Déjà fait aujourd\'hui', '');
    return;
  }
  await loadUser();
  showToast('xp', 'sparkle', `+${data.xpEarned} XP`, 'Quête complétée');
  handleLevelUpAndBadges(data);
  await loadGoalsPage();
}

function setupGoalModal() {
  document.querySelectorAll('[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedGoalType = btn.dataset.type;
    });
  });
  document.querySelectorAll('.color-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedColor = btn.dataset.color;
    });
  });
}

function openGoalModal() {
  document.getElementById('goal-modal').style.display = 'flex';
  document.getElementById('goal-title').value = '';
  document.getElementById('goal-desc').value = '';
  document.getElementById('goal-title').focus();
}

function closeGoalModal() {
  document.getElementById('goal-modal').style.display = 'none';
}

async function createGoal() {
  const title = document.getElementById('goal-title').value.trim();
  if (!title) { document.getElementById('goal-title').focus(); return; }
  await fetch('/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      description: document.getElementById('goal-desc').value.trim(),
      type: state.selectedGoalType,
      color: state.selectedColor
    })
  });
  closeGoalModal();
  await loadGoalsPage();
  showToast('success', 'target', 'Quête créée', title);
}

async function deleteGoal(id) {
  await fetch(`/api/goals/${id}`, { method: 'DELETE' });
  await loadGoalsPage();
}

// ─── Physique ─────────────────────────────────────────────────────────────
async function loadPhysiquePage() {
  const res = await fetch('/api/physique');
  const data = await res.json();
  state.physique = data;
  document.getElementById('t-description').value = data.targetDescription || '';
  document.getElementById('t-weight').value = data.targetWeight || '';
  document.getElementById('t-bodyfat').value = data.targetBodyfat || '';
  document.getElementById('t-deadline').value = data.targetDeadline || '';
  renderMeasurements(data.measurements || []);
}

async function saveTarget() {
  const payload = {
    targetDescription: document.getElementById('t-description').value.trim(),
    targetWeight: parseFloat(document.getElementById('t-weight').value) || null,
    targetBodyfat: parseFloat(document.getElementById('t-bodyfat').value) || null,
    targetDeadline: document.getElementById('t-deadline').value.trim()
  };
  await fetch('/api/physique', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  showToast('success', 'check', 'Cible enregistrée', 'Le coach utilisera cette info.');
}

function renderMeasurements(list) {
  const container = document.getElementById('measurements-list');
  if (!list.length) {
    container.innerHTML = '<p class="empty-state">Aucune mesure enregistrée.</p>';
    return;
  }
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
  container.innerHTML = sorted.map(m => `
    <div class="measurement-row">
      <div class="measurement-date">${formatDate(m.date)}</div>
      <div class="measurement-cell"><span class="label">Poids</span><span class="value">${m.weight ? m.weight + 'kg' : '—'}</span></div>
      <div class="measurement-cell"><span class="label">% Gras</span><span class="value">${m.bodyfat ? m.bodyfat + '%' : '—'}</span></div>
      <div class="measurement-cell"><span class="label">Poitrine</span><span class="value">${m.chest ? m.chest + 'cm' : '—'}</span></div>
      <div class="measurement-cell"><span class="label">Taille</span><span class="value">${m.waist ? m.waist + 'cm' : '—'}</span></div>
      <div class="measurement-cell"><span class="label">Bras</span><span class="value">${m.arm ? m.arm + 'cm' : '—'}</span></div>
      <button class="goal-delete-btn" onclick="deleteMeasurement('${m.id}')" title="Supprimer">${icon('trash')}</button>
    </div>
  `).join('');
}

async function saveMeasurement() {
  const payload = {
    date: document.getElementById('m-date').value || todayStr(),
    weight: parseFloat(document.getElementById('m-weight').value) || null,
    bodyfat: parseFloat(document.getElementById('m-bodyfat').value) || null,
    chest: parseFloat(document.getElementById('m-chest').value) || null,
    waist: parseFloat(document.getElementById('m-waist').value) || null,
    arm: parseFloat(document.getElementById('m-arm').value) || null,
    notes: document.getElementById('m-notes').value
  };
  await fetch('/api/physique/measurement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  ['weight','bodyfat','chest','waist','arm','notes'].forEach(k => document.getElementById('m-' + k).value = '');
  await loadPhysiquePage();
  showToast('success', 'check', 'Mesure enregistrée', 'Continue à suivre l\'évolution.');
}

async function deleteMeasurement(id) {
  await fetch(`/api/physique/measurement/${id}`, { method: 'DELETE' });
  await loadPhysiquePage();
}

// ─── Settings ─────────────────────────────────────────────────────────────
async function openSettingsModal() {
  await loadUser();
  document.getElementById('settings-modal').style.display = 'flex';
  const input = document.getElementById('settings-name');
  if (input) {
    input.value = state.user?.name || '';
    setTimeout(() => input.focus(), 50);
  }
}

function closeSettingsModal() {
  document.getElementById('settings-modal').style.display = 'none';
}

async function saveSettings() {
  const nameInput = document.getElementById('settings-name');
  const name = (nameInput?.value || '').trim();
  if (!name) {
    showToast('warning', 'close', 'Prénom requis', '');
    return;
  }
  await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  await loadUser();
  closeSettingsModal();
  showToast('success', 'check', 'Prénom sauvegardé', name);
  setDateDisplays();
}

// ─── Stats ────────────────────────────────────────────────────────────────
async function loadStatsPage() {
  const res = await fetch('/api/stats');
  const stats = await res.json();

  const activeDays = stats.last30.filter(d => d.hasEntry).length;
  const habits30 = stats.last30.reduce((s, d) => s + (d.habitsCompleted || 0), 0);
  document.getElementById('stat-active-days').textContent = activeDays;
  document.getElementById('stat-habits-30').textContent = habits30;
  document.getElementById('stat-longest').textContent = stats.longestStreak;
  document.getElementById('stat-total-xp').textContent = stats.totalXp.toLocaleString();

  const labels = stats.last30.map(d => d.date.slice(5));
  const activityData = stats.last30.map(d => d.habitsCompleted || 0);
  const xpData = stats.last30.map(d => d.xp);

  const chartDefaults = {
    responsive: true,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0d0d18', borderColor: '#c4b5fd33', borderWidth: 1, padding: 10, titleColor: '#e9e6f3', bodyColor: '#b8b4ce' } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#6b6783', font: { size: 10, family: 'Inter' }, maxTicksLimit: 10 } },
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#6b6783', font: { size: 10, family: 'Inter' } }, beginAtZero: true }
    }
  };

  if (state.activityChart) state.activityChart.destroy();
  state.activityChart = new Chart(document.getElementById('activity-chart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: activityData,
        borderColor: '#c4b5fd',
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#f0abfc',
        pointBorderColor: '#0d0d18',
        pointBorderWidth: 1,
        fill: true,
        tension: 0.35
      }]
    },
    options: chartDefaults
  });

  if (state.xpChart) state.xpChart.destroy();
  state.xpChart = new Chart(document.getElementById('xp-chart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: xpData,
        backgroundColor: 'rgba(236, 72, 153, 0.35)',
        borderColor: '#f0abfc',
        borderWidth: 1,
        borderRadius: 3
      }]
    },
    options: chartDefaults
  });
}

// ─── Achievements ─────────────────────────────────────────────────────────
async function loadAchievements() {
  const badges = await (await fetch('/api/badges')).json();
  const container = document.getElementById('badges-grid');
  container.innerHTML = badges.map(b => `
    <div class="badge-card ${b.unlocked ? 'unlocked' : 'locked'}">
      <div class="badge-mark">${icon(b.icon || 'star', 'icon icon-lg')}</div>
      <div class="badge-name">${esc(b.name)}</div>
      <div class="badge-desc">${esc(b.desc)}</div>
      ${b.unlocked ? '<span class="badge-unlocked-tag">Débloqué</span>' : ''}
    </div>
  `).join('');
}

// ─── Level up & badges ────────────────────────────────────────────────────
function handleLevelUpAndBadges(data) {
  if (data.newBadges && data.newBadges.length > 0) {
    setTimeout(() => {
      data.newBadges.forEach(b => showToast('badge', b.icon || 'star', 'Succès débloqué', b.name));
    }, 600);
  }
  if (data.leveledUp) {
    setTimeout(() => {
      document.getElementById('levelup-num').textContent = `Niveau ${data.level}`;
      document.getElementById('levelup-overlay').style.display = 'flex';
    }, 1000);
  }
}

function closeLevelUp() {
  document.getElementById('levelup-overlay').style.display = 'none';
}

// ─── Toast ────────────────────────────────────────────────────────────────
function showToast(type, iconName, title, desc) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `${icon(iconName, 'icon icon-lg')}<div><div class="toast-title">${esc(title)}</div>${desc ? `<div class="toast-desc">${esc(desc)}</div>` : ''}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    toast.style.transition = '0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── JOURNAL ──────────────────────────────────────────────────────────────
function setDailyPrompt() {
  const day = new Date().getDate();
  const el = document.getElementById('daily-prompt');
  if (el) el.textContent = PROMPTS[day % PROMPTS.length];
}

function setupMoodSelector() {
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => selectMood(parseInt(btn.dataset.mood)));
  });
}

function selectMood(mood) {
  state.selectedMood = mood;
  document.querySelectorAll('.mood-btn').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.mood) === mood);
  });
}

async function loadJournalPage() {
  await loadUser();

  // Today's entry (if any)
  const todayRes = await fetch('/api/journal/today');
  const today = await todayRes.json();
  const textarea = document.getElementById('journal-content');
  if (today) {
    textarea.value = today.content || '';
    if (today.mood) selectMood(today.mood);
    else {
      state.selectedMood = null;
      document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
    }
  } else {
    textarea.value = '';
    state.selectedMood = null;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  }

  // Recent entries
  const allRes = await fetch('/api/journal');
  const all = await allRes.json();
  const recent = all.slice(-5).reverse();
  const recContainer = document.getElementById('recent-entries');
  if (!recent.length) {
    recContainer.innerHTML = '<p class="empty-state">Aucune entrée pour l\'instant.</p>';
  } else {
    recContainer.innerHTML = recent.map(e => `
      <div class="recent-entry">
        <div class="recent-entry-date">${formatDate(e.date)} ${e.mood ? `<span class="recent-entry-mood">${e.mood}/10</span>` : ''}</div>
        <div class="recent-entry-preview">${esc((e.content || '').substring(0, 100))}${(e.content || '').length > 100 ? '…' : ''}</div>
      </div>
    `).join('');
  }
}

async function saveJournal() {
  const content = document.getElementById('journal-content').value.trim();
  if (!content) {
    showToast('warning', 'pen', 'Entrée vide', 'Écris au moins quelques mots.');
    return;
  }

  const btn = document.getElementById('save-journal-btn');
  btn.disabled = true;
  btn.textContent = 'Sauvegarde…';

  try {
    const res = await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mood: state.selectedMood, goalsCompleted: [] })
    });
    const data = await res.json();

    await loadUser();
    showToast('xp', 'sparkle', `+${data.xpEarned} XP`, `Streak : ${data.streak} jour${data.streak !== 1 ? 's' : ''}`);
    handleLevelUpAndBadges(data);
    showToast('success', 'check', 'Journée sauvegardée', 'Bien.');
    await loadJournalPage();
  } catch (e) {
    showToast('warning', 'close', 'Erreur', 'Impossible de sauvegarder.');
  }

  btn.disabled = false;
  btn.textContent = 'Sauvegarder';
}

// ─── FITNESS ──────────────────────────────────────────────────────────────
let fitnessState = {
  exercises: [],
  selectedType: null,
  activeSession: null,
  dashboard: null,
  bwChart: null,
  progressChart: null
};

const SESSION_TYPES = ['push', 'pull', 'legs', 'upper', 'cardio'];

async function loadFitnessPage() {
  await loadExercisesList();
  await loadFitnessDashboard();
  await loadIntakesToday();
  await loadRecentSessions();
  await loadBodyweightChart();
  populateProgressionSelect();
  renderMealPlan();
  renderShoppingList();
}

const MEAL_PLAN = [
  { name: 'Matin', time: '~8h', kcal: 500, protein: 32, ingredients: "80 g flocons d'avoine + 1 banane + 200 ml lait demi-écrémé + 25 g whey" },
  { name: 'Collation matin', time: '~11h', kcal: 150, protein: 18, ingredients: "1 skyr 0% nature (150 g) + 1 pomme", optional: true },
  { name: 'Déjeuner', time: '~13h', kcal: 700, protein: 45, ingredients: "100 g riz cru (≈300 g cuit) + 150 g poulet (blanc ou cuisse) + 200 g légumes surgelés + 1 c.à.c huile d'olive" },
  { name: 'Post-training', time: '~17h', kcal: 280, protein: 28, ingredients: "25 g whey + 250 ml eau + 1 banane (ou 40 g flocons d'avoine)" },
  { name: 'Dîner', time: '~20h', kcal: 700, protein: 35, ingredients: "3 œufs entiers + 1 blanc + 80 g pâtes complètes sec (ou 250 g pommes de terre) + 200 g légumes + 30 g emmental râpé" }
];

const SHOPPING_LIST = {
  total: '~28 € / semaine (+ ~5 €/sem amorti pour whey + créatine)',
  stores: [
    {
      name: 'Lidl Marly (~12 €)',
      items: [
        ["Flocons d'avoine 1 kg", '1,40 €'],
        ['Œufs frais (2 × boîte de 12)', '6,40 €'],
        ['Skyr 0% nature × 4 pots', '3,00 €'],
        ['Bananes 1,5 kg', '1,90 €'],
        ['Pommes 1 kg', '1,80 €'],
        ['Légumes surgelés 1 kg (mélange ou brocolis)', '1,50 €'],
        ['Lait demi-écrémé 1 L', '1,00 €']
      ]
    },
    {
      name: 'Carrefour Aulnoy (~13 €)',
      items: [
        ['Blanc de poulet 800 g - 1 kg (ou cuisses ~4 €/kg)', '7-9 €'],
        ["Thon en boîte à l'eau MDD × 4", '3,50 €'],
        ['Riz blanc 1 kg', '1,20 €'],
        ['Pâtes complètes 500 g × 2', '1,80 €'],
        ['Emmental râpé MDD 200 g', '1,80 €'],
        ["Huile d'olive 500 ml (tous les 2 mois)", '—']
      ]
    },
    {
      name: 'Compléments (par mois ou 2)',
      items: [
        ['Whey 2 kg MDD (Carrefour, Auchan, Décathlon)', '35-45 €'],
        ['Créatine monohydrate 300 g', '12-15 €']
      ]
    }
  ]
};

function renderMealPlan() {
  const c = document.getElementById('meal-plan-list');
  if (!c) return;
  c.innerHTML = MEAL_PLAN.map((m, i) => `
    <div class="meal-item">
      <div class="meal-header">
        <div class="meal-info">
          <div class="meal-name">${esc(m.name)} <span class="meal-time">${esc(m.time)}</span>${m.optional ? '<span class="meal-opt">optionnel</span>' : ''}</div>
          <div class="meal-ingredients">${esc(m.ingredients)}</div>
        </div>
        <div class="meal-macros">
          <div class="meal-kcal">+${m.kcal} kcal</div>
          <div class="meal-prot">+${m.protein} g prot</div>
        </div>
      </div>
      <button class="meal-add-btn" onclick="addMealToNutrition(${i})">+ Ajouter au jour</button>
    </div>
  `).join('');
}

function renderShoppingList() {
  const c = document.getElementById('shopping-list');
  if (!c) return;
  let html = `<p class="form-help" style="margin-bottom: 14px;">${esc(SHOPPING_LIST.total)}</p>`;
  for (const store of SHOPPING_LIST.stores) {
    html += `
      <div class="shop-store">
        <div class="shop-store-header">
          <span class="shop-store-name">${esc(store.name)}</span>
        </div>
        <div class="shop-items">
          ${store.items.map(([item, price]) => `
            <div class="shop-item">
              <span>${esc(item)}</span>
              <span class="shop-price">${esc(price)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  c.innerHTML = html;
}

async function addMealToNutrition(idx) {
  const meal = MEAL_PLAN[idx];
  const calEl = document.getElementById('nut-calories');
  const proEl = document.getElementById('nut-protein');
  const carbsEl = document.getElementById('nut-carbs');
  const fatEl = document.getElementById('nut-fat');
  const notesEl = document.getElementById('nut-notes');

  const newCal = (parseFloat(calEl.value) || 0) + meal.kcal;
  const newPro = (parseFloat(proEl.value) || 0) + meal.protein;
  calEl.value = newCal;
  proEl.value = newPro;

  await fetch('/api/nutrition/today', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      calories_kcal: newCal,
      protein_g: newPro,
      carbs_g: parseFloat(carbsEl.value) || '',
      fat_g: parseFloat(fatEl.value) || '',
      notes: notesEl.value
    })
  });
  showToast('xp', 'check', `${meal.name} ajouté`, `+${meal.kcal} kcal · +${meal.protein} g prot`);
  await loadFitnessDashboard();
}

async function resetNutrition() {
  if (!confirm('Effacer les macros du jour ?')) return;
  ['nut-calories','nut-protein','nut-carbs','nut-fat','nut-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  await fetch('/api/nutrition/today', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ calories_kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, notes: '' })
  });
  showToast('success', 'check', 'Macros effacées', '');
  await loadFitnessDashboard();
}

async function loadExercisesList() {
  const res = await fetch('/api/exercises');
  fitnessState.exercises = await res.json();
}

async function loadFitnessDashboard() {
  const res = await fetch('/api/fitness/dashboard');
  const d = await res.json();
  fitnessState.dashboard = d;
  fitnessState.activeSession = d.active_session;

  // Snapshot cards
  const protein = Math.round(d.today.protein_g);
  const proteinWithWhey = Math.round(d.today.protein_g_with_whey);
  const target = d.profile.protein_target_g;
  document.getElementById('snap-protein').innerHTML = `${proteinWithWhey}<span class="snap-unit">g</span>`;
  document.getElementById('snap-protein-target').textContent = target ? `cible ${target}g (incl. whey)` : 'pèse-toi pour calculer';
  const bar = document.getElementById('snap-protein-bar');
  if (target) {
    const pct = Math.min((proteinWithWhey / target) * 100, 100);
    bar.style.width = pct + '%';
    bar.classList.remove('low','mid','full');
    if (pct < 80) bar.classList.add('low');
    else if (pct < 100) bar.classList.add('mid');
    else bar.classList.add('full');
  } else { bar.style.width = '0%'; }

  document.getElementById('snap-creatine').textContent = d.today.creatine_taken ? 'Prise ✓' : 'Non prise';
  document.getElementById('snap-creatine').style.color = d.today.creatine_taken ? '#34d399' : 'var(--pink-soft)';

  document.getElementById('snap-whey').innerHTML = `${d.today.whey_count}<span class="snap-unit">×</span>`;
  document.getElementById('snap-whey-detail').textContent = `${d.today.whey_protein_added} g protéines`;

  document.getElementById('snap-calories').innerHTML = `${d.today.calories_kcal}<span class="snap-unit">kcal</span>`;
  document.getElementById('snap-cal-target').textContent = `cible ${d.profile.calorie_target_kcal} kcal`;

  document.getElementById('snap-sessions').innerHTML = `${d.week.sessions_count}<span class="snap-unit">/${d.week.sessions_target}</span>`;

  // Profile form
  document.getElementById('prof-height').value = d.profile.height_cm || '';
  document.getElementById('prof-calories').value = d.profile.calorie_target_kcal || '';
  document.getElementById('prof-sessions').value = d.profile.weekly_session_target || '';
  document.getElementById('prof-creatine').value = d.profile.creatine_daily_g || '';
  document.getElementById('profile-protein-target').textContent = target
    ? `Cible protéines calculée : ${target}g/jour (1,8 × ${d.profile.bodyweight_kg}kg)`
    : `Enregistre ton poids pour calculer la cible protéines.`;

  // Nutrition form
  const n = await (await fetch('/api/nutrition/today')).json();
  if (n) {
    document.getElementById('nut-calories').value = n.calories_kcal || '';
    document.getElementById('nut-protein').value = n.protein_g || '';
    document.getElementById('nut-carbs').value = n.carbs_g || '';
    document.getElementById('nut-fat').value = n.fat_g || '';
    document.getElementById('nut-notes').value = n.notes || '';
  }

  // Whey/creatine quick-sub
  document.getElementById('whey-quick-sub').textContent = `${d.profile.whey_per_serving_g}g`;
  document.getElementById('creatine-quick-sub').textContent = `${d.profile.creatine_daily_g}g`;

  // Bodyweight current display
  if (d.profile.bodyweight_kg) {
    document.getElementById('bw-current').textContent = `Dernier poids enregistré : ${d.profile.bodyweight_kg} kg`;
  } else {
    document.getElementById('bw-current').textContent = 'Aucun poids enregistré.';
  }

  // Workout card
  renderWorkoutCard();
}

function renderWorkoutCard() {
  const content = document.getElementById('workout-content');
  const title = document.getElementById('workout-card-title');
  if (fitnessState.activeSession) {
    title.textContent = 'Séance en cours';
    renderActiveSession();
  } else {
    title.textContent = 'Démarrer une séance';
    content.innerHTML = `
      <p class="form-help">Choisis le type de séance — les exercices du programme s'affichent.</p>
      <div class="workout-type-select">
        ${SESSION_TYPES.map(t => `<button class="workout-type-btn" data-type="${t}" onclick="selectWorkoutType('${t}')">${t === 'push' ? 'Push' : t === 'pull' ? 'Pull' : t === 'legs' ? 'Legs' : t === 'upper' ? 'Upper' : 'Cardio'}</button>`).join('')}
      </div>
      <button class="btn btn-primary btn-large" id="start-session-btn" onclick="startSession()" disabled style="opacity: 0.5;">
        Démarrer
      </button>
    `;
  }
}

function selectWorkoutType(type) {
  fitnessState.selectedType = type;
  document.querySelectorAll('.workout-type-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  const btn = document.getElementById('start-session-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
}

async function startSession() {
  if (!fitnessState.selectedType) return;
  const res = await fetch('/api/workouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: fitnessState.selectedType })
  });
  const session = await res.json();
  fitnessState.activeSession = session;
  await renderActiveSession();
  renderWorkoutCard();
  showToast('success', 'play', 'Séance démarrée', `Type : ${session.type}`);
}

async function renderActiveSession() {
  const session = fitnessState.activeSession;
  if (!session) return;
  const content = document.getElementById('workout-content');
  const detail = await (await fetch(`/api/workouts/${session.id}`)).json();

  // Filter exercises by session type
  let visibleExercises = fitnessState.exercises;
  if (session.type === 'upper') {
    visibleExercises = fitnessState.exercises.filter(e => e.muscle_group === 'push' || e.muscle_group === 'pull');
  } else if (session.type !== 'cardio') {
    visibleExercises = fitnessState.exercises.filter(e => e.muscle_group === session.type);
  } else {
    visibleExercises = fitnessState.exercises.filter(e => e.muscle_group === 'cardio');
  }

  // Group sets by exercise
  const setsByExercise = {};
  for (const s of detail.sets) {
    if (!setsByExercise[s.exercise_id]) setsByExercise[s.exercise_id] = [];
    setsByExercise[s.exercise_id].push(s);
  }
  Object.values(setsByExercise).forEach(arr => arr.sort((a,b) => a.set_number - b.set_number));

  // Build exercise blocks
  const blocks = await Promise.all(visibleExercises.map(async ex => {
    const last = await (await fetch(`/api/exercises/${ex.id}/last`)).json();
    const sets = setsByExercise[ex.id] || [];
    return `
      <div class="exercise-block">
        <div class="exercise-header">
          <div>
            <div class="exercise-name">${esc(ex.name)}</div>
            <div class="exercise-target">${ex.target_sets ? ex.target_sets + ' × ' + esc(ex.target_reps) : ''}</div>
            ${last ? `<div class="exercise-last">Dernière fois : ${last.sets.map(s => `${s.weight_kg}kg × ${s.reps}`).join(' / ')}</div>` : ''}
          </div>
        </div>
        ${sets.map(s => `
          <div class="set-row">
            <span class="set-num">${s.set_number}</span>
            <div class="set-input-wrap"><input class="set-input" type="number" step="0.5" value="${s.weight_kg}" disabled><span class="lbl">kg</span></div>
            <div class="set-input-wrap"><input class="set-input" type="number" value="${s.reps}" disabled><span class="lbl">reps</span></div>
            <button class="set-del" onclick="deleteSet('${session.id}', '${s.id}')">×</button>
          </div>
        `).join('')}
        <div class="set-row" style="margin-top: 4px;">
          <span class="set-num">${sets.length + 1}</span>
          <div class="set-input-wrap"><input class="set-input" type="number" step="0.5" placeholder="${last && last.sets[sets.length] ? last.sets[sets.length].weight_kg : ''}" id="w-${ex.id}"><span class="lbl">kg</span></div>
          <div class="set-input-wrap"><input class="set-input" type="number" placeholder="${last && last.sets[sets.length] ? last.sets[sets.length].reps : ''}" id="r-${ex.id}"><span class="lbl">reps</span></div>
          <button class="set-add-btn" style="grid-column: 4 / 5; padding: 6px; margin-top: 0;" onclick="addSet('${session.id}', '${ex.id}')">+</button>
        </div>
      </div>
    `;
  }));

  const startedAt = new Date(session.createdAt);
  content.innerHTML = `
    <div class="workout-active">
      <div class="workout-meta">
        <div class="workout-meta-info">
          <strong>Type</strong>
          ${session.type}
        </div>
        <div class="workout-meta-info" style="text-align: right;">
          <strong>Démarré</strong>
          ${startedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
      ${blocks.join('')}
      <div style="display: flex; gap: 8px; margin-top: 10px;">
        <button class="btn btn-ghost" onclick="cancelSession('${session.id}')" style="flex: 1;">Annuler</button>
        <button class="btn btn-primary" onclick="endSession('${session.id}')" style="flex: 2;">Terminer la séance</button>
      </div>
    </div>
  `;
}

async function addSet(sessionId, exerciseId) {
  const w = parseFloat(document.getElementById('w-' + exerciseId).value);
  const r = parseInt(document.getElementById('r-' + exerciseId).value);
  if (!w || !r) { showToast('warning', 'close', 'Champs manquants', 'Poids et reps requis'); return; }
  await fetch(`/api/workouts/${sessionId}/sets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exercise_id: exerciseId, weight_kg: w, reps: r })
  });
  await renderActiveSession();
}

async function deleteSet(sessionId, setId) {
  await fetch(`/api/workouts/${sessionId}/sets/${setId}`, { method: 'DELETE' });
  await renderActiveSession();
}

async function endSession(sessionId) {
  await fetch(`/api/workouts/${sessionId}/end`, { method: 'POST' });
  fitnessState.activeSession = null;
  fitnessState.selectedType = null;
  showToast('success', 'check', 'Séance terminée', 'Bon repos.');
  await loadFitnessDashboard();
  await loadRecentSessions();
  populateProgressionSelect();
}

async function cancelSession(sessionId) {
  if (!confirm('Annuler cette séance ? Les séries enregistrées seront supprimées.')) return;
  await fetch(`/api/workouts/${sessionId}`, { method: 'DELETE' });
  fitnessState.activeSession = null;
  fitnessState.selectedType = null;
  await loadFitnessDashboard();
}

async function saveNutrition() {
  const payload = {
    calories_kcal: document.getElementById('nut-calories').value,
    protein_g: document.getElementById('nut-protein').value,
    carbs_g: document.getElementById('nut-carbs').value,
    fat_g: document.getElementById('nut-fat').value,
    notes: document.getElementById('nut-notes').value
  };
  await fetch('/api/nutrition/today', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  showToast('success', 'check', 'Nutrition enregistrée', '');
  await loadFitnessDashboard();
}

async function logIntake(type) {
  await fetch('/api/supplements/intake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type })
  });
  showToast('success', 'check', type === 'whey' ? 'Whey enregistrée' : 'Créatine enregistrée', '');
  await loadFitnessDashboard();
  await loadIntakesToday();
}

async function loadIntakesToday() {
  const res = await fetch('/api/supplements/intake/today');
  const list = await res.json();
  const container = document.getElementById('intakes-today');
  if (!list.length) {
    container.innerHTML = '<p class="empty-state" style="padding: 8px 0;">Aucune prise enregistrée aujourd\'hui.</p>';
    return;
  }
  list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  container.innerHTML = list.map(s => `
    <div class="intake-row">
      <span class="intake-time">${esc(s.time || '')}</span>
      <span class="intake-name">${s.type === 'whey' ? 'Whey' : 'Créatine'}</span>
      <span class="intake-amount">${s.amount_g}g</span>
      <button class="intake-del" onclick="deleteIntake('${s.id}')">×</button>
    </div>
  `).join('');
}

async function deleteIntake(id) {
  await fetch(`/api/supplements/intake/${id}`, { method: 'DELETE' });
  await loadFitnessDashboard();
  await loadIntakesToday();
}

async function logBodyweight() {
  const w = parseFloat(document.getElementById('bw-input').value);
  if (!w) { showToast('warning', 'close', 'Poids requis', ''); return; }
  await fetch('/api/bodyweight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weight_kg: w })
  });
  document.getElementById('bw-input').value = '';
  showToast('success', 'check', `${w} kg enregistré`, 'Cible protéines recalculée');
  await loadFitnessDashboard();
  await loadBodyweightChart();
}

async function loadBodyweightChart() {
  const list = await (await fetch('/api/bodyweight')).json();
  const canvas = document.getElementById('bw-chart');
  if (!canvas) return;
  if (!list.length) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';
  if (fitnessState.bwChart) fitnessState.bwChart.destroy();
  fitnessState.bwChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: list.map(e => e.date.slice(5)),
      datasets: [{
        data: list.map(e => e.weight_kg),
        borderColor: '#c4b5fd',
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: '#f0abfc',
        fill: true,
        tension: 0.3
      }]
    },
    options: chartOpts()
  });
}

function populateProgressionSelect() {
  const sel = document.getElementById('progress-exercise-select');
  if (!sel) return;
  const current = sel.value;
  const grouped = {};
  for (const e of fitnessState.exercises) {
    if (!grouped[e.muscle_group]) grouped[e.muscle_group] = [];
    grouped[e.muscle_group].push(e);
  }
  let html = '<option value="">— Choisir un exercice —</option>';
  for (const g of ['push','pull','legs','core','cardio']) {
    if (!grouped[g]) continue;
    html += `<optgroup label="${g.toUpperCase()}">`;
    for (const e of grouped[g]) {
      html += `<option value="${e.id}">${esc(e.name)}</option>`;
    }
    html += '</optgroup>';
  }
  sel.innerHTML = html;
  if (current) sel.value = current;
}

async function loadProgressionChart() {
  const sel = document.getElementById('progress-exercise-select');
  const id = sel.value;
  const canvas = document.getElementById('progress-chart');
  const empty = document.getElementById('progress-empty');
  if (!id) { canvas.style.display = 'none'; empty.style.display = 'none'; if (fitnessState.progressChart) { fitnessState.progressChart.destroy(); fitnessState.progressChart = null; } return; }
  const history = await (await fetch(`/api/exercises/${id}/history`)).json();
  if (!history.length) {
    canvas.style.display = 'none';
    empty.style.display = 'block';
    if (fitnessState.progressChart) { fitnessState.progressChart.destroy(); fitnessState.progressChart = null; }
    return;
  }
  empty.style.display = 'none';
  canvas.style.display = 'block';
  if (fitnessState.progressChart) fitnessState.progressChart.destroy();
  fitnessState.progressChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: history.map(h => h.date.slice(5)),
      datasets: [{
        label: 'Charge max',
        data: history.map(h => h.topWeight),
        borderColor: '#f0abfc',
        backgroundColor: 'rgba(236, 72, 153, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        fill: true,
        tension: 0.3,
        yAxisID: 'y'
      }, {
        label: 'Volume',
        data: history.map(h => h.volume),
        borderColor: '#67e8f9',
        backgroundColor: 'rgba(103, 232, 249, 0.05)',
        borderWidth: 1,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
        tension: 0.3,
        yAxisID: 'y1'
      }]
    },
    options: {
      ...chartOpts(),
      scales: {
        ...chartOpts().scales,
        y: { ...chartOpts().scales.y, position: 'left', beginAtZero: false },
        y1: { ...chartOpts().scales.y, position: 'right', grid: { display: false }, beginAtZero: true }
      },
      plugins: {
        ...chartOpts().plugins,
        legend: { display: true, labels: { color: '#b8b4ce', font: { size: 10, family: 'Inter' } } }
      }
    }
  });
}

function chartOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0d0d18', borderColor: '#c4b5fd33', borderWidth: 1, padding: 10, titleColor: '#e9e6f3', bodyColor: '#b8b4ce' } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#6b6783', font: { size: 10, family: 'Inter' }, maxTicksLimit: 10 } },
      y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#6b6783', font: { size: 10, family: 'Inter' } } }
    }
  };
}

async function loadRecentSessions() {
  const res = await fetch('/api/workouts');
  const sessions = await res.json();
  const container = document.getElementById('recent-sessions');
  if (!sessions.length) {
    container.innerHTML = '<p class="empty-state">Aucune séance enregistrée.</p>';
    return;
  }
  const recent = sessions.slice(0, 6);
  container.innerHTML = recent.map(s => {
    const date = new Date(s.date);
    const dateStr = date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `
      <div class="session-row">
        <div>
          <div class="session-date">${dateStr}</div>
          <div class="session-meta">${s.set_count} série${s.set_count > 1 ? 's' : ''}${s.duration_min ? ' • ' + s.duration_min + ' min' : ''}</div>
        </div>
        <span class="session-type-badge">${s.type}</span>
      </div>
    `;
  }).join('');
}

async function saveProfile() {
  const payload = {
    height_cm: parseInt(document.getElementById('prof-height').value) || null,
    calorie_target_kcal: parseInt(document.getElementById('prof-calories').value) || null,
    weekly_session_target: parseInt(document.getElementById('prof-sessions').value) || null,
    creatine_daily_g: parseFloat(document.getElementById('prof-creatine').value) || null
  };
  await fetch('/api/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  showToast('success', 'check', 'Profil sauvegardé', '');
  await loadFitnessDashboard();
}

// ─── Utils ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function formatDate(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
