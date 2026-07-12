# Learning Stack

A fast static prototype for tracking study courses, stopwatch sessions, daily totals, streaks, and AI-style coaching insights.

## Features

- Add courses with daily hour goals and colors.
- Start a stopwatch before studying and stop it when finished.
- Automatically records studied minutes by course and day.
- Shows today's totals, weekly totals, recent sessions, and current streak.
- Supports manual session entry for past study time.
- Generates local AI Coach recommendations from your history.
- Saves data in browser localStorage.
- Installs as a Progressive Web App from Chrome or Edge.
- Caches the app shell for offline use after the first visit.

## Run

Run a static server from this folder:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8000
```

Chrome or Edge will show an install option once the app loads. You can also use the `Download app` button when it appears in the sidebar.

## Prototype note

The AI Coach is local and rule-based for this prototype. A production version can connect this data to an LLM API for deeper summaries, plans, and reminders.
