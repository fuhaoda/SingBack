export type Gender = 'male' | 'female'

export type Tuning = 'equal_temperament' | 'just_intonation'

export type Difficulty = 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6'

export type MatchMode = 'absolute' | 'relative'

export interface UserSettings {
  gender: Gender
  minHz: number
  maxHz: number
  doHz: number
  tuning: Tuning
  difficulty: Difficulty
  mode: MatchMode
  dirtyMinHz: boolean
  dirtyMaxHz: boolean
  dirtyDoHz: boolean
}

export interface ExerciseSpec {
  id: string
  durationSec: number
  target: Array<{ t: number; hz: number }>
  bandLow: number
  bandHigh: number
  difficulty: Difficulty
}

export interface AttemptCurvePoint {
  t: number
  hz: number | null
  y: number | null
  centErr: number | null
}

export interface AttemptResult {
  attemptIndex: number
  valid: boolean
  failReason?: 'too_short' | 'no_voiced'
  score?: number
  subscores?: {
    accuracy: number
    stability: number
    lock: number
  }
  curve: AttemptCurvePoint[]
  clip: Float32Array
  sampleRate: number
}

export interface QuestionState {
  first?: AttemptResult
  current?: AttemptResult
  best?: AttemptResult
  attempts: AttemptResult[]
}

export type Phase =
  | 'idle'
  | 'first_countdown'
  | 'recording'
  | 'evaluating'
  | 'practice_loop'
