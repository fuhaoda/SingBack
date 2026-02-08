# SingBack Architecture

## Overview

SingBack is a pure frontend application with browser-local DSP and rendering.

### Runtime layers

1. **UI Layer** (`src/App.tsx`, `src/chart/`)
2. **Domain Layer** (`src/exercise/`, `src/scoring/`, `src/app/stateMachine.ts`)
3. **Audio Layer** (`src/audio/`)
4. **Config + Types** (`src/config/`, `src/types/`)

## Module Breakdown

## `src/types/index.ts`

Defines public app contracts:

- `UserSettings`
- `ExerciseSpec`
- `AttemptResult`
- `QuestionState`
- core enums/unions

## `src/config/defaults.ts`

Centralized constants:

- Male/female defaults
- countdown / max recording durations
- scoring weights and thresholds

## `src/exercise/generator.ts`

Creates bounded target exercises:

- computes center band from `minHz/maxHz`
- builds semitone paths by difficulty
- maps semitone to Hz under selected tuning
- returns dense target timeline for playback/chart/scoring

## `src/audio/pitchTracker.ts`

Autocorrelation-based pitch tracker:

- RMS silence gate
- lag search within Hz bounds
- confidence threshold
- median + EMA smoothing

## `src/audio/micCapture.ts`

Microphone capture manager:

- acquires mic stream
- reads blocks with ScriptProcessorNode
- emits `(t, rms, hz, block)` frames
- does not persist audio files

## `src/audio/memoryRecorder.ts`

In-memory clip buffer:

- appends incoming PCM blocks
- trims to max configured duration
- merges to single `Float32Array`

## `src/scoring/score.ts`

Attempt evaluation:

- detects singing start
- rebases attempt time to singing start
- computes cent error against target
- supports absolute and relative-contour scoring modes
- bridges short pitch gaps to avoid fragile curve breaks
- validates coverage/duration
- returns total + sub-scores
- decides `best` by score, then accuracy, then earlier attempt index

## `src/chart/PitchCanvas.tsx`

Custom canvas renderer:

- draws grid and axis labels
- renders target (blue) and sung curve (orange)
- handles broken voiced segments without forced interpolation

## `src/app/stateMachine.ts`

Explicit state transitions:

- `idle`
- `first_countdown`
- `recording`
- `evaluating`
- `practice_loop`

## Data Flow

1. User sets range/settings
2. Any settings change resets current question state to avoid stale curve carryover.
3. `generateExercise()` creates target
4. User clicks Start/Next -> auto target playback -> `3,2,1,Start` -> recording
5. Mic frames feed pitch tracker + in-memory recorder
6. On detected singing end or timeout -> `evaluateAttempt()`
7. State machine updates `current/first/best`
8. Three chart windows render with shared axis config

## Failure Paths

- mic permission denied
- no voiced frames
- voiced duration too short

Failures do not overwrite `first`/`best`.
