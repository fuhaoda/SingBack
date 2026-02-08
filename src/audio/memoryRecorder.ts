export class MemoryRecorder {
  private readonly sampleRate: number

  private readonly maxSamples: number

  private chunks: Float32Array[] = []

  private totalSamples = 0

  public constructor(sampleRate: number, maxSeconds: number) {
    this.sampleRate = sampleRate
    this.maxSamples = Math.floor(sampleRate * maxSeconds)
  }

  public clear(): void {
    this.chunks = []
    this.totalSamples = 0
  }

  public push(block: Float32Array): void {
    if (block.length === 0) {
      return
    }
    this.chunks.push(new Float32Array(block))
    this.totalSamples += block.length

    while (this.totalSamples > this.maxSamples && this.chunks.length > 0) {
      const overflow = this.totalSamples - this.maxSamples
      const first = this.chunks[0]
      if (first.length <= overflow) {
        this.chunks.shift()
        this.totalSamples -= first.length
      } else {
        this.chunks[0] = first.slice(overflow)
        this.totalSamples -= overflow
      }
    }
  }

  public toClip(): Float32Array {
    const merged = new Float32Array(this.totalSamples)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    return merged
  }

  public get durationSeconds(): number {
    return this.totalSamples / this.sampleRate
  }
}
