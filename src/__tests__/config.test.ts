import { describe, expect, it } from 'vitest'
import { buildInitialSettings, KEY_OPTIONS } from '../config/defaults'

describe('config defaults', () => {
  it('uses key 1=C as default', () => {
    const settings = buildInitialSettings()
    expect(settings.keySemitone).toBe(0)
  })

  it('keeps key option labels in tune_coach order', () => {
    const labels = KEY_OPTIONS.map((item) => item.label)
    expect(labels).toEqual([
      '1=C',
      '1=C#/Db',
      '1=D',
      '1=D#/Eb',
      '1=E',
      '1=F',
      '1=F#/Gb',
      '1=G',
      '1=G#/Ab',
      '1=A',
      '1=A#/Bb',
      '1=B'
    ])
    expect(KEY_OPTIONS.map((item) => item.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })
})
