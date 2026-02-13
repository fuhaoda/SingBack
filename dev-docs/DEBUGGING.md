# SingBack Debugging Guide

## Quick Validation Commands

```bash
npm run lint
npm run test:run
npm run build
```

## Manual Smoke Checklist

1. Open app and set range/do/key
2. Change one setting (for example L2 -> L5) and confirm question state resets (no stale curves)
3. Click `Start Question`
4. Confirm all windows are chart-hidden before first scored attempt
5. Confirm app auto-plays target, then shows `3,2,1,Start`
6. Sing during recording; confirm auto stop after you finish (or max 10s fallback)
7. Confirm score and sub-scores appear (including rhythm)
8. Confirm `First` saved only after first valid attempt
9. Retry and confirm `Current` updates each time
10. Confirm `Best` updates only when score improves
11. Click replay for current/first/best and verify audio playback
12. Replay should start near voice onset (with ~0.15s pre-roll), not from long initial silence
13. Click `Next Question` and verify previous attempts are cleared

Note:
- live chart is intentionally delayed by about `0.2s` to match final scored curve shape.

## Common Issues

## Mic permission denied

Symptoms:

- status shows permission failure
- no recording begins

Fix:

1. allow mic permission in browser site settings
2. refresh page
3. retry `Start Question`

## No sound during target/replay

Symptoms:

- button click but no audio

Fix:

1. click anywhere in page to ensure user gesture
2. verify tab is not muted
3. check output device settings

## Repeated invalid `too_short`

Symptoms:

- attempts fail as too short

Fix:

1. sing continuously for at least ~1 second
2. increase mic input gain / move closer
3. reduce background noise

## Range validation errors

Symptoms:

- cannot start question

Fix:

1. ensure `minHz < maxHz`
2. ensure `Do` is between min and max
3. keep range within `[50, 1200]`

## Unexpected pitch zone (too high or too low)

Symptoms:

- generated prompts feel outside intended comfort range

Fix:

1. verify Key (`1=C` ... `1=B`) is what you expect
2. verify `doHz` and vocal range values are correct
3. remember generator uses transposed low4-high2 window intersected with vocal safety band

## Browser Compatibility Notes

- ScriptProcessorNode is used for MVP simplicity.
- On modern browsers it still works, but AudioWorklet migration is recommended in a future version.

## Internal Debug Tips

- inspect `machine.phase` chip in UI
- compare current/first/best score chips
- run unit tests for deterministic regression checks
