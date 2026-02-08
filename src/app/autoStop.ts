export interface AutoStopInput {
  hasVoiced: boolean
  lastVoicedAt: number | null
  nowSec: number
  minRecordSec: number
  silenceSec: number
}

export function shouldAutoStopSinging(input: AutoStopInput): boolean {
  if (!input.hasVoiced || input.lastVoicedAt === null) {
    return false
  }
  if (input.nowSec < input.minRecordSec) {
    return false
  }
  return input.nowSec - input.lastVoicedAt >= input.silenceSec
}
