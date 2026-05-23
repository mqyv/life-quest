const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const IMG_DIR = path.join(DATA_DIR, 'images');

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function readJSON(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// Format a Date as YYYY-MM-DD using LOCAL date components (no UTC shift).
function localDateStr(d) {
  d = d || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function today() { return localDateStr(); }
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return localDateStr(d);
}
function weekStart(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return localDateStr(d);
}

function initData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });
  if (!readJSON('user.json')) {
    writeJSON('user.json', {
      name: 'Player', xp: 0, level: 1, streak: 0, longestStreak: 0,
      lastCheckin: null, badges: [], totalEntries: 0,
      totalGoalsCompleted: 0, totalHabitsCompleted: 0
    });
  }
  if (!readJSON('journal.json')) writeJSON('journal.json', []);
  if (!readJSON('goals.json')) writeJSON('goals.json', []);
  if (!readJSON('habits.json')) {
    writeJSON('habits.json', [
      { id: 'prayers', name: 'Salat — les 5 prières', desc: 'Les cinq prières quotidiennes', type: 'number', frequency: 'daily', target: 5, unit: 'prières', xp: 500, builtin: true },
      { id: 'gym', name: 'Salle de sport', desc: 'Aller à la salle aujourd\'hui', type: 'check', frequency: 'daily', xp: 80, builtin: true },
      { id: 'steps', name: 'Pas du jour', desc: 'Marche active', type: 'number', frequency: 'daily', target: 10000, unit: 'pas', xp: 40, builtin: true },
      { id: 'room', name: 'Ranger la chambre', desc: 'Chambre propre et ordonnée', type: 'check', frequency: 'weekly', xp: 120, builtin: true },
      { id: 'water', name: 'Hydratation', desc: 'Adapté à ta dose de créatine', type: 'number', frequency: 'daily', target: 2, unit: 'L', xp: 50, builtin: true },
      { id: 'reading', name: 'Lecture 15 min', desc: 'Lire au moins 15 minutes', type: 'check', frequency: 'daily', xp: 50, builtin: true },
      { id: 'sleep', name: 'Dormir 7h', desc: 'Récupération complète', type: 'check', frequency: 'daily', xp: 60, builtin: true }
    ]);
  }
  if (!readJSON('habit_logs.json')) writeJSON('habit_logs.json', []);
  if (!readJSON('physique.json')) {
    writeJSON('physique.json', {
      targetDescription: '', targetWeight: null, targetBodyfat: null, targetDeadline: '',
      measurements: [], program: null, photos: []
    });
  } else {
    // Ensure target fields exist on older physique.json
    const p = readJSON('physique.json');
    let changed = false;
    if (p.targetDescription === undefined) { p.targetDescription = ''; changed = true; }
    if (p.targetWeight === undefined) { p.targetWeight = null; changed = true; }
    if (p.targetBodyfat === undefined) { p.targetBodyfat = null; changed = true; }
    if (p.targetDeadline === undefined) { p.targetDeadline = ''; changed = true; }
    if (changed) writeJSON('physique.json', p);
  }
  if (!readJSON('config.json')) writeJSON('config.json', { apiKey: '', model: 'claude-sonnet-4-6' });
  if (!readJSON('supplements.json')) writeJSON('supplements.json', []);
  if (!readJSON('chat.json')) writeJSON('chat.json', []);

  // Fitness module data
  if (!readJSON('profile.json')) {
    writeJSON('profile.json', {
      height_cm: 186,
      calorie_target_kcal: 2500,
      creatine_daily_g: 5,
      weekly_session_target: 4,
      whey_per_serving_g: 30,
      whey_protein_per_serving_g: 22,
      activeWorkoutId: null
    });
  }
  if (!readJSON('exercises.json')) writeJSON('exercises.json', seedExercises());
  if (!readJSON('workout_sessions.json')) writeJSON('workout_sessions.json', []);
  if (!readJSON('workout_sets.json')) writeJSON('workout_sets.json', []);
  if (!readJSON('nutrition.json')) writeJSON('nutrition.json', []);
  if (!readJSON('supplement_intakes.json')) writeJSON('supplement_intakes.json', []);
  if (!readJSON('bodyweight.json')) writeJSON('bodyweight.json', []);

  // Migration: ajoute le suivi des courses dans le profil
  const prof = readJSON('profile.json');
  if (prof && !prof.groceries) {
    prof.groceries = { lastShopping: null, stocks: defaultStocks() };
    writeJSON('profile.json', prof);
  }

  // Migration: cardio reduit à Tapis + Escalier (idempotent)
  const exos = readJSON('exercises.json');
  if (exos && !exos.some(e => e.name === 'Escalier' && !e.is_custom)) {
    const filtered = exos.filter(e => !(e.muscle_group === 'cardio' && !e.is_custom));
    filtered.push(
      { id: uuidv4(), name: 'Tapis', muscle_group: 'cardio', target_sets: 1, target_reps: '20-30 min', is_custom: false },
      { id: uuidv4(), name: 'Escalier', muscle_group: 'cardio', target_sets: 1, target_reps: '15-20 min', is_custom: false }
    );
    writeJSON('exercises.json', filtered);
    console.log('Migration: cardio remplacé par Tapis + Escalier');
  }
}

function defaultStocks() {
  return {
    whey:     { lastBought: null, intervalDays: 60 },
    creatine: { lastBought: null, intervalDays: 60 },
    rice:     { lastBought: null, intervalDays: 42 },
    pasta:    { lastBought: null, intervalDays: 35 },
    oats:     { lastBought: null, intervalDays: 42 },
    oil:      { lastBought: null, intervalDays: 56 },
    cheese:   { lastBought: null, intervalDays: 14 }
  };
}

const STOCK_LABELS = {
  whey:     { name: 'Whey 2 kg',                price: '~40 €',   store: 'Carrefour ou Décathlon' },
  creatine: { name: 'Créatine 300 g',           price: '~15 €',   store: 'Carrefour ou Décathlon' },
  rice:     { name: 'Riz blanc 1 kg',           price: '~1,20 €', store: 'Carrefour' },
  pasta:    { name: 'Pâtes complètes 500g ×2',  price: '~1,80 €', store: 'Carrefour' },
  oats:     { name: 'Flocons d\'avoine 1 kg',   price: '~1,40 €', store: 'Lidl' },
  oil:      { name: 'Huile d\'olive 500 ml',    price: '~3 €',    store: 'Carrefour' },
  cheese:   { name: 'Emmental râpé 200 g',      price: '~1,80 €', store: 'Carrefour' }
};

const WEEKLY_ITEMS = [
  'Œufs (24, soit 2 boîtes)',
  'Skyr 0% nature × 4 pots',
  'Bananes 1,5 kg',
  'Pommes 1 kg',
  'Légumes surgelés 1 kg',
  'Lait demi-écrémé 1 L',
  'Poulet 800 g - 1 kg (ou cuisses)',
  'Jambon blanc 6-8 tranches'
];

function seedExercises() {
  const exos = [
    // Push
    { name: "Développé couché haltères", muscle_group: "push", target_sets: 4, target_reps: "8-10" },
    { name: "Développé incliné", muscle_group: "push", target_sets: 4, target_reps: "8-10" },
    { name: "Développé militaire", muscle_group: "push", target_sets: 4, target_reps: "8-10" },
    { name: "Écarté poulie vis-à-vis", muscle_group: "push", target_sets: 3, target_reps: "12" },
    { name: "Élévations latérales", muscle_group: "push", target_sets: 4, target_reps: "12-15" },
    { name: "Extensions triceps poulie", muscle_group: "push", target_sets: 3, target_reps: "12" },
    // Pull
    { name: "Tirage vertical", muscle_group: "pull", target_sets: 4, target_reps: "8-10" },
    { name: "Tractions assistées", muscle_group: "pull", target_sets: 4, target_reps: "8-10" },
    { name: "Rowing barre", muscle_group: "pull", target_sets: 4, target_reps: "8-10" },
    { name: "Tirage horizontal poulie", muscle_group: "pull", target_sets: 3, target_reps: "10-12" },
    { name: "Face pull", muscle_group: "pull", target_sets: 3, target_reps: "15" },
    { name: "Curl biceps", muscle_group: "pull", target_sets: 3, target_reps: "10-12" },
    // Legs
    { name: "Presse à cuisses", muscle_group: "legs", target_sets: 4, target_reps: "10" },
    { name: "Leg curl", muscle_group: "legs", target_sets: 3, target_reps: "12" },
    { name: "Fentes", muscle_group: "legs", target_sets: 3, target_reps: "10" },
    { name: "Squat machine", muscle_group: "legs", target_sets: 3, target_reps: "10" },
    { name: "Mollets debout", muscle_group: "legs", target_sets: 4, target_reps: "15" },
    // Core
    { name: "Gainage", muscle_group: "core", target_sets: 3, target_reps: "60s" },
    { name: "Crunches", muscle_group: "core", target_sets: 3, target_reps: "15" },
    // Cardio
    { name: "Tapis", muscle_group: "cardio", target_sets: 1, target_reps: "20-30 min" },
    { name: "Escalier", muscle_group: "cardio", target_sets: 1, target_reps: "15-20 min" }
  ];
  return exos.map(e => ({ id: uuidv4(), ...e, is_custom: false }));
}

function xpForLevel(level) { return Math.floor(100 * Math.pow(1.5, level - 1)); }
function calcLevel(totalXp) {
  let level = 1; let remaining = totalXp;
  while (remaining >= xpForLevel(level)) { remaining -= xpForLevel(level); level++; }
  return { level, currentXp: remaining, xpNeeded: xpForLevel(level) };
}

const BADGES = [
  { id: 'streak_3', name: 'Trois Nuits', desc: '3 jours consécutifs', icon: 'b-moons', condition: u => u.streak >= 3 },
  { id: 'streak_7', name: 'Une Semaine', desc: '7 jours consécutifs', icon: 'b-week', condition: u => u.streak >= 7 },
  { id: 'streak_30', name: 'Constance', desc: '30 jours consécutifs', icon: 'b-mountain', condition: u => u.streak >= 30 },
  { id: 'first_goal', name: 'Première Quête', desc: 'Compléter ton premier objectif', icon: 'b-arrow', condition: u => u.totalGoalsCompleted >= 1 },
  { id: 'goals_10', name: 'Persévérance', desc: '10 objectifs complétés', icon: 'b-cup', condition: u => u.totalGoalsCompleted >= 10 },
  { id: 'level_5', name: 'Éveil', desc: 'Atteindre le niveau 5', icon: 'b-sunrise', condition: u => u.level >= 5 },
  { id: 'level_10', name: 'Lumière', desc: 'Atteindre le niveau 10', icon: 'b-diamond', condition: u => u.level >= 10 },
  { id: 'habits_10', name: 'Discipline', desc: '10 habitudes complétées', icon: 'b-shield', condition: u => u.totalHabitsCompleted >= 10 },
  { id: 'habits_50', name: 'Rituel', desc: '50 habitudes complétées', icon: 'b-scroll', condition: u => u.totalHabitsCompleted >= 50 },
  { id: 'habits_200', name: 'Forge', desc: '200 habitudes complétées', icon: 'b-anvil', condition: u => u.totalHabitsCompleted >= 200 }
];

function checkBadges(user) {
  const newBadges = [];
  for (const badge of BADGES) {
    if (!user.badges.includes(badge.id)) {
      const lvlInfo = calcLevel(user.xp);
      const userWithLevel = { ...user, level: lvlInfo.level };
      if (badge.condition(userWithLevel)) {
        user.badges.push(badge.id);
        newBadges.push({ id: badge.id, name: badge.name, desc: badge.desc, icon: badge.icon });
      }
    }
  }
  return newBadges;
}

function awardXp(user, amount) {
  const before = calcLevel(user.xp).level;
  user.xp += amount;
  return calcLevel(user.xp).level > before;
}

// Apply dynamic adjustments to specific habits (e.g. water target adapts to creatine dose)
function applyDynamicHabit(h) {
  if (h.id === 'water') {
    const profile = readJSON('profile.json') || {};
    const creatineG = profile.creatine_daily_g || 0;
    const extra = creatineG * 0.3; // ~300 ml d'eau par gramme de créatine
    const target = Math.round((2 + extra) * 10) / 10;
    return {
      ...h,
      target,
      desc: creatineG > 0
        ? `2 L de base + ${extra.toFixed(1)} L pour ${creatineG} g de créatine`
        : '2 L de base — augmente avec la créatine'
    };
  }
  return h;
}

// Mark user as active today, update streak if first activity
// Counts both habit logs and journal entries as activity sources.
function markActivity(user, currentLogs) {
  const t = today();
  const logs = currentLogs || (readJSON('habit_logs.json') || []);
  const journal = readJSON('journal.json') || [];
  const alreadyToday = (user.lastCheckin === t)
    || logs.some(l => l.date === t)
    || journal.some(j => j.date === t);
  if (alreadyToday) return;
  const y = yesterday();
  const wasYesterday = (user.lastCheckin === y)
    || logs.some(l => l.date === y)
    || journal.some(j => j.date === y);
  user.streak = wasYesterday ? user.streak + 1 : 1;
  if (user.streak > user.longestStreak) user.longestStreak = user.streak;
  user.lastCheckin = t;
}

// ─── USER ────────────────────────────────────────────────────────────────
app.get('/api/user', (req, res) => {
  const user = readJSON('user.json');
  res.json({ ...user, ...calcLevel(user.xp) });
});

app.put('/api/user', (req, res) => {
  const user = readJSON('user.json');
  if (req.body.name) user.name = req.body.name;
  writeJSON('user.json', user);
  res.json(user);
});

// ─── CONFIG ──────────────────────────────────────────────────────────────
app.get('/api/config', (req, res) => {
  const c = readJSON('config.json');
  const user = readJSON('user.json');
  res.json({ hasApiKey: !!c.apiKey, model: c.model || 'claude-sonnet-4-6', name: user.name });
});

app.put('/api/config', (req, res) => {
  const c = readJSON('config.json');
  if (req.body.apiKey !== undefined) c.apiKey = req.body.apiKey;
  if (req.body.model) c.model = req.body.model;
  writeJSON('config.json', c);
  if (req.body.name !== undefined) {
    const u = readJSON('user.json');
    u.name = req.body.name || u.name;
    writeJSON('user.json', u);
  }
  res.json({ hasApiKey: !!c.apiKey, model: c.model });
});

// ─── JOURNAL ─────────────────────────────────────────────────────────────
app.get('/api/journal', (req, res) => res.json(readJSON('journal.json')));
app.get('/api/journal/today', (req, res) => {
  const entries = readJSON('journal.json');
  res.json(entries.find(e => e.date === today()) || null);
});

app.post('/api/journal', (req, res) => {
  const { content, mood } = req.body;
  const t = today();
  const entries = readJSON('journal.json');
  const user = readJSON('user.json');

  const existing = entries.find(e => e.date === t);
  let xpEarned = 0;
  let leveledUp = false;

  if (existing) {
    // Update only — no streak change, no new XP (already awarded)
    existing.content = content;
    existing.mood = mood;
    existing.updatedAt = new Date().toISOString();
  } else {
    // New entry today
    xpEarned = 30 + (mood ? 10 : 0);
    // markActivity handles streak using both habits + journal sources
    markActivity(user);
    const streakBonus = user.streak * 5;
    xpEarned += streakBonus;
    leveledUp = awardXp(user, xpEarned);
    user.totalEntries += 1;

    entries.push({
      id: uuidv4(),
      date: t,
      content,
      mood,
      xpEarned,
      streakBonus,
      createdAt: new Date().toISOString()
    });
  }

  writeJSON('journal.json', entries);
  const newBadges = checkBadges(user);
  const lvlInfo = calcLevel(user.xp);
  user.level = lvlInfo.level;
  writeJSON('user.json', user);

  res.json({ success: true, xpEarned, newBadges, leveledUp, streak: user.streak, ...lvlInfo });
});

// ─── GOALS ───────────────────────────────────────────────────────────────
app.get('/api/goals', (req, res) => res.json(readJSON('goals.json')));

app.post('/api/goals', (req, res) => {
  const goals = readJSON('goals.json');
  const xpMap = { daily: 50, weekly: 100, longterm: 200 };
  const goal = {
    id: uuidv4(),
    title: req.body.title,
    description: req.body.description || '',
    type: req.body.type || 'daily',
    xpReward: xpMap[req.body.type] || 50,
    color: req.body.color || '#a78bfa',
    completedDates: [],
    archived: false,
    createdAt: new Date().toISOString()
  };
  goals.push(goal);
  writeJSON('goals.json', goals);
  res.json(goal);
});

app.delete('/api/goals/:id', (req, res) => {
  let goals = readJSON('goals.json');
  goals = goals.filter(g => g.id !== req.params.id);
  writeJSON('goals.json', goals);
  res.json({ success: true });
});

// Mark a goal complete today
app.post('/api/goals/:id/complete', (req, res) => {
  const goals = readJSON('goals.json');
  const goal = goals.find(g => g.id === req.params.id);
  if (!goal) return res.status(404).json({ error: 'not_found' });
  const t = today();
  if (goal.completedDates && goal.completedDates.includes(t)) {
    return res.json({ alreadyDone: true });
  }
  goal.completedDates = goal.completedDates || [];
  goal.completedDates.push(t);
  writeJSON('goals.json', goals);

  const user = readJSON('user.json');
  const habitLogs = readJSON('habit_logs.json');
  markActivity(user, habitLogs);
  const leveledUp = awardXp(user, goal.xpReward);
  user.totalGoalsCompleted += 1;
  const newBadges = checkBadges(user);
  const lvlInfo = calcLevel(user.xp);
  user.level = lvlInfo.level;
  writeJSON('user.json', user);

  res.json({ success: true, xpEarned: goal.xpReward, leveledUp, newBadges, ...lvlInfo, streak: user.streak });
});

// ─── HABITS ──────────────────────────────────────────────────────────────
app.get('/api/habits', (req, res) => {
  const habits = readJSON('habits.json');
  const logs = readJSON('habit_logs.json');
  const t = today();
  const ws = weekStart();

  const enriched = habits.map(rawH => {
    const h = applyDynamicHabit(rawH);
    let todayLog = null;
    if (h.frequency === 'daily') {
      todayLog = logs.find(l => l.habitId === h.id && l.date === t);
    } else if (h.frequency === 'weekly') {
      todayLog = logs.find(l => l.habitId === h.id && l.weekStart === ws);
    }
    return { ...h, todayLog };
  });
  res.json(enriched);
});

app.post('/api/habits', (req, res) => {
  const habits = readJSON('habits.json');
  const habit = {
    id: uuidv4(),
    name: req.body.name,
    desc: req.body.desc || '',
    type: req.body.type || 'check',
    frequency: req.body.frequency || 'daily',
    target: req.body.target || null,
    unit: req.body.unit || '',
    xp: req.body.xp || 40,
    builtin: false
  };
  habits.push(habit);
  writeJSON('habits.json', habits);
  res.json(habit);
});

app.delete('/api/habits/:id', (req, res) => {
  let habits = readJSON('habits.json');
  const target = habits.find(h => h.id === req.params.id);
  if (target && target.builtin) {
    return res.status(400).json({ error: 'Cannot delete builtin habit' });
  }
  habits = habits.filter(h => h.id !== req.params.id);
  writeJSON('habits.json', habits);
  res.json({ success: true });
});

app.post('/api/habits/:id/log', (req, res) => {
  const { value } = req.body;
  const habits = readJSON('habits.json');
  const rawHabit = habits.find(h => h.id === req.params.id);
  if (!rawHabit) return res.status(404).json({ error: 'Habit not found' });
  const habit = applyDynamicHabit(rawHabit);

  const logs = readJSON('habit_logs.json');
  const user = readJSON('user.json');
  const t = today();
  const ws = weekStart();

  let existing;
  if (habit.frequency === 'daily') {
    existing = logs.find(l => l.habitId === habit.id && l.date === t);
  } else {
    existing = logs.find(l => l.habitId === habit.id && l.weekStart === ws);
  }

  let xpEarned = 0;
  let leveledUp = false;
  let completed = false;

  if (habit.type === 'check') {
    if (existing) {
      logs.splice(logs.indexOf(existing), 1);
      user.xp -= existing.xpEarned || 0;
      if (user.xp < 0) user.xp = 0;
      user.totalHabitsCompleted = Math.max(0, user.totalHabitsCompleted - 1);
    } else {
      // Mark activity (streak) BEFORE pushing new log so check sees prior state
      markActivity(user, logs);
      const log = {
        id: uuidv4(), habitId: habit.id, date: t, weekStart: ws,
        value: true, xpEarned: habit.xp, createdAt: new Date().toISOString()
      };
      logs.push(log);
      leveledUp = awardXp(user, habit.xp);
      xpEarned = habit.xp;
      user.totalHabitsCompleted += 1;
      completed = true;
    }
  } else if (habit.type === 'number') {
    const numVal = parseFloat(value) || 0;
    const targetHit = habit.target ? numVal >= habit.target : numVal > 0;
    const reward = targetHit ? habit.xp : Math.floor((numVal / (habit.target || 1)) * habit.xp);

    if (existing) {
      user.xp -= existing.xpEarned || 0;
      if (user.xp < 0) user.xp = 0;
      existing.value = numVal;
      existing.xpEarned = reward;
      const before = calcLevel(user.xp).level;
      user.xp += reward;
      leveledUp = calcLevel(user.xp).level > before;
      xpEarned = reward;
      if (targetHit && !existing.targetHit) {
        user.totalHabitsCompleted += 1;
        existing.targetHit = true;
        completed = true;
      }
    } else {
      markActivity(user, logs);
      const log = {
        id: uuidv4(), habitId: habit.id, date: t, weekStart: ws,
        value: numVal, xpEarned: reward, targetHit, createdAt: new Date().toISOString()
      };
      logs.push(log);
      leveledUp = awardXp(user, reward);
      xpEarned = reward;
      if (targetHit) { user.totalHabitsCompleted += 1; completed = true; }
    }
  }

  writeJSON('habit_logs.json', logs);
  const newBadges = checkBadges(user);
  const lvlInfo = calcLevel(user.xp);
  user.level = lvlInfo.level;
  writeJSON('user.json', user);

  res.json({ success: true, xpEarned, completed, leveledUp, newBadges, streak: user.streak, ...lvlInfo });
});

// ─── PHYSIQUE ────────────────────────────────────────────────────────────
app.get('/api/physique', (req, res) => res.json(readJSON('physique.json')));

app.put('/api/physique', (req, res) => {
  const p = readJSON('physique.json');
  if (req.body.targetDescription !== undefined) p.targetDescription = req.body.targetDescription;
  if (req.body.targetWeight !== undefined) p.targetWeight = req.body.targetWeight;
  if (req.body.targetBodyfat !== undefined) p.targetBodyfat = req.body.targetBodyfat;
  if (req.body.targetDeadline !== undefined) p.targetDeadline = req.body.targetDeadline;
  writeJSON('physique.json', p);
  res.json(p);
});

app.post('/api/physique/measurement', (req, res) => {
  const p = readJSON('physique.json');
  const m = {
    id: uuidv4(),
    date: req.body.date || today(),
    weight: req.body.weight || null,
    bodyfat: req.body.bodyfat || null,
    chest: req.body.chest || null,
    waist: req.body.waist || null,
    arm: req.body.arm || null,
    thigh: req.body.thigh || null,
    notes: req.body.notes || '',
    createdAt: new Date().toISOString()
  };
  p.measurements.push(m);
  writeJSON('physique.json', p);
  res.json(m);
});

app.delete('/api/physique/measurement/:id', (req, res) => {
  const p = readJSON('physique.json');
  p.measurements = p.measurements.filter(m => m.id !== req.params.id);
  writeJSON('physique.json', p);
  res.json({ success: true });
});

// ─── SUPPLEMENTS ─────────────────────────────────────────────────────────
app.get('/api/supplements', (req, res) => res.json(readJSON('supplements.json')));

app.post('/api/supplements', (req, res) => {
  const list = readJSON('supplements.json');
  const s = {
    id: uuidv4(),
    name: req.body.name,
    dose: req.body.dose || '',
    timing: req.body.timing || '',
    notes: req.body.notes || '',
    createdAt: new Date().toISOString()
  };
  list.push(s);
  writeJSON('supplements.json', list);
  res.json(s);
});

app.delete('/api/supplements/:id', (req, res) => {
  let list = readJSON('supplements.json');
  list = list.filter(s => s.id !== req.params.id);
  writeJSON('supplements.json', list);
  res.json({ success: true });
});

// ─── COACH (Chat with Claude API) ────────────────────────────────────────
const COACH_SYSTEM_PROMPT = `Tu es le coach personnel spécialisé en musculation et transformation physique, intégré à l'application Life Quest. L'utilisateur est un étudiant français — adapte systématiquement tes conseils nutritionnels à un budget serré.

# Ton style
- Direct, précis, scientifique. Pas de fioritures.
- Pas d'emojis. Pas de "tu peux le faire". Pas de phrases creuses motivantes.
- Donne des chiffres concrets : grammes de protéines, séries × reps, calories, prix indicatifs en euros.
- Réponses concises par défaut. Programmes/plans complets sur demande explicite.
- Tutoiement direct. Français courant. Ton honnête, jamais condescendant.

# Quand on te montre une photo
- **Physique actuel** : estime la composition corporelle (% masse grasse approximatif), identifie les groupes musculaires dominants vs en retard, donne un verdict honnête.
- **Physique cible** : analyse réalistement le temps nécessaire pour l'atteindre (3 mois, 6 mois, 1 an, 2 ans...) en fonction de la distance entre actuel et cible. Sois honnête si l'objectif est très long ou irréaliste sur la deadline annoncée.
- **Étiquettes de compléments** : évalue chaque produit individuellement (utile, inutile, dosage correct, alternative moins chère), lis les ingrédients et donne une analyse précise.

# Programme alimentaire (étudiant — priorité prix/protéines)
Bases bon marché à intégrer prioritairement (prix indicatifs France 2026) :
- Œufs (~2€/dz, ~6g protéines/œuf — protéine la moins chère)
- Riz blanc (~1€/kg cru), pâtes (~1€/kg), flocons d'avoine (~2€/kg)
- Poulet : préférer cuisses (~6€/kg) aux blancs (~12€/kg)
- Thon en boîte (~1€/boîte 130g, 25g protéines), sardines en boîte (~1.5€)
- Lentilles, pois chiches, haricots secs (~2€/kg, riches en protéines végétales)
- Légumes surgelés (~1.5€/kg) : épinards, brocolis, mélanges — peu chers, longs à se gâter
- Skyr / fromage blanc 0% (~2€/kg)
- Whey en grosse boîte 2kg marque distributeur (~35-50€, soit ~50-70 portions)
- Bananes, pommes (fruits les moins chers au kilo)

Mentaler le coût par repas : 2€ pour un repas étudiant solide est l'objectif.

Évite de recommander : protein bars chères (3€/barre), plats préparés "fitness", produits niche, snacks coûteux.

# Compléments
Bases utiles, à recommander seulement si pertinentes :
- **Whey** ou caséine : utile uniquement si apport protéique alimentaire insuffisant (cible 1.6-2.2g/kg/jour)
- **Créatine monohydrate** : 3-5g/jour, ~15€ pour 3 mois, efficace prouvé, sûr — souvent la première recommandation
- **Vitamine D3** : en hiver, 1000-2000 UI/jour, peu cher
- **Oméga-3** : si peu de poisson dans l'alimentation
- Multivitamine basique : optionnel si alimentation correcte

À éviter ou modérer :
- Pré-workout : caféine pure (café) est plus efficace et moins chère
- BCAA / EAA : inutile si l'apport protéique total est suffisant
- Brûleurs de graisse : déficit calorique reste la seule méthode qui marche
- Gainers : sucre + maltodextrine cher — privilégier riz/avoine en cuisine

**TU NE RECOMMANDES JAMAIS de SARMs, AAS, peptides, prohormones ou tout produit dopant.** Si l'utilisateur en demande, refuse fermement et explique brièvement les risques.

# Entraînement
- Demande la fréquence de salle disponible (3, 4, 5, 6 jours/semaine) avant de générer un programme complet.
- Demande le niveau (débutant <6 mois, intermédiaire 6-24 mois, avancé 2+ ans) si pas clair.
- Privilégie les mouvements polyarticulaires : squat, soulevé de terre (conventionnel ou roumain), développé couché, tractions, presse militaire, rowing barre.
- Structure : 4-12 séries par groupe musculaire par semaine selon niveau.
- Repos : 7-9h de sommeil obligatoire — insiste là-dessus systématiquement, c'est plus important que n'importe quel complément.
- Surcharge progressive : explique que c'est le moteur principal du progrès. +2.5kg/semaine sur composé pour débutant, ralenti ensuite.

# Comportement
- Tu poses des questions précises quand le contexte manque : poids actuel, taille, âge, expérience musculation, fréquence salle, ressources cuisine.
- Tu te souviens du contexte de la conversation : si l'utilisateur a déjà donné son poids, ses suppléments, sa fréquence — ne redemande pas.
- Tu ne juges pas, mais tu es honnête sur la durée et la difficulté. "Atteindre ce physique en 3 mois est impossible naturellement" si c'est le cas.
- Tu structures clairement les programmes : Jour 1 / Jour 2 / Repas type matin / midi / soir.
- Tu réponds aux questions liées : sommeil, gestion du stress, conciliation études/salle, sortie alcool/social, blessures (avec disclaimer "consulte un médecin pour X").
- Tu refuses poliment les sujets hors-scope (psychologie clinique, médical lourd, finance non-musculation) en redirigeant vers le bon professionnel.

# Format des réponses
- Réponse courte : 3-6 phrases. Pour confirmations, ajustements, questions de précision.
- Réponse moyenne : avec sous-titres en gras, listes à puces. Pour analyses ou conseils ciblés.
- Réponse longue : programme complet (entraînement + repas + suppléments), avec sections en markdown clair. Uniquement si demandé.

Ne mets jamais de disclaimer générique "consulte un professionnel" sauf cas médical clair. L'utilisateur sait que tu es une IA.`;

app.get('/api/coach/history', (req, res) => {
  const history = readJSON('chat.json');
  // Strip imageId from response to avoid leaking image paths; map to URLs
  const safe = history.map(m => ({
    role: m.role,
    content: m.content.map(c => {
      if (c.type === 'image') {
        return { type: 'image', url: `/api/coach/images/${c.imageId}`, media_type: c.media_type };
      }
      return c;
    }),
    createdAt: m.createdAt
  }));
  res.json(safe);
});

app.delete('/api/coach/history', (req, res) => {
  // Optionally clean image files
  const history = readJSON('chat.json');
  for (const m of history) {
    for (const c of m.content || []) {
      if (c.type === 'image' && c.imageId) {
        const files = fs.readdirSync(IMG_DIR);
        const file = files.find(f => f.startsWith(c.imageId));
        if (file) try { fs.unlinkSync(path.join(IMG_DIR, file)); } catch(e) {}
      }
    }
  }
  writeJSON('chat.json', []);
  res.json({ success: true });
});

app.get('/api/coach/images/:id', (req, res) => {
  const files = fs.readdirSync(IMG_DIR);
  const file = files.find(f => f.startsWith(req.params.id));
  if (!file) return res.status(404).end();
  res.sendFile(path.join(IMG_DIR, file));
});

function saveImageFromBase64(base64Data, mediaType) {
  const id = uuidv4();
  const ext = (mediaType || 'image/jpeg').split('/')[1].replace('jpeg', 'jpg').replace('+xml', '');
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(IMG_DIR, filename), Buffer.from(base64Data, 'base64'));
  return id;
}

function loadImageAsBase64(imageId) {
  const files = fs.readdirSync(IMG_DIR);
  const file = files.find(f => f.startsWith(imageId));
  if (!file) return null;
  const data = fs.readFileSync(path.join(IMG_DIR, file));
  return data.toString('base64');
}

function buildDynamicContext() {
  const user = readJSON('user.json');
  const physique = readJSON('physique.json');
  const supplements = readJSON('supplements.json');
  const habits = readJSON('habits.json');
  const habitLogs = readJSON('habit_logs.json');
  const t = today();
  const lvl = calcLevel(user.xp);

  let ctx = `# Contexte de l'utilisateur (à jour)\n`;
  ctx += `- Prénom : ${user.name}\n`;
  ctx += `- Niveau ${lvl.level} (${user.xp} XP total)\n`;
  ctx += `- Streak : ${user.streak} jours consécutifs (record ${user.longestStreak})\n`;

  // Mesures
  const m = (physique.measurements || []).slice().sort((a,b) => b.date.localeCompare(a.date))[0];
  if (m) {
    const parts = [];
    if (m.weight) parts.push(`${m.weight}kg`);
    if (m.bodyfat) parts.push(`${m.bodyfat}% MG`);
    if (m.chest) parts.push(`poitrine ${m.chest}cm`);
    if (m.waist) parts.push(`taille ${m.waist}cm`);
    if (m.arm) parts.push(`bras ${m.arm}cm`);
    if (m.thigh) parts.push(`cuisse ${m.thigh}cm`);
    ctx += `- Dernière mesure (${m.date}) : ${parts.join(', ') || 'données partielles'}\n`;
    if (m.notes) ctx += `  Notes : ${m.notes}\n`;
  } else {
    ctx += `- Aucune mesure physique enregistrée pour le moment\n`;
  }

  // Cible
  if (physique.targetDescription || physique.targetWeight) {
    ctx += `- Physique cible :`;
    if (physique.targetDescription) ctx += ` ${physique.targetDescription}.`;
    if (physique.targetWeight) ctx += ` Poids visé ${physique.targetWeight}kg.`;
    if (physique.targetBodyfat) ctx += ` MG visée ${physique.targetBodyfat}%.`;
    if (physique.targetDeadline) ctx += ` Échéance : ${physique.targetDeadline}.`;
    ctx += '\n';
  } else {
    ctx += `- Physique cible non défini\n`;
  }

  // Compléments
  if (supplements.length) {
    ctx += `- Compléments pris actuellement :\n`;
    for (const s of supplements) {
      ctx += `  • ${s.name}`;
      if (s.dose) ctx += ` (${s.dose})`;
      if (s.timing) ctx += `, moment : ${s.timing}`;
      if (s.notes) ctx += `, notes : ${s.notes}`;
      ctx += '\n';
    }
  } else {
    ctx += `- Aucun complément déclaré dans le profil\n`;
  }

  // Habitudes du jour
  const todayLogs = habitLogs.filter(l => l.date === t);
  if (todayLogs.length) {
    ctx += `- Activité aujourd'hui : `;
    const parts = todayLogs.map(l => {
      const h = habits.find(x => x.id === l.habitId);
      if (!h) return null;
      if (h.type === 'number') return `${h.name} ${l.value}${h.target ? '/' + h.target : ''} ${h.unit || ''}`.trim();
      return h.name;
    }).filter(Boolean);
    ctx += parts.join(' ; ') + '\n';
  } else {
    ctx += `- Aucune habitude validée aujourd'hui pour le moment\n`;
  }

  ctx += `\nDate du jour : ${t}\n`;
  return ctx;
}

app.post('/api/coach/chat', async (req, res) => {
  const config = readJSON('config.json');
  if (!config.apiKey) {
    return res.status(400).json({ error: 'no_api_key', message: "Configure ta clé API Anthropic dans les paramètres (icône en haut à droite du Coach)." });
  }

  const { message, images } = req.body;
  const text = (message || '').trim();
  if (!text && (!images || !images.length)) {
    return res.status(400).json({ error: 'empty', message: 'Message vide.' });
  }

  // Save images to disk + build current message blocks
  const currentBlocksForApi = [];
  const currentBlocksForHistory = [];
  if (text) {
    currentBlocksForApi.push({ type: 'text', text });
    currentBlocksForHistory.push({ type: 'text', text });
  }
  if (images && images.length) {
    for (const img of images) {
      const mediaType = img.media_type || 'image/jpeg';
      const id = saveImageFromBase64(img.base64, mediaType);
      currentBlocksForApi.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: img.base64 }
      });
      currentBlocksForHistory.push({ type: 'image', imageId: id, media_type: mediaType });
    }
  }

  // Build messages array from history (last 30)
  const history = readJSON('chat.json');
  const recent = history.slice(-30);
  const apiMessages = recent.map(m => {
    const content = m.content.map(c => {
      if (c.type === 'image' && c.imageId) {
        const data = loadImageAsBase64(c.imageId);
        if (!data) return null;
        return {
          type: 'image',
          source: { type: 'base64', media_type: c.media_type || 'image/jpeg', data }
        };
      }
      return c;
    }).filter(Boolean);
    return { role: m.role, content };
  });
  apiMessages.push({ role: 'user', content: currentBlocksForApi });

  try {
    const client = new Anthropic({ apiKey: config.apiKey });
    const dynCtx = buildDynamicContext();

    const response = await client.messages.create({
      model: config.model || 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        { type: 'text', text: COACH_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynCtx }
      ],
      messages: apiMessages
    });

    const assistantText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    // Persist
    history.push({
      role: 'user',
      content: currentBlocksForHistory,
      createdAt: new Date().toISOString()
    });
    history.push({
      role: 'assistant',
      content: [{ type: 'text', text: assistantText }],
      createdAt: new Date().toISOString()
    });
    writeJSON('chat.json', history);

    res.json({
      reply: assistantText,
      usage: response.usage
    });
  } catch (err) {
    console.error('Coach API error:', err.message);
    let msg = err.message || 'Erreur API';
    if (err.status === 401) msg = "Clé API invalide. Vérifie tes paramètres.";
    else if (err.status === 429) msg = "Limite de l'API atteinte. Réessaie dans quelques minutes.";
    else if (err.status === 529) msg = "L'API est surchargée. Réessaie dans un instant.";
    res.status(500).json({ error: 'api_error', message: msg });
  }
});

// ─── STATS ───────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const entries = readJSON('journal.json');
  const user = readJSON('user.json');
  const goals = readJSON('goals.json');
  const habitLogs = readJSON('habit_logs.json');

  const last30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = localDateStr(d);
    const entry = entries.find(e => e.date === dateStr);
    const habitsThatDay = habitLogs.filter(l => l.date === dateStr);
    const xpThatDay = (entry ? entry.xpEarned : 0) + habitsThatDay.reduce((s, l) => s + (l.xpEarned || 0), 0);
    last30.push({
      date: dateStr,
      mood: entry ? entry.mood : null,
      xp: xpThatDay,
      hasEntry: !!entry || habitsThatDay.length > 0,
      habitsCompleted: habitsThatDay.length
    });
  }

  res.json({
    last30,
    totalXp: user.xp,
    totalEntries: user.totalEntries,
    totalGoalsCompleted: user.totalGoalsCompleted,
    totalHabitsCompleted: user.totalHabitsCompleted,
    currentStreak: user.streak,
    longestStreak: user.longestStreak,
    activeGoals: goals.filter(g => !g.archived).length,
    badges: BADGES.map(b => ({ id: b.id, name: b.name, desc: b.desc, icon: b.icon, unlocked: user.badges.includes(b.id) }))
  });
});

app.get('/api/badges', (req, res) => {
  const user = readJSON('user.json');
  res.json(BADGES.map(b => ({ id: b.id, name: b.name, desc: b.desc, icon: b.icon, unlocked: user.badges.includes(b.id) })));
});

// ─── HADITHS ─────────────────────────────────────────────────────────────
const HADITHS = [
  { text: "Les actions ne valent que par les intentions, et chaque personne aura selon son intention.", source: "Rapporté par al-Bukhari et Muslim — Omar ibn al-Khattab" },
  { text: "Aucun de vous n'est croyant tant qu'il n'aime pas pour son frère ce qu'il aime pour lui-même.", source: "Rapporté par al-Bukhari et Muslim — Anas ibn Malik" },
  { text: "Que celui qui croit en Allah et au Jour dernier dise du bien ou se taise.", source: "Rapporté par al-Bukhari et Muslim — Abu Hurayra" },
  { text: "La propreté est la moitié de la foi.", source: "Rapporté par Muslim — Abu Malik al-Ash'ari" },
  { text: "Sourire au visage de ton frère est une aumône.", source: "Rapporté par at-Tirmidhi — Abu Dharr" },
  { text: "Le fort n'est pas celui qui terrasse les autres, mais celui qui se maîtrise dans la colère.", source: "Rapporté par al-Bukhari et Muslim — Abu Hurayra" },
  { text: "Allah est doux et aime la douceur en toute chose.", source: "Rapporté par al-Bukhari et Muslim — A'isha" },
  { text: "Personne ne mange une meilleure nourriture que celle qu'il a gagnée par le travail de ses mains.", source: "Rapporté par al-Bukhari — al-Miqdam" },
  { text: "Allah aime, lorsque l'un d'entre vous accomplit un acte, qu'il le perfectionne.", source: "Rapporté par al-Bayhaqi — A'isha" },
  { text: "Les meilleurs d'entre vous sont ceux qui ont le meilleur caractère.", source: "Rapporté par al-Bukhari et Muslim — Abdullah ibn Amr" },
  { text: "Sois dans ce monde comme un étranger ou un voyageur de passage.", source: "Rapporté par al-Bukhari — Abdullah ibn Omar" },
  { text: "Lorsque le fils d'Adam meurt, ses œuvres cessent, sauf trois : une aumône durable, une science profitable, ou un enfant pieux qui prie pour lui.", source: "Rapporté par Muslim — Abu Hurayra" },
  { text: "Le musulman est celui dont les autres musulmans sont à l'abri de sa langue et de sa main.", source: "Rapporté par al-Bukhari et Muslim — Abdullah ibn Amr" },
  { text: "Crains Allah où que tu sois ; fais suivre une mauvaise action d'une bonne afin de l'effacer ; et comporte-toi avec les gens d'une belle conduite.", source: "Rapporté par at-Tirmidhi — Abu Dharr et Mu'adh" },
  { text: "Allah ne regarde pas vos formes ni vos biens, mais Il regarde vos cœurs et vos actes.", source: "Rapporté par Muslim — Abu Hurayra" },
  { text: "Que celui qui croit en Allah et au Jour dernier honore son voisin.", source: "Rapporté par al-Bukhari et Muslim — Abu Hurayra" },
  { text: "L'aumône n'amoindrit pas la richesse.", source: "Rapporté par Muslim — Abu Hurayra" },
  { text: "Le croyant fort est meilleur et plus aimé d'Allah que le croyant faible — bien qu'il y ait du bien en chacun. Tiens-toi à ce qui te profite, demande l'aide d'Allah, et ne te décourage pas.", source: "Rapporté par Muslim — Abu Hurayra" },
  { text: "Ô Allah, je cherche refuge auprès de Toi contre l'incapacité et la paresse, contre la lâcheté et la sénilité, contre l'avarice et la dette accablante.", source: "Rapporté par al-Bukhari — Anas ibn Malik (du'a du Prophète ﷺ)" },
  { text: "Deux paroles légères sur la langue, lourdes dans la balance, aimées du Tout-Miséricordieux : SubhanAllahi wa bihamdihi, SubhanAllah al-'Adhim.", source: "Rapporté par al-Bukhari et Muslim — Abu Hurayra" },
  { text: "Le meilleur d'entre vous est celui qui apprend le Coran et l'enseigne.", source: "Rapporté par al-Bukhari — Uthman ibn Affan" },
  { text: "Personne n'entrera au Paradis grâce à ses œuvres seules. — Pas même toi, ô Messager d'Allah ? — Pas même moi, à moins qu'Allah ne me couvre de Sa miséricorde.", source: "Rapporté par al-Bukhari et Muslim — Abu Hurayra" },
  { text: "Saisis cinq choses avant cinq autres : ta jeunesse avant ta vieillesse, ta santé avant ta maladie, ta richesse avant ta pauvreté, ton temps libre avant ton occupation, et ta vie avant ta mort.", source: "Rapporté par al-Hakim — Ibn Abbas" },
  { text: "Celui qui chemine sur une voie pour y chercher la science, Allah lui facilite par elle une voie vers le Paradis.", source: "Rapporté par Muslim — Abu Hurayra" },
  { text: "Quiconque se réveille en sécurité chez lui, en bonne santé dans son corps, et possède sa nourriture du jour, c'est comme s'il possédait le monde entier.", source: "Rapporté par at-Tirmidhi et Ibn Maja — 'Ubaydullah ibn Mihsan" },
  { text: "Le meilleur des actes est la prière à son heure prescrite, puis la bienfaisance envers les parents, puis le combat dans la voie d'Allah.", source: "Rapporté par al-Bukhari et Muslim — Abdullah ibn Mas'ud" },
  { text: "Allah est plus heureux du repentir de son serviteur que ne l'est l'homme qui retrouve sa monture perdue dans le désert.", source: "Rapporté par al-Bukhari et Muslim — Anas ibn Malik" },
  { text: "Mets ta confiance en Allah, mais attache d'abord ta monture.", source: "Rapporté par at-Tirmidhi — Anas ibn Malik" },
  { text: "Le bon compagnon est comme le vendeur de musc : soit il t'en offre, soit tu en achètes, soit tu sentiras son bon parfum.", source: "Rapporté par al-Bukhari et Muslim — Abu Musa al-Ash'ari" },
  { text: "Il suffit à un homme d'être un menteur de rapporter tout ce qu'il entend.", source: "Rapporté par Muslim — Abu Hurayra" }
];

app.get('/api/hadith/today', (req, res) => {
  // Day-of-year based selection — same hadith for the whole day
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  const h = HADITHS[dayOfYear % HADITHS.length];
  res.json({ ...h, date: today() });
});

// ─── FITNESS PROFILE ─────────────────────────────────────────────────────
function getLatestBodyweight() {
  const bw = readJSON('bodyweight.json') || [];
  if (!bw.length) return null;
  return [...bw].sort((a, b) => b.date.localeCompare(a.date))[0].weight_kg;
}

function computeProteinTarget(weightKg) {
  if (!weightKg) return null;
  return Math.round(1.8 * weightKg);
}

app.get('/api/profile', (req, res) => {
  const p = readJSON('profile.json');
  const weight = getLatestBodyweight();
  res.json({
    ...p,
    bodyweight_kg: weight,
    protein_target_g: computeProteinTarget(weight)
  });
});

app.put('/api/profile', (req, res) => {
  const p = readJSON('profile.json');
  ['height_cm','calorie_target_kcal','creatine_daily_g','weekly_session_target','whey_per_serving_g','whey_protein_per_serving_g'].forEach(k => {
    if (req.body[k] !== undefined && req.body[k] !== null && req.body[k] !== '') p[k] = req.body[k];
  });
  writeJSON('profile.json', p);
  const weight = getLatestBodyweight();
  res.json({ ...p, bodyweight_kg: weight, protein_target_g: computeProteinTarget(weight) });
});

// ─── EXERCISES ───────────────────────────────────────────────────────────
app.get('/api/exercises', (req, res) => {
  const list = readJSON('exercises.json');
  res.json(list);
});

app.post('/api/exercises', (req, res) => {
  const list = readJSON('exercises.json');
  const ex = {
    id: uuidv4(),
    name: req.body.name,
    muscle_group: req.body.muscle_group || 'push',
    target_sets: req.body.target_sets || null,
    target_reps: req.body.target_reps || '',
    is_custom: true
  };
  list.push(ex);
  writeJSON('exercises.json', list);
  res.json(ex);
});

app.delete('/api/exercises/:id', (req, res) => {
  let list = readJSON('exercises.json');
  const ex = list.find(e => e.id === req.params.id);
  if (ex && !ex.is_custom) return res.status(400).json({ error: 'cannot delete builtin' });
  list = list.filter(e => e.id !== req.params.id);
  writeJSON('exercises.json', list);
  res.json({ success: true });
});

app.get('/api/exercises/:id/last', (req, res) => {
  const sets = readJSON('workout_sets.json');
  const exSets = sets.filter(s => s.exercise_id === req.params.id);
  if (!exSets.length) return res.json(null);
  exSets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Group last session's sets together
  const lastSessionId = exSets[0].session_id;
  const lastSessionSets = exSets.filter(s => s.session_id === lastSessionId).sort((a,b) => a.set_number - b.set_number);
  res.json({
    session_id: lastSessionId,
    date: exSets[0].createdAt.split('T')[0],
    sets: lastSessionSets.map(s => ({ set_number: s.set_number, weight_kg: s.weight_kg, reps: s.reps }))
  });
});

app.get('/api/exercises/:id/history', (req, res) => {
  const sets = readJSON('workout_sets.json');
  const sessions = readJSON('workout_sessions.json');
  const exSets = sets.filter(s => s.exercise_id === req.params.id);
  // For each session, compute volume = sum(weight*reps) and topSet = max(weight)
  const bySession = {};
  for (const s of exSets) {
    if (!bySession[s.session_id]) bySession[s.session_id] = { volume: 0, topWeight: 0, topReps: 0 };
    bySession[s.session_id].volume += (s.weight_kg || 0) * (s.reps || 0);
    if (s.weight_kg > bySession[s.session_id].topWeight) {
      bySession[s.session_id].topWeight = s.weight_kg;
      bySession[s.session_id].topReps = s.reps;
    }
  }
  const out = Object.keys(bySession).map(sid => {
    const sess = sessions.find(x => x.id === sid);
    return {
      session_id: sid,
      date: sess ? sess.date : null,
      volume: bySession[sid].volume,
      topWeight: bySession[sid].topWeight,
      topReps: bySession[sid].topReps
    };
  }).filter(x => x.date).sort((a, b) => a.date.localeCompare(b.date));
  res.json(out);
});

// ─── WORKOUT SESSIONS ────────────────────────────────────────────────────
app.get('/api/workouts', (req, res) => {
  const sessions = readJSON('workout_sessions.json');
  const sets = readJSON('workout_sets.json');
  const enriched = sessions.map(s => ({
    ...s,
    set_count: sets.filter(x => x.session_id === s.id).length
  }));
  enriched.sort((a, b) => b.date.localeCompare(a.date));
  res.json(enriched);
});

app.post('/api/workouts', (req, res) => {
  const sessions = readJSON('workout_sessions.json');
  const profile = readJSON('profile.json');
  const session = {
    id: uuidv4(),
    date: new Date().toISOString(),
    type: req.body.type || 'push',
    duration_min: null,
    notes: '',
    ended_at: null,
    createdAt: new Date().toISOString()
  };
  sessions.push(session);
  writeJSON('workout_sessions.json', sessions);
  profile.activeWorkoutId = session.id;
  writeJSON('profile.json', profile);
  res.json(session);
});

app.get('/api/workouts/:id', (req, res) => {
  const sessions = readJSON('workout_sessions.json');
  const sets = readJSON('workout_sets.json');
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'not found' });
  const sessionSets = sets.filter(x => x.session_id === session.id);
  res.json({ ...session, sets: sessionSets });
});

app.put('/api/workouts/:id', (req, res) => {
  const sessions = readJSON('workout_sessions.json');
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'not found' });
  if (req.body.notes !== undefined) session.notes = req.body.notes;
  if (req.body.duration_min !== undefined) session.duration_min = req.body.duration_min;
  writeJSON('workout_sessions.json', sessions);
  res.json(session);
});

app.post('/api/workouts/:id/end', (req, res) => {
  const sessions = readJSON('workout_sessions.json');
  const profile = readJSON('profile.json');
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'not found' });
  session.ended_at = new Date().toISOString();
  if (!session.duration_min) {
    const start = new Date(session.createdAt).getTime();
    const end = new Date(session.ended_at).getTime();
    session.duration_min = Math.max(1, Math.round((end - start) / 60000));
  }
  writeJSON('workout_sessions.json', sessions);
  if (profile.activeWorkoutId === session.id) {
    profile.activeWorkoutId = null;
    writeJSON('profile.json', profile);
  }
  res.json(session);
});

app.delete('/api/workouts/:id', (req, res) => {
  let sessions = readJSON('workout_sessions.json');
  let sets = readJSON('workout_sets.json');
  const profile = readJSON('profile.json');
  sessions = sessions.filter(s => s.id !== req.params.id);
  sets = sets.filter(x => x.session_id !== req.params.id);
  writeJSON('workout_sessions.json', sessions);
  writeJSON('workout_sets.json', sets);
  if (profile.activeWorkoutId === req.params.id) {
    profile.activeWorkoutId = null;
    writeJSON('profile.json', profile);
  }
  res.json({ success: true });
});

app.post('/api/workouts/:id/sets', (req, res) => {
  const sessions = readJSON('workout_sessions.json');
  const sets = readJSON('workout_sets.json');
  const session = sessions.find(s => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  const existingForExercise = sets.filter(s => s.session_id === session.id && s.exercise_id === req.body.exercise_id);
  const setNumber = req.body.set_number || (existingForExercise.length + 1);
  const newSet = {
    id: uuidv4(),
    session_id: session.id,
    exercise_id: req.body.exercise_id,
    set_number: setNumber,
    weight_kg: parseFloat(req.body.weight_kg) || 0,
    reps: parseInt(req.body.reps) || 0,
    createdAt: new Date().toISOString()
  };
  sets.push(newSet);
  writeJSON('workout_sets.json', sets);
  res.json(newSet);
});

app.delete('/api/workouts/:id/sets/:setId', (req, res) => {
  let sets = readJSON('workout_sets.json');
  sets = sets.filter(s => s.id !== req.params.setId);
  writeJSON('workout_sets.json', sets);
  res.json({ success: true });
});

// ─── NUTRITION ───────────────────────────────────────────────────────────
app.get('/api/nutrition', (req, res) => {
  const list = readJSON('nutrition.json');
  list.sort((a, b) => b.date.localeCompare(a.date));
  res.json(list);
});

app.get('/api/nutrition/today', (req, res) => {
  const list = readJSON('nutrition.json');
  const entry = list.find(e => e.date === today());
  res.json(entry || null);
});

app.put('/api/nutrition/today', (req, res) => {
  const list = readJSON('nutrition.json');
  const t = today();
  let entry = list.find(e => e.date === t);
  if (!entry) {
    entry = { id: uuidv4(), date: t, createdAt: new Date().toISOString() };
    list.push(entry);
  }
  ['calories_kcal','protein_g','carbs_g','fat_g'].forEach(k => {
    if (req.body[k] !== undefined && req.body[k] !== '') entry[k] = parseFloat(req.body[k]) || 0;
  });
  if (req.body.notes !== undefined) entry.notes = req.body.notes;
  entry.updatedAt = new Date().toISOString();
  writeJSON('nutrition.json', list);
  res.json(entry);
});

// ─── SUPPLEMENT INTAKES (whey / creatine) ────────────────────────────────
app.get('/api/supplements/intake/today', (req, res) => {
  const list = readJSON('supplement_intakes.json');
  res.json(list.filter(s => s.date === today()));
});

app.get('/api/supplements/intake/week', (req, res) => {
  const list = readJSON('supplement_intakes.json');
  const now = new Date();
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  res.json(list.filter(s => s.date >= cutoff));
});

app.post('/api/supplements/intake', (req, res) => {
  const list = readJSON('supplement_intakes.json');
  const profile = readJSON('profile.json');
  const type = req.body.type;
  if (!['whey','creatine'].includes(type)) return res.status(400).json({ error: 'invalid type' });
  const defaultAmount = type === 'whey' ? profile.whey_per_serving_g : profile.creatine_daily_g;
  const intake = {
    id: uuidv4(),
    date: today(),
    type,
    amount_g: parseFloat(req.body.amount_g) || defaultAmount,
    time: new Date().toTimeString().slice(0,5),
    createdAt: new Date().toISOString()
  };
  list.push(intake);
  writeJSON('supplement_intakes.json', list);
  res.json(intake);
});

app.delete('/api/supplements/intake/:id', (req, res) => {
  let list = readJSON('supplement_intakes.json');
  list = list.filter(s => s.id !== req.params.id);
  writeJSON('supplement_intakes.json', list);
  res.json({ success: true });
});

// ─── BODYWEIGHT ──────────────────────────────────────────────────────────
app.get('/api/bodyweight', (req, res) => {
  const list = readJSON('bodyweight.json');
  list.sort((a, b) => a.date.localeCompare(b.date));
  res.json(list);
});

app.post('/api/bodyweight', (req, res) => {
  const list = readJSON('bodyweight.json');
  const t = req.body.date || today();
  const w = parseFloat(req.body.weight_kg);
  if (!w || w < 30 || w > 250) return res.status(400).json({ error: 'invalid weight' });
  // Replace existing entry for the same day
  const idx = list.findIndex(x => x.date === t);
  const entry = { id: uuidv4(), date: t, weight_kg: w, createdAt: new Date().toISOString() };
  if (idx >= 0) list[idx] = entry; else list.push(entry);
  writeJSON('bodyweight.json', list);
  res.json(entry);
});

// ─── FITNESS DASHBOARD AGGREGATE ─────────────────────────────────────────
app.get('/api/fitness/dashboard', (req, res) => {
  const profile = readJSON('profile.json');
  const t = today();
  const nutrition = readJSON('nutrition.json').find(e => e.date === t) || null;
  const intakes = readJSON('supplement_intakes.json').filter(s => s.date === t);
  const wheyToday = intakes.filter(s => s.type === 'whey');
  const creatineToday = intakes.filter(s => s.type === 'creatine');
  const wheyProteinToday = wheyToday.reduce((acc, w) => acc + (w.amount_g / (profile.whey_per_serving_g || 30)) * (profile.whey_protein_per_serving_g || 22), 0);

  const sessions = readJSON('workout_sessions.json');
  const ws = weekStart();
  const sessionsThisWeek = sessions.filter(s => s.date.split('T')[0] >= ws);

  const weight = getLatestBodyweight();
  const proteinTarget = computeProteinTarget(weight);

  const activeSession = profile.activeWorkoutId ? sessions.find(s => s.id === profile.activeWorkoutId) : null;

  res.json({
    profile: { ...profile, bodyweight_kg: weight, protein_target_g: proteinTarget },
    today: {
      date: t,
      protein_g: nutrition ? (nutrition.protein_g || 0) : 0,
      protein_g_with_whey: nutrition ? (nutrition.protein_g || 0) + wheyProteinToday : wheyProteinToday,
      calories_kcal: nutrition ? (nutrition.calories_kcal || 0) : 0,
      carbs_g: nutrition ? (nutrition.carbs_g || 0) : 0,
      fat_g: nutrition ? (nutrition.fat_g || 0) : 0,
      whey_count: wheyToday.length,
      creatine_taken: creatineToday.length > 0,
      whey_protein_added: Math.round(wheyProteinToday)
    },
    week: {
      sessions_count: sessionsThisWeek.length,
      sessions_target: profile.weekly_session_target,
      sessions: sessionsThisWeek
    },
    active_session: activeSession,
    last_sessions: sessions.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0,5)
  });
});

// ─── GROCERIES (rappel automatique) ──────────────────────────────────────
function getNextShoppingInfo() {
  const profile = readJSON('profile.json') || {};
  if (!profile.groceries) profile.groceries = { lastShopping: null, stocks: defaultStocks() };
  const stocks = profile.groceries.stocks || {};
  const todayStr = today();
  const todayDate = new Date(todayStr + 'T00:00:00');
  const day = todayDate.getDay(); // 0 = Sunday

  // Compute next Sunday
  let target = new Date(todayDate);
  if (day === 0) {
    if (profile.groceries.lastShopping === todayStr) {
      target.setDate(target.getDate() + 7);
    }
  } else {
    target.setDate(target.getDate() + ((7 - day) % 7));
  }
  const nextStr = localDateStr(target);
  const daysUntil = Math.round((target - todayDate) / 86400000);

  // Periodic items due (within 3 days of interval)
  const due = [];
  for (const [key, stock] of Object.entries(stocks)) {
    const label = STOCK_LABELS[key];
    if (!label) continue;
    let isDue = false;
    if (!stock.lastBought) {
      isDue = true;
    } else {
      const last = new Date(stock.lastBought + 'T00:00:00');
      const daysToNext = Math.round((target - last) / 86400000);
      isDue = daysToNext >= stock.intervalDays - 3;
    }
    if (isDue) due.push({
      key,
      name: label.name,
      price: label.price,
      store: label.store,
      lastBought: stock.lastBought,
      intervalDays: stock.intervalDays
    });
  }

  return {
    nextShoppingDate: nextStr,
    daysUntil,
    isToday: daysUntil === 0,
    lastShopping: profile.groceries.lastShopping,
    weeklyItems: WEEKLY_ITEMS,
    periodicDue: due
  };
}

app.get('/api/groceries', (req, res) => {
  res.json(getNextShoppingInfo());
});

app.post('/api/groceries/done', (req, res) => {
  const { stocksRestocked } = req.body || {};
  const profile = readJSON('profile.json') || {};
  if (!profile.groceries) profile.groceries = { lastShopping: null, stocks: defaultStocks() };
  profile.groceries.lastShopping = today();
  if (Array.isArray(stocksRestocked)) {
    for (const key of stocksRestocked) {
      if (profile.groceries.stocks[key]) {
        profile.groceries.stocks[key].lastBought = today();
      } else if (STOCK_LABELS[key]) {
        profile.groceries.stocks[key] = { lastBought: today(), intervalDays: 60 };
      }
    }
  }
  writeJSON('profile.json', profile);
  res.json({ success: true, ...getNextShoppingInfo() });
});

initData();
app.listen(PORT, () => console.log(`\nLife Quest — http://localhost:${PORT}\n`));
