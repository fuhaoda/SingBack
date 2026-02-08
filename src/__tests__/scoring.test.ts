import { describe, expect, it } from 'vitest'
import { evaluateAttempt, isAttemptBetter, type RawSamplePoint } from '../scoring/score'

function makeTarget(hz: number, duration = 2): Array<{ t: number; hz: number }> {
  const points: Array<{ t: number; hz: number }> = []
  for (let t = 0; t <= duration; t += 0.05) {
    points.push({ t: Number(t.toFixed(2)), hz })
  }
  return points
}

function makeCurve(offsetCents = 0, duration = 2): RawSamplePoint[] {
  const baseHz = 220 * 2 ** (offsetCents / 1200)
  const curve: RawSamplePoint[] = []
  for (let t = 0; t <= duration; t += 0.05) {
    curve.push({ t: Number(t.toFixed(2)), hz: baseHz })
  }
  return curve
}

describe('scoring', () => {
  it('gives better score when pitch error is smaller', () => {
    const perfect = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurve(0),
      target: makeTarget(220),
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const flat = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeCurve(-60),
      target: makeTarget(220),
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(perfect.valid).toBe(true)
    expect(flat.valid).toBe(true)
    expect(perfect.score ?? 0).toBeGreaterThan(flat.score ?? 0)
  })

  it('marks short attempt as invalid', () => {
    const shortCurve: RawSamplePoint[] = [
      { t: 0, hz: 220 },
      { t: 0.05, hz: 220 },
      { t: 0.1, hz: 220 },
      { t: 0.15, hz: null }
    ]

    const result = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: shortCurve,
      target: makeTarget(220),
      doHz: 130.8,
      clip: new Float32Array(1000),
      sampleRate: 44_100
    })

    expect(result.valid).toBe(false)
    expect(result.failReason).toBe('too_short')
  })

  it('keeps accuracy non-zero for novice-level large errors', () => {
    const off = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurve(-180),
      target: makeTarget(220),
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(off.valid).toBe(true)
    expect(off.subscores?.accuracy ?? 0).toBeGreaterThanOrEqual(8)
  })

  it('picks higher score as better attempt', () => {
    const better = {
      attemptIndex: 2,
      valid: true,
      score: 90,
      subscores: { accuracy: 92, stability: 88, lock: 80 },
      curve: [],
      clip: new Float32Array(),
      sampleRate: 44_100
    }
    const baseline = {
      attemptIndex: 1,
      valid: true,
      score: 82,
      subscores: { accuracy: 82, stability: 80, lock: 85 },
      curve: [],
      clip: new Float32Array(),
      sampleRate: 44_100
    }

    expect(isAttemptBetter(better, baseline)).toBe(true)
    expect(isAttemptBetter(baseline, better)).toBe(false)
  })

  it('relative mode scores transposed singing higher than absolute mode', () => {
    const transposed = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurve(300),
      target: makeTarget(220),
      doHz: 130.8,
      mode: 'absolute',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const transposedRelative = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeCurve(300),
      target: makeTarget(220),
      doHz: 130.8,
      mode: 'relative',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect((transposedRelative.score ?? 0)).toBeGreaterThan(transposed.score ?? 0)
  })
})
