export interface PitchTrackerConfig {
  sampleRate: number
  windowSize?: number
  hopSize?: number
  minHz?: number
  maxHz?: number
  silenceRms?: number
  confidenceMin?: number
  medianWindow?: number
  emaAlpha?: number
}

const DEFAULTS = {
  windowSize: 4096,
  hopSize: 1024,
  minHz: 80,
  maxHz: 1000,
  silenceRms: 0.015,
  confidenceMin: 0.35,
  medianWindow: 7,
  emaAlpha: 0.25
} as const

export class PitchTracker {
  private readonly sampleRate: number

  private readonly windowSize: number

  private readonly hopSize: number

  private readonly minHz: number

  private readonly maxHz: number

  private readonly silenceRms: number

  private readonly confidenceMin: number

  private readonly medianWindow: number

  private readonly emaAlpha: number

  private recent: number[] = []

  private ema: number | null = null

  private readonly buffer: Float32Array

  private bufferFill = 0

  public constructor(config: PitchTrackerConfig) {
    this.sampleRate = config.sampleRate
    this.windowSize = config.windowSize ?? DEFAULTS.windowSize
    this.hopSize = config.hopSize ?? DEFAULTS.hopSize
    this.minHz = config.minHz ?? DEFAULTS.minHz
    this.maxHz = config.maxHz ?? DEFAULTS.maxHz
    this.silenceRms = config.silenceRms ?? DEFAULTS.silenceRms
    this.confidenceMin = config.confidenceMin ?? DEFAULTS.confidenceMin
    this.medianWindow = config.medianWindow ?? DEFAULTS.medianWindow
    this.emaAlpha = config.emaAlpha ?? DEFAULTS.emaAlpha
    this.buffer = new Float32Array(this.windowSize)
  }

  public get silenceThreshold(): number {
    return this.silenceRms
  }

  public reset(): void {
    this.recent = []
    this.ema = null
    this.bufferFill = 0
    this.buffer.fill(0)
  }

  public process(block: Float32Array): number | null {
    if (block.length === 0) {
      return null
    }

    const rms = computeRms(block)
    if (rms < this.silenceRms) {
      this.reset()
      return null
    }

    this.push(block)
    if (this.bufferFill < this.windowSize) {
      return null
    }

    const { hz, confidence } = autocorrelationPitch(
      this.buffer,
      this.sampleRate,
      this.minHz,
      this.maxHz
    )

    if (hz === null || confidence < this.confidenceMin) {
      this.recent = []
      this.ema = null
      return null
    }

    this.recent.push(hz)
    if (this.recent.length > this.medianWindow) {
      this.recent.shift()
    }

    const median = computeMedian(this.recent)
    if (this.ema === null) {
      this.ema = median
    } else {
      this.ema = this.emaAlpha * median + (1 - this.emaAlpha) * this.ema
    }

    return this.ema
  }

  private push(block: Float32Array): void {
    if (block.length >= this.windowSize) {
      this.buffer.set(block.slice(block.length - this.windowSize))
      this.bufferFill = this.windowSize
      return
    }

    if (this.bufferFill < this.windowSize) {
      const take = Math.min(this.windowSize - this.bufferFill, block.length)
      this.buffer.set(block.slice(block.length - take), this.bufferFill)
      this.bufferFill += take
      return
    }

    const hop = Math.min(this.hopSize, block.length)
    this.buffer.copyWithin(0, hop)
    this.buffer.set(block.slice(block.length - hop), this.windowSize - hop)
  }
}

function computeRms(data: Float32Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i]
  }
  return Math.sqrt(sum / Math.max(1, data.length))
}

function computeMedian(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[mid]
  }
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function autocorrelationPitch(
  frame: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number
): { hz: number | null; confidence: number } {
  const n = frame.length
  if (n < 4) {
    return { hz: null, confidence: 0 }
  }

  let mean = 0
  for (let i = 0; i < n; i += 1) {
    mean += frame[i]
  }
  mean /= n

  const windowed = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
    windowed[i] = (frame[i] - mean) * hann
  }

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz))
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / minHz))
  if (maxLag <= minLag) {
    return { hz: null, confidence: 0 }
  }

  let r0 = 0
  for (let i = 0; i < n; i += 1) {
    r0 += windowed[i] * windowed[i]
  }
  if (r0 <= 1e-8) {
    return { hz: null, confidence: 0 }
  }

  let bestLag = -1
  let bestValue = -Infinity

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let sum = 0
    for (let i = 0; i < n - lag; i += 1) {
      sum += windowed[i] * windowed[i + lag]
    }
    const normalized = sum / r0
    if (normalized > bestValue) {
      bestValue = normalized
      bestLag = lag
    }
  }

  if (bestLag <= 0) {
    return { hz: null, confidence: 0 }
  }

  const lag0 = Math.max(minLag, bestLag - 1)
  const lag2 = Math.min(maxLag, bestLag + 1)
  const y0 = correlationAtLag(windowed, lag0) / r0
  const y1 = correlationAtLag(windowed, bestLag) / r0
  const y2 = correlationAtLag(windowed, lag2) / r0
  const denom = y0 - 2 * y1 + y2
  let lag = bestLag
  if (Math.abs(denom) > 1e-8) {
    lag = bestLag + 0.5 * ((y0 - y2) / denom)
  }

  if (lag <= 0) {
    return { hz: null, confidence: 0 }
  }

  const hz = sampleRate / lag
  if (hz < minHz || hz > maxHz) {
    return { hz: null, confidence: clamp(bestValue, 0, 1) }
  }

  const bonus = octaveSanityBonus(windowed, minLag, bestLag)
  return {
    hz,
    confidence: clamp(bestValue, 0, 1) * bonus
  }
}

function correlationAtLag(data: Float32Array, lag: number): number {
  let sum = 0
  for (let i = 0; i < data.length - lag; i += 1) {
    sum += data[i] * data[i + lag]
  }
  return sum
}

function octaveSanityBonus(data: Float32Array, minLag: number, peakLag: number): number {
  const half = Math.floor(peakLag / 2)
  if (half <= minLag) {
    return 1
  }
  const peak = Math.abs(correlationAtLag(data, peakLag))
  const halfPeak = Math.abs(correlationAtLag(data, half))
  if (peak <= 1e-6) {
    return 0
  }
  const ratio = halfPeak / peak
  return clamp(1 - Math.min(0.5, Math.max(0, ratio - 0.55)), 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
