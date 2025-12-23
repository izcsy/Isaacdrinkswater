(() => {
  const DEFAULT_DAILY_GOAL = 2000;
  const HISTORY_DAYS = 30;

  const LS_EVENTS = "water_events_v5";
  const LS_GOAL = "water_goal_v3";
  const LS_STREAK = "water_streak_v1";
  const LS_AWARDED_DAY = "water_streak_awarded_day_v1";
  const LS_THEME = "water_theme_v1";
  const LS_PROFILE = "water_profile_v2";

  const DEFAULT_PROFILE = {
    weightKg: "",
    gender: "unspecified",
    activity: "sedentary",
    weather: "normal",
    cupMl: 50,
    outfit: {
      headwear: "none",
      facewear: "none",
      shirt: "none",
      bottoms: "none",
      shoes: "none",
    }
  };

  const ASSETS = {
    cap: "assets/cap.png",
    sunglasses: "assets/sunglasses.png",
    shirt: "assets/shirt.png",
    jeans: "assets/jeans.png",
    boots: "assets/boots.png",
  };

  const VARIANT_TO_BASE = {
    // headwear
    cap_blue: "cap",
    cap_red: "cap",
    cap_black: "cap",

    // facewear
    shades_black: "sunglasses",
    shades_blue: "sunglasses",
    shades_gold: "sunglasses",

    // shirts
    tee_black: "shirt",
    tee_white: "shirt",
    tee_blue: "shirt",

    // bottoms
    jeans_light: "jeans",
    jeans_dark: "jeans",
    jeans_black: "jeans",

    // shoes
    boots_yellow: "boots",
    boots_black: "boots",
    boots_brown: "boots",
  };

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
    return events.filter(e => isWithinLastDays(e.ts, HISTORY_DAYS));
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

  function colorForProgress(p){
    p = clamp01(p);
    if (p <= 0.5) return mixColor("#ef4444", "#f59e0b", p / 0.5);
    return mixColor("#f59e0b", "#2563eb", (p - 0.5) / 0.5);
  }

  function msUntilNextMidnight(){
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    return next.getTime() - now.getTime();
  }

  function safeJsonParse(raw, fallback){
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  function loadEvents(){
    const raw = localStorage.getItem(LS_EVENTS);
    const arr = raw ? safeJsonParse(raw, []) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(o => o && typeof o === "object")
      .map(o => ({ ts: o.ts, ml: o.ml }))
      .filter(o => Number.isFinite(o.ts) && Number.isFinite(o.ml) && o.ml > 0);
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

  function loadTheme(){
    const t = localStorage.getItem(LS_THEME);
    return (t === "dark" || t === "light") ? t : "light";
  }
  function saveTheme(t){
    localStorage.setItem(LS_THEME, t);
  }

  function loadProfile(){
    const raw = localStorage.getItem(LS_PROFILE);
    const p = raw ? safeJsonParse(raw, null) : null;

    const merged = structuredClone(DEFAULT_PROFILE);
    if (p && typeof p === "object") {
      if (typeof p.weightKg === "string" || typeof p.weightKg === "number") merged.weightKg = String(p.weightKg ?? "");
      if (typeof p.gender === "string") merged.gender = p.gender;
      if (typeof p.activity === "string") merged.activity = p.activity;
      if (typeof p.weather === "string") merged.weather = p.weather;

      const cup = Number(p.cupMl);
      merged.cupMl = [50,100,200].includes(cup) ? cup : 50;

      if (p.outfit && typeof p.outfit === "object") {
        for (const k of ["headwear","facewear","shirt","bottoms","shoes"]) {
          if (typeof p.outfit[k] === "string") merged.outfit[k] = p.outfit[k];
        }
      }
    }
    return merged;
  }

  function saveProfile(profile){
    localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
  }

  // --- Image cut-out + "cartoon" processing (simple + fast) ---
  function loadImage(url){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load ${url}`));
      img.src = url;
    });
  }

  function processSticker(img, { remove = "white" }){
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    ctx.drawImage(img, 0, 0);

    const im = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = im.data;

    // remove background (white-ish or black-ish)
    // AND make edges a bit cleaner by softening alpha
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      const a = d[i+3];

      if (a === 0) continue;

      const max = Math.max(r,g,b);
      const min = Math.min(r,g,b);

      const isWhiteish = (r > 240 && g > 240 && b > 240) || (max > 245 && (max-min) < 20);
      const isBlackish = (r < 18 && g < 18 && b < 18) || (max < 22 && (max-min) < 18);

      const kill = (remove === "white" && isWhiteish) || (remove === "black" && isBlackish);
      if (kill) {
        d[i+3] = 0;
        continue;
      }

      // Slight posterize (cartoon vibe): reduce color steps a bit
      // (kept mild so it doesn't destroy texture)
      const step = 18;
      d[i]   = Math.round(r / step) * step;
      d[i+1] = Math.round(g / step) * step;
      d[i+2] = Math.round(b / step) * step;
    }

    ctx.putImageData(im, 0, 0);
    return canvas.toDataURL("image/png");
  }

  document.addEventListener("DOMContentLoaded", async () => {
    let timerId = null;

    const bottleBtn = document.getElementById("bottleBtn");
    const bottleWrap = document.getElementById("bottleWrap");
    const bottleHintEl = document.getElementById("bottleHint");
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

    const menuBtn = document.getElementById("menuBtn");
    const menuPanel = document.getElementById("menuPanel");
    const historyBtn = document.getElementById("historyBtn");
    const reminderBtn = document.getElementById("reminderBtn");
    const chartBtn = document.getElementById("chartBtn");
    const personaliseBtn = document.getElementById("personaliseBtn");
    const settingsBtn = document.getElementById("settingsBtn");
    const closeMenuBtn = document.getElementById("closeMenuBtn");

    const historyModal = document.getElementById("historyModal");
    const closeHistoryBtn = document.getElementById("closeHistoryBtn");
    const historyList = document.getElementById("historyList");
    const historyEmpty = document.getElementById("historyEmpty");
    const historySub = document.getElementById("historySub");

    const reminderModal = document.getElementById("reminderModal");
    const closeReminderBtn = document.getElementById("closeReminderBtn");
    const minutesInput = document.getElementById("minutes");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    const statusEl = document.getElementById("status");
    const notifToggle = document.getElementById("notifToggle");
    const ding = document.getElementById("ding");

    const chartModal = document.getElementById("chartModal");
    const closeChartBtn = document.getElementById("closeChartBtn");
    const chartDateSelect = document.getElementById("chartDateSelect");
    const chartCanvas = document.getElementById("chartCanvas");
    const chartTotalMl = document.getElementById("chartTotalMl");
    const chartLegend = document.getElementById("chartLegend");

    const personaliseModal = document.getElementById("personaliseModal");
    const closePersonaliseBtn = document.getElementById("closePersonaliseBtn");
    const savePersonaliseBtn = document.getElementById("savePersonaliseBtn");
    const resetPersonaliseBtn = document.getElementById("resetPersonaliseBtn");
    const personaliseStatus = document.getElementById("personaliseStatus");

    const pWeight = document.getElementById("pWeight");
    const pGender = document.getElementById("pGender");
    const pActivity = document.getElementById("pActivity");
    const pWeather = document.getElementById("pWeather");
    const pCupMl = document.getElementById("pCupMl");

    const cHeadwear = document.getElementById("cHeadwear");
    const cFacewear = document.getElementById("cFacewear");
    const cShirt = document.getElementById("cShirt");
    const cBottoms = document.getElementById("cBottoms");
    const cShoes = document.getElementById("cShoes");

    const settingsModal = document.getElementById("settingsModal");
    const closeSettingsBtn = document.getElementById("closeSettingsBtn");
    const darkModeToggle = document.getElementById("darkModeToggle");

    const accImgs = Array.from(document.querySelectorAll(".accImg"));

    // Theme
    function applyTheme(theme){
      if (theme === "dark") document.body.classList.add("dark");
      else document.body.classList.remove("dark");
      darkModeToggle.checked = (theme === "dark");
    }
    let theme = loadTheme();
    applyTheme(theme);

    darkModeToggle.addEventListener("change", () => {
      theme = darkModeToggle.checked ? "dark" : "light";
      saveTheme(theme);
      applyTheme(theme);
      if (chartModal.classList.contains("open")) drawChart(chartDateSelect.value);
    });

    // Data
    let events = pruneOldEvents(loadEvents());
    let dailyGoal = loadGoal();
    let streak = loadStreak();
    let awardedDay = loadAwardedDay();
    let profile = loadProfile();

    function getCupMl(){
      const cup = Number(profile.cupMl);
      return [50,100,200].includes(cup) ? cup : 50;
    }

    function applyOutfitToBottle(){
      bottleWrap.dataset.headwear = profile.outfit.headwear || "none";
      bottleWrap.dataset.facewear = profile.outfit.facewear || "none";
      bottleWrap.dataset.shirt = profile.outfit.shirt || "none";
      bottleWrap.dataset.bottoms = profile.outfit.bottoms || "none";
      bottleWrap.dataset.shoes = profile.outfit.shoes || "none";
    }

    function syncCupText(){
      const cup = getCupMl();
      bottleHintEl.textContent = `Click to log ${cup}ml`;
      historySub.textContent = `Each entry logs your cup size at that time. Current cup size: ${cup}ml.`;
      chartLegend.textContent = `Each bar = total ml in that hour (based on your cup size at the time).`;
    }

    // Toast
    let toastTimer = null;
    function showToast(msg){
      toastEl.textContent = msg;
      toastEl.classList.add("show");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
    }

    // Stats
    function statsForDay(dayKey){
      let clicks = 0;
      let ml = 0;
      for (const e of events){
        if (todayKey(new Date(e.ts)) === dayKey){
          clicks += 1;
          ml += e.ml;
        }
      }
      return { clicks, ml };
    }

    function maybeAwardStreakIfGoalReached(todayMl){
      const day = todayKey();
      if (awardedDay === day) return;
      if (todayMl < dailyGoal) return;

      streak += 1;
      saveStreak(streak);
      streakCountEl.textContent = String(streak);

      awardedDay = day;
      saveAwardedDay(day);

      showToast(`🎉 Goal reached! Streak +1 (🔥 ${streak})`);
    }

    function updateMainUI(){
      events = pruneOldEvents(events);
      saveEvents(events);

      streakCountEl.textContent = String(streak);

      const key = todayKey();
      const { clicks, ml } = statsForDay(key);

      clickCountEl.textContent = clicks;
      mlCountEl.textContent = ml;

      progressNowEl.textContent = ml;
      progressGoalEl.textContent = dailyGoal;

      const p = dailyGoal > 0 ? clamp01(ml / dailyGoal) : 0;
      const c = colorForProgress(p);

      progressFillEl.style.width = `${Math.round(p * 100)}%`;
      progressFillEl.style.background = c;

      bottleWaterEl.style.height = `${Math.round(p * 100)}%`;
      bottleWaterEl.style.background = c;

      if (p >= 1) progressHintEl.textContent = "Goal reached 🎉 Keep it up!";
      else if (p >= 0.5) progressHintEl.textContent = "Nice! Halfway there.";
      else if (p > 0) progressHintEl.textContent = `Good start — keep sipping. (+${getCupMl()}ml per click)`;
      else progressHintEl.textContent = `Tap the bottle to log ${getCupMl()}ml.`;

      maybeAwardStreakIfGoalReached(ml);
    }

    function scheduleMidnightRefresh(){
      const ms = msUntilNextMidnight();
      setTimeout(() => {
        updateMainUI();
        populateChartDates();
        scheduleMidnightRefresh();
      }, ms + 50);
    }

    // Log drink
    function logDrinkNow(){
      const cup = getCupMl();
      events.push({ ts: Date.now(), ml: cup });
      updateMainUI();
    }
    function undoLast(){
      if (events.length === 0) return;
      events.pop();
      updateMainUI();
    }

    // History
    function renderHistory(){
      events = pruneOldEvents(events);

      const map = new Map();
      for (const e of events){
        const k = todayKey(new Date(e.ts));
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(e);
      }

      const days = Array.from(map.keys()).sort((a,b) => (a < b ? 1 : -1));
      historyList.innerHTML = "";

      if (days.length === 0){
        historyEmpty.style.display = "block";
        return;
      }
      historyEmpty.style.display = "none";

      for (const day of days){
        const entries = map.get(day).sort((a,b) => a.ts - b.ts);
        const totalMl = entries.reduce((sum, e) => sum + e.ml, 0);

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

        for (const e of entries){
          const d = new Date(e.ts);
          const hh = String(d.getHours()).padStart(2,"0");
          const mm = String(d.getMinutes()).padStart(2,"0");
          const ss = String(d.getSeconds()).padStart(2,"0");

          const chip = document.createElement("div");
          chip.className = "timeChip";
          chip.textContent = `${hh}:${mm}:${ss} • ${e.ml}ml`;
          chips.appendChild(chip);
        }

        group.appendChild(title);
        group.appendChild(chips);
        historyList.appendChild(group);
      }
    }

    // Chart
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
      for (const e of events){
        const d = new Date(e.ts);
        if (todayKey(d) !== dayKey) continue;
        buckets[d.getHours()] += e.ml;
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

      const isDark = document.body.classList.contains("dark");
      const axis = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.25)";
      const text = isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.65)";
      const title = isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.80)";

      ctx.lineWidth = 1;
      ctx.strokeStyle = axis;
      ctx.beginPath();
      ctx.moveTo(padL, padT);
      ctx.lineTo(padL, padT + innerH);
      ctx.lineTo(padL + innerW, padT + innerH);
      ctx.stroke();

      ctx.fillStyle = text;
      ctx.font = "700 12px system-ui";
      ctx.fillText("0", 10, padT + innerH + 4);
      ctx.fillText(String(Math.round(maxVal/2)), 10, padT + innerH/2 + 4);
      ctx.fillText(String(maxVal), 10, padT + 10);

      const barGap = 6;
      const barW = (innerW - barGap * 23) / 24;

      const p = dailyGoal > 0 ? clamp01(total / dailyGoal) : 0;
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
          ctx.fillStyle = text;
          ctx.font = "800 11px system-ui";
          ctx.fillText(String(hr), x + 2, padT + innerH + 28);
        }
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = title;
      ctx.font = "900 14px system-ui";
      ctx.fillText(`Hourly intake (ml) — ${dayKey}`, padL, 14);
    }

    // Menu + modals
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

    function setStatus(text){ statusEl.textContent = text; }

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

    // Personalisation
    function populatePersonaliseForm(){
      pWeight.value = profile.weightKg ? String(profile.weightKg) : "";
      pGender.value = profile.gender || "unspecified";
      pActivity.value = profile.activity || "sedentary";
      pWeather.value = profile.weather || "normal";
      pCupMl.value = String(getCupMl());

      cHeadwear.value = profile.outfit.headwear || "none";
      cFacewear.value = profile.outfit.facewear || "none";
      cShirt.value = profile.outfit.shirt || "none";
      cBottoms.value = profile.outfit.bottoms || "none";
      cShoes.value = profile.outfit.shoes || "none";
    }

    function applyLiveOutfitFromSelects(){
      profile.outfit.headwear = cHeadwear.value;
      profile.outfit.facewear = cFacewear.value;
      profile.outfit.shirt = cShirt.value;
      profile.outfit.bottoms = cBottoms.value;
      profile.outfit.shoes = cShoes.value;
      applyOutfitToBottle();
    }

    function applyLiveCupFromSelect(){
      const cup = Number(pCupMl.value);
      profile.cupMl = [50,100,200].includes(cup) ? cup : 50;
      syncCupText();
      updateMainUI();
    }

    function savePersonalisation(){
      const w = pWeight.value.trim();
      profile.weightKg = w ? w : "";

      profile.gender = pGender.value;
      profile.activity = pActivity.value;
      profile.weather = pWeather.value;

      const cup = Number(pCupMl.value);
      profile.cupMl = [50,100,200].includes(cup) ? cup : 50;

      profile.outfit.headwear = cHeadwear.value;
      profile.outfit.facewear = cFacewear.value;
      profile.outfit.shirt = cShirt.value;
      profile.outfit.bottoms = cBottoms.value;
      profile.outfit.shoes = cShoes.value;

      saveProfile(profile);
      personaliseStatus.textContent = "Saved ✅";
      showToast("Saved personalisation ✅");

      applyOutfitToBottle();
      syncCupText();
      updateMainUI();
      if (chartModal.classList.contains("open")) drawChart(chartDateSelect.value);
    }

    function resetPersonalisation(){
      profile = structuredClone(DEFAULT_PROFILE);
      saveProfile(profile);
      populatePersonaliseForm();
      applyOutfitToBottle();
      syncCupText();
      updateMainUI();
      personaliseStatus.textContent = "Reset to defaults";
      showToast("Personalisation reset");
    }

    // --- Load & process sticker images once ---
    async function initStickers(){
      const processed = new Map(); // baseName -> dataURL

      async function getBase(baseName){
        if (processed.has(baseName)) return processed.get(baseName);

        const url = ASSETS[baseName];
        const img = await loadImage(url);

        // sunglasses: remove black background, others: remove white background
        const remove = (baseName === "sunglasses") ? "black" : "white";

        const dataUrl = processSticker(img, { remove });
        processed.set(baseName, dataUrl);
        return dataUrl;
      }

      for (const el of accImgs){
        const variant = el.dataset.variant;
        const base = VARIANT_TO_BASE[variant];
        if (!base) continue;

        try{
          el.src = await getBase(base);
        }catch(e){
          // If missing assets, don’t crash the app
          console.warn(e);
        }
      }
    }

    // Events
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

    personaliseBtn.addEventListener("click", () => {
      closeMenu();
      populatePersonaliseForm();
      personaliseStatus.textContent = "Edit your preferences, then Save";
      openModal(personaliseModal);
    });

    settingsBtn.addEventListener("click", () => {
      closeMenu();
      openModal(settingsModal);
    });

    closeHistoryBtn.addEventListener("click", () => closeModal(historyModal));
    closeReminderBtn.addEventListener("click", () => closeModal(reminderModal));
    closeChartBtn.addEventListener("click", () => closeModal(chartModal));
    closePersonaliseBtn.addEventListener("click", () => closeModal(personaliseModal));
    closeSettingsBtn.addEventListener("click", () => closeModal(settingsModal));

    historyModal.addEventListener("click", (e) => { if (e.target === historyModal) closeModal(historyModal); });
    reminderModal.addEventListener("click", (e) => { if (e.target === reminderModal) closeModal(reminderModal); });
    chartModal.addEventListener("click", (e) => { if (e.target === chartModal) closeModal(chartModal); });
    personaliseModal.addEventListener("click", (e) => { if (e.target === personaliseModal) closeModal(personaliseModal); });
    settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) closeModal(settingsModal); });

    document.addEventListener("click", (e) => {
      if (!menuPanel.classList.contains("open")) return;
      const within = menuPanel.contains(e.target) || menuBtn.contains(e.target);
      if (!within) closeMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape"){
        closeMenu();
        closeModal(historyModal);
        closeModal(reminderModal);
        closeModal(chartModal);
        closeModal(personaliseModal);
        closeModal(settingsModal);
      }
    });

    chartDateSelect.addEventListener("change", () => drawChart(chartDateSelect.value));

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

    cHeadwear.addEventListener("change", applyLiveOutfitFromSelects);
    cFacewear.addEventListener("change", applyLiveOutfitFromSelects);
    cShirt.addEventListener("change", applyLiveOutfitFromSelects);
    cBottoms.addEventListener("change", applyLiveOutfitFromSelects);
    cShoes.addEventListener("change", applyLiveOutfitFromSelects);

    pCupMl.addEventListener("change", applyLiveCupFromSelect);

    savePersonaliseBtn.addEventListener("click", savePersonalisation);
    resetPersonaliseBtn.addEventListener("click", resetPersonalisation);

    // Init
    await initStickers();
    applyOutfitToBottle();
    syncCupText();
    updateMainUI();
    scheduleMidnightRefresh();
  });
})();
