import { useEffect, useRef } from 'react'
import type { AttemptCurvePoint, ExerciseSpec } from '../types'
import type { AxisConfig } from './axis'

interface PitchCanvasProps {
  target: ExerciseSpec['target']
  attempt: AttemptCurvePoint[]
  axis: AxisConfig
  doHz: number
  durationSec?: number
  className?: string
}

const TARGET_COLOR = 'rgba(25, 92, 168, 0.92)'
const SING_COLOR = 'rgba(222, 111, 44, 0.95)'

export default function PitchCanvas({
  target,
  attempt,
  axis,
  doHz,
  durationSec = 10,
  className
}: PitchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const width = Math.max(300, Math.floor(rect.width))
    const height = Math.max(180, Math.floor(rect.height))
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const left = 44
    const right = width - 16
    const top = 12
    const bottom = height - 28

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fillRect(0, 0, width, height)

    drawGrid(ctx, { left, right, top, bottom }, axis, durationSec)
    drawTarget(ctx, target, { left, right, top, bottom }, axis, durationSec, doHz)
    drawAttempt(ctx, attempt, { left, right, top, bottom }, axis, durationSec)
  }, [attempt, axis, doHz, durationSec, target])

  return <canvas ref={canvasRef} className={className} aria-label="Pitch comparison chart" />
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  bounds: { left: number; right: number; top: number; bottom: number },
  axis: AxisConfig,
  durationSec: number
): void {
  const width = bounds.right - bounds.left

  ctx.strokeStyle = 'rgba(10, 52, 92, 0.14)'
  ctx.lineWidth = 1
  for (let second = 0; second <= durationSec; second += 1) {
    const x = bounds.left + (second / durationSec) * width
    ctx.beginPath()
    ctx.moveTo(x, bounds.top)
    ctx.lineTo(x, bounds.bottom)
    ctx.stroke()
  }

  const startSemi = Math.ceil(axis.yMinSemi)
  const endSemi = Math.floor(axis.yMaxSemi)
  for (let semi = startSemi; semi <= endSemi; semi += 1) {
    const y = semiToY(semi, axis, bounds)
    ctx.strokeStyle = semi % 12 === 0 ? 'rgba(222, 111, 44, 0.28)' : 'rgba(10, 52, 92, 0.12)'
    ctx.beginPath()
    ctx.moveTo(bounds.left, y)
    ctx.lineTo(bounds.right, y)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(10, 52, 92, 0.35)'
  ctx.beginPath()
  ctx.moveTo(bounds.left, bounds.bottom)
  ctx.lineTo(bounds.right, bounds.bottom)
  ctx.stroke()

  ctx.fillStyle = 'rgba(12, 48, 78, 0.82)'
  ctx.font = '11px "Space Grotesk", "Avenir Next", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let second = 0; second <= durationSec; second += 2) {
    const x = bounds.left + (second / durationSec) * width
    ctx.fillText(`${second}s`, x, bounds.bottom + 4)
  }

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let semi = startSemi; semi <= endSemi; semi += 2) {
    const y = semiToY(semi, axis, bounds)
    ctx.fillText(`${semi}`, bounds.left - 6, y)
  }
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  target: ExerciseSpec['target'],
  bounds: { left: number; right: number; top: number; bottom: number },
  axis: AxisConfig,
  durationSec: number,
  doHz: number
): void {
  if (target.length === 0) {
    return
  }
  const width = bounds.right - bounds.left

  ctx.strokeStyle = TARGET_COLOR
  ctx.lineWidth = 2.3
  ctx.beginPath()

  for (let i = 0; i < target.length; i += 1) {
    const point = target[i]
    const semi = 12 * Math.log2(point.hz / doHz)
    const x = bounds.left + (Math.min(durationSec, point.t) / durationSec) * width
    const y = semiToY(semi, axis, bounds)
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
}

function drawAttempt(
  ctx: CanvasRenderingContext2D,
  attempt: AttemptCurvePoint[],
  bounds: { left: number; right: number; top: number; bottom: number },
  axis: AxisConfig,
  durationSec: number
): void {
  if (attempt.length === 0) {
    return
  }
  const width = bounds.right - bounds.left

  ctx.strokeStyle = SING_COLOR
  ctx.lineWidth = 2
  ctx.beginPath()

  let drawing = false
  for (const point of attempt) {
    const x = bounds.left + (Math.min(durationSec, point.t) / durationSec) * width
    if (point.y === null) {
      drawing = false
      continue
    }
    const y = semiToY(point.y, axis, bounds)
    if (!drawing) {
      ctx.moveTo(x, y)
      drawing = true
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.stroke()
}

function semiToY(
  semi: number,
  axis: AxisConfig,
  bounds: { left: number; right: number; top: number; bottom: number }
): number {
  const ratio = (axis.yMaxSemi - semi) / axis.yRangeSemi
  return bounds.top + ratio * (bounds.bottom - bounds.top)
}
