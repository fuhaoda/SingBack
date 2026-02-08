# SingBack Scoring

## Total Score

Total score is clamped to `0..100`:

`score = round(0.75 * accuracy + 0.15 * stability + 0.10 * lock)`

## Inputs

For each voiced sample point:

- sung Hz from pitch tracker
- target Hz interpolated on exercise timeline
- cent error

`errCent = 1200 * log2(sungHz / targetHz)`

Before scoring, short pitch-tracker dropouts are gap-bridged (about 220ms) to reduce
artificial curve breaks on moving melodies.

## Valid Attempt Gate

An attempt is marked invalid if either condition fails:

1. voiced duration `< 0.8s`
2. voiced coverage `< 30%`

Invalid attempts return:

- `valid = false`
- `failReason = "too_short" | "no_voiced"`
- no score update for first/best

## Accuracy (75%)

Accuracy uses robust absolute cent statistics:

- median absolute error (p50)
- p90 absolute error

Combined error:

`combined = 0.7 * p50 + 0.3 * p90`

Mapped score:

`accuracy = clamp(max(8, 100 * exp(-combined / 180)))`

This is intentionally newbie-friendly: large pitch errors still get non-zero feedback,
so progress is visible instead of collapsing to 0 too often.

## Stability (15%)

Stability penalizes wobble:

- standard deviation of cent error
- mean absolute first derivative of cent error

Mapped score:

`stability = clamp(100 - 1.1 * std - 0.7 * meanDiff)`

## Lock (10%)

Lock rewards fast settling into tune.

Condition:

- enter `|errCent| <= 25`
- hold for at least `300ms`

If lock occurs at `lockTime`:

`lock = clamp(100 * (1 - min(lockTime, 3) / 3))`

If lock never occurs:

`lock = 0`

## Match Modes

- `absolute`: uses direct cent error against target pitch.
- `relative`: estimates a constant offset (median cent difference) and subtracts it before
  computing accuracy/stability/lock. This rewards interval/contour matching even if singer key is shifted.

## Best Attempt Selection

Within one question, `best` is chosen by:

1. higher total score
2. if tie: higher accuracy
3. if tie: earlier attempt index

This policy ensures stable tie-break behavior and deterministic UI.
