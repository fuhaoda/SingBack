import { semitoneToJianpuLabel } from '../chart/axis'
import { TARGET_RESOLUTION_SECONDS } from '../config/defaults'
import type { Difficulty, ExerciseSpec, MatchMode, NoteEvent, Tuning, UserSettings } from '../types'

const JUST_NATURAL_RATIOS: Record<number, number> = {
  0: 1,
  2: 9 / 8,
  4: 5 / 4,
  5: 4 / 3,
  7: 3 / 2,
  9: 5 / 3,
  11: 15 / 8
}

const CORE_NATURAL_SEMITONES = [0, 2, 4, 5, 7, 9, 11]
const LOW4_BOUND_SEMI = -7
const HIGH2_BOUND_SEMI = 14
const CORE_ZONE_PROBABILITY = 0.9
const SAFETY_MARGIN_RATIO = 0.05
const MIN_EFFECTIVE_BAND_HZ = 8
const MIN_NOTE_DURATION_SECONDS = 0.22
const MAX_EXERCISE_DURATION_SECONDS = 6

interface DifficultyProfile {
  noteCountMin: number
  noteCountMax: number
  totalDurationMin: number
  totalDurationMax: number
  maxLeapSemi: number
  rhythmJitter: number
}

const ABSOLUTE_PROFILES: Record<Difficulty, DifficultyProfile> = {
  L1: { noteCountMin: 1, noteCountMax: 1, totalDurationMin: 1, totalDurationMax: 3, maxLeapSemi: 0, rhythmJitter: 0 },
  L2: { noteCountMin: 2, noteCountMax: 3, totalDurationMin: 1.8, totalDurationMax: 4.8, maxLeapSemi: 2, rhythmJitter: 0.25 },
  L3: { noteCountMin: 3, noteCountMax: 4, totalDurationMin: 2.2, totalDurationMax: 5.5, maxLeapSemi: 4, rhythmJitter: 0.35 },
  L4: { noteCountMin: 4, noteCountMax: 5, totalDurationMin: 2.6, totalDurationMax: 6.0, maxLeapSemi: 6, rhythmJitter: 0.5 },
  L5: { noteCountMin: 5, noteCountMax: 6, totalDurationMin: 3.0, totalDurationMax: 6.0, maxLeapSemi: 8, rhythmJitter: 0.65 },
  L6: { noteCountMin: 6, noteCountMax: 8, totalDurationMin: 3.5, totalDurationMax: 6.0, maxLeapSemi: 10, rhythmJitter: 0.8 }
}

const RELATIVE_PROFILES: Record<Difficulty, DifficultyProfile> = {
  L1: { noteCountMin: 2, noteCountMax: 2, totalDurationMin: 1.2, totalDurationMax: 4.0, maxLeapSemi: 2, rhythmJitter: 0.25 },
  L2: { noteCountMin: 3, noteCountMax: 4, totalDurationMin: 2.0, totalDurationMax: 5.0, maxLeapSemi: 4, rhythmJitter: 0.35 },
  L3: { noteCountMin: 4, noteCountMax: 5, totalDurationMin: 2.4, totalDurationMax: 5.8, maxLeapSemi: 6, rhythmJitter: 0.45 },
  L4: { noteCountMin: 5, noteCountMax: 6, totalDurationMin: 2.8, totalDurationMax: 6.0, maxLeapSemi: 8, rhythmJitter: 0.6 },
  L5: { noteCountMin: 6, noteCountMax: 7, totalDurationMin: 3.2, totalDurationMax: 6.0, maxLeapSemi: 10, rhythmJitter: 0.75 },
  L6: { noteCountMin: 7, noteCountMax: 9, totalDurationMin: 3.6, totalDurationMax: 6.0, maxLeapSemi: 12, rhythmJitter: 0.85 }
}

export interface BandInfo {
  effectiveDoHz: number
  musicLowHz: number
  musicHighHz: number
  safeLowHz: number
  safeHighHz: number
  bandLow: number
  bandHigh: number
}

interface SemitonePools {
  all: number[]
  core: number[]
  extension: number[]
}

function floorMod(value: number, mod: number): number {
  return ((value % mod) + mod) % mod
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomIntInclusive(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function hzToSemi(hz: number, doHz: number): number {
  return 12 * Math.log2(hz / doHz)
}

function equalSemiToHz(semi: number, doHz: number): number {
  return doHz * 2 ** (semi / 12)
}

function semiToHzWithTuning(semi: number, doHz: number, tuning: Tuning): number {
  if (tuning === 'equal_temperament') {
    return equalSemiToHz(semi, doHz)
  }

  const octave = Math.floor(semi / 12)
  const semitoneInOctave = floorMod(semi, 12)
  const ratio = JUST_NATURAL_RATIOS[semitoneInOctave]
  if (ratio !== undefined) {
    return doHz * ratio * 2 ** octave
  }

  return equalSemiToHz(semi, doHz)
}

function getProfile(mode: MatchMode, difficulty: Difficulty): DifficultyProfile {
  return mode === 'relative' ? RELATIVE_PROFILES[difficulty] : ABSOLUTE_PROFILES[difficulty]
}

function isCoreNatural(semi: number): boolean {
  return semi >= 0 && semi <= 11 && CORE_NATURAL_SEMITONES.includes(semi)
}

function gaussianWeight(value: number, center: number, sigma: number): number {
  const distance = value - center
  return Math.exp(-(distance * distance) / (2 * sigma * sigma))
}

function weightedPick(values: number[], weights: number[]): number {
  if (values.length === 0) {
    throw new Error('Cannot pick from an empty set')
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) {
    return values[Math.floor(Math.random() * values.length)]
  }
  let cursor = Math.random() * total
  for (let i = 0; i < values.length; i += 1) {
    cursor -= weights[i]
    if (cursor <= 0) {
      return values[i]
    }
  }
  return values[values.length - 1]
}

function buildSemitonePools(minSemi: number, maxSemi: number): SemitonePools {
  const all: number[] = []
  const core: number[] = []
  const extension: number[] = []

  for (let semi = minSemi; semi <= maxSemi; semi += 1) {
    all.push(semi)
    if (isCoreNatural(semi)) {
      core.push(semi)
    } else {
      extension.push(semi)
    }
  }

  return {
    all,
    core,
    extension
  }
}

function buildDurations(noteCount: number, totalDurationSec: number, rhythmJitter: number): number[] {
  if (noteCount <= 1) {
    return [Math.min(MAX_EXERCISE_DURATION_SECONDS, totalDurationSec)]
  }

  const hardMinimum = noteCount * MIN_NOTE_DURATION_SECONDS
  const total = Math.min(MAX_EXERCISE_DURATION_SECONDS, Math.max(totalDurationSec, hardMinimum))
  const freeDuration = Math.max(0, total - hardMinimum)

  const jitterAmplitude = 0.15 + 0.75 * rhythmJitter
  const rawWeights = Array.from({ length: noteCount }, () => {
    const jitter = (Math.random() * 2 - 1) * jitterAmplitude
    return Math.max(0.12, 1 + jitter)
  })

  const weightSum = rawWeights.reduce((sum, value) => sum + value, 0)
  return rawWeights.map((weight) => MIN_NOTE_DURATION_SECONDS + (freeDuration * weight) / Math.max(1e-6, weightSum))
}

function pickNextSemi(
  pools: SemitonePools,
  maxLeapSemi: number,
  previousSemi: number | null,
  coreSigma: number,
  extensionSigma: number
): number {
  const basePool =
    pools.core.length > 0 && (pools.extension.length === 0 || Math.random() < CORE_ZONE_PROBABILITY)
      ? pools.core
      : pools.extension.length > 0
        ? pools.extension
        : pools.all

  let candidates = basePool
  if (previousSemi !== null) {
    const leapFiltered = candidates.filter((semi) => Math.abs(semi - previousSemi) <= maxLeapSemi)
    if (leapFiltered.length > 0) {
      candidates = leapFiltered
    }
  }

  if (candidates.length === 0) {
    candidates = pools.all
  }

  const sigma = basePool === pools.core ? coreSigma : extensionSigma
  const weights = candidates.map((semi) => gaussianWeight(semi, 5, sigma))
  return weightedPick(candidates, weights)
}

function buildSemitonePath(settings: UserSettings, pools: SemitonePools, profile: DifficultyProfile): number[] {
  const noteCount = randomIntInclusive(profile.noteCountMin, profile.noteCountMax)
  const path: number[] = []

  const coreSigma = settings.difficulty === 'L1' || settings.difficulty === 'L2' ? 2.1 : 2.8
  const extensionSigma = settings.difficulty === 'L1' ? 3.4 : 4.2

  for (let i = 0; i < noteCount; i += 1) {
    const previous = i > 0 ? path[i - 1] : null
    const next = pickNextSemi(pools, profile.maxLeapSemi, previous, coreSigma, extensionSigma)
    path.push(next)
  }

  if (settings.mode === 'relative' && path.length >= 2) {
    const allEqual = path.every((semi) => semi === path[0])
    if (allEqual) {
      const neighbor = pools.all.find((semi) => semi !== path[0] && Math.abs(semi - path[0]) <= profile.maxLeapSemi)
      if (neighbor !== undefined) {
        path[path.length - 1] = neighbor
      }
    }
  }

  return path
}

export function computeBandFromRange(
  minHz: number,
  maxHz: number,
  doHz: number,
  keySemitone = 0
): BandInfo {
  const effectiveDoHz = doHz * 2 ** (keySemitone / 12)
  const musicLowHz = equalSemiToHz(LOW4_BOUND_SEMI, effectiveDoHz)
  const musicHighHz = equalSemiToHz(HIGH2_BOUND_SEMI, effectiveDoHz)

  const rangeHz = Math.max(0, maxHz - minHz)
  const safeLowHz = minHz + rangeHz * SAFETY_MARGIN_RATIO
  const safeHighHz = maxHz - rangeHz * SAFETY_MARGIN_RATIO

  let bandLow = Math.max(musicLowHz, safeLowHz)
  let bandHigh = Math.min(musicHighHz, safeHighHz)

  if (bandHigh - bandLow < MIN_EFFECTIVE_BAND_HZ) {
    bandLow = Math.max(musicLowHz, minHz)
    bandHigh = Math.min(musicHighHz, maxHz)
  }

  if (bandHigh - bandLow < MIN_EFFECTIVE_BAND_HZ) {
    bandLow = minHz
    bandHigh = maxHz
  }

  if (bandHigh <= bandLow) {
    const center = Math.max(1, (minHz + maxHz) / 2)
    bandLow = Math.max(1, center - MIN_EFFECTIVE_BAND_HZ / 2)
    bandHigh = center + MIN_EFFECTIVE_BAND_HZ / 2
  }

  return {
    effectiveDoHz,
    musicLowHz,
    musicHighHz,
    safeLowHz,
    safeHighHz,
    bandLow,
    bandHigh
  }
}

function buildNoteEvents(
  semitonePath: number[],
  durations: number[],
  effectiveDoHz: number,
  tuning: Tuning
): NoteEvent[] {
  const notes: NoteEvent[] = []
  let cursor = 0

  for (let i = 0; i < semitonePath.length; i += 1) {
    const semi = semitonePath[i]
    const duration = durations[i]
    const start = Number(cursor.toFixed(4))
    cursor += duration
    const end = Number(cursor.toFixed(4))

    notes.push({
      idx: i,
      start,
      end,
      hz: semiToHzWithTuning(semi, effectiveDoHz, tuning),
      semi,
      jianpu: semitoneToJianpuLabel(semi),
      inCoreZone: isCoreNatural(semi)
    })
  }

  return notes
}

function expandTargetFromNotes(notes: NoteEvent[]): Array<{ t: number; hz: number }> {
  const target: Array<{ t: number; hz: number }> = []

  for (const note of notes) {
    for (let t = note.start; t < note.end; t += TARGET_RESOLUTION_SECONDS) {
      target.push({ t: Number(t.toFixed(4)), hz: note.hz })
    }
  }

  const last = notes[notes.length - 1]
  target.push({ t: Number(last.end.toFixed(4)), hz: last.hz })

  return target
}

export function generateExercise(settings: UserSettings): ExerciseSpec {
  const bandInfo = computeBandFromRange(settings.minHz, settings.maxHz, settings.doHz, settings.keySemitone)
  const minSemi = Math.ceil(hzToSemi(bandInfo.bandLow, bandInfo.effectiveDoHz))
  const maxSemi = Math.floor(hzToSemi(bandInfo.bandHigh, bandInfo.effectiveDoHz))

  const pools = buildSemitonePools(minSemi, maxSemi)
  const profile = getProfile(settings.mode, settings.difficulty)

  const semitonePath = buildSemitonePath(settings, pools, profile)
  const totalDuration = randomInRange(profile.totalDurationMin, profile.totalDurationMax)
  const durations = buildDurations(semitonePath.length, totalDuration, profile.rhythmJitter)

  const notes = buildNoteEvents(semitonePath, durations, bandInfo.effectiveDoHz, settings.tuning)
  const target = expandTargetFromNotes(notes)
  const durationSec = Math.min(MAX_EXERCISE_DURATION_SECONDS, notes[notes.length - 1]?.end ?? totalDuration)

  return {
    id: `q-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    durationSec,
    target,
    notes,
    effectiveDoHz: bandInfo.effectiveDoHz,
    bandLow: bandInfo.bandLow,
    bandHigh: bandInfo.bandHigh,
    difficulty: settings.difficulty
  }
}
