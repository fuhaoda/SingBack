# SingBack Scoring (v0.2)

## Total Score

Total score is clamped to `0..100`:

`score = round(0.70*accuracy + 0.10*stability + 0.10*lock + 0.10*rhythm)`

## Inputs

For each voiced sample point:

- sung Hz from pitch tracker
- target Hz interpolated on exercise timeline
- cent error

`errCent = 1200 * log2(sungHz / targetHz)`

Before scoring, short pitch-tracker dropouts are gap-bridged (~220ms) to reduce artificial curve breaks.

## Valid Attempt Gate

Attempt is invalid if either condition fails:

1. voiced duration `< 0.8s`
2. voiced coverage `< 30%`

Invalid attempts:

- `valid = false`
- `failReason = "too_short" | "no_voiced"`
- do not update `first` / `best`

## Accuracy (70%)

Uses robust absolute cent statistics:

- median absolute error (p50)
- p90 absolute error

Combined error:

`combined = 0.7*p50 + 0.3*p90`

Mapped score:

`accuracy = clamp(1 + 99 * exp(-(combined/350)^0.9))`

This keeps novice feedback informative (no forced zero), while making `90+` progressively harder so top scores require very tight cent control.

## Stability (10%)

Penalizes local wobble:

- standard deviation of cent error
- mean absolute first derivative of cent error

Mapped score:

`stability = clamp(100 - 1.1*std - 0.7*meanDiff)`

## Lock (10%)

### Absolute mode

For each voiced time slice, assign weight by absolute cent error:

- `|err| <= 35c` => `1.00x` time
- `35c < |err| <= 50c` => `0.80x` time
- `50c < |err| <= 100c` => `0.50x` time
- `100c < |err| <= 200c` => `0.25x` time
- `|err| > 200c` => `0.00x` time

Then:

`coverage = weightedVoicedTime / voicedTime`

`lock = clamp(100 * coverage^1.2)`

Hard gate:

- if median absolute pitch error is `>= 2400c` (about 2 octaves), `lock = 0`.

### Relative mode

Relative lock uses a slightly wider tolerance band because contour tasks emphasize interval shape over exact absolute cent position.

- `|err| <= 45c` => `1.00x`
- `45c < |err| <= 70c` => `0.80x`
- `70c < |err| <= 120c` => `0.50x`
- `120c < |err| <= 220c` => `0.25x`
- `|err| > 220c` => `0.00x`

`lockRelative = clamp(100 * coverage^1.1)`

## Rhythm (10%)

Rhythm score is based on note timing alignment and duration proportion.

### Global tempo tolerance

- First estimate global singing speed vs target duration.
- Fit/allow moderate drift in `0.90x ~ 1.10x` range.
- Inside this range, rhythm is not heavily penalized.

### Components

1. Boundary alignment error
   - Compare expected note-boundary times against detected sung boundary candidates.
   - Candidate matching window is tightened (`~320ms` max).
   - Missed boundary penalties are stronger than before.
2. Duration-ratio error
   - Compare normalized per-note duration proportions.
   - Penalty slope is tightened.
3. Tempo overflow penalty
   - Penalize only drift beyond tolerance window.

Single-note prompts use duration error directly (with same tempo tolerance idea).

## Match Modes

- `absolute`: direct cent error against target pitch.
- `relative`: scoring logic is contour-first and differs from absolute:
  - first estimate and remove constant pitch offset (median cent difference)
  - build per-note median sung pitch in time-aligned note windows
  - score interval accuracy (`target interval` vs `sung interval`) as primary signal
  - include interval direction hit-rate (up/down/static) and a smaller local-cent term
  - use wider lock bands than absolute mode

## Best Attempt Selection

Within one question, `best` is selected by:

1. higher total score
2. if tie: higher `accuracy`
3. if tie: earlier attempt index

This keeps tie-break behavior deterministic.
