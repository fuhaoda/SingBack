import { TARGET_RESOLUTION_SECONDS } from '../config/defaults'
import type { Difficulty, ExerciseSpec, Tuning, UserSettings } from '../types'
import { clamp } from '../chart/axis'

const JUST_INTONATION_RATIOS = [
  1 / 1,
  16 / 15,
  9 / 8,
  6 / 5,
  5 / 4,
  4 / 3,
  45 / 32,
  3 / 2,
  8 / 5,
  5 / 3,
  9 / 5,
  15 / 8
]

const NOTE_COUNT_BY_DIFFICULTY: Record<Difficulty, number> = {
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
  L5: 5,
  L6: 5
}

const NOTE_DURATION_BY_DIFFICULTY: Record<Difficulty, number> = {
  L1: 2,
  L2: 1.6,
  L3: 1.25,
  L4: 1,
  L5: 0.85,
  L6: 0.85
}

const STEP_BY_DIFFICULTY: Record<Difficulty, number[]> = {
  L1: [0],
  L2: [-2, -1, 1, 2],
  L3: [-3, -2, -1, 1, 2, 3],
  L4: [-4, -3, -2, -1, 1, 2, 3, 4],
  L5: [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5],
  L6: [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]
}

export interface BandInfo {
  midHz: number
  bandLow: number
  bandHigh: number
}

export function computeBandFromRange(minHz: number, maxHz: number): BandInfo {
  const midHz = (minHz + maxHz) / 2
  const bandLow = Math.max(minHz, midHz * 2 ** (-6 / 12))
  const bandHigh = Math.min(maxHz, midHz * 2 ** (6 / 12))
  return { midHz, bandLow, bandHigh }
}

function hzToSemi(hz: number, doHz: number): number {
  return 12 * Math.log2(hz / doHz)
}

function semiToHz(semitone: number, doHz: number, tuning: Tuning): number {
  if (tuning === 'equal_temperament') {
    return doHz * 2 ** (semitone / 12)
  }
  const octave = Math.floor(semitone / 12)
  const index = ((semitone % 12) + 12) % 12
  return doHz * JUST_INTONATION_RATIOS[index] * 2 ** octave
}

function chooseStartSemitone(minSemi: number, maxSemi: number, difficulty: Difficulty): number {
  const center = Math.round((minSemi + maxSemi) / 2)
  if (difficulty === 'L1') {
    return center
  }

  const edgeBias = difficulty === 'L5' || difficulty === 'L6'
  if (edgeBias && Math.random() < 0.45) {
    const lowerEdge = Math.round(minSemi + 1)
    const upperEdge = Math.round(maxSemi - 1)
    if (Math.random() < 0.5) {
      return clamp(lowerEdge, Math.ceil(minSemi), Math.floor(maxSemi))
    }
    return clamp(upperEdge, Math.ceil(minSemi), Math.floor(maxSemi))
  }

  const centerSpread = difficulty === 'L2' ? 1 : difficulty === 'L3' ? 2 : 3
  const jitter = Math.round((Math.random() * 2 - 1) * centerSpread)
  return clamp(center + jitter, Math.ceil(minSemi), Math.floor(maxSemi))
}

function buildRelativeL1Path(minSemi: number, maxSemi: number): number[] {
  const minBound = Math.ceil(minSemi)
  const maxBound = Math.floor(maxSemi)
  const first = chooseStartSemitone(minSemi, maxSemi, 'L1')
  const options = STEP_BY_DIFFICULTY.L2.filter((step) => {
    const candidate = first + step
    return candidate >= minBound && candidate <= maxBound
  })

  if (options.length === 0) {
    return [first, first]
  }

  const step = options[Math.floor(Math.random() * options.length)]
  return [first, first + step]
}

export function buildSemitonePath(
  difficulty: Difficulty,
  minSemi: number,
  maxSemi: number
): number[] {
  const noteCount = NOTE_COUNT_BY_DIFFICULTY[difficulty]
  const minBound = Math.ceil(minSemi)
  const maxBound = Math.floor(maxSemi)

  if (minBound > maxBound) {
    return [Math.round((minSemi + maxSemi) / 2)]
  }

  for (let attempt = 0; attempt < 300; attempt += 1) {
    const values: number[] = [chooseStartSemitone(minSemi, maxSemi, difficulty)]

    while (values.length < noteCount) {
      const current = values[values.length - 1]
      const options = STEP_BY_DIFFICULTY[difficulty]
      const shuffled = [...options].sort(() => Math.random() - 0.5)
      let picked: number | null = null

      for (const step of shuffled) {
        const candidate = current + step
        if (candidate < minBound || candidate > maxBound) {
          continue
        }
        if (values.length >= 2 && values[values.length - 2] === candidate && Math.random() < 0.8) {
          continue
        }
        picked = candidate
        break
      }

      if (picked === null) {
        break
      }
      values.push(picked)
    }

    if (values.length === noteCount) {
      return values
    }
  }

  const center = Math.round((minBound + maxBound) / 2)
  return Array.from({ length: noteCount }, () => center)
}

export function generateExercise(settings: UserSettings): ExerciseSpec {
  const { bandLow, bandHigh } = computeBandFromRange(settings.minHz, settings.maxHz)
  const minSemi = hzToSemi(bandLow, settings.doHz)
  const maxSemi = hzToSemi(bandHigh, settings.doHz)

  const semitonePath =
    settings.mode === 'relative' && settings.difficulty === 'L1'
      ? buildRelativeL1Path(minSemi, maxSemi)
      : buildSemitonePath(settings.difficulty, minSemi, maxSemi)
  const noteDuration = NOTE_DURATION_BY_DIFFICULTY[settings.difficulty]
  const durationSec = Math.min(10, semitonePath.length * noteDuration)

  const target: Array<{ t: number; hz: number }> = []

  for (let i = 0; i < semitonePath.length; i += 1) {
    const tStart = i * noteDuration
    const tEnd = Math.min(durationSec, (i + 1) * noteDuration)
    const hz = semiToHz(semitonePath[i], settings.doHz, settings.tuning)

    for (let t = tStart; t < tEnd; t += TARGET_RESOLUTION_SECONDS) {
      target.push({ t: Number(t.toFixed(4)), hz })
    }
  }

  const lastHz = semiToHz(semitonePath[semitonePath.length - 1], settings.doHz, settings.tuning)
  target.push({ t: Number(durationSec.toFixed(4)), hz: lastHz })

  return {
    id: `q-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    durationSec,
    target,
    bandLow,
    bandHigh,
    difficulty: settings.difficulty
  }
}
