import { describe, expect, it } from 'vitest'
import { buildInitialSettings } from '../config/defaults'
import { buildSemitonePath, computeBandFromRange, generateExercise } from '../exercise/generator'

describe('exercise generator', () => {
  it('computes bounded center band from user min/max', () => {
    const range = computeBandFromRange(105, 530)
    expect(range.midHz).toBe(317.5)
    expect(range.bandLow).toBeGreaterThanOrEqual(105)
    expect(range.bandHigh).toBeLessThanOrEqual(530)
    expect(range.bandLow).toBeLessThan(range.bandHigh)
  })

  it('never emits target tones outside generated band', () => {
    const settings = buildInitialSettings()
    settings.difficulty = 'L6'

    for (let i = 0; i < 12; i += 1) {
      const exercise = generateExercise(settings)
      for (const point of exercise.target) {
        expect(point.hz).toBeGreaterThanOrEqual(exercise.bandLow - 0.001)
        expect(point.hz).toBeLessThanOrEqual(exercise.bandHigh + 0.001)
      }
    }
  })

  it('builds sequence length by difficulty ladder', () => {
    expect(buildSemitonePath('L1', -3, 3)).toHaveLength(1)
    expect(buildSemitonePath('L2', -3, 3)).toHaveLength(2)
    expect(buildSemitonePath('L3', -6, 6)).toHaveLength(3)
    expect(buildSemitonePath('L4', -6, 6)).toHaveLength(4)
    expect(buildSemitonePath('L5', -6, 6)).toHaveLength(5)
    expect(buildSemitonePath('L6', -6, 6)).toHaveLength(5)
  })

  it('keeps absolute L1 as a single-note target', () => {
    const settings = buildInitialSettings()
    settings.mode = 'absolute'
    settings.difficulty = 'L1'
    const exercise = generateExercise(settings)
    const uniqueHz = new Set(exercise.target.map((point) => point.hz.toFixed(4)))
    expect(uniqueHz.size).toBe(1)
  })

  it('uses two-note contour for relative L1', () => {
    const settings = buildInitialSettings()
    settings.mode = 'relative'
    settings.difficulty = 'L1'
    const exercise = generateExercise(settings)
    const uniqueHz = new Set(exercise.target.map((point) => point.hz.toFixed(4)))
    expect(uniqueHz.size).toBeGreaterThanOrEqual(2)
  })
})
