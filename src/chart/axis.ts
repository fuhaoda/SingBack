import type { ExerciseSpec } from '../types'

export interface AxisConfig {
  yMinSemi: number
  yMaxSemi: number
  yRangeSemi: number
}

export interface JianpuLabelParts {
  base: string
  upperDots: number
  lowerDots: number
}

const Y_MARGIN_SEMI = 0.5

const CHROMATIC_JIANPU_LABELS = ['1', '#1', '2', '#2', '3', '4', '#4', '5', '#5', '6', '#6', '7']

function floorMod(value: number, mod: number): number {
  return ((value % mod) + mod) % mod
}

export function semitoneToJianpuLabel(semi: number): string {
  const parts = semitoneToJianpuParts(semi)
  let label = parts.base
  if (parts.upperDots > 0) {
    label += '\u0307'.repeat(parts.upperDots)
  } else if (parts.lowerDots > 0) {
    label += '\u0323'.repeat(parts.lowerDots)
  }
  return label
}

export function semitoneToJianpuParts(semi: number): JianpuLabelParts {
  const rounded = Math.round(semi)
  const octave = Math.floor(rounded / 12)
  const withinOctave = floorMod(rounded, 12)
  return {
    base: CHROMATIC_JIANPU_LABELS[withinOctave],
    upperDots: Math.max(0, octave),
    lowerDots: Math.max(0, -octave)
  }
}

export function hzToSemi(hz: number, doHz: number): number {
  return 12 * Math.log2(hz / doHz)
}

export function semiToHz(semi: number, doHz: number): number {
  return doHz * 2 ** (semi / 12)
}

export function buildAxisConfig(exercise: ExerciseSpec, doHz: number): AxisConfig {
  const minSemi = hzToSemi(exercise.bandLow, doHz)
  const maxSemi = hzToSemi(exercise.bandHigh, doHz)
  const yMinSemi = minSemi - Y_MARGIN_SEMI
  const yMaxSemi = maxSemi + Y_MARGIN_SEMI
  return {
    yMinSemi,
    yMaxSemi,
    yRangeSemi: Math.max(0.001, yMaxSemi - yMinSemi)
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function interpolateTargetHz(target: Array<{ t: number; hz: number }>, t: number): number | null {
  if (target.length === 0) {
    return null
  }
  if (t <= target[0].t) {
    return target[0].hz
  }
  const last = target[target.length - 1]
  if (t >= last.t) {
    return last.hz
  }

  let low = 0
  let high = target.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    if (target[mid].t < t) {
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  const right = target[low]
  const left = target[low - 1]
  const span = right.t - left.t
  if (span <= 0) {
    return left.hz
  }
  const ratio = (t - left.t) / span
  return left.hz + (right.hz - left.hz) * ratio
}
