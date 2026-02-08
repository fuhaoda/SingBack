# SingBack 🎤

SingBack is a focused pitch-matching practice app for singers.

Core loop:

1. Play a generated target tone/melody
2. Sing it back
3. Get a 0-100 score with sub-scores
4. Compare curves in three synchronized windows
5. Retry immediately and improve

All processing runs locally in the browser.

## Highlights

- Pure frontend MVP: no backend, no account, no cloud dependency
- Three-window comparison
  - `Current` (big)
  - `First` (first valid attempt in this question)
  - `Best` (highest score in this question)
- Unified axes across all windows
  - X axis: 0-10 seconds
  - Y axis: semitone/cent logarithmic pitch axis
- Configurable range + Do + tuning + difficulty
- Match mode options:
  - `Absolute Match`: match target absolute pitch
  - `Relative Contour`: allow transposed singing, score relative intervals/shape
  - In `Relative Contour`, `L1` uses a two-note prompt (not single-note)
- In-memory recording only
  - No audio file writing
  - No localStorage audio persistence
  - Question switch clears prior clips

## Product Rules Implemented

- Default male: `min=105`, `max=530`, `do=130.8`
- Default female: `min=175`, `max=880`, `do=261.6`
- Gender selector shown in **Settings panel only**
- Manual Hz inputs are preserved when gender changes (dirty flags)
- Any setting change resets current question state to avoid stale curves/scores
- Exercise generation is strictly bounded by user range
- New question flow: auto play target -> `3,2,1,Start` -> auto recording
- Before first scored attempt, all windows stay chart-hidden (audio-only)
- Retry: no countdown, unlimited attempts
- Max recording per attempt: `10s`
- Auto stop: detect singing end by post-voice silence, then score automatically
- Invalid short/no-voice attempts are rejected and do not replace first/best

## Tech Stack

- Vite + React + TypeScript
- Web Audio API (mic capture, synth playback, in-memory replay)
- Canvas 2D for charts
- Vitest + Testing Library

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Run in dev mode

```bash
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`).

### Quality checks

```bash
npm run lint
npm run test:run
npm run build
```

## How to Use

1. Open **Settings** and set `minHz`, `maxHz`, `doHz`, tuning, difficulty, and match mode.
2. Click **Start Question**.
3. App automatically plays target, then shows `3,2,1,Start`, then starts recording.
4. Click **Play Target** any time to hear reference again.
5. Sing and stop naturally; app detects end-of-singing and scores automatically.
6. Click **Record Attempt** for retries.
7. Compare `Current` vs `First` vs `Best` and replay each human recording.
8. Click **Next Question** to clear question-local memory and generate a new one.

## Scoring

Total score:

- `Score = 0.75 * Accuracy + 0.15 * Stability + 0.10 * Lock`

Sub-scores:

- Accuracy: newbie-friendly smooth mapping from robust cent error (does not collapse to 0 too early)
- Stability: local jitter (variance + derivative penalty)
- Lock: time-to-enter and hold within ±25 cents for at least 300 ms

Mode behavior:

- `Absolute Match`: direct cent error to target pitch
- `Relative Contour`: removes constant pitch offset before scoring, so contour/interval accuracy is rewarded

More detail: `docs/SCORING.md`

## Documentation

- `docs/FEATURES.md`: feature list, limits, future roadmap
- `docs/ARCHITECTURE.md`: module design and data flow
- `docs/SCORING.md`: scoring math and thresholds
- `docs/DEBUGGING.md`: troubleshooting and verification checklist

## Browser Notes

- Mic access requires secure/user-approved context depending on browser policy.
- First user gesture is needed in some browsers to unlock audio.
- If permission is denied, refresh and allow microphone access.

## License

MIT
