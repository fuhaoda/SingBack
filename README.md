# SingBack 🎤

SingBack is a browser app for practical singing practice.  
The loop is simple: **hear the target -> sing it back -> see your score and curve -> retry immediately**.

The goal is not gamified streaks. The goal is clear feedback:
- Are you sharp or flat?
- How far off are you?
- Is the main issue pitch, stability, lock, or rhythm?

---

## What You See

Each question has 3 comparison panels (same axes for direct visual comparison):
- `Current`: your latest attempt
- `First`: your first valid attempt in this question
- `Best`: your highest-score attempt in this question

Each panel shows:
- total score (`0-100`)
- subscores: `Acc / Stb / Lock / Rhy`
- a clean synthesized target tone designed as a pitch reference (sine-based "pitch ruler")

---

## Quick Start (2 minutes)

### Requirements
- Node.js 20+
- npm 10+

### Install
```bash
npm install
```

### Run
```bash
npm run dev
```

Open the local URL from the terminal (usually `http://localhost:5173`).

### Optional checks
```bash
npm run lint
npm run test:run
npm run build
```

> No Python virtual environment is required. This is a pure frontend Node project.

### Local preview of GitHub Pages build
```bash
npm run build:pages
./start_local.sh
```

Open `http://127.0.0.1:8080`.

If `8080` is already in use, run:
```bash
cd docs
python3 -m http.server 8090
```
Then open `http://127.0.0.1:8090`.

### Deploy to GitHub Pages (`main/docs`)
1. Build Pages artifacts:
```bash
npm run build:pages
```
2. Commit and push both source changes and updated `docs/` artifacts to `main`.
3. In GitHub repository settings, set:
   - `Settings -> Pages`
   - `Source: Deploy from a branch`
   - `Branch: main`
   - `Folder: /docs`
4. Wait for Pages to finish publishing, then open:
   - `https://fuhaoda.github.io/SingBack/`

### Release checklist (recommended)
```bash
npm run test:run
npm run lint
npm run build
npm run build:pages
```

Commit all source + `docs/` artifact changes in the same commit.

---

## Daily Usage Flow

1. Open `Settings` and set your `minHz / maxHz / doHz`.
2. Choose mode: `Absolute Match` or `Relative Contour`.
3. Choose difficulty `L1-L6`.
4. Click `Start Question` and listen to the prompt.
5. Sing after `3,2,1,Start`.
6. Recording stops automatically (or at 10 seconds max), then scoring appears.
7. Click `Record Attempt` to retry and compare `Current / First / Best`.

---

## Settings, in Plain Language

- `minHz / maxHz`: your safe vocal range; prompts will stay inside it.
- `doHz`: your Do reference frequency.
- `Key`: transposition (`1=C` to `1=B`).
- `Match Mode`:
  - `Absolute Match`: your absolute pitch should match the target.
  - `Relative Contour`: your melodic contour and intervals matter most.
- `Difficulty`: controls number of notes, pitch leaps, and rhythm complexity.
- `Tuning`: `12-TET` or `Just`.

---

## What Each Level Trains

These are user-facing training goals, not algorithm parameters.

### Absolute Match
- `L1`: single sustained note; build basic pitch placement.
- `L2`: 2-3 notes; start clean note transitions.
- `L3`: 3-4 notes; clearer up/down melodic movement.
- `L4`: 4-5 notes; longer phrase control.
- `L5`: 5-6 notes; wider pitch span and more active rhythm.
- `L6`: 6-8 notes; dense short phrases and full control.

### Relative Contour
- `L1`: 2-note contour check (up/down/flat).
- `L2`: 3-4 notes; short melodic contour accuracy.
- `L3`: 4-5 notes; stronger interval changes.
- `L4`: 5-6 notes; longer contour + richer rhythm.
- `L5`: 6-7 notes; maintain contour over larger spans.
- `L6`: 7-9 notes; high-complexity contour reproduction.

---

## How to Read Scores (Simple Version)

Total score is `0-100`.  
Best strategy: aim for steady improvement, not instant perfection.

- `Acc` (Accuracy)
  - How close your sung pitch is to the target.
  - Higher means smaller pitch error.
  - High-score range is intentionally stricter.

- `Stb` (Stability)
  - How steady your pitch is over time.
  - Higher means less wobble and drift.

- `Lock`
  - How much of your singing time stays in acceptable pitch zones.
  - Time closer to target gets higher weight.
  - Beginner-friendly: sustained in-range singing is rewarded, not only instant hit.

- `Rhy` (Rhythm)
  - How well your note timing and durations match the prompt.
  - Better timing alignment gives higher score.

### Relative mode scoring focus

`Relative Contour` does not require matching the exact absolute pitch of the prompt.  
It mainly checks:
- melodic direction (up/down/flat)
- relative interval relationships between notes
- rhythm alignment

So it is especially useful for “hear melody -> find your own key -> reproduce contour”.

---

## Practical Improvement Tips

- Low `Acc`: reduce difficulty and focus on landing each note before moving.
- Low `Stb`: shorten phrases, reduce volume swings, aim for smoother tone.
- Low `Lock`: hold notes longer in-range instead of rushing transitions.
- Low `Rhy`: count lightly first, then sing; fix timing before chasing perfect pitch.

---

## Privacy and Data

- Audio is processed in browser memory only.
- No audio files are written to disk.
- No cloud upload and no account required.
- Moving to a new question resets question-local attempt data.

---

## FAQ

- No mic input: check browser mic permission, refresh, retry.
- No playback sound: click any control once to unlock browser audio context.
- No chart yet: first complete one valid scored attempt in the current question.

---

## Technical Docs (for developers)

Implementation details and scoring internals are in `dev-docs/`:
- `dev-docs/FEATURES.md`
- `dev-docs/SCORING.md`
- `dev-docs/ARCHITECTURE.md`
- `dev-docs/DEBUGGING.md`
- `dev-docs/DEPLOY_GITHUB_PAGES.md`

---

## License

MIT
