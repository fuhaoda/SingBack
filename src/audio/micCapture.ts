import { PitchTracker } from './pitchTracker'
import { SAMPLE_RATE_FALLBACK } from '../config/defaults'

export interface MicFrame {
  t: number
  block: Float32Array
  rms: number
  hz: number | null
}

export type MicFrameHandler = (frame: MicFrame) => void

export class MicCapture {
  private ctx: AudioContext | null = null

  private stream: MediaStream | null = null

  private source: MediaStreamAudioSourceNode | null = null

  private processor: ScriptProcessorNode | null = null

  private muteGain: GainNode | null = null

  private tracker: PitchTracker | null = null

  private clock = 0

  public get sampleRate(): number {
    return this.ctx?.sampleRate ?? SAMPLE_RATE_FALLBACK
  }

  public async start(handler: MicFrameHandler): Promise<void> {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) {
        throw new Error('AudioContext is not supported in this browser')
      }
      this.ctx = new Ctor()
    }

    if (this.ctx.state !== 'running') {
      await this.ctx.resume()
    }

    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
    }

    this.clock = 0
    this.tracker = new PitchTracker({ sampleRate: this.sampleRate })

    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(1024, 1, 1)
    this.muteGain = this.ctx.createGain()
    this.muteGain.gain.value = 0

    this.processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0)
      const block = new Float32Array(input)
      const rms = computeRms(block)
      const hz = this.tracker?.process(block) ?? null
      this.clock += block.length / this.sampleRate
      handler({
        t: this.clock,
        block,
        rms,
        hz
      })
    }

    this.source.connect(this.processor)
    this.processor.connect(this.muteGain)
    this.muteGain.connect(this.ctx.destination)
  }

  public stop(): void {
    if (this.processor) {
      this.processor.disconnect()
      this.processor.onaudioprocess = null
      this.processor = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.muteGain) {
      this.muteGain.disconnect()
      this.muteGain = null
    }
    if (this.tracker) {
      this.tracker.reset()
    }
  }

  public async dispose(): Promise<void> {
    this.stop()
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    if (this.ctx) {
      await this.ctx.close()
      this.ctx = null
    }
  }
}

function computeRms(data: Float32Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i] * data[i]
  }
  return Math.sqrt(sum / Math.max(1, data.length))
}
