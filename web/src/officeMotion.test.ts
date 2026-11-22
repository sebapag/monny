import { describe, expect, it } from 'vitest'
import {
  FOCUS_DURATION,
  FOCUS_EASE_CSS,
  MODAL_FADE_MS,
  FOCUS_EASE,
} from './officeMotion'

describe('officeMotion', () => {
  it('keeps shared timing constants for dolly + modal sync', () => {
    expect(FOCUS_DURATION).toBeGreaterThan(1)
    expect(MODAL_FADE_MS).toBeGreaterThan(200)
    expect(FOCUS_EASE_CSS).toContain('cubic-bezier')
    expect(typeof FOCUS_EASE).toBe('function')
    expect(FOCUS_EASE(0)).toBe(0)
    expect(FOCUS_EASE(1)).toBe(1)
  })
})
