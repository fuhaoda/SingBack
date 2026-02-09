import type { ExerciseSpec } from '../types'

export interface AudioContextRef {
  current: AudioContext | null
}

const PITCH_RULER_LEVEL = 0.18
const MIN_ATTACK_SECONDS = 0.006
const MAX_ATTACK_SECONDS = 0.014
const MIN_RELEASE_SECONDS = 0.018
const MAX_RELEASE_SECONDS = 0.05

export async function ensureAudioContext(ctxRef: AudioContextRef): Promise<AudioContext> {
  if (!ctxRef.current) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      throw new Error('AudioContext is not supported in this browser')
    }
    ctxRef.current = new Ctor()
  }
  if (ctxRef.current.state !== 'running') {
    await ctxRef.current.resume()
  }
  return ctxRef.current
}

export function playExerciseTone(ctx: AudioContext, exercise: ExerciseSpec): Promise<void> {
  stopActiveTone(ctx)
  const master = ctx.createGain()
  // Keep the target tone clean and stable: sine wave as a "pitch ruler".
  master.gain.setValueAtTime(PITCH_RULER_LEVEL, ctx.currentTime)
  master.connect(ctx.destination)

  const stepBoundaries: number[] = []
  let lastHz = exercise.target[0]?.hz ?? 0
  stepBoundaries.push(0)
  for (const point of exercise.target) {
    if (point.hz !== lastHz) {
      stepBoundaries.push(point.t)
      lastHz = point.hz
    }
  }
  stepBoundaries.push(exercise.durationSec)

  for (let i = 0; i < stepBoundaries.length - 1; i += 1) {
    const start = stepBoundaries[i]
    const end = stepBoundaries[i + 1]
    const hz = sampleHzAt(exercise.target, start)
    if (!hz || hz <= 0 || end <= start) {
      continue
    }

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    const segmentStart = ctx.currentTime + start
    const segmentEnd = ctx.currentTime + end
    const segmentDuration = Math.max(0.001, end - start)
    osc.frequency.setValueAtTime(hz, segmentStart)

    const attack = Math.min(MAX_ATTACK_SECONDS, Math.max(MIN_ATTACK_SECONDS, segmentDuration * 0.3))
    const release = Math.min(MAX_RELEASE_SECONDS, Math.max(MIN_RELEASE_SECONDS, segmentDuration * 0.4))
    const peakAt = Math.min(segmentEnd, segmentStart + attack)
    const releaseStart = Math.max(peakAt, segmentEnd - release)

    gain.gain.setValueAtTime(0.0001, segmentStart)
    gain.gain.exponentialRampToValueAtTime(1, peakAt)
    gain.gain.setValueAtTime(1, releaseStart)
    gain.gain.exponentialRampToValueAtTime(0.0001, segmentEnd)

    osc.connect(gain)
    gain.connect(master)

    osc.start(segmentStart)
    osc.stop(segmentEnd)
  }

  const doneInMs = Math.ceil(exercise.durationSec * 1000)
  return new Promise((resolve) => {
    window.setTimeout(() => {
      master.disconnect()
      resolve()
    }, doneInMs + 100)
  })
}

export function playClip(ctx: AudioContext, clip: Float32Array, sampleRate: number): Promise<void> {
  if (clip.length === 0) {
    return Promise.resolve()
  }
  const buffer = ctx.createBuffer(1, clip.length, sampleRate)
  buffer.copyToChannel(new Float32Array(clip), 0)

  const source = ctx.createBufferSource()
  source.buffer = buffer
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.95, ctx.currentTime)
  source.connect(gain)
  gain.connect(ctx.destination)

  stopActiveTone(ctx)
  source.start()

  return new Promise((resolve) => {
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
      resolve()
    }
  })
}

function sampleHzAt(target: Array<{ t: number; hz: number }>, t: number): number | null {
  if (target.length === 0) {
    return null
  }
  if (t <= target[0].t) {
    return target[0].hz
  }
  for (let i = 1; i < target.length; i += 1) {
    if (target[i].t >= t) {
      return target[i].hz
    }
  }
  return target[target.length - 1].hz
}

function stopActiveTone(ctx: AudioContext): void {
  // NOP placeholder to keep API stable if we add centralized voice management later.
  void ctx
}
