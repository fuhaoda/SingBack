import { describe, expect, it } from 'vitest'
import { buildAxisConfig, hzToSemi, interpolateTargetHz } from '../chart/axis'

describe('chart axis helpers', () => {
  it('creates consistent axis bounds from exercise band', () => {
    const axis = buildAxisConfig(
      {
        id: 'x',
        durationSec: 4,
        target: [
          { t: 0, hz: 220 },
          { t: 4, hz: 220 }
        ],
        bandLow: 180,
        bandHigh: 360,
        difficulty: 'L1'
      },
      130.8
    )

    expect(axis.yMaxSemi).toBeGreaterThan(axis.yMinSemi)
    expect(axis.yRangeSemi).toBeCloseTo(axis.yMaxSemi - axis.yMinSemi)
  })

  it('interpolates target hz between points', () => {
    const hz = interpolateTargetHz(
      [
        { t: 0, hz: 200 },
        { t: 1, hz: 300 }
      ],
      0.25
    )
    expect(hz).toBeCloseTo(225)
  })

  it('converts hz to semitone offset around do', () => {
    expect(hzToSemi(261.6, 130.8)).toBeCloseTo(12)
  })
})
