import {
  LOCK_THRESHOLD_CENTS,
  MAX_DISPLAY_SECONDS,
  MIN_VOICED_COVERAGE,
  MIN_VOICED_DURATION_SECONDS,
  PITCH_GAP_BRIDGE_SECONDS,
  SCORE_WEIGHTS
} from '../config/defaults'
import { hzToSemi, interpolateTargetHz } from '../chart/axis'
import type { AttemptCurvePoint, AttemptResult, ExerciseSpec, MatchMode, NoteEvent } from '../types'

export interface RawSamplePoint {
  t: number
  hz: number | null
}

export interface EvaluateAttemptInput {
  attemptIndex: number
  rawCurve: RawSamplePoint[]
  target: ExerciseSpec['target']
  notes: NoteEvent[]
  doHz: number
  mode?: MatchMode
  clip: Float32Array
  sampleRate: number
}

export interface BuildDisplayCurveInput {
  rawCurve: RawSamplePoint[]
  target: ExerciseSpec['target']
  doHz: number
  mode?: MatchMode
}

interface BoundaryCandidate {
  t: number
  strength: number
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const low = Math.floor(idx)
  const high = Math.ceil(idx)
  if (low === high) {
    return sorted[low]
  }
  const ratio = idx - low
  return sorted[low] + (sorted[high] - sorted[low]) * ratio
}

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeCurve(rawCurve: RawSamplePoint[], doHz: number, target: ExerciseSpec['target']): AttemptCurvePoint[] {
  return rawCurve
    .map((point) => {
      const y = point.hz === null ? null : hzToSemi(point.hz, doHz)
      const targetHz = interpolateTargetHz(target, point.t)
      const centErr =
        point.hz === null || targetHz === null || targetHz <= 0
          ? null
          : 1200 * Math.log2(point.hz / targetHz)
      return {
        t: point.t,
        hz: point.hz,
        y,
        centErr
      }
    })
    .filter((point) => point.t >= 0 && point.t <= MAX_DISPLAY_SECONDS)
}

function bridgeShortGaps(rawCurve: RawSamplePoint[], maxGapSec: number): RawSamplePoint[] {
  let lastHz: number | null = null
  let lastVoicedAt: number | null = null
  return rawCurve.map((point) => {
    if (point.hz !== null) {
      lastHz = point.hz
      lastVoicedAt = point.t
      return point
    }
    if (lastHz !== null && lastVoicedAt !== null && point.t - lastVoicedAt <= maxGapSec) {
      return {
        ...point,
        hz: lastHz
      }
    }
    return point
  })
}

function findVoiceStart(rawCurve: RawSamplePoint[]): number | null {
  let run = 0
  for (const point of rawCurve) {
    if (point.hz !== null) {
      run += 1
      if (run >= 3) {
        return point.t
      }
    } else {
      run = 0
    }
  }
  return null
}

function voicedStats(curve: AttemptCurvePoint[]): { voicedDuration: number; coverage: number } {
  if (curve.length < 2) {
    return { voicedDuration: 0, coverage: 0 }
  }

  const totalDuration = Math.max(0.001, curve[curve.length - 1].t - curve[0].t)
  let voicedDuration = 0

  for (let i = 1; i < curve.length; i += 1) {
    const prev = curve[i - 1]
    const curr = curve[i]
    const dt = Math.max(0, curr.t - prev.t)
    if (prev.hz !== null && curr.hz !== null) {
      voicedDuration += dt
    }
  }

  return {
    voicedDuration,
    coverage: voicedDuration / totalDuration
  }
}

function scoreAccuracy(absErrors: number[]): number {
  const medianAbs = percentile(absErrors, 50)
  const p90Abs = percentile(absErrors, 90)
  const combined = 0.7 * medianAbs + 0.3 * p90Abs

  // Distributed mapping:
  // - keeps non-zero feedback for large miss
  // - makes 90+ progressively harder (near-perfect cent control required)
  const normalized = Math.max(0, combined) / 350
  const shaped = Math.exp(-(normalized ** 0.9))
  const raw = 1 + 99 * shaped
  return clampScore(raw)
}

function scoreStability(errors: number[]): number {
  if (errors.length < 4) {
    return 0
  }
  const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length
  const variance =
    errors.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, errors.length - 1)
  const std = Math.sqrt(variance)

  const diffs: number[] = []
  for (let i = 1; i < errors.length; i += 1) {
    diffs.push(Math.abs(errors[i] - errors[i - 1]))
  }
  const meanDiff = diffs.reduce((sum, value) => sum + value, 0) / Math.max(1, diffs.length)

  return clampScore(100 - std * 1.1 - meanDiff * 0.7)
}

function scoreLockAbsolute(curve: AttemptCurvePoint[]): number {
  if (curve.length < 2) {
    return 0
  }

  const absErrors = curve
    .map((point) => point.centErr)
    .filter((value): value is number => value !== null)
    .map((value) => Math.abs(value))

  if (absErrors.length === 0) {
    return 0
  }

  // Hard floor: if median error is two octaves off, lock is zero.
  if (percentile(absErrors, 50) >= 2400) {
    return 0
  }

  let voicedDuration = 0
  let weightedDuration = 0

  for (let i = 1; i < curve.length; i += 1) {
    const prev = curve[i - 1]
    const curr = curve[i]
    if (prev.centErr === null || curr.centErr === null) {
      continue
    }
    const dt = Math.max(0, curr.t - prev.t)
    if (dt <= 0) {
      continue
    }
    const avgAbsErr = (Math.abs(prev.centErr) + Math.abs(curr.centErr)) / 2
    voicedDuration += dt
    weightedDuration += dt * lockBandWeightAbsolute(avgAbsErr)
  }

  if (voicedDuration <= 0) {
    return 0
  }

  const coverage = weightedDuration / voicedDuration

  // Slight shaping so high lock score needs sustained high-quality in-range singing.
  return clampScore(100 * coverage ** 1.2)
}

function lockBandWeightAbsolute(absErrCent: number): number {
  if (absErrCent <= LOCK_THRESHOLD_CENTS) {
    return 1
  }
  if (absErrCent <= 50) {
    return 0.8
  }
  if (absErrCent <= 100) {
    return 0.5
  }
  if (absErrCent <= 200) {
    return 0.25
  }
  return 0
}

function scoreLockRelative(curve: AttemptCurvePoint[]): number {
  if (curve.length < 2) {
    return 0
  }

  const absErrors = curve
    .map((point) => point.centErr)
    .filter((value): value is number => value !== null)
    .map((value) => Math.abs(value))

  if (absErrors.length === 0) {
    return 0
  }

  if (percentile(absErrors, 50) >= 2400) {
    return 0
  }

  let voicedDuration = 0
  let weightedDuration = 0
  for (let i = 1; i < curve.length; i += 1) {
    const prev = curve[i - 1]
    const curr = curve[i]
    if (prev.centErr === null || curr.centErr === null) {
      continue
    }
    const dt = Math.max(0, curr.t - prev.t)
    if (dt <= 0) {
      continue
    }
    const avgAbsErr = (Math.abs(prev.centErr) + Math.abs(curr.centErr)) / 2
    voicedDuration += dt
    weightedDuration += dt * lockBandWeightRelative(avgAbsErr)
  }

  if (voicedDuration <= 0) {
    return 0
  }

  const coverage = weightedDuration / voicedDuration
  return clampScore(100 * coverage ** 1.1)
}

function lockBandWeightRelative(absErrCent: number): number {
  if (absErrCent <= 45) {
    return 1
  }
  if (absErrCent <= 70) {
    return 0.8
  }
  if (absErrCent <= 120) {
    return 0.5
  }
  if (absErrCent <= 220) {
    return 0.25
  }
  return 0
}

function collectRelativeNoteMedians(curve: AttemptCurvePoint[], notes: NoteEvent[]): Array<number | null> {
  if (notes.length === 0) {
    return []
  }
  const voiced = curve.filter((point) => point.y !== null)
  if (voiced.length < 2) {
    return notes.map(() => null)
  }

  const sungStart = voiced[0].t
  const sungEnd = voiced[voiced.length - 1].t
  const sungDuration = Math.max(0.001, sungEnd - sungStart)
  const targetStart = notes[0].start
  const targetDuration = Math.max(0.001, notes[notes.length - 1].end - targetStart)
  const fittedScale = clamp(sungDuration / targetDuration, 0.85, 1.15)

  return notes.map((note) => {
    const mappedStart = sungStart + (note.start - targetStart) * fittedScale
    const mappedEnd = sungStart + (note.end - targetStart) * fittedScale
    const selected = voiced
      .filter((point) => point.t >= mappedStart && point.t <= mappedEnd)
      .map((point) => point.y as number)
    if (selected.length > 0) {
      return percentile(selected, 50)
    }

    // Fallback: near-window sample for sparse voiced frames.
    const margin = 0.08
    const fallback = voiced
      .filter((point) => point.t >= mappedStart - margin && point.t <= mappedEnd + margin)
      .map((point) => point.y as number)
    if (fallback.length > 0) {
      return percentile(fallback, 50)
    }
    return null
  })
}

function scoreRelativeAccuracy(curve: AttemptCurvePoint[], notes: NoteEvent[]): number {
  const absErrors = curve
    .map((point) => point.centErr)
    .filter((value): value is number => value !== null)
    .map((value) => Math.abs(value))
  if (absErrors.length === 0) {
    return 0
  }
  if (notes.length < 2) {
    return scoreAccuracy(absErrors)
  }

  const noteMedians = collectRelativeNoteMedians(curve, notes)
  const intervalErrorsCent: number[] = []
  let directionHits = 0
  let directionTotal = 0

  for (let i = 1; i < notes.length; i += 1) {
    const prev = noteMedians[i - 1]
    const curr = noteMedians[i]
    if (prev === null || curr === null) {
      continue
    }

    const targetDeltaSemi = notes[i].semi - notes[i - 1].semi
    const sungDeltaSemi = curr - prev
    intervalErrorsCent.push(Math.abs((sungDeltaSemi - targetDeltaSemi) * 100))

    directionTotal += 1
    if (Math.abs(targetDeltaSemi) < 0.25) {
      if (Math.abs(sungDeltaSemi) < 0.35) {
        directionHits += 1
      }
    } else if (Math.sign(targetDeltaSemi) === Math.sign(sungDeltaSemi) && Math.abs(sungDeltaSemi) >= 0.15) {
      directionHits += 1
    }
  }

  if (intervalErrorsCent.length === 0) {
    return scoreAccuracy(absErrors)
  }

  const intervalCombined = 0.7 * percentile(intervalErrorsCent, 50) + 0.3 * percentile(intervalErrorsCent, 90)
  const intervalScore = clampScore(100 * Math.exp(-((intervalCombined / 140) ** 0.95)))
  const directionRate = directionTotal > 0 ? directionHits / directionTotal : 0
  const directionScore = clampScore(20 + 80 * directionRate)
  const localCombined = 0.7 * percentile(absErrors, 50) + 0.3 * percentile(absErrors, 90)
  const localScore = clampScore(1 + 99 * Math.exp(-((localCombined / 420) ** 0.9)))

  return clampScore(intervalScore * 0.55 + directionScore * 0.35 + localScore * 0.1)
}

function rebaseRawCurve(rawCurve: RawSamplePoint[], offset: number): RawSamplePoint[] {
  return rawCurve
    .map((point) => ({
      t: point.t - offset,
      hz: point.hz
    }))
    .filter((point) => point.t >= 0)
}

function applyRelativeOffset(curve: AttemptCurvePoint[], offsetCent: number): AttemptCurvePoint[] {
  const offsetSemi = offsetCent / 100
  return curve.map((point) => ({
    ...point,
    y: point.y === null ? null : point.y - offsetSemi,
    centErr: point.centErr === null ? null : point.centErr - offsetCent
  }))
}

function detectBoundaryCandidates(curve: AttemptCurvePoint[]): BoundaryCandidate[] {
  const candidates: BoundaryCandidate[] = []
  let lastAddedTime = -Infinity

  for (let i = 1; i < curve.length; i += 1) {
    const prev = curve[i - 1]
    const curr = curve[i]
    if (prev.y === null || curr.y === null) {
      continue
    }

    const dy = Math.abs(curr.y - prev.y)
    if (dy < 0.35) {
      continue
    }

    const t = (prev.t + curr.t) / 2
    if (t - lastAddedTime < 0.12) {
      continue
    }

    candidates.push({ t, strength: dy })
    lastAddedTime = t
  }

  return candidates
}

function scoreRhythm(curve: AttemptCurvePoint[], notes: NoteEvent[]): number {
  if (notes.length === 0) {
    return 0
  }

  const voiced = curve.filter((point) => point.hz !== null)
  if (voiced.length < 2) {
    return 0
  }

  const sungStart = voiced[0].t
  const sungEnd = voiced[voiced.length - 1].t
  const sungDuration = Math.max(0.001, sungEnd - sungStart)
  const targetDuration = Math.max(0.001, notes[notes.length - 1].end - notes[0].start)

  const rawScale = sungDuration / targetDuration
  const fittedScale = clamp(rawScale, 0.9, 1.1)
  const tempoOverflow = Math.max(0, Math.abs(rawScale - 1) - 0.1)
  const tempoScore = 100 * Math.exp(-tempoOverflow / 0.08)

  if (notes.length === 1) {
    return clampScore(tempoScore)
  }

  const targetBoundaries = notes.slice(1).map((note) => note.start - notes[0].start)
  const expectedBoundaries = targetBoundaries.map((time) => sungStart + time * fittedScale)
  const candidates = detectBoundaryCandidates(curve)

  const usedIndices = new Set<number>()
  const observedBoundaries: Array<{ t: number; miss: boolean }> = []

  for (const expected of expectedBoundaries) {
    let bestIdx = -1
    let bestScore = -Infinity

    for (let i = 0; i < candidates.length; i += 1) {
      if (usedIndices.has(i)) {
        continue
      }
      const candidate = candidates[i]
      const diff = Math.abs(candidate.t - expected)
      if (diff > 0.35) {
        continue
      }
      const score = candidate.strength - diff * 2.6
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    if (bestIdx >= 0) {
      usedIndices.add(bestIdx)
      observedBoundaries.push({ t: candidates[bestIdx].t, miss: false })
    } else {
      observedBoundaries.push({ t: expected, miss: true })
    }
  }

  let boundaryPenalty = 0
  for (let i = 0; i < expectedBoundaries.length; i += 1) {
    const diff = Math.abs(observedBoundaries[i].t - expectedBoundaries[i])
    boundaryPenalty += diff + (observedBoundaries[i].miss ? 0.2 : 0)
  }
  const meanBoundaryErrorSec = boundaryPenalty / Math.max(1, expectedBoundaries.length)
  const boundaryScore = 100 * Math.exp(-meanBoundaryErrorSec / 0.125)

  const expectedDurations = notes.map((note) => (note.end - note.start) * fittedScale)
  const observedTimes = [sungStart, ...observedBoundaries.map((b) => b.t), sungEnd]
  const observedDurations: number[] = []
  for (let i = 1; i < observedTimes.length; i += 1) {
    observedDurations.push(Math.max(0.001, observedTimes[i] - observedTimes[i - 1]))
  }

  const expectedTotal = expectedDurations.reduce((sum, value) => sum + value, 0)
  const observedTotal = observedDurations.reduce((sum, value) => sum + value, 0)

  let ratioError = 0
  for (let i = 0; i < expectedDurations.length; i += 1) {
    const expectedRatio = expectedDurations[i] / Math.max(0.001, expectedTotal)
    const observedRatio = (observedDurations[i] ?? observedDurations[observedDurations.length - 1]) / Math.max(0.001, observedTotal)
    ratioError += Math.abs(expectedRatio - observedRatio)
  }
  ratioError /= Math.max(1, expectedDurations.length)
  const ratioScore = 100 * Math.exp(-ratioError / 0.07)

  return clampScore(boundaryScore * 0.58 + ratioScore * 0.3 + tempoScore * 0.12)
}

export function buildDisplayCurve(
  input: BuildDisplayCurveInput
): { curve: AttemptCurvePoint[]; voiceStartSec: number | null } {
  const bridgedRaw = bridgeShortGaps(input.rawCurve, PITCH_GAP_BRIDGE_SECONDS)
  const voiceStartSec = findVoiceStart(bridgedRaw)
  if (voiceStartSec === null) {
    return {
      curve: [],
      voiceStartSec: null
    }
  }

  const rebased = rebaseRawCurve(bridgedRaw, voiceStartSec)
  const curve = normalizeCurve(rebased, input.doHz, input.target)
  const mode = input.mode ?? 'absolute'

  if (mode !== 'relative') {
    return {
      curve,
      voiceStartSec
    }
  }

  const rawErrors = curve
    .map((point) => point.centErr)
    .filter((value): value is number => value !== null)
  const relativeOffsetCent = rawErrors.length > 0 ? percentile(rawErrors, 50) : 0

  return {
    curve: applyRelativeOffset(curve, relativeOffsetCent),
    voiceStartSec
  }
}

export function evaluateAttempt(input: EvaluateAttemptInput): AttemptResult {
  const display = buildDisplayCurve({
    rawCurve: input.rawCurve,
    target: input.target,
    doHz: input.doHz,
    mode: input.mode
  })
  if (display.voiceStartSec === null) {
    return {
      attemptIndex: input.attemptIndex,
      valid: false,
      failReason: 'no_voiced',
      clip: input.clip,
      sampleRate: input.sampleRate,
      curve: []
    }
  }

  const curve = display.curve
  const stats = voicedStats(curve)

  if (
    stats.voicedDuration < MIN_VOICED_DURATION_SECONDS ||
    stats.coverage < MIN_VOICED_COVERAGE
  ) {
    return {
      attemptIndex: input.attemptIndex,
      valid: false,
      failReason: 'too_short',
      voiceStartSec: display.voiceStartSec,
      clip: input.clip,
      sampleRate: input.sampleRate,
      curve
    }
  }

  const mode = input.mode ?? 'absolute'
  const errors = curve
    .map((point) => point.centErr)
    .filter((value): value is number => value !== null)
  const absErrors = errors.map((value) => Math.abs(value))

  const accuracy = mode === 'relative' ? scoreRelativeAccuracy(curve, input.notes) : scoreAccuracy(absErrors)
  const stability = scoreStability(errors)
  const lock = mode === 'relative' ? scoreLockRelative(curve) : scoreLockAbsolute(curve)
  const rhythm = scoreRhythm(curve, input.notes)

  const score = clampScore(
    accuracy * SCORE_WEIGHTS.accuracy +
      stability * SCORE_WEIGHTS.stability +
      lock * SCORE_WEIGHTS.lock +
      rhythm * SCORE_WEIGHTS.rhythm
  )

  return {
    attemptIndex: input.attemptIndex,
    valid: true,
    voiceStartSec: display.voiceStartSec,
    score,
    subscores: {
      accuracy,
      stability,
      lock,
      rhythm
    },
    curve,
    clip: input.clip,
    sampleRate: input.sampleRate
  }
}

export function isAttemptBetter(candidate: AttemptResult, baseline?: AttemptResult): boolean {
  if (!candidate.valid) {
    return false
  }
  if (!baseline || !baseline.valid) {
    return true
  }

  if ((candidate.score ?? 0) !== (baseline.score ?? 0)) {
    return (candidate.score ?? 0) > (baseline.score ?? 0)
  }

  const candidateAcc = candidate.subscores?.accuracy ?? 0
  const baselineAcc = baseline.subscores?.accuracy ?? 0
  if (candidateAcc !== baselineAcc) {
    return candidateAcc > baselineAcc
  }

  return candidate.attemptIndex < baseline.attemptIndex
}
