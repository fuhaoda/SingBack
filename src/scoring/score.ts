import {
  LOCK_HOLD_SECONDS,
  LOCK_THRESHOLD_CENTS,
  MAX_DISPLAY_SECONDS,
  MIN_VOICED_COVERAGE,
  MIN_VOICED_DURATION_SECONDS,
  PITCH_GAP_BRIDGE_SECONDS,
  SCORE_WEIGHTS
} from '../config/defaults'
import { hzToSemi, interpolateTargetHz } from '../chart/axis'
import type { AttemptCurvePoint, AttemptResult, ExerciseSpec, MatchMode } from '../types'

export interface RawSamplePoint {
  t: number
  hz: number | null
}

export interface EvaluateAttemptInput {
  attemptIndex: number
  rawCurve: RawSamplePoint[]
  target: ExerciseSpec['target']
  doHz: number
  mode?: MatchMode
  clip: Float32Array
  sampleRate: number
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
  // Newbie-friendly curve: decreases smoothly with cent error,
  // instead of collapsing to zero too early.
  const raw = 100 * Math.exp(-combined / 180)
  return clampScore(Math.max(8, raw))
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

function scoreLock(curve: AttemptCurvePoint[]): number {
  if (curve.length < 2) {
    return 0
  }

  for (let i = 0; i < curve.length; i += 1) {
    const start = curve[i]
    if (start.centErr === null || Math.abs(start.centErr) > LOCK_THRESHOLD_CENTS) {
      continue
    }

    let hold = 0
    for (let j = i + 1; j < curve.length; j += 1) {
      const prev = curve[j - 1]
      const curr = curve[j]
      if (curr.centErr === null || Math.abs(curr.centErr) > LOCK_THRESHOLD_CENTS) {
        break
      }
      hold += Math.max(0, curr.t - prev.t)
      if (hold >= LOCK_HOLD_SECONDS) {
        const lockTime = start.t
        const capped = Math.min(3, Math.max(0, lockTime))
        return clampScore(100 * (1 - capped / 3))
      }
    }
  }

  return 0
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

export function evaluateAttempt(input: EvaluateAttemptInput): AttemptResult {
  const bridgedRaw = bridgeShortGaps(input.rawCurve, PITCH_GAP_BRIDGE_SECONDS)
  const voiceStart = findVoiceStart(bridgedRaw)
  if (voiceStart === null) {
    return {
      attemptIndex: input.attemptIndex,
      valid: false,
      failReason: 'no_voiced',
      clip: input.clip,
      sampleRate: input.sampleRate,
      curve: []
    }
  }

  const rebased = rebaseRawCurve(bridgedRaw, voiceStart)
  const curve = normalizeCurve(rebased, input.doHz, input.target)
  const stats = voicedStats(curve)

  if (
    stats.voicedDuration < MIN_VOICED_DURATION_SECONDS ||
    stats.coverage < MIN_VOICED_COVERAGE
  ) {
    return {
      attemptIndex: input.attemptIndex,
      valid: false,
      failReason: 'too_short',
      clip: input.clip,
      sampleRate: input.sampleRate,
      curve
    }
  }

  const rawErrors = curve
    .map((point) => point.centErr)
    .filter((value): value is number => value !== null)

  const mode = input.mode ?? 'absolute'
  const relativeOffsetCent = mode === 'relative' && rawErrors.length > 0 ? percentile(rawErrors, 50) : 0
  const scoredCurve = mode === 'relative' ? applyRelativeOffset(curve, relativeOffsetCent) : curve

  const errors = scoredCurve
    .map((point) => point.centErr)
    .filter((value): value is number => value !== null)
  const absErrors = errors.map((value) => Math.abs(value))

  const accuracy = scoreAccuracy(absErrors)
  const stability = scoreStability(errors)
  const lock = scoreLock(scoredCurve)

  const score = clampScore(
    accuracy * SCORE_WEIGHTS.accuracy +
      stability * SCORE_WEIGHTS.stability +
      lock * SCORE_WEIGHTS.lock
  )

  return {
    attemptIndex: input.attemptIndex,
    valid: true,
    score,
    subscores: {
      accuracy,
      stability,
      lock
    },
    curve: scoredCurve,
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
