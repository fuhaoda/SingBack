import { describe, expect, it } from 'vitest'
import { createInitialMachine, transition } from '../app/stateMachine'
import type { AttemptResult } from '../types'

function attempt(index: number, score: number, valid = true): AttemptResult {
  return {
    attemptIndex: index,
    valid,
    score,
    subscores: { accuracy: score, stability: score, lock: score },
    curve: [],
    clip: new Float32Array(),
    sampleRate: 44_100,
    failReason: valid ? undefined : 'too_short'
  }
}

describe('practice state machine', () => {
  it('runs first countdown into recording', () => {
    let machine = createInitialMachine()
    machine = transition(machine, { type: 'start_question' })
    expect(machine.phase).toBe('first_countdown')

    machine = transition(machine, { type: 'countdown_done' })
    expect(machine.phase).toBe('recording')
  })

  it('stores first valid attempt and best score', () => {
    let machine = createInitialMachine()
    machine = transition(machine, { type: 'start_question' })
    machine = transition(machine, { type: 'countdown_done' })

    machine = transition(machine, { type: 'attempt_done', attempt: attempt(1, 74) })
    expect(machine.question.first?.score).toBe(74)
    expect(machine.question.best?.score).toBe(74)

    machine = transition(machine, { type: 'attempt_done', attempt: attempt(2, 88) })
    expect(machine.question.first?.score).toBe(74)
    expect(machine.question.best?.score).toBe(88)
  })

  it('does not set first with invalid attempt', () => {
    let machine = createInitialMachine()
    machine = transition(machine, { type: 'start_question' })
    machine = transition(machine, { type: 'countdown_done' })

    machine = transition(machine, { type: 'attempt_done', attempt: attempt(1, 0, false) })
    expect(machine.question.first).toBeUndefined()
  })

  it('resets to idle when reset event is dispatched', () => {
    let machine = createInitialMachine()
    machine = transition(machine, { type: 'start_question' })
    machine = transition(machine, { type: 'countdown_done' })
    machine = transition(machine, { type: 'attempt_done', attempt: attempt(1, 88) })

    machine = transition(machine, { type: 'reset' })
    expect(machine.phase).toBe('idle')
    expect(machine.attemptsCount).toBe(0)
    expect(machine.question.attempts).toHaveLength(0)
    expect(machine.question.first).toBeUndefined()
  })
})
