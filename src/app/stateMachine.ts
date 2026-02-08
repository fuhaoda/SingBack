import type { AttemptResult, Phase, QuestionState } from '../types'
import { isAttemptBetter } from '../scoring/score'

export interface PracticeMachine {
  phase: Phase
  attemptsCount: number
  question: QuestionState
}

export type PracticeEvent =
  | { type: 'start_question' }
  | { type: 'start_countdown' }
  | { type: 'countdown_done' }
  | { type: 'start_recording' }
  | { type: 'start_evaluating' }
  | { type: 'attempt_done'; attempt: AttemptResult }
  | { type: 'next_question' }
  | { type: 'reset' }

export function createInitialMachine(): PracticeMachine {
  return {
    phase: 'idle',
    attemptsCount: 0,
    question: {
      attempts: []
    }
  }
}

export function transition(machine: PracticeMachine, event: PracticeEvent): PracticeMachine {
  switch (event.type) {
    case 'start_question':
      return {
        phase: 'first_countdown',
        attemptsCount: 0,
        question: {
          attempts: []
        }
      }

    case 'start_countdown':
      if (machine.phase === 'idle' || machine.phase === 'practice_loop') {
        return {
          ...machine,
          phase: 'first_countdown'
        }
      }
      return machine

    case 'countdown_done':
      if (machine.phase !== 'first_countdown') {
        return machine
      }
      return {
        ...machine,
        phase: 'recording'
      }

    case 'start_recording':
      if (machine.phase === 'practice_loop' || machine.phase === 'idle') {
        return {
          ...machine,
          phase: 'recording'
        }
      }
      return machine

    case 'start_evaluating':
      if (machine.phase !== 'recording') {
        return machine
      }
      return {
        ...machine,
        phase: 'evaluating'
      }

    case 'attempt_done': {
      const attempts = [...machine.question.attempts, event.attempt]
      const first =
        machine.question.first ??
        (event.attempt.valid
          ? event.attempt
          : undefined)
      const best = isAttemptBetter(event.attempt, machine.question.best)
        ? event.attempt
        : machine.question.best

      return {
        phase: 'practice_loop',
        attemptsCount: machine.attemptsCount + 1,
        question: {
          attempts,
          first,
          best,
          current: event.attempt
        }
      }
    }

    case 'next_question':
      return {
        phase: 'first_countdown',
        attemptsCount: 0,
        question: {
          attempts: []
        }
      }

    case 'reset':
      return createInitialMachine()

    default:
      return machine
  }
}
