# SingBack Features

## v0.2 Implemented Features

1. Question-local sing-back training loop
2. User-defined vocal range (`minHz`, `maxHz`) and `doHz`
3. Gender presets (male/female) in settings panel
4. Key selector with 12 fixed options
   - `1=C, 1=C#/Db, 1=D, 1=D#/Eb, 1=E, 1=F, 1=F#/Gb, 1=G, 1=G#/Ab, 1=A, 1=A#/Bb, 1=B`
5. Tuning switch
   - `equal_temperament`
   - `just_intonation`
6. Match mode switch
   - `absolute`
   - `relative`
7. Difficulty ladder `L1` to `L6` with increasing interval + rhythm complexity
8. Comfort-first exercise generation
   - transposed low-4 to high-2 musical window
   - intersection with 5% safe-margin vocal range
   - fallback to playable range when intersection is too narrow
9. Note-distribution policy
   - about 90% notes sampled from middle-octave natural `1..7`
   - remaining notes sampled from extension zone
10. Timeline limits
   - chart X-axis fixed to `0-8s`
   - `absolute L1` single-note duration is `1-3s`
   - every generated question is capped to `<=6s`
11. New question flow: auto target playback + `3,2,1,Start` countdown
12. Unlimited retries without countdown
13. In-memory recording only (max 10 seconds per attempt)
14. Attempt validation (`too_short`, `no_voiced`)
15. Short-gap bridge on pitch curve (fewer visual breakpoints)
16. Three synchronized visualization windows
17. Auto end-of-singing detection using post-voice silence
18. First-score unlock mode (charts hidden before first scored attempt)
19. Replay for `current`, `first`, and `best` human recordings
20. 0-100 scoring with 4 sub-scores (`accuracy`, `stability`, `lock`, `rhythm`)
21. Y-axis jianpu labels with accidentals and octave dots
22. Replay silence-trim with `~0.15s` pre-roll before detected voice onset
23. Live curve rendered with `0.2s` delay to align with final post-processed curve

## UX Principles

- Clear corrective feedback over gamification
- Same axis scale across windows for direct visual comparison
- Sub-scores exposed to users (no hidden score logic)
- High training density with minimal controls

## Data Retention Policy

- Audio clips are stored only in memory (`Float32Array`)
- No clip is written to disk
- No clip is persisted in localStorage/IndexedDB
- Switching question clears previous question attempts

## Known Limits (v0.2)

1. No automatic vocal-range calibration flow yet
2. No cross-question history tracking
3. No song import or copyrighted audio handling
4. No backend account/sync features

## Planned Next Steps

1. Guided range calibration
2. Session-level progress analytics without raw audio persistence
3. Optional blind-mode variants
4. More pop-song-like phrase templates
