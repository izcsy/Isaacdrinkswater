(() => {
  /***********************
   * CONFIG
   ***********************/
  const ML_PER_CLICK = 50;
  const DEFAULT_DAILY_GOAL = 2000;
  const HISTORY_DAYS = 30;

  const LS_EVENTS  = "water_events_v3";
  const LS_GOAL    = "water_goal_v3";
  const LS_STREAK  = "water_streak_v1";
  const LS_AWARDED_DAY = "water_streak_awarded_day_v1"; // YYYY-MM-DD

  /***********************
   * UTIL
   ***********************/
  function todayKey(d = new Date()){
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const day = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }

  function isWithinLastDays(ts, days){
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return ts >= cutoff;
  }

  function pruneOldEvents(events){
    return events.filter(ts => isWithinLastDays(ts, HISTORY_DAYS));
  }

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  function hexToRgb(hex){
    const h = hex.replace("#","");
    const bigint = parseInt(h, 16);
    return { r:(bigint>>16)&255, g:(bigint>>8)&255, b:bigint&255 };
  }

  function mixColor(a, b, t){
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const r = Math.round(A.r + (B.r - A.r) * t);
    const g = Math.round(A.g + (B.g - A.g) * t);
    const bl = Math.round(A.b + (B.b - A.b) * t);
    return `rgb(${r}, ${g}, ${bl})`;
  }

  // Red -> Yellow -> Blue based on progress
  function colorForProgress(p){
    p = clamp01(p);
    if (p <= 0.5) return mixColor("#ef4444", "#f59e0b", p / 0.5);
    return mixColor("#f59e0b", "#2563eb", (p - 0.5) / 0.5);
  }

  function msUntilNextMidnight(){
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0); // next 00:00
    return next.getTime() - now.getTime();
  }

  /***********************
   * STORAGE
   ***********************/
  function loadEvents(){
    try{
      const raw = localStorage.getItem(LS_EVENTS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(n => typeof n === "number") : [];
    } catch {
      return [];
    }
  }
  function saveEvents(events){
    localStorage.setItem(LS_EVENTS, JSON.stringify(events));
  }

  function loadGoal(){
    const raw = localStorage.getItem(LS_GOAL);
    const g = raw ? Number(raw) : NaN;
    return Number.isFinite(g) && g > 0 ? g : DEFAULT_DAILY_GOAL;
  }

  function loadStreak(){
    const raw = localStorage.getItem(LS_STREAK);
    const s = raw ? Number(raw) : 0;
    return Number.isFinite(s) && s >= 0 ? s : 0;
  }
  function saveStreak(s){
    localStorage.setItem(LS_STREAK, String(s));
  }

  function loadAwardedDay(){
    return localStorage.getItem(LS_AWARDED_DAY) || "";
  }
  function saveAwardedDay(dayKey){
    localStorage.setItem(LS_AWARDED_DAY, dayKey);
  }

  /***********************
   * DOM READY
   ***********************/
  document.addEventListener("DOMContentLoaded", () => {
    let timerId = null;

    // Main UI
    const bottleBtn = document.getElementById("bottleBtn");
    const undoBtn = document.getElementById("undoBtn");

    const clickCountEl = document.getElementById("clickCount");
    const mlCountEl = document.getElementById("mlCount");

    const progressNowEl = document.getElementById("progressNow");
    const progressGoalEl = document.getElementById("progressGoal");
    const progressFillEl = document.getElementById("progressFill");
    const progressHintEl = document.getElementById("progressHint");
    const bottleWaterEl = document.getElementById("bottleWater");

    const streakCountEl = document.getElementById("streakCount");
    const toastEl = document.getElementById("toast");

    // Menu
    const menuBtn = document.getElementById("menuBtn");
    const menuPanel = document.getElementById("menuPanel");
    const historyBtn = document.getElementById("historyBtn");
    const reminderBtn = document.getElementById("reminderBtn");
    const chartBtn = document.getElementById("chartBtn");
    const closeMenuBtn = document.getElementById("closeMenuBtn");

    // History modal
    const historyModal = document.getElementById("historyModal");
    const closeHistoryBtn = document.getElementById("closeHistoryBtn");
    const historyList = document.getElementById("historyList");
    const historyEmpty = document.getElementById("historyEmpty");

    // Reminder modal
    const reminderModal = document.getElementById("reminderModal");
    const closeReminderBtn = document.getElementById("closeReminderBtn");

    // Reminder controls
    const minutesInput = document.getElementById("minutes");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const statusEl = document.getElementById("status");
    const notifToggle = document.getElementById("notifToggle");
    const ding = document.getElementById("ding");

    // Chart modal
    const chartModal = document.getElementById("chartModal");
    const closeChartBtn = document.getElementById("closeChartBtn");
    const chartDateSelect = document.getElementById("chartDateSelect");
    const chartCanvas = document.getElementById("chartCanvas");
    const chartTotalMl = document.getElementById("chartTotalMl");

    // Guard
    const required = [
      bottleBtn, undoBtn, clickCountEl, mlCountEl, progressNowEl, progressGoalEl,
      progressFillEl, progressHintEl, bottleWaterEl, streakCountEl, toastEl,
      menuBtn, menuPanel, historyBtn, reminderBtn, chartBtn, closeMenuBtn,
      historyModal, closeHistoryBtn, historyList, historyEmpty,
      reminderModal, closeReminderBtn,
      minutesInput, startBtn, stopBtn, statusEl, notifToggle, ding,
      chartModal, closeChartBtn, chartDateSelect, chartCanvas, chartTotalMl
    ];
    if (required.some(x => !x)) {
      alert("Some elements are missing. Please replace index.html, style.css, and script.js exactly as provided.");
      return;
    }

    /***********************
     * STATE
     ***********************/
    let events = pruneOldEvents(loadEvents());
    let dailyGoal = loadGoal();

    let streak = loadStreak();               // starts at 0
    let awardedDay = loadAwardedDay();       // day already awarded for

    /***********************
     * TOAST
     ***********************/
    let toastTimer = null;
    function showToast(msg){
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
    }

    /***********************
     * COUNTS
     ***********************/
    function countForDay(dayKey){
      let c = 0;
      for (const ts of events){
        if (todayKey(new Date(ts)) === dayKey) c++;
      }
      return c;
    }

    /***********************
     * STREAK AWARD
     ***********************/
    function maybeAwardStreakIfGoalReached(todayMl){
      const day = todayKey();

      // already awarded today
      if (awardedDay === day) return;

      // only award if goal reached today
      if (todayMl < dailyGoal) return;

      // award once
      streak += 1;
      saveStreak(streak);
      streakCountEl.textContent = String(streak);

      awardedDay = day;
      saveAwardedDay(day);

      showToast(`🎉 Goal reached! Streak +1 (🔥 ${streak})`);
    }

    /***********************
     * MAIN UI UPDATE
     ***********************/
    function updateMainUI(){
      events = pruneOldEvents(events);
      saveEvents(events);

      // Always show streak
      streakCountEl.textContent = String(streak);

      const key = todayKey();
      const clicks = countForDay(key);
      const ml = clicks * ML_PER_CLICK;

      clickCountEl.textContent = clicks;
      mlCountEl.textContent = ml;

      progressNowEl.textContent = ml;
      progressGoalEl.textContent = dailyGoal;

      const p = clamp01(ml / dailyGoal);
      const c = colorForProgress(p);

      progressFillEl.style.width = `${Math.round(p * 100)}%`;
      progressFillEl.style.background = c;

      bottleWaterEl.style.height = `${Math.round(p * 100)}%`;
      bottleWaterEl.style.background = c;

      if (p >= 1) progressHintEl.textContent = "Goal reached 🎉 Keep it up!";
      else if (p >= 0.5) progressHintEl.textContent = "Nice! Halfway there.";
      else if (p > 0) progressHintEl.textContent = "Good start — keep sipping.";
      else progressHintEl.textContent = "Tap the bottle to log 50ml.";

      // Award streak if eligible
      maybeAwardStreakIfGoalReached(ml);
    }

    /***********************
     * DAILY MIDNIGHT RESET (AUTO)
     * - We don't delete history; we just force the UI to refresh at 00:00
     * - Since "today" is computed by date, everything becomes 0 automatically.
     ***********************/
    function scheduleMidnightRefresh(){
      const ms = msUntilNextMidnight();
      setTimeout(() => {
        // new day → UI should show 0 today
        updateMainUI();

        // also refresh chart date options so "today" is correct
        populateChartDates();

        // schedule the next midnight again
        scheduleMidnightRefresh();
      }, ms + 50); // small buffer
    }

    /***********************
     * DRINK ACTIONS
     ***********************/
    function logDrinkNow(){
      events.push(Date.now());
      updateMainUI();
    }

    function undoLast(){
      if (events.length === 0) return;

      // If we undo after getting streak today, we DO NOT remove streak
      // (streak is earned for the day once you reach goal).
      // If you want "streak revoked if you undo below goal", tell me and I can change it.
      events.pop();
      updateMainUI();
    }

    /***********************
     * HISTORY
     ***********************/
    function renderHistory(){
      events = pruneOldEvents(events);

      const map = new Map(); // dateKey -> timestamps
      for (const ts of events){
        const k = todayKey(new Date(ts));
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(ts);
      }

      const days = Array.from(map.keys()).sort((a,b) => (a < b ? 1 : -1));
      historyList.innerHTML = "";

      if (days.length === 0){
        historyEmpty.style.display = "block";
        return;
      }
      historyEmpty.style.display = "none";

      for (const day of days){
        const entries = map.get(day).sort((a,b) => a - b);
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
     * CHART
     ***********************/
    function getAvailableDayKeys(){
      const keys = [];
      const now = new Date();
      for (let i = 0; i < HISTORY_DAYS; i++){
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        keys.push(todayKey(d));
      }
      return keys;
    }

    function populateChartDates(){
      const keys = getAvailableDayKeys();
      chartDateSelect.innerHTML = "";
      for (const k of keys){
        const opt = document.createElement("option");
        opt.value = k;
        opt.textContent = k;
        chartDateSelect.appendChild(opt);
      }
      chartDateSelect.value = todayKey();
    }

    function hourlyMlForDay(dayKey){
      const buckets = new Array(24).fill(0);
      for (const ts of events){
        const d = new Date(ts);
        if (todayKey(d) !== dayKey) continue;
        buckets[d.getHours()] += ML_PER_CLICK;
      }
      return buckets;
    }

    function drawChart(dayKey){
      const ctx = chartCanvas.getContext("2d");
      const W = chartCanvas.width;
      const H = chartCanvas.height;

      ctx.clearRect(0, 0, W, H);

      const data = hourlyMlForDay(dayKey);
      const total = data.reduce((a,b)=>a+b,0);
      chartTotalMl.textContent = String(total);

      const maxVal = Math.max(50, ...data);
      const padL = 46, padR = 14, padT = 18, padB = 42;
      const innerW = W - padL - padR;
      const innerH = H - padT - padB;

      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + innerH);
      ctx.lineTo(padL + innerW, padT + innerH);
      ctx.stroke();

      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.font = "700 12px system-ui";
      ctx.fillText("0", 10, padT + innerH + 4);
      ctx.fillText(String(Math.round(maxVal/2)), 10, padT + innerH/2 + 4);
      ctx.fillText(String(maxVal), 10, padT + 10);

      const barGap = 6;
      const barW = (innerW - barGap * 23) / 24;

      const p = clamp01(total / dailyGoal);
      const barColor = colorForProgress(p);

      for (let hr = 0; hr < 24; hr++){
        const val = data[hr];
        const x = padL + hr * (barW + barGap);
        const h = (val / maxVal) * innerH;
        const y = padT + innerH - h;

        ctx.fillStyle = barColor;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x, y, barW, h);

        if (hr % 3 === 0){
          ctx.globalAlpha = 1;
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.font = "800 11px system-ui";
          ctx.fillText(String(hr), x + 2, padT + innerH + 28);
        }
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.font = "900 14px system-ui";
      ctx.fillText(`Hourly intake (ml) — ${dayKey}`, padL, 14);
    }

    /***********************
     * MENU + MODALS
     ***********************/
    function openMenu(){
      menuPanel.classList.add("open");
      menuPanel.setAttribute("aria-hidden","false");
      menuBtn.setAttribute("aria-expanded","true");
    }
    function closeMenu(){
      menuPanel.classList.remove("open");
      menuPanel.setAttribute("aria-hidden","true");
      menuBtn.setAttribute("aria-expanded","false");
    }
    function toggleMenu(){
      if (menuPanel.classList.contains("open")) closeMenu();
      else openMenu();
    }

    function openModal(modalEl){
      modalEl.classList.add("open");
      modalEl.setAttribute("aria-hidden","false");
    }
    function closeModal(modalEl){
      modalEl.classList.remove("open");
      modalEl.setAttribute("aria-hidden","true");
    }

    /***********************
     * REMINDER LOGIC
     ***********************/
    function setStatus(text){
      statusEl.textContent = text;
    }

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
     * BIND EVENTS
     ***********************/
    bottleBtn.addEventListener("click", logDrinkNow);
    undoBtn.addEventListener("click", undoLast);

    menuBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
    closeMenuBtn.addEventListener("click", closeMenu);

    historyBtn.addEventListener("click", () => {
      closeMenu();
      renderHistory();
      openModal(historyModal);
    });

    reminderBtn.addEventListener("click", () => {
      closeMenu();
      openModal(reminderModal);
    });

    chartBtn.addEventListener("click", () => {
      closeMenu();
      populateChartDates();
      drawChart(chartDateSelect.value);
      openModal(chartModal);
    });

    // Close buttons
    closeHistoryBtn.addEventListener("click", () => closeModal(historyModal));
    closeReminderBtn.addEventListener("click", () => closeModal(reminderModal));
    closeChartBtn.addEventListener("click", () => closeModal(chartModal));

    // Close by clicking overlay
    historyModal.addEventListener("click", (e) => { if (e.target === historyModal) closeModal(historyModal); });
    reminderModal.addEventListener("click", (e) => { if (e.target === reminderModal) closeModal(reminderModal); });
    chartModal.addEventListener("click", (e) => { if (e.target === chartModal) closeModal(chartModal); });

    // Close menu outside click
    document.addEventListener("click", (e) => {
      if (!menuPanel.classList.contains("open")) return;
      const within = menuPanel.contains(e.target) || menuBtn.contains(e.target);
      if (!within) closeMenu();
    });

    // ESC closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape"){
        closeMenu();
        closeModal(historyModal);
        closeModal(reminderModal);
        closeModal(chartModal);
      }
    });

    // Chart date change
    chartDateSelect.addEventListener("change", () => drawChart(chartDateSelect.value));

    // Reminder start/stop
    startBtn.addEventListener("click", async () => {
      const mins = Number(minutesInput.value);
      if (!mins || mins < 1) {
        alert("Please enter a valid number of minutes (1 or more).");
        return;
      }

      await maybeRequestNotifications();

      if (timerId) clearInterval(timerId);
      timerId = setInterval(remind, mins * 60 * 1000);

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
    updateMainUI();
    scheduleMidnightRefresh();
  });
})();
