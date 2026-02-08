import { describe, expect, it } from 'vitest'
import { buildInitialSettings } from '../config/defaults'
import { computeBandFromRange, generateExercise } from '../exercise/generator'

describe('exercise generator', () => {
  it('computes effective band with key and safety boundaries', () => {
    const band = computeBandFromRange(105, 530, 130.8, 0)
    expect(band.effectiveDoHz).toBeCloseTo(130.8)
    expect(band.bandLow).toBeGreaterThanOrEqual(105)
    expect(band.bandHigh).toBeLessThanOrEqual(530)
    expect(band.bandLow).toBeLessThan(band.bandHigh)
    expect(band.musicLowHz).toBeLessThan(band.musicHighHz)
  })

  it('never emits target tones outside generated band', () => {
    const settings = buildInitialSettings()
    settings.difficulty = 'L6'
    settings.mode = 'absolute'

    for (let i = 0; i < 20; i += 1) {
      const exercise = generateExercise(settings)
      for (const point of exercise.target) {
        expect(point.hz).toBeGreaterThanOrEqual(exercise.bandLow - 0.001)
        expect(point.hz).toBeLessThanOrEqual(exercise.bandHigh + 0.001)
      }
    }
  })

  it('keeps absolute L1 as single-note with random total duration 1-3s', () => {
    const settings = buildInitialSettings()
    settings.mode = 'absolute'
    settings.difficulty = 'L1'

    for (let i = 0; i < 20; i += 1) {
      const exercise = generateExercise(settings)
      expect(exercise.notes).toHaveLength(1)
      expect(exercise.durationSec).toBeGreaterThanOrEqual(1)
      expect(exercise.durationSec).toBeLessThanOrEqual(3)
    }
  })

  it('uses two-note contour and variable durations for relative L1', () => {
    const settings = buildInitialSettings()
    settings.mode = 'relative'
    settings.difficulty = 'L1'

    let observedDurationVariance = false
    for (let i = 0; i < 30; i += 1) {
      const exercise = generateExercise(settings)
      expect(exercise.notes).toHaveLength(2)
      expect(exercise.durationSec).toBeGreaterThanOrEqual(1.2)
      expect(exercise.durationSec).toBeLessThanOrEqual(4)

      const firstDuration = exercise.notes[0].end - exercise.notes[0].start
      const secondDuration = exercise.notes[1].end - exercise.notes[1].start
      if (Math.abs(firstDuration - secondDuration) > 0.05) {
        observedDurationVariance = true
      }
    }

    expect(observedDurationVariance).toBe(true)
  })

  it('keeps around 90% notes in core zone (1-7 natural) for default male range', () => {
    const settings = buildInitialSettings()
    settings.mode = 'absolute'
    settings.difficulty = 'L6'

    let totalNotes = 0
    let coreNotes = 0
    for (let i = 0; i < 400; i += 1) {
      const exercise = generateExercise(settings)
      for (const note of exercise.notes) {
        totalNotes += 1
        if (note.inCoreZone) {
          coreNotes += 1
        }
      }
    }

    const ratio = coreNotes / Math.max(1, totalNotes)
    expect(ratio).toBeGreaterThan(0.87)
    expect(ratio).toBeLessThan(0.93)
  })

  it('caps all generated exercises to 6 seconds', () => {
    const settings = buildInitialSettings()
    const difficulties = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as const
    const modes = ['absolute', 'relative'] as const

    for (const mode of modes) {
      settings.mode = mode
      for (const difficulty of difficulties) {
        settings.difficulty = difficulty
        for (let i = 0; i < 40; i += 1) {
          const exercise = generateExercise(settings)
          expect(exercise.durationSec).toBeLessThanOrEqual(6)
        }
      }
    }
  })
})
