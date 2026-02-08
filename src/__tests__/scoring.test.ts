import { describe, expect, it } from 'vitest'
import type { NoteEvent } from '../types'
import { evaluateAttempt, isAttemptBetter, type RawSamplePoint } from '../scoring/score'

function semiToHz(semi: number, doHz: number): number {
  return doHz * 2 ** (semi / 12)
}

function makeNotes(semis: number[], durations: number[], doHz = 220): NoteEvent[] {
  const notes: NoteEvent[] = []
  let t = 0
  for (let i = 0; i < semis.length; i += 1) {
    const start = Number(t.toFixed(4))
    t += durations[i]
    const end = Number(t.toFixed(4))
    notes.push({
      idx: i,
      start,
      end,
      semi: semis[i],
      hz: semiToHz(semis[i], doHz),
      jianpu: String(i + 1),
      inCoreZone: true
    })
  }
  return notes
}

function makeTarget(notes: NoteEvent[], step = 0.05): Array<{ t: number; hz: number }> {
  const target: Array<{ t: number; hz: number }> = []
  for (const note of notes) {
    for (let t = note.start; t < note.end; t += step) {
      target.push({ t: Number(t.toFixed(2)), hz: note.hz })
    }
  }
  const last = notes[notes.length - 1]
  target.push({ t: Number(last.end.toFixed(2)), hz: last.hz })
  return target
}

function makeCurveFromSegments(
  semis: number[],
  durations: number[],
  doHz = 220,
  offsetCents = 0,
  step = 0.05
): RawSamplePoint[] {
  const curve: RawSamplePoint[] = []
  let t = 0

  for (let i = 0; i < semis.length; i += 1) {
    const hz = semiToHz(semis[i], doHz) * 2 ** (offsetCents / 1200)
    const end = t + durations[i]
    for (let x = t; x < end; x += step) {
      curve.push({ t: Number(x.toFixed(2)), hz })
    }
    t = end
  }

  curve.push({ t: Number(t.toFixed(2)), hz: semiToHz(semis[semis.length - 1], doHz) * 2 ** (offsetCents / 1200) })
  return curve
}

function makeSingleNotePiecewiseCurve(
  durationSec: number,
  doHz: number,
  parts: Array<{ ratio: number; offsetCents: number }>,
  step = 0.05
): RawSamplePoint[] {
  const curve: RawSamplePoint[] = []
  let t = 0

  for (const part of parts) {
    const segDuration = durationSec * part.ratio
    const end = t + segDuration
    const hz = doHz * 2 ** (part.offsetCents / 1200)
    for (let x = t; x < end; x += step) {
      curve.push({ t: Number(x.toFixed(2)), hz })
    }
    t = end
  }

  const lastOffset = parts[parts.length - 1]?.offsetCents ?? 0
  curve.push({ t: Number(durationSec.toFixed(2)), hz: doHz * 2 ** (lastOffset / 1200) })
  return curve
}

describe('scoring', () => {
  it('gives better score when pitch error is smaller', () => {
    const notes = makeNotes([0], [2], 220)
    const target = makeTarget(notes)

    const perfect = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurveFromSegments([0], [2], 220, 0),
      target,
      notes,
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const flat = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeCurveFromSegments([0], [2], 220, -60),
      target,
      notes,
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(perfect.valid).toBe(true)
    expect(flat.valid).toBe(true)
    expect(perfect.score ?? 0).toBeGreaterThan(flat.score ?? 0)
  })

  it('marks short attempt as invalid', () => {
    const notes = makeNotes([0], [2], 220)
    const shortCurve: RawSamplePoint[] = [
      { t: 0, hz: 220 },
      { t: 0.05, hz: 220 },
      { t: 0.1, hz: 220 },
      { t: 0.15, hz: null }
    ]

    const result = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: shortCurve,
      target: makeTarget(notes),
      notes,
      doHz: 130.8,
      clip: new Float32Array(1000),
      sampleRate: 44_100
    })

    expect(result.valid).toBe(false)
    expect(result.failReason).toBe('too_short')
  })

  it('keeps accuracy non-zero for novice-level large errors', () => {
    const notes = makeNotes([0], [2], 220)
    const off = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurveFromSegments([0], [2], 220, -180),
      target: makeTarget(notes),
      notes,
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(off.valid).toBe(true)
    expect(off.subscores?.accuracy ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('keeps octave-scale misses low but non-zero (1 octave ~5, 2 octaves ~1)', () => {
    const notes = makeNotes([0], [2], 220)
    const target = makeTarget(notes)

    const oneOctaveOff = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurveFromSegments([0], [2], 220, 1200),
      target,
      notes,
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const twoOctaveOff = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeCurveFromSegments([0], [2], 220, 2400),
      target,
      notes,
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(oneOctaveOff.valid).toBe(true)
    expect(twoOctaveOff.valid).toBe(true)
    expect(oneOctaveOff.subscores?.accuracy ?? 0).toBeGreaterThanOrEqual(4)
    expect(oneOctaveOff.subscores?.accuracy ?? 0).toBeLessThanOrEqual(8)
    expect(twoOctaveOff.subscores?.accuracy ?? 0).toBeGreaterThanOrEqual(1)
    expect(twoOctaveOff.subscores?.accuracy ?? 0).toBeLessThanOrEqual(3)
  })

  it('scores lock by weighted in-range duration', () => {
    const notes = makeNotes([0], [2], 220)
    const target = makeTarget(notes)

    const mostlyInRange = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeSingleNotePiecewiseCurve(2, 220, [
        { ratio: 0.75, offsetCents: 20 },
        { ratio: 0.25, offsetCents: 150 }
      ]),
      target,
      notes,
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const barelyInRange = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeSingleNotePiecewiseCurve(2, 220, [
        { ratio: 0.05, offsetCents: 20 },
        { ratio: 0.95, offsetCents: 150 }
      ]),
      target,
      notes,
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(mostlyInRange.subscores?.lock ?? 0).toBeGreaterThan((barelyInRange.subscores?.lock ?? 0) + 25)
  })

  it('sets lock to zero when median pitch error is two octaves off', () => {
    const notes = makeNotes([0], [2], 220)
    const target = makeTarget(notes)
    const twoOctaveOff = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurveFromSegments([0], [2], 220, 2400),
      target,
      notes,
      doHz: 130.8,
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(twoOctaveOff.subscores?.lock ?? 0).toBe(0)
  })

  it('picks higher score as better attempt', () => {
    const better = {
      attemptIndex: 2,
      valid: true,
      score: 90,
      subscores: { accuracy: 92, stability: 88, lock: 80, rhythm: 85 },
      curve: [],
      clip: new Float32Array(),
      sampleRate: 44_100
    }
    const baseline = {
      attemptIndex: 1,
      valid: true,
      score: 82,
      subscores: { accuracy: 82, stability: 80, lock: 85, rhythm: 70 },
      curve: [],
      clip: new Float32Array(),
      sampleRate: 44_100
    }

    expect(isAttemptBetter(better, baseline)).toBe(true)
    expect(isAttemptBetter(baseline, better)).toBe(false)
  })

  it('relative mode scores transposed singing higher than absolute mode', () => {
    const notes = makeNotes([0], [2], 220)
    const target = makeTarget(notes)
    const transposedCurve = makeCurveFromSegments([0], [2], 220, 300)

    const transposed = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: transposedCurve,
      target,
      notes,
      doHz: 130.8,
      mode: 'absolute',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const transposedRelative = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: transposedCurve,
      target,
      notes,
      doHz: 130.8,
      mode: 'relative',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(transposedRelative.score ?? 0).toBeGreaterThan(transposed.score ?? 0)
  })

  it('relative mode rewards correct contour intervals across key offset', () => {
    const notes = makeNotes([0, 2, 4, 5], [0.8, 0.8, 0.8, 0.8], 220)
    const target = makeTarget(notes)

    const correctContourTransposed = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurveFromSegments([5, 7, 9, 10], [0.8, 0.8, 0.8, 0.8], 220),
      target,
      notes,
      doHz: 130.8,
      mode: 'relative',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const wrongContour = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeCurveFromSegments([5, 4, 3, 2], [0.8, 0.8, 0.8, 0.8], 220),
      target,
      notes,
      doHz: 130.8,
      mode: 'relative',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect((correctContourTransposed.subscores?.accuracy ?? 0)).toBeGreaterThan((wrongContour.subscores?.accuracy ?? 0) + 25)
    expect((correctContourTransposed.score ?? 0)).toBeGreaterThan((wrongContour.score ?? 0))
  })

  it('relative lock stays usable with mild contour mismatch but drops on strong mismatch', () => {
    const notes = makeNotes([0, 2, 4], [1, 1, 1], 220)
    const target = makeTarget(notes)

    const mild = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurveFromSegments([5, 6.8, 9.2], [1, 1, 1], 220),
      target,
      notes,
      doHz: 130.8,
      mode: 'relative',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const heavy = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeCurveFromSegments([5, 3, 0], [1, 1, 1], 220),
      target,
      notes,
      doHz: 130.8,
      mode: 'relative',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect((mild.subscores?.lock ?? 0)).toBeGreaterThan(45)
    expect((mild.subscores?.lock ?? 0)).toBeGreaterThan((heavy.subscores?.lock ?? 0))
  })

  it('keeps rhythm score usable for moderate global tempo drift', () => {
    const notes = makeNotes([0, 2, 4], [1, 1, 1], 220)
    const target = makeTarget(notes)

    const slowCurve = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurveFromSegments([0, 2, 4], [0.9, 0.9, 0.9], 220),
      target,
      notes,
      doHz: 130.8,
      mode: 'absolute',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const fastCurve = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeCurveFromSegments([0, 2, 4], [1.1, 1.1, 1.1], 220),
      target,
      notes,
      doHz: 130.8,
      mode: 'absolute',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect(slowCurve.subscores?.rhythm ?? 0).toBeGreaterThanOrEqual(50)
    expect(fastCurve.subscores?.rhythm ?? 0).toBeGreaterThanOrEqual(50)
  })

  it('reduces rhythm score when segment boundaries are heavily misaligned', () => {
    const notes = makeNotes([0, 2, 4], [1, 1, 1], 220)
    const target = makeTarget(notes)

    const aligned = evaluateAttempt({
      attemptIndex: 1,
      rawCurve: makeCurveFromSegments([0, 2, 4], [1, 1, 1], 220),
      target,
      notes,
      doHz: 130.8,
      mode: 'absolute',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    const misaligned = evaluateAttempt({
      attemptIndex: 2,
      rawCurve: makeCurveFromSegments([0, 2, 4], [1.8, 0.2, 1], 220),
      target,
      notes,
      doHz: 130.8,
      mode: 'absolute',
      clip: new Float32Array(44_100),
      sampleRate: 44_100
    })

    expect((aligned.subscores?.rhythm ?? 0)).toBeGreaterThan(misaligned.subscores?.rhythm ?? 0)
  })
})
