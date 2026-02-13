# SingBack Architecture

## Overview

SingBack is a browser-only app with local DSP, local scoring, and local rendering.

Runtime layers:

1. UI Layer (`src/App.tsx`, `src/chart/`)
2. Domain Layer (`src/exercise/`, `src/scoring/`, `src/app/stateMachine.ts`)
3. Audio Layer (`src/audio/`)
4. Config + Types (`src/config/`, `src/types/`)

## Core Contracts (`src/types/index.ts`)

- `UserSettings`
  - includes `keySemitone` for 12-key transposition
- `ExerciseSpec`
  - includes `effectiveDoHz`
  - includes structured `notes: NoteEvent[]`
- `AttemptResult`
  - includes `subscores.rhythm`
  - includes optional `voiceStartSec` for replay trimming

## Config (`src/config/defaults.ts`)

Central constants:

- male/female defaults
- key list (`1=C` ... `1=B`)
- countdown / recording limits
- score weights and thresholds

## Exercise Generator (`src/exercise/generator.ts`)

Responsibilities:

1. Compute transposed root (`effectiveDoHz`) from `doHz + keySemitone`
2. Build playable band from
   - transposed low4-high2 musical window
   - plus 5% safe-margin vocal range
3. Sample note sequences with
   - 90% core-zone preference (middle-octave natural 1..7)
   - extension-zone fallback
4. Generate variable rhythm durations per level
5. Emit
   - note events (`start/end/hz/semi/jianpu/inCoreZone`)
   - dense target timeline for playback and scoring

## Audio Layer

### `src/audio/pitchTracker.ts`

- autocorrelation pitch detection
- RMS silence gate
- confidence threshold
- median + EMA smoothing

### `src/audio/micCapture.ts`

- mic stream lifecycle
- ScriptProcessor frame callback
- emits `(t, block, rms, hz)` style frames

### `src/audio/memoryRecorder.ts`

- keeps clip as in-memory `Float32Array`
- max-duration clipping
- no disk persistence

### `src/audio/tonePlayer.ts`

- target phrase playback
- in-memory clip replay

## Scoring (`src/scoring/score.ts`)

Pipeline:

1. Bridge short pitch gaps
2. Detect singing start and rebase time
3. Build curve (`hz`, `y`, `centErr`)
4. Validate coverage/duration
5. Compute sub-scores
   - Accuracy
   - Stability
   - Lock
   - Rhythm
6. Aggregate total score
7. Return attempt payload used by state machine and charts

Mode behavior:

- `absolute`: direct cent scoring
- `relative`: remove constant pitch offset before pitch scoring

## Chart Rendering (`src/chart/PitchCanvas.tsx`)

- shared axis mapping across all windows
- blue target vs orange sung curve
- disconnected rendering across unvoiced gaps
- Y-axis labels shown in jianpu with accidentals and octave dots

## State Machine (`src/app/stateMachine.ts`)

Phases:

- `idle`
- `first_countdown`
- `recording`
- `evaluating`
- `practice_loop`

Role:

- tracks attempts for current question only
- maintains `current`, `first`, `best`
- resets cleanly on settings change or next question

## Data Flow

1. User updates settings (range/do/key/tuning/mode/difficulty)
2. Settings change resets question-local state
3. `generateExercise()` returns bounded phrase (`notes + target`)
4. Start question -> target playback -> countdown -> recording
5. Mic frames feed in-memory recorder + delayed live display curve (same post-process path as final scoring)
6. Auto/Manual stop -> `evaluateAttempt()`
7. State machine updates attempts and best selection
8. Three windows render synchronized comparison

## Failure Paths

- microphone permission denied
- no voiced signal
- too-short voiced attempt

Invalid attempts do not replace `first` or `best`.
