const STORAGE_KEY = "learning-stack-state-v1";

const defaultState = {
  courses: [
    { id: createId(), name: "Data Structures", goalHours: 2, color: "#2563eb" },
    { id: createId(), name: "Mathematics", goalHours: 1.5, color: "#16a34a" }
  ],
  sessions: [],
  activeTimer: null,
  ui: {
    hideCompletedCourses: false
  }
};

let state = loadState();
let tickHandle = null;
let deferredInstallPrompt = null;
let editingCourseId = null;
let refreshingForServiceWorker = false;

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  todayTotal: document.querySelector("#todayTotal"),
  weekTotal: document.querySelector("#weekTotal"),
  courseCount: document.querySelector("#courseCount"),
  streakValue: document.querySelector("#streakValue"),
  streakText: document.querySelector("#streakText"),
  timerStatus: document.querySelector("#timerStatus"),
  timerDisplay: document.querySelector("#timerDisplay"),
  courseSelect: document.querySelector("#courseSelect"),
  sessionNote: document.querySelector("#sessionNote"),
  startBtn: document.querySelector("#startBtn"),
  pauseBtn: document.querySelector("#pauseBtn"),
  resumeBtn: document.querySelector("#resumeBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  hideCompletedToggle: document.querySelector("#hideCompletedToggle"),
  courseForm: document.querySelector("#courseForm"),
  courseName: document.querySelector("#courseName"),
  courseGoal: document.querySelector("#courseGoal"),
  courseColor: document.querySelector("#courseColor"),
  courseList: document.querySelector("#courseList"),
  todayChart: document.querySelector("#todayChart"),
  studyHeatmap: document.querySelector("#studyHeatmap"),
  sessionList: document.querySelector("#sessionList"),
  addManualBtn: document.querySelector("#addManualBtn"),
  manualDialog: document.querySelector("#manualDialog"),
  manualForm: document.querySelector("#manualForm"),
  manualCourse: document.querySelector("#manualCourse"),
  manualDate: document.querySelector("#manualDate"),
  manualHours: document.querySelector("#manualHours"),
  manualNote: document.querySelector("#manualNote"),
  closeManualBtn: document.querySelector("#closeManualBtn"),
  refreshCoachBtn: document.querySelector("#refreshCoachBtn"),
  installAppBtn: document.querySelector("#installAppBtn"),
  coachAction: document.querySelector("#coachAction"),
  coachConsistency: document.querySelector("#coachConsistency"),
  coachBalance: document.querySelector("#coachBalance")
};

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return cloneDefaultState();

  try {
    const parsed = JSON.parse(saved);
    return {
      courses: parsed.courses?.length ? parsed.courses : cloneDefaultState().courses,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      activeTimer: normalizeTimer(parsed.activeTimer),
      ui: {
        ...cloneDefaultState().ui,
        ...(parsed.ui || {})
      }
    };
  } catch {
    return cloneDefaultState();
  }
}

function normalizeTimer(timer) {
  if (!timer) return null;
  return {
    courseId: timer.courseId,
    note: timer.note || "",
    startedAt: timer.startedAt || new Date().toISOString(),
    runningStartedAt: timer.runningStartedAt || timer.startedAt || new Date().toISOString(),
    accumulatedSeconds: Number.isFinite(timer.accumulatedSeconds) ? timer.accumulatedSeconds : 0,
    isPaused: Boolean(timer.isPaused)
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(defaultState));
}

function startOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dateKey(date = new Date()) {
  const local = startOfDay(date);
  const year = local.getFullYear();
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesBetween(startIso, endIso) {
  return Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function formatStopwatch(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function getCourse(courseId) {
  return state.courses.find((course) => course.id === courseId);
}

function isCourseCompletedToday(course, totals = totalsByCourse(sessionsForDate(dateKey()))) {
  return (totals[course.id] || 0) >= course.goalHours * 60;
}

function visibleCoursesForToday() {
  if (!state.ui.hideCompletedCourses) return state.courses;
  const todayTotals = totalsByCourse(sessionsForDate(dateKey()));
  return state.courses.filter((course) => !isCourseCompletedToday(course, todayTotals));
}

function activeSessions(sessions = state.sessions) {
  return sessions.filter((session) => getCourse(session.courseId));
}

function sessionsForDate(key) {
  return state.sessions.filter((session) => dateKey(new Date(session.start)) === key);
}

function totalMinutesForSessions(sessions) {
  return sessions.reduce((sum, session) => sum + session.minutes, 0);
}

function totalsByCourse(sessions) {
  return sessions.reduce((acc, session) => {
    acc[session.courseId] = (acc[session.courseId] || 0) + session.minutes;
    return acc;
  }, {});
}

function getWeekSessions() {
  const today = startOfDay();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  return state.sessions.filter((session) => new Date(session.start) >= weekStart);
}

function calculateStreak() {
  const studiedDays = new Set(
    state.sessions
      .filter((session) => session.minutes > 0)
      .map((session) => dateKey(new Date(session.start)))
  );
  let streak = 0;
  const cursor = startOfDay();

  while (studiedDays.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function renderOptions() {
  const optionMarkup = visibleCoursesForToday()
    .map((course) => `<option value="${course.id}">${escapeHtml(course.name)}</option>`)
    .join("");
  els.courseSelect.innerHTML = optionMarkup;
  els.manualCourse.innerHTML = state.courses
    .map((course) => `<option value="${course.id}">${escapeHtml(course.name)}</option>`)
    .join("");
}

function renderTimer() {
  if (!state.activeTimer) {
    els.timerDisplay.textContent = "00:00:00";
    els.timerStatus.textContent = "Idle";
    els.startBtn.disabled = !visibleCoursesForToday().length;
    els.pauseBtn.disabled = true;
    els.pauseBtn.hidden = false;
    els.resumeBtn.disabled = true;
    els.resumeBtn.hidden = true;
    els.stopBtn.disabled = true;
    els.courseSelect.disabled = false;
    els.sessionNote.disabled = false;
    return;
  }

  const elapsedSeconds = getActiveTimerSeconds();
  const course = getCourse(state.activeTimer.courseId);
  els.timerDisplay.textContent = formatStopwatch(elapsedSeconds);
  els.timerStatus.textContent = state.activeTimer.isPaused
    ? "Paused"
    : course ? `Studying ${course.name}` : "Studying";
  els.startBtn.disabled = true;
  els.pauseBtn.disabled = state.activeTimer.isPaused;
  els.pauseBtn.hidden = state.activeTimer.isPaused;
  els.resumeBtn.disabled = !state.activeTimer.isPaused;
  els.resumeBtn.hidden = !state.activeTimer.isPaused;
  els.stopBtn.disabled = false;
  els.courseSelect.disabled = true;
  els.sessionNote.disabled = true;
}

function renderCourses() {
  const coursesToRender = visibleCoursesForToday();
  if (!state.courses.length) {
    els.courseList.innerHTML = `<div class="empty">No courses yet. Add your first course to start tracking.</div>`;
    return;
  }

  if (!coursesToRender.length) {
    els.courseList.innerHTML = `<div class="empty">All courses with today's completed goals are hidden.</div>`;
    return;
  }

  const todayTotals = totalsByCourse(sessionsForDate(dateKey()));
  els.courseList.innerHTML = coursesToRender.map((course) => {
    const studied = todayTotals[course.id] || 0;
    const goalMinutes = course.goalHours * 60;
    const progress = Math.min(100, Math.round((studied / goalMinutes) * 100));
    if (editingCourseId === course.id) {
      return `
        <article class="course-item">
          <form class="course-edit-form" data-course-id="${course.id}">
            <label>
              Name
              <input name="name" type="text" value="${escapeHtml(course.name)}" required>
            </label>
            <label>
              Hours
              <input name="goalHours" type="number" min="0.5" step="0.5" value="${course.goalHours}" required>
            </label>
            <label>
              Color
              <select name="color" aria-label="Course color">
                ${renderColorOptions(course.color)}
              </select>
            </label>
            <button class="primary small-button" type="submit">Save</button>
            <button class="ghost small-button cancel-course-edit" type="button">Cancel</button>
          </form>
        </article>
      `;
    }
    return `
      <article class="course-item">
        <div class="item-row">
          <div class="course-title">
            <span class="swatch" style="background:${course.color}"></span>
            <span>${escapeHtml(course.name)}</span>
          </div>
          <div class="course-actions">
            <button class="ghost small-button edit-course" data-course-id="${course.id}" type="button">Edit</button>
            <button class="ghost small-button delete-course" data-course-id="${course.id}" type="button">Delete</button>
          </div>
        </div>
        <div class="muted">Today: ${formatDuration(studied)} / Goal: ${formatDuration(goalMinutes)}</div>
        <div class="progress" aria-label="${course.name} progress">
          <span style="width:${progress}%;background:${course.color}"></span>
        </div>
      </article>
    `;
  }).join("");
}

function renderSummary() {
  const today = new Date();
  const todaySessions = sessionsForDate(dateKey(today));
  const weekSessions = getWeekSessions();
  const streak = calculateStreak();

  els.todayLabel.textContent = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
  els.todayTotal.textContent = formatDuration(totalMinutesForSessions(todaySessions));
  els.weekTotal.textContent = formatDuration(totalMinutesForSessions(weekSessions));
  els.courseCount.textContent = String(state.courses.length);
  els.hideCompletedToggle.checked = state.ui.hideCompletedCourses;
  els.streakValue.textContent = `${streak} ${streak === 1 ? "day" : "days"}`;
  els.streakText.textContent = streak
    ? "Keep studying at least once per day to continue this streak."
    : "Start a timer today to begin your streak.";
}

function renderChart() {
  if (!els.todayChart) return;

  const todayTotals = totalsByCourse(activeSessions(sessionsForDate(dateKey())));
  const maxMinutes = Math.max(1, ...Object.values(todayTotals));
  const rows = visibleCoursesForToday()
    .filter((course) => todayTotals[course.id])
    .map((course) => {
      const minutes = todayTotals[course.id];
      const width = Math.max(6, Math.round((minutes / maxMinutes) * 100));
      return `
        <div class="chart-row">
          <strong>${escapeHtml(course.name)}</strong>
          <div class="bar"><span style="width:${width}%;background:${course.color}"></span></div>
          <span class="muted">${formatDuration(minutes)}</span>
        </div>
      `;
    });

  els.todayChart.innerHTML = rows.length
    ? rows.join("")
    : `<div class="empty">No study time recorded today.</div>`;
}

function renderHeatmap() {
  const daysToShow = 84;
  const today = startOfDay();
  const firstDay = new Date(today);
  firstDay.setDate(today.getDate() - daysToShow + 1);

  const totals = activeSessions().reduce((acc, session) => {
    const key = dateKey(new Date(session.start));
    acc[key] = (acc[key] || 0) + session.minutes;
    return acc;
  }, {});

  const blanks = Array.from({ length: firstDay.getDay() }, () => `<span class="heat-day empty-day"></span>`);
  const cells = [];

  for (let index = 0; index < daysToShow; index += 1) {
    const day = new Date(firstDay);
    day.setDate(firstDay.getDate() + index);
    const key = dateKey(day);
    const minutes = totals[key] || 0;
    const level = getHeatLevel(minutes);
    const dateLabel = day.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric"
    });
    const tooltip = `${dateLabel}: ${formatDuration(minutes)} studied`;
    const tick = minutes > 0 ? "&#10003;" : "";

    cells.push(`
      <button
        class="heat-day level-${level}"
        type="button"
        data-tooltip="${escapeHtml(tooltip)}"
        aria-label="${escapeHtml(tooltip)}"
        title="${escapeHtml(tooltip)}"
      >${tick}</button>
    `);
  }

  els.studyHeatmap.innerHTML = [...blanks, ...cells].join("");
}

function getHeatLevel(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 90) return 2;
  if (minutes < 180) return 3;
  return 4;
}

function renderSessions() {
  if (!els.sessionList) return;

  const recent = activeSessions()
    .sort((a, b) => new Date(b.start) - new Date(a.start))
    .slice(0, 8);

  if (!recent.length) {
    els.sessionList.innerHTML = `<div class="empty">Your recent study sessions will appear here.</div>`;
    return;
  }

  els.sessionList.innerHTML = recent.map((session) => {
    const course = getCourse(session.courseId);
    const started = new Date(session.start);
    return `
      <article class="session-item">
        <div class="item-row">
          <div class="course-title">
            <span class="swatch" style="background:${course?.color || "#64748b"}"></span>
            <span>${escapeHtml(course?.name || "Deleted course")}</span>
          </div>
          <strong>${formatDuration(session.minutes)}</strong>
        </div>
        <div class="muted">${started.toLocaleDateString()} at ${started.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
        ${session.note ? `<div>${escapeHtml(session.note)}</div>` : ""}
      </article>
    `;
  }).join("");
}

function renderCoach() {
  const todaySessions = sessionsForDate(dateKey());
  const weekSessions = getWeekSessions();
  const todayMinutes = totalMinutesForSessions(todaySessions);
  const weekMinutes = totalMinutesForSessions(weekSessions);
  const streak = calculateStreak();
  const todayTotals = totalsByCourse(todaySessions);
  const weakestCourse = state.courses
    .map((course) => ({
      course,
      progress: (todayTotals[course.id] || 0) / Math.max(1, course.goalHours * 60)
    }))
    .sort((a, b) => a.progress - b.progress)[0];

  if (!state.sessions.length) {
    els.coachAction.textContent = "Start one 25 to 50 minute session in your most important course.";
    els.coachConsistency.textContent = "No completed sessions yet. Your streak begins after the first saved study session.";
    els.coachBalance.textContent = "Add all active courses so the tracker can compare your daily progress.";
    return;
  }

  els.coachAction.textContent = weakestCourse
    ? `Focus next on ${weakestCourse.course.name}. It has the lowest progress against today's goal.`
    : "Complete one more short review session to strengthen recall.";

  els.coachConsistency.textContent = streak >= 3
    ? `You have a ${streak}-day streak. Keep tomorrow's session small if your schedule is tight.`
    : `This week you studied ${formatDuration(weekMinutes)}. Study on consecutive days to build a stronger streak.`;

  const sortedTotals = Object.entries(totalsByCourse(weekSessions))
    .map(([courseId, minutes]) => ({ course: getCourse(courseId), minutes }))
    .filter((item) => item.course)
    .sort((a, b) => b.minutes - a.minutes);

  if (sortedTotals.length >= 2) {
    const top = sortedTotals[0];
    const bottom = sortedTotals[sortedTotals.length - 1];
    els.coachBalance.textContent = `${top.course.name} has the most time this week. Balance it with ${bottom.course.name} if both are important.`;
  } else {
    els.coachBalance.textContent = todayMinutes
      ? `Today you have logged ${formatDuration(todayMinutes)}. Add another course to compare balance.`
      : "No time logged today. Begin with a focused timer session.";
  }
}

function renderAll() {
  renderOptions();
  renderTimer();
  renderCourses();
  renderSummary();
  renderChart();
  renderHeatmap();
  renderSessions();
  renderCoach();
  saveState();
}

function startTimer() {
  const courseId = els.courseSelect.value;
  if (!courseId) return;

  state.activeTimer = {
    courseId,
    note: els.sessionNote.value.trim(),
    startedAt: new Date().toISOString(),
    runningStartedAt: new Date().toISOString(),
    accumulatedSeconds: 0,
    isPaused: false
  };
  saveState();
  ensureTicker();
  renderAll();
}

function getActiveTimerSeconds() {
  if (!state.activeTimer) return 0;
  const accumulated = state.activeTimer.accumulatedSeconds || 0;
  if (state.activeTimer.isPaused) return accumulated;

  const runningStartedAt = new Date(state.activeTimer.runningStartedAt || state.activeTimer.startedAt).getTime();
  return accumulated + Math.max(0, Math.floor((Date.now() - runningStartedAt) / 1000));
}

function pauseTimer() {
  if (!state.activeTimer || state.activeTimer.isPaused) return;

  state.activeTimer.accumulatedSeconds = getActiveTimerSeconds();
  state.activeTimer.isPaused = true;
  saveState();
  renderAll();
}

function resumeTimer() {
  if (!state.activeTimer || !state.activeTimer.isPaused) return;

  state.activeTimer.runningStartedAt = new Date().toISOString();
  state.activeTimer.isPaused = false;
  saveState();
  renderAll();
}

function stopTimer() {
  if (!state.activeTimer) return;

  const endedAt = new Date().toISOString();
  const minutes = Math.max(1, Math.round(getActiveTimerSeconds() / 60));
  state.sessions.push({
    id: createId(),
    courseId: state.activeTimer.courseId,
    note: state.activeTimer.note,
    start: state.activeTimer.startedAt,
    end: endedAt,
    minutes
  });
  state.activeTimer = null;
  els.sessionNote.value = "";
  saveState();
  renderAll();
}

function resetTimer() {
  state.activeTimer = null;
  els.sessionNote.value = "";
  saveState();
  renderAll();
}

function addCourse(event) {
  event.preventDefault();
  const name = els.courseName.value.trim();
  const goalHours = Number(els.courseGoal.value);
  if (!name || !Number.isFinite(goalHours) || goalHours <= 0) return;

  state.courses.push({
    id: createId(),
    name,
    goalHours,
    color: els.courseColor.value
  });
  els.courseForm.reset();
  els.courseGoal.value = "2";
  renderAll();
}

function deleteCourse(courseId) {
  const isActive = state.activeTimer?.courseId === courseId;
  if (isActive) {
    alert("Stop or reset the active timer before deleting this course.");
    return;
  }

  state.courses = state.courses.filter((course) => course.id !== courseId);
  if (editingCourseId === courseId) editingCourseId = null;
  renderAll();
}

function updateCourse(courseId, form) {
  const course = getCourse(courseId);
  if (!course) return;

  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const goalHours = Number(formData.get("goalHours"));
  const color = String(formData.get("color") || course.color);
  if (!name || !Number.isFinite(goalHours) || goalHours <= 0) return;

  course.name = name;
  course.goalHours = goalHours;
  course.color = color;
  editingCourseId = null;
  renderAll();
}

function addManualSession(event) {
  event.preventDefault();
  const courseId = els.manualCourse.value;
  const hours = Number(els.manualHours.value);
  const date = els.manualDate.value;
  if (!courseId || !date || !Number.isFinite(hours) || hours <= 0) return;

  const start = new Date(`${date}T09:00:00`);
  const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
  state.sessions.push({
    id: createId(),
    courseId,
    note: els.manualNote.value.trim(),
    start: start.toISOString(),
    end: end.toISOString(),
    minutes: Math.round(hours * 60)
  });
  els.manualDialog.close();
  els.manualForm.reset();
  renderAll();
}

function ensureTicker() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    if (state.activeTimer) renderTimer();
  }, 1000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function renderColorOptions(selectedColor) {
  const colors = [
    ["#2563eb", "Blue"],
    ["#16a34a", "Green"],
    ["#dc2626", "Red"],
    ["#9333ea", "Violet"],
    ["#ea580c", "Orange"]
  ];

  return colors
    .map(([value, label]) => `<option value="${value}" ${value === selectedColor ? "selected" : ""}>${label}</option>`)
    .join("");
}

els.startBtn.addEventListener("click", startTimer);
els.pauseBtn.addEventListener("click", pauseTimer);
els.resumeBtn.addEventListener("click", resumeTimer);
els.stopBtn.addEventListener("click", stopTimer);
els.resetBtn.addEventListener("click", resetTimer);
els.hideCompletedToggle.addEventListener("change", () => {
  state.ui.hideCompletedCourses = els.hideCompletedToggle.checked;
  renderAll();
});
els.courseForm.addEventListener("submit", addCourse);
els.courseList.addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-course");
  const deleteButton = event.target.closest(".delete-course");
  const cancelButton = event.target.closest(".cancel-course-edit");

  if (editButton) {
    editingCourseId = editButton.dataset.courseId;
    renderAll();
  }
  if (deleteButton) deleteCourse(deleteButton.dataset.courseId);
  if (cancelButton) {
    editingCourseId = null;
    renderAll();
  }
});
els.courseList.addEventListener("submit", (event) => {
  const form = event.target.closest(".course-edit-form");
  if (!form) return;

  event.preventDefault();
  updateCourse(form.dataset.courseId, form);
});
els.addManualBtn.addEventListener("click", () => {
  els.manualDate.value = dateKey();
  els.manualDialog.showModal();
});
els.closeManualBtn.addEventListener("click", () => els.manualDialog.close());
els.manualForm.addEventListener("submit", addManualSession);
els.refreshCoachBtn.addEventListener("click", renderCoach);
els.installAppBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.installAppBtn.hidden = true;
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  els.installAppBtn.hidden = false;
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  els.installAppBtn.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then((registration) => {
        registration.update();
      })
      .catch((error) => {
        console.warn("Service worker registration failed:", error);
      });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingForServiceWorker) return;
    refreshingForServiceWorker = true;
    window.location.reload();
  });
}

ensureTicker();
renderAll();
