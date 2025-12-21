/***********************
 * CONFIG
 ***********************/
const ML_PER_CLICK = 50;
const DEFAULT_DAILY_GOAL = 2000;
const HISTORY_DAYS = 30;

const LS_EVENTS = "water_events_v1";   // array of timestamps (ms)
const LS_GOAL = "water_goal_v1";       // number
const LS_LAST_DAY = "water_last_day_v1";

/***********************
 * ELEMENTS
 ***********************/
let timerId = null;

const minutesInput = document.getElementById("minutes");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusEl = document.getElementById("status");
const notifToggle = document.getElementById("notifToggle");
const ding = document.getElementById("ding");

const bottleBtn = document.getElementById("bottleBtn");
const undoBtn = document.getElementById("undoBtn");

const clickCountEl = document.getElementById("clickCount");
const mlCountEl = document.getElementById("mlCount");

const progressNowEl = document.getElementById("progressNow");
const progressGoalEl = document.getElementById("progressGoal");
const progressFillEl = document.getElementById("progressFill");
const progressHintEl = document.getElementById("progressHint");
const bottleWaterEl = document.getElementById("bottleWater");

// Hamburger/menu
const menuBtn = document.getElementById("menuBtn");
const menuPanel = document.getElementById("menuPanel");
const historyBtn = document.getElementById("historyBtn");
const closeMenuBtn = document.getElementById("closeMenuBtn");
const resetTodayBtn = document.getElementById("resetTodayBtn");
const resetAllBtn = document.getElementById("resetAllBtn");

// History modal
const historyModal = document.getElementById("historyModal");
const closeHistoryBtn = document.getElementById("closeHistoryBtn");
const historyList = document.getElementById("historyList");
const historyEmpty = document.getElementById("historyEmpty");

/***********************
 * STATE
 ***********************/
let events = loadEvents();             // [timestampMs, ...]
let dailyGoal = loadGoal();            // number

/***********************
 * UTIL
 ***********************/
function todayKey(d = new Date()){
  // local date key: YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function isWithinLastDays(ts, days){
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return ts >= cutoff;
}

function pruneOldEvents(){
  events = events.filter(ts => isWithinLastDays(ts, HISTORY_DAYS));
}

function countToday(){
  const key = todayKey();
  let c = 0;
  for (const ts of events){
    if (todayKey(new Date(ts)) === key) c++;
  }
  return c;
}

function mlToday(){
  return countToday() * ML_PER_CLICK;
}

function setStatus(text){
  statusEl.textContent = text;
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

/* Red -> Yellow -> Blue based on progress */
function colorForProgress(p){
  p = clamp01(p);
  // 0..0.5: red -> yellow
  if (p <= 0.5){
    const t = p / 0.5;
    return mixColor("#ef4444", "#f59e0b", t);
  }
  // 0.5..1: yellow -> blue
  const t = (p - 0.5) / 0.5;
  return mixColor("#f59e0b", "#2563eb", t);
}

function mixColor(a, b, t){
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const r = Math.round(A.r + (B.r - A.r) * t);
  const g = Math.round(A.g + (B.g - A.g) * t);
  const bl = Math.round(A.b + (B.b - A.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex){
  const h = hex.replace("#","");
  const bigint = parseInt(h, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

/***********************
 * STORAGE
 ***********************/
function loadEvents(){
  try{
    const raw = localStorage.getItem(LS_EVENTS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(n => typeof n === "number") : [];
  }catch{
    return [];
  }
}

function saveEvents(){
  localStorage.setItem(LS_EVENTS, JSON.stringify(events));
}

function loadGoal(){
  const raw = localStorage.getItem(LS_GOAL);
  const g = raw ? Number(raw) : NaN;
  return Number.isFinite(g) && g > 0 ? g : DEFAULT_DAILY_GOAL;
}

function saveGoal(){
  localStorage.setItem(LS_GOAL, String(dailyGoal));
}

/***********************
 * UI UPDATE
 ***********************/
function updateAllUI(){
  pruneOldEvents();
  saveEvents();

  const clicks = countToday();
  const ml = clicks * ML_PER_CLICK;

  clickCountEl.textContent = clicks;
  mlCountEl.textContent = ml;

  progressNowEl.textContent = ml;
  progressGoalEl.textContent = dailyGoal;

  const p = clamp01(ml / dailyGoal);

  // progress bar
  progressFillEl.style.width = `${Math.round(p * 100)}%`;

  // color changes with hydration
  const c = colorForProgress(p);
  progressFillEl.style.background = c;
  bottleWaterEl.style.background = c;

  // bottle fill level
  bottleWaterEl.style.height = `${Math.round(p * 100)}%`;

  // hint text
  if (p >= 1){
    progressHintEl.textContent = "Goal reached 🎉 Keep it up!";
  } else if (p >= 0.5){
    progressHintEl.textContent = "Nice! Halfway there.";
  } else if (p > 0){
    progressHintEl.textContent = "Good start — keep sipping.";
  } else {
    progressHintEl.textContent = "Tap the bottle to log 50ml.";
  }
}

/***********************
 * HISTORY RENDER
 ***********************/
function openHistory(){
  renderHistory();
  historyModal.classList.add("open");
  historyModal.setAttribute("aria-hidden", "false");
}

function closeHistory(){
  historyModal.classList.remove("open");
  historyModal.setAttribute("aria-hidden", "true");
}

function renderHistory(){
  pruneOldEvents();

  // Group by date (YYYY-MM-DD)
  const map = new Map(); // dateKey -> [timestamps]
  for (const ts of events){
    const k = todayKey(new Date(ts));
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(ts);
  }

  // Sort days desc
  const days = Array.from(map.keys()).sort((a,b) => (a < b ? 1 : -1));

  historyList.innerHTML = "";

  if (days.length === 0){
    historyEmpty.style.display = "block";
    return;
  }
  historyEmpty.style.display = "none";

  for (const day of days){
    const entries = map.get(day).sort((a,b) => a - b); // time asc
    const totalMl = entries.length * ML_PER_CLICK;

    const group = document.createElement("div");
    group.className = "dayGroup";

    const title = document.createElement("div");
    title.className = "dayTitle";

    const left = document.createElement("div");
    left.textContent = day;

    const right = document.createElement("div");
    right.className = "dayTotal";
    right.textContent = `${totalMl} ml`;

    title.appendChild(left);
    title.appendChild(right);

    const chips = document.createElement("div");
    chips.className = "dayEntries";

    for (const ts of entries){
      const d = new Date(ts);
      const hh = String(d.getHours()).padStart(2,"0");
      const mm = String(d.getMinutes()).padStart(2,"0");
      const ss = String(d.getSeconds()).padStart(2,"0");

      const chip = document.createElement("div");
      chip.className = "timeChip";
      chip.textContent = `${hh}:${mm}:${ss}`;
      chips.appendChild(chip);
    }

    group.appendChild(title);
    group.appendChild(chips);
    historyList.appendChild(group);
  }
}

/***********************
 * DRINK ACTIONS
 ***********************/
function logDrinkNow(){
  const ts = Date.now();
  events.push(ts);
  pruneOldEvents();
  saveEvents();
  updateAllUI();
}

function undoLast(){
  // undo only if last event is today (so it matches your "today" counters)
  if (events.length === 0) return;

  // remove the latest event, regardless of day (simple and intuitive)
  events.pop();
  saveEvents();
  updateAllUI();
}

function resetToday(){
  const key = todayKey();
  events = events.filter(ts => todayKey(new Date(ts)) !== key);
  saveEvents();
  updateAllUI();
}

function resetAll(){
  events = [];
  dailyGoal = DEFAULT_DAILY_GOAL;
  localStorage.removeItem(LS_EVENTS);
  localStorage.removeItem(LS_GOAL);
  updateAllUI();
}

/***********************
 * HAMBURGER MENU
 ***********************/
function openMenu(){
  menuPanel.classList.add("open");
  menuPanel.setAttribute("aria-hidden", "false");
  menuBtn.setAttribute("aria-expanded", "true");
}

function closeMenu(){
  menuPanel.classList.remove("open");
  menuPanel.setAttribute("aria-hidden", "true");
  menuBtn.setAttribute("aria-expanded", "false");
}

function toggleMenu(){
  if (menuPanel.classList.contains("open")) closeMenu();
  else openMenu();
}

/***********************
 * REMINDER LOGIC (unchanged)
 ***********************/
async function maybeRequestNotifications() {
  if (!notifToggle.checked) return;

  if (!("Notification" in window)) {
    alert("Your browser doesn't support notifications.");
    notifToggle.checked = false;
    return;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      notifToggle.checked = false;
      alert("Notifications not enabled — reminders will show in-page only.");
    }
  }
}

function remind() {
  alert("💧 Time to drink water!");
  ding.play().catch(() => {});

  if (notifToggle.checked && "Notification" in window && Notification.permission === "granted") {
    new Notification("💧 Drink water", { body: "Take a few sips now." });
  }
}

/***********************
 * EVENTS
 ***********************/
bottleBtn.addEventListener("click", logDrinkNow);
undoBtn.addEventListener("click", undoLast);

// Menu controls
menuBtn.addEventListener("click", toggleMenu);
closeMenuBtn.addEventListener("click", closeMenu);

historyBtn.addEventListener("click", () => {
  closeMenu();
  openHistory();
});

resetTodayBtn.addEventListener("click", () => {
  closeMenu();
  resetToday();
});

resetAllBtn.addEventListener("click", () => {
  closeMenu();
  const ok = confirm("Reset ALL data? This clears history too.");
  if (ok) resetAll();
});

// Close menu when clicking outside
document.addEventListener("click", (e) => {
  if (!menuPanel.classList.contains("open")) return;
  const within = menuPanel.contains(e.target) || menuBtn.contains(e.target);
  if (!within) closeMenu();
});

// ESC closes menu/modal
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape"){
    closeMenu();
    closeHistory();
  }
});

// History modal close
closeHistoryBtn.addEventListener("click", closeHistory);
historyModal.addEventListener("click", (e) => {
  if (e.target === historyModal) closeHistory();
});

// Reminder buttons
startBtn.addEventListener("click", async () => {
  const mins = Number(minutesInput.value);

  if (!mins || mins < 1) {
    alert("Please enter a valid number of minutes (1 or more).");
    return;
  }

  await maybeRequestNotifications();

  if (timerId) clearInterval(timerId);

  const ms = mins * 60 * 1000;
  timerId = setInterval(remind, ms);

  setStatus(`Running: every ${mins} minute(s)`);
  startBtn.disabled = true;
  stopBtn.disabled = false;
  minutesInput.disabled = true;
});

stopBtn.addEventListener("click", () => {
  if (timerId) clearInterval(timerId);
  timerId = null;

  setStatus("Not running");
  startBtn.disabled = false;
  stopBtn.disabled = true;
  minutesInput.disabled = false;
});

/***********************
 * INIT
 ***********************/
updateAllUI();
