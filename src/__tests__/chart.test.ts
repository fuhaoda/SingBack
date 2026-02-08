import { describe, expect, it } from 'vitest'
import {
  buildAxisConfig,
  hzToSemi,
  interpolateTargetHz,
  semitoneToJianpuLabel,
  semitoneToJianpuParts
} from '../chart/axis'
import type { NoteEvent } from '../types'

describe('chart axis helpers', () => {
  it('creates consistent axis bounds from exercise band', () => {
    const notes: NoteEvent[] = [
      {
        idx: 0,
        start: 0,
        end: 4,
        hz: 220,
        semi: 0,
        jianpu: '1',
        inCoreZone: true
      }
    ]
    const axis = buildAxisConfig(
      {
        id: 'x',
        durationSec: 4,
        target: [
          { t: 0, hz: 220 },
          { t: 4, hz: 220 }
        ],
        notes,
        effectiveDoHz: 130.8,
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

  it('formats semitone labels as jianpu with accidentals and octave dots', () => {
    expect(semitoneToJianpuLabel(0)).toBe('1')
    expect(semitoneToJianpuLabel(1)).toBe('#1')
    expect(semitoneToJianpuLabel(14)).toBe('2\u0307')
    expect(semitoneToJianpuLabel(-7)).toBe('4\u0323')
  })

  it('returns jianpu dot metadata for canvas rendering', () => {
    expect(semitoneToJianpuParts(14)).toEqual({
      base: '2',
      upperDots: 1,
      lowerDots: 0
    })
    expect(semitoneToJianpuParts(-7)).toEqual({
      base: '4',
      upperDots: 0,
      lowerDots: 1
    })
  })
})
