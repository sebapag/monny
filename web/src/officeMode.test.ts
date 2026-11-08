import { describe, expect, it } from 'vitest'
import { autoPrefersLight, resolvePresentation, type OfficeCapability } from './officeMode'

const capable: OfficeCapability = {
  webgl: true,
  reducedMotion: false,
  lowCapability: false,
}

const weak: OfficeCapability = {
  webgl: true,
  reducedMotion: false,
  lowCapability: true,
}

const noGl: OfficeCapability = {
  webgl: false,
  reducedMotion: false,
  lowCapability: true,
}

describe('office presentation modes', () => {
  it('auto prefers light on weak / no WebGL / reduced motion', () => {
    expect(autoPrefersLight(capable)).toBe(false)
    expect(autoPrefersLight(weak)).toBe(true)
    expect(autoPrefersLight(noGl)).toBe(true)
    expect(
      autoPrefersLight({ webgl: true, reducedMotion: true, lowCapability: false }),
    ).toBe(true)
  })

  it('honors full / light override; auto follows capability', () => {
    expect(resolvePresentation('full', noGl)).toBe('full')
    expect(resolvePresentation('light', capable)).toBe('light')
    expect(resolvePresentation('auto', capable)).toBe('full')
    expect(resolvePresentation('auto', weak)).toBe('light')
  })
})
