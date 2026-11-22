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
  it('auto prefers light only when WebGL is missing', () => {
    expect(autoPrefersLight(capable)).toBe(false)
    // Software / low GPU still get full 3D (market: 3D for everyone).
    expect(autoPrefersLight(weak)).toBe(false)
    expect(autoPrefersLight(noGl)).toBe(true)
    expect(
      autoPrefersLight({ webgl: true, reducedMotion: true, lowCapability: false }),
    ).toBe(false)
  })

  it('honors full / light override; auto follows WebGL only', () => {
    expect(resolvePresentation('full', noGl)).toBe('full')
    expect(resolvePresentation('light', capable)).toBe('light')
    expect(resolvePresentation('auto', capable)).toBe('full')
    expect(resolvePresentation('auto', weak)).toBe('full')
    expect(resolvePresentation('auto', noGl)).toBe('light')
  })
})
