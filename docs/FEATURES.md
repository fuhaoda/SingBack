# SingBack Features

## v0.1 Implemented Features

1. Question-local pitch matching workflow
2. User-defined vocal range (`minHz`, `maxHz`) and `doHz`
3. Gender presets (male/female) in settings panel
4. Tuning switch
   - `equal_temperament`
   - `just_intonation`
5. Match mode switch
   - `absolute`
   - `relative`
   - `relative + L1` uses a two-note contour prompt
6. Difficulty ladder `L1` to `L6`
7. Automatic target generation bounded by user range
8. New question flow: auto target playback + `3,2,1,Start` countdown
9. Unlimited retries without countdown
10. In-memory recording (max 10 seconds per attempt)
11. Attempt validation (`too_short`, `no_voiced`)
12. Short gap bridge on pitch curve (fewer visual breakpoints)
13. Three synchronized visualization windows
14. Auto end-of-singing detection using post-voice silence
15. First-score unlock mode (all charts hidden until first scored attempt)
16. Replay for `current`, `first`, and `best` human recordings
17. 0-100 scoring with sub-scores shown in all three windows

## UX Principles Implemented

- Immediate feedback loop over gamification
- Same axis scale across windows for direct comparison
- No hidden scoring magic (sub-scores shown)
- Minimal controls with high training density

## Data Retention Policy (v0.1)

- Audio clips are stored only in memory (`Float32Array`)
- No clip is written to disk
- No clip is persisted in localStorage/IndexedDB
- Switching to next question clears old question attempts

## Known Limits (v0.1)

1. No auto vocal range test yet (manual input only)
2. No cross-question progress history
3. No song import / no copyrighted audio handling
4. No backend sync/account/multi-device state

## Planned Next Steps

1. Guided vocal range calibration flow
2. Session-level analytics (without storing raw audio)
3. Optional blind mode / delayed visual reveal mode
4. Advanced melody templates closer to pop phrases
