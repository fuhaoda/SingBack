import type { ExerciseSpec } from '../types'

export interface AudioContextRef {
  current: AudioContext | null
}

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
  master.gain.setValueAtTime(0.24, ctx.currentTime)
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
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(hz, ctx.currentTime + start)

    const attack = 0.02
    const release = 0.06
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start)
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + start + attack)
    gain.gain.setValueAtTime(0.2, ctx.currentTime + end - release)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + end)

    osc.connect(gain)
    gain.connect(master)

    osc.start(ctx.currentTime + start)
    osc.stop(ctx.currentTime + end)
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
