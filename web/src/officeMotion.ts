/**
 * Office SPA motion — anime.js for DOM overlays; R3F keeps its own camera tween.
 *
 * Choice (see docs/ui-office3d.md):
 * - anime.js drives modal fade/rise, focus-bar enter, and Leggera floorplan pan/zoom.
 * - Completa camera dolly stays in ScriptedCamera (useFrame + smootherstep) — better for
 *   mid-flight reverses and Three.js Vector3/FOV without fighting the render loop.
 */
import { animate, cubicBezier } from 'animejs'

/** Calm dolly in/out (seconds) — premium ease, no snaps. */
export const FOCUS_DURATION = 1.55
/** Modal enter/leave synced with the end of the dolly. */
export const MODAL_FADE_MS = 560
/** Soft ease-in-out without overshoot (CSS twin / vars use the same curve). */
export const FOCUS_EASE_CSS = 'cubic-bezier(0.45, 0.05, 0.25, 1)'
/** anime.js easing matching FOCUS_EASE_CSS. */
export const FOCUS_EASE = cubicBezier(0.45, 0.05, 0.25, 1)

export type LightFocusTransform = { x: number; y: number; scale: number }

type Animatable = {
  pause: () => unknown
}

export type MotionHandle = Animatable | null

const OVERVIEW_XF: LightFocusTransform = { x: 0, y: 0, scale: 1 }

export function cancelMotion(anim: MotionHandle) {
  if (!anim) return
  try {
    anim.pause()
  } catch {
    /* ignore */
  }
}

function parallel(anims: Animatable[]): MotionHandle {
  if (anims.length === 0) return null
  return {
    pause: () => {
      for (const a of anims) a.pause()
    },
  }
}

/**
 * Soft backdrop + panel enter.
 * Backdrop animates background alpha (not element opacity) so the dialog stays
 * a11y-visible as soon as it mounts — important for tests and screen readers.
 */
export function playDeptFocusEnter(
  backdrop: HTMLElement,
  panel: HTMLElement,
  reduceMotion: boolean,
): MotionHandle {
  backdrop.style.opacity = '1'
  if (reduceMotion) {
    backdrop.style.backgroundColor = 'rgba(10, 21, 48, 0.4)'
    panel.style.opacity = '1'
    panel.style.transform = 'translateY(0px) scale(1)'
    return null
  }
  backdrop.style.backgroundColor = 'rgba(10, 21, 48, 0)'
  panel.style.opacity = '0'
  panel.style.transform = 'translateY(14px) scale(0.975)'
  return parallel([
    animate(backdrop, {
      backgroundColor: 'rgba(10, 21, 48, 0.4)',
      duration: MODAL_FADE_MS,
      ease: FOCUS_EASE,
      composition: 'replace',
    }),
    animate(panel, {
      opacity: 1,
      translateY: 0,
      scale: 1,
      duration: MODAL_FADE_MS + 40,
      ease: FOCUS_EASE,
      composition: 'replace',
    }),
  ])
}

/** Soft leave while camera dollies back. */
export function playDeptFocusLeave(
  backdrop: HTMLElement,
  panel: HTMLElement,
  reduceMotion: boolean,
): MotionHandle {
  if (reduceMotion) {
    backdrop.style.backgroundColor = 'rgba(10, 21, 48, 0)'
    panel.style.opacity = '0'
    panel.style.transform = 'translateY(10px) scale(0.98)'
    return null
  }
  return parallel([
    animate(backdrop, {
      backgroundColor: 'rgba(10, 21, 48, 0)',
      duration: MODAL_FADE_MS,
      ease: FOCUS_EASE,
      composition: 'replace',
    }),
    animate(panel, {
      opacity: 0,
      translateY: 10,
      scale: 0.98,
      duration: MODAL_FADE_MS,
      ease: FOCUS_EASE,
      composition: 'replace',
    }),
  ])
}

/** Focus chrome bar — fade in when a department is selected. */
export function playFocusBarEnter(el: HTMLElement, reduceMotion: boolean): MotionHandle {
  if (reduceMotion) {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0px)'
    return null
  }
  el.style.opacity = '0'
  el.style.transform = 'translateY(-6px)'
  return animate(el, {
    opacity: 1,
    translateY: 0,
    duration: 480,
    ease: FOCUS_EASE,
    composition: 'replace',
  })
}

/**
 * Leggera floorplan pan/zoom — same duration as Completa dolly.
 * Cancels any previous handle so mid-flight focus changes stay continuous.
 */
export function playLightFloorplanFocus(
  el: HTMLElement,
  to: LightFocusTransform | null,
  reduceMotion: boolean,
  previous?: MotionHandle,
): MotionHandle {
  cancelMotion(previous ?? null)
  const target = to ?? OVERVIEW_XF
  const next = `translate(${target.x}%, ${target.y}%) scale(${target.scale})`
  if (reduceMotion) {
    el.style.transform = next
    return null
  }
  const from = el.style.transform || 'translate(0%, 0%) scale(1)'
  return animate(el, {
    transform: [from, next],
    duration: FOCUS_DURATION * 1000,
    ease: FOCUS_EASE,
    composition: 'replace',
  })
}
