const STORAGE_KEY = "learning-stack-state-v1";

const defaultState = {
  courses: [
    { id: createId(), name: "Data Structures", goalHours: 2, color: "#2563eb" },
    { id: createId(), name: "Mathematics", goalHours: 1.5, color: "#16a34a" }
  ],
  sessions: [],
  activeTimer: null
};

let state = loadState();
let tickHandle = null;
let deferredInstallPrompt = null;

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
  stopBtn: document.querySelector("#stopBtn"),
  resetBtn: document.querySelector("#resetBtn"),
  courseForm: document.querySelector("#courseForm"),
  courseName: document.querySelector("#courseName"),
  courseGoal: document.querySelector("#courseGoal"),
  courseColor: document.querySelector("#courseColor"),
  courseList: document.querySelector("#courseList"),
  todayChart: document.querySelector("#todayChart"),
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
      activeTimer: parsed.activeTimer || null
    };
  } catch {
    return cloneDefaultState();
  }
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
  const optionMarkup = state.courses
    .map((course) => `<option value="${course.id}">${escapeHtml(course.name)}</option>`)
    .join("");
  els.courseSelect.innerHTML = optionMarkup;
  els.manualCourse.innerHTML = optionMarkup;
}

function renderTimer() {
  if (!state.activeTimer) {
    els.timerDisplay.textContent = "00:00:00";
    els.timerStatus.textContent = "Idle";
    els.startBtn.disabled = state.courses.length === 0;
    els.stopBtn.disabled = true;
    els.courseSelect.disabled = false;
    return;
  }

  const elapsedSeconds = Math.floor((Date.now() - new Date(state.activeTimer.startedAt).getTime()) / 1000);
  const course = getCourse(state.activeTimer.courseId);
  els.timerDisplay.textContent = formatStopwatch(elapsedSeconds);
  els.timerStatus.textContent = course ? `Studying ${course.name}` : "Studying";
  els.startBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.courseSelect.disabled = true;
}

function renderCourses() {
  if (!state.courses.length) {
    els.courseList.innerHTML = `<div class="empty">No courses yet. Add your first course to start tracking.</div>`;
    return;
  }

  const todayTotals = totalsByCourse(sessionsForDate(dateKey()));
  els.courseList.innerHTML = state.courses.map((course) => {
    const studied = todayTotals[course.id] || 0;
    const goalMinutes = course.goalHours * 60;
    const progress = Math.min(100, Math.round((studied / goalMinutes) * 100));
    return `
      <article class="course-item">
        <div class="item-row">
          <div class="course-title">
            <span class="swatch" style="background:${course.color}"></span>
            <span>${escapeHtml(course.name)}</span>
          </div>
          <button class="ghost delete-course" data-course-id="${course.id}" type="button">Delete</button>
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
  els.streakValue.textContent = `${streak} ${streak === 1 ? "day" : "days"}`;
  els.streakText.textContent = streak
    ? "Keep studying at least once per day to continue this streak."
    : "Start a timer today to begin your streak.";
}

function renderChart() {
  const todayTotals = totalsByCourse(sessionsForDate(dateKey()));
  const maxMinutes = Math.max(1, ...Object.values(todayTotals));
  const rows = state.courses
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

function renderSessions() {
  const recent = [...state.sessions]
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
    startedAt: new Date().toISOString()
  };
  saveState();
  ensureTicker();
  renderAll();
}

function stopTimer() {
  if (!state.activeTimer) return;

  const endedAt = new Date().toISOString();
  const minutes = Math.max(1, minutesBetween(state.activeTimer.startedAt, endedAt));
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

els.startBtn.addEventListener("click", startTimer);
els.stopBtn.addEventListener("click", stopTimer);
els.resetBtn.addEventListener("click", resetTimer);
els.courseForm.addEventListener("submit", addCourse);
els.courseList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-course");
  if (button) deleteCourse(button.dataset.courseId);
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
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}

ensureTicker();
renderAll();
