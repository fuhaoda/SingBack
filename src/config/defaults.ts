import type { Difficulty, Gender, MatchMode, Tuning, UserSettings } from '../types'

export const MALE_DEFAULTS = {
  minHz: 105,
  maxHz: 530,
  doHz: 130.8
} as const

export const FEMALE_DEFAULTS = {
  minHz: 175,
  maxHz: 880,
  doHz: 261.6
} as const

export const DEFAULT_TUNING: Tuning = 'equal_temperament'

export const DEFAULT_DIFFICULTY: Difficulty = 'L1'

export const DEFAULT_GENDER: Gender = 'male'

export const DEFAULT_MATCH_MODE: MatchMode = 'absolute'

export const DEFAULT_KEY_SEMITONE = 0

export const COUNTDOWN_SECONDS = 3

export const COUNTDOWN_START_SECONDS = 0.5

export const AUTO_STOP_SILENCE_SECONDS = 1

export const AUTO_STOP_MIN_RECORD_SECONDS = 1

export const PITCH_GAP_BRIDGE_SECONDS = 0.22

export const MAX_RECORDING_SECONDS = 10

export const MAX_DISPLAY_SECONDS = 8

export const LIVE_CURVE_DELAY_SECONDS = 0.2

export const REPLAY_VOICE_PREROLL_SECONDS = 0.15

export const MIN_VOICED_DURATION_SECONDS = 0.8

export const MIN_VOICED_COVERAGE = 0.3

export const SCORE_WEIGHTS = {
  accuracy: 0.7,
  stability: 0.1,
  lock: 0.1,
  rhythm: 0.1
} as const

export const LOCK_THRESHOLD_CENTS = 35

export const TARGET_RESOLUTION_SECONDS = 0.02

export const SAMPLE_RATE_FALLBACK = 44100

export const KEY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '1=C' },
  { value: 1, label: '1=C#/Db' },
  { value: 2, label: '1=D' },
  { value: 3, label: '1=D#/Eb' },
  { value: 4, label: '1=E' },
  { value: 5, label: '1=F' },
  { value: 6, label: '1=F#/Gb' },
  { value: 7, label: '1=G' },
  { value: 8, label: '1=G#/Ab' },
  { value: 9, label: '1=A' },
  { value: 10, label: '1=A#/Bb' },
  { value: 11, label: '1=B' }
]

export function defaultsForGender(gender: Gender): { minHz: number; maxHz: number; doHz: number } {
  if (gender === 'female') {
    return { ...FEMALE_DEFAULTS }
  }
  return { ...MALE_DEFAULTS }
}

export function buildInitialSettings(): UserSettings {
  const defaults = defaultsForGender(DEFAULT_GENDER)
  return {
    gender: DEFAULT_GENDER,
    minHz: defaults.minHz,
    maxHz: defaults.maxHz,
    doHz: defaults.doHz,
    keySemitone: DEFAULT_KEY_SEMITONE,
    tuning: DEFAULT_TUNING,
    difficulty: DEFAULT_DIFFICULTY,
    mode: DEFAULT_MATCH_MODE,
    dirtyMinHz: false,
    dirtyMaxHz: false,
    dirtyDoHz: false
  }
}

export const DIFFICULTY_OPTIONS: Difficulty[] = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6']

export const TUNING_OPTIONS: Array<{ value: Tuning; label: string }> = [
  { value: 'equal_temperament', label: '12-TET' },
  { value: 'just_intonation', label: 'Just' }
]

export const MATCH_MODE_OPTIONS: Array<{ value: MatchMode; label: string }> = [
  { value: 'absolute', label: 'Absolute Match' },
  { value: 'relative', label: 'Relative Contour' }
]
