import { describe, expect, it } from 'vitest'
import { shouldAutoStopSinging } from '../app/autoStop'

describe('auto stop singing', () => {
  it('returns false before voiced start', () => {
    expect(
      shouldAutoStopSinging({
        hasVoiced: false,
        lastVoicedAt: null,
        nowSec: 2,
        minRecordSec: 1,
        silenceSec: 1
      })
    ).toBe(false)
  })

  it('returns false before min record duration', () => {
    expect(
      shouldAutoStopSinging({
        hasVoiced: true,
        lastVoicedAt: 0.2,
        nowSec: 0.7,
        minRecordSec: 1,
        silenceSec: 0.8
      })
    ).toBe(false)
  })

  it('returns true when silence threshold is reached after voiced segment', () => {
    expect(
      shouldAutoStopSinging({
        hasVoiced: true,
        lastVoicedAt: 1.5,
        nowSec: 2.6,
        minRecordSec: 1,
        silenceSec: 1
      })
    ).toBe(true)
  })
})
