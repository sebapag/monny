import type { OfficeMode } from './api'

export type OfficeCapability = {
  webgl: boolean
  reducedMotion: boolean
  lowCapability: boolean
}

/**
 * Probe browser capability for the office twin.
 * Prefer light when WebGL is missing/unreliable, motion is reduced, or the
 * GPU path looks weak (software / major performance caveat).
 */
export function probeOfficeCapability(
  win: Window & typeof globalThis = window,
): OfficeCapability {
  const reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches

  let webgl = false
  let lowCapability = false
  try {
    const canvas = win.document.createElement('canvas')
    const attrs = {
      alpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      powerPreference: 'default' as WebGLPowerPreference,
      failIfMajorPerformanceCaveat: true,
    }
    let gl =
      (canvas.getContext('webgl', attrs) as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl', attrs) as WebGLRenderingContext | null)

    if (!gl) {
      // Retry without the performance caveat so we can still offer full 3D
      // when the user/admin forces it; mark as low capability for auto.
      const softAttrs = { ...attrs, failIfMajorPerformanceCaveat: false }
      gl =
        (canvas.getContext('webgl', softAttrs) as WebGLRenderingContext | null) ||
        (canvas.getContext('experimental-webgl', softAttrs) as WebGLRenderingContext | null)
      if (gl) {
        webgl = true
        lowCapability = true
      }
    } else {
      webgl = true
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '')
        if (/swiftshader|llvmpipe|software|microsoft basic render/i.test(renderer)) {
          lowCapability = true
        }
      }
      const lose = gl.getExtension('WEBGL_lose_context')
      // Keep context alive for the real Canvas; dispose probe only.
      lose?.loseContext()
    }
  } catch {
    webgl = false
    lowCapability = true
  }

  return { webgl, reducedMotion, lowCapability }
}

/** Auto prefers light when capability is weak; never traps the user. */
export function autoPrefersLight(cap: OfficeCapability): boolean {
  return !cap.webgl || cap.reducedMotion || cap.lowCapability
}

/**
 * Resolve which presentation to show.
 * - light / full: honor preference (full may still fall back after Canvas error)
 * - auto: prefer light on weak capability, else full
 */
export function resolvePresentation(
  mode: OfficeMode,
  cap: OfficeCapability,
): 'full' | 'light' {
  if (mode === 'light') return 'light'
  if (mode === 'full') return 'full'
  return autoPrefersLight(cap) ? 'light' : 'full'
}
