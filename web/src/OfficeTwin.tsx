import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, RoundedBox } from '@react-three/drei'
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  CanvasTexture,
  Color,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  PerspectiveCamera,
  type Camera,
  type Group,
  type MeshStandardMaterial,
  type PointLight as PointLightType,
  type Texture,
} from 'three'
import type { Approval, AuditEvent, OfficeMode, SubscriptionSkills, TimelineStep } from './api'
import { DeptFocusModal } from './DeptFocusModal'
import { bumpOfficeFocusCount } from './deptFocus'
import { DEPARTMENTS, type DeptId } from './depts'
import { isDeptEnabled, lockedHintIt } from './entitlements'
import type { RoomLightState } from './lights'
import {
  probeOfficeCapability,
  resolvePresentation,
  type OfficeCapability,
} from './officeMode'

/** Soft Notion pastels — always readable, brighter when lit. */
type RoomLayout = {
  id: DeptId
  /** English 3D hotspot label (Italian kept in dept panels / UI copy). */
  label: string
  hotspot: number
  position: [number, number, number]
  size: [number, number, number]
  floor: string
  floorLit: string
  wall: string
  accent: string
  people: number
}

const ROOMS: RoomLayout[] = [
  {
    id: 'direzione',
    label: 'Leadership',
    hotspot: 1,
    position: [0, 0.04, 4.4],
    size: [5.4, 0.1, 2.7],
    floor: '#fef7d6',
    floorLit: '#f9e79f',
    wall: '#f7f0e4',
    accent: '#f5d75e',
    people: 2,
  },
  {
    id: 'spend',
    label: 'Media',
    hotspot: 2,
    position: [-4.8, 0.04, 1.15],
    size: [3.8, 0.1, 3.0],
    floor: '#dcecfa',
    floorLit: '#b8daf5',
    wall: '#eaf3fb',
    accent: '#7eb8e8',
    people: 2,
  },
  {
    id: 'seo',
    label: 'SEO',
    hotspot: 3,
    position: [4.8, 0.04, 1.15],
    size: [3.8, 0.1, 3.0],
    floor: '#d9f3e1',
    floorLit: '#b6e6c6',
    wall: '#e8f6ed',
    accent: '#6fbf8f',
    people: 2,
  },
  {
    id: 'shopify',
    label: 'Commerce',
    hotspot: 4,
    position: [-4.8, 0.04, -2.15],
    size: [3.8, 0.1, 2.8],
    floor: '#ffe8d4',
    floorLit: '#ffd4b0',
    wall: '#fff2e8',
    accent: '#f0a878',
    people: 2,
  },
  {
    id: 'lead',
    label: 'Leads',
    hotspot: 5,
    position: [4.8, 0.04, -2.15],
    size: [3.8, 0.1, 2.8],
    floor: '#fde0ec',
    floorLit: '#f7c5d9',
    wall: '#fef1f6',
    accent: '#e890b8',
    people: 2,
  },
  {
    id: 'ops',
    label: 'Operations',
    hotspot: 6,
    position: [-5.7, 0.04, -5.55],
    size: [3.4, 0.1, 2.6],
    floor: '#f3e6d0',
    floorLit: '#e8d4ae',
    wall: '#f7efe3',
    accent: '#d4a86a',
    people: 2,
  },
  {
    id: 'design',
    label: 'Design',
    hotspot: 7,
    position: [-1.9, 0.04, -5.55],
    size: [3.4, 0.1, 2.6],
    floor: '#e8e0f5',
    floorLit: '#d2c6ef',
    wall: '#f1ecfa',
    accent: '#a78bcf',
    people: 2,
  },
  {
    id: 'it',
    label: 'IT',
    hotspot: 8,
    position: [1.9, 0.04, -5.55],
    size: [3.4, 0.1, 2.6],
    floor: '#dce4f0',
    floorLit: '#c2cedf',
    wall: '#e8eef6',
    accent: '#7a92b0',
    people: 2,
  },
  {
    id: 'controlling',
    label: 'Controlling',
    hotspot: 9,
    position: [5.7, 0.04, -5.55],
    size: [3.4, 0.1, 2.6],
    floor: '#e2edd8',
    floorLit: '#c9dfb8',
    wall: '#eef5e8',
    accent: '#7fad6e',
    people: 2,
  },
]

/** Warm structure palette — no sterile grey slabs. */
const WOOD = '#c4a574'
const WOOD_DARK = '#9a7b52'
const CREAM = '#f5efe6'
const SAND = '#ebe4d8'
const BLUSH_WALL = '#efe6f2'
const CHAIR = '#5b6ea8'
const DESK_TOP = '#e8d9c4'
const SHELF = '#d9c7ae'
const GLASS = '#d7eef5'

const MATTE = { roughness: 1, metalness: 0 } as const
const SOFT = { roughness: 0.72, metalness: 0.08 } as const
/** Seconds-ish easing: higher = snappier. ~3.2 ≈ soft 0.6–0.8s feel. */
const EASE = 3.2

/** Overview framing — city + full floor (no free orbit). */
const OVERVIEW_POS: [number, number, number] = [13.6, 14.4, 15.4]
const OVERVIEW_LOOK: [number, number, number] = [0, 0.35, -0.6]
const OVERVIEW_FOV = 38
const FOCUS_FOV = 33.2
/** Calm dolly in/out (seconds) — premium ease, no snaps. */
export const FOCUS_DURATION = 1.55
/** Modal enter/leave synced with the end of the dolly. */
export const MODAL_FADE_MS = 560
/** Soft ease-in-out without overshoot (CSS twin uses the same curve). */
export const FOCUS_EASE_CSS = 'cubic-bezier(0.45, 0.05, 0.25, 1)'

/** Ken Perlin smootherstep — gentler accel/decel than smoothstep. */
function smootherstep(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** Scripted close-up for one room — same isometric bias, shorter distance. */
function focusFraming(room: RoomLayout): { pos: Vector3; look: Vector3 } {
  const [hx, , hz] = room.position
  const look = new Vector3(hx, 0.42, hz)
  const overviewPos = new Vector3(...OVERVIEW_POS)
  const overviewLook = new Vector3(...OVERVIEW_LOOK)
  const dir = overviewPos.clone().sub(overviewLook).normalize()
  const span = Math.max(room.size[0], room.size[2])
  const dist = 5.35 + span * 0.52
  const pos = look.clone().add(dir.multiplyScalar(dist))
  pos.y = Math.min(Math.max(pos.y * 0.78, 5.1), 9.0)
  return { pos, look }
}

/**
 * Leggera (2D) focus offsets — scale + translate so the selected room
 * fills the stage (percent of floorplan size).
 */
const LIGHT_FOCUS: Record<DeptId, { x: number; y: number; scale: number }> = {
  direzione: { x: 0, y: 32, scale: 1.72 },
  spend: { x: 26, y: 10, scale: 1.95 },
  seo: { x: -26, y: 10, scale: 1.95 },
  shopify: { x: 26, y: -6, scale: 1.95 },
  lead: { x: -26, y: -6, scale: 1.95 },
  ops: { x: 34, y: -28, scale: 2.05 },
  design: { x: 12, y: -28, scale: 2.05 },
  it: { x: -12, y: -28, scale: 2.05 },
  controlling: { x: -34, y: -28, scale: 2.05 },
}

/** Light oak plank floor — procedural canvas texture. */
function makeWoodFloorTexture(): Texture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#d8c3a3'
  ctx.fillRect(0, 0, size, size)
  const plankH = 42
  for (let y = 0, row = 0; y < size; y += plankH, row++) {
    const offset = (row % 2) * 28
    for (let x = -offset; x < size + 80; x += 86) {
      const tone = 190 + ((row * 17 + x * 3) % 28)
      ctx.fillStyle = `rgb(${tone}, ${tone - 28}, ${tone - 58})`
      ctx.fillRect(x + 1, y + 1, 84, plankH - 2)
      ctx.strokeStyle = 'rgba(120, 90, 55, 0.22)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y + 0.5, 85, plankH - 1)
      // Soft grain
      ctx.strokeStyle = 'rgba(90, 65, 40, 0.08)'
      for (let g = 0; g < 3; g++) {
        const gy = y + 8 + g * 10 + ((x + row) % 5)
        ctx.beginPath()
        ctx.moveTo(x + 4, gy)
        ctx.bezierCurveTo(x + 28, gy + 1, x + 55, gy - 1, x + 80, gy)
        ctx.stroke()
      }
    }
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.repeat.set(6.2, 5.4)
  tex.anisotropy = 4
  return tex
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function lightLevel(light: RoomLightState): number {
  if (light === 'on') return 1
  if (light === 'soft') return 0.38
  return 0
}

function FlatMat({
  color,
  emissive,
  emissiveIntensity = 0,
}: {
  color: string
  emissive?: string
  emissiveIntensity?: number
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive ?? '#000000'}
      emissiveIntensity={emissiveIntensity}
      {...MATTE}
    />
  )
}

/**
 * Scripted camera — overview by default; calm dolly into a room on focus.
 * No user orbit / pan / zoom (locked view).
 */
function ScriptedCamera({
  focusId,
  reduceMotion,
  onArrived,
}: {
  focusId: DeptId | null
  reduceMotion: boolean
  onArrived: (id: DeptId) => void
}) {
  const { camera } = useThree()
  const posCurrent = useRef(new Vector3(...OVERVIEW_POS))
  const lookCurrent = useRef(new Vector3(...OVERVIEW_LOOK))
  const fovCurrent = useRef(OVERVIEW_FOV)
  const anim = useRef<{
    fromPos: Vector3
    toPos: Vector3
    fromLook: Vector3
    toLook: Vector3
    fromFov: number
    toFov: number
    t: number
    id: DeptId | null
    notified: boolean
  } | null>(null)
  const arrivedRef = useRef(onArrived)
  const lastNotified = useRef<DeptId | null>(null)
  useEffect(() => {
    arrivedRef.current = onArrived
  }, [onArrived])

  useEffect(() => {
    const room = focusId ? ROOMS.find((r) => r.id === focusId) : null
    const target = room
      ? focusFraming(room)
      : { pos: new Vector3(...OVERVIEW_POS), look: new Vector3(...OVERVIEW_LOOK) }
    const targetFov = room ? FOCUS_FOV : OVERVIEW_FOV

    if (reduceMotion) {
      posCurrent.current.copy(target.pos)
      lookCurrent.current.copy(target.look)
      fovCurrent.current = targetFov
      camera.position.copy(target.pos)
      camera.lookAt(lookCurrent.current)
      if (camera instanceof PerspectiveCamera) {
        camera.fov = targetFov
        camera.updateProjectionMatrix()
      }
      anim.current = null
      if (focusId && lastNotified.current !== focusId) {
        lastNotified.current = focusId
        arrivedRef.current(focusId)
      }
      if (!focusId) lastNotified.current = null
      return
    }

    // Continue from the live pose so mid-flight reverses stay continuous (no snap).
    anim.current = {
      fromPos: posCurrent.current.clone(),
      toPos: target.pos.clone(),
      fromLook: lookCurrent.current.clone(),
      toLook: target.look.clone(),
      fromFov: fovCurrent.current,
      toFov: targetFov,
      t: 0,
      id: focusId,
      notified: false,
    }
    if (!focusId) lastNotified.current = null
  }, [focusId, reduceMotion, camera])

  useFrame((_, dt) => {
    const a = anim.current
    if (!a) return
    // Cap dt so a long frame (tab switch) never jumps the dolly.
    const step = Math.min(Math.max(dt, 0), 1 / 24)
    a.t = Math.min(1, a.t + step / FOCUS_DURATION)
    const e = smootherstep(a.t)
    posCurrent.current.lerpVectors(a.fromPos, a.toPos, e)
    lookCurrent.current.lerpVectors(a.fromLook, a.toLook, e)
    fovCurrent.current = lerp(a.fromFov, a.toFov, e)
    camera.position.copy(posCurrent.current)
    camera.lookAt(lookCurrent.current)
    if (camera instanceof PerspectiveCamera) {
      camera.fov = fovCurrent.current
      camera.updateProjectionMatrix()
    }
    if (a.t >= 1 && a.id && !a.notified) {
      a.notified = true
      lastNotified.current = a.id
      arrivedRef.current(a.id)
    }
  })

  return null
}

/** World → CSS pixel (rounded) for the Completa label overlay. */
const _proj = new Vector3()
function projectToCssPx(
  x: number,
  y: number,
  z: number,
  camera: Camera,
  width: number,
  height: number,
): { x: number; y: number } {
  _proj.set(x, y, z).project(camera)
  return {
    x: Math.round(_proj.x * (width / 2) + width / 2),
    y: Math.round(-_proj.y * (height / 2) + height / 2),
  }
}

type OverlayLabel = {
  id: DeptId
  hotspot: number
  label: string
  locked: boolean
  lit: boolean
  x: number
  y: number
}

type OverlayBadge = { x: number; y: number; count: number }

/**
 * Publishes fixed-camera label anchors to a DOM overlay sibling of the Canvas.
 * Avoids drei Html (fractional translate3d + React 19 portal unmount races).
 */
function LabelAnchorPublisher({
  lights,
  enabled,
  pendingTotal,
  onChange,
}: {
  lights: Record<DeptId, RoomLightState>
  enabled: SubscriptionSkills
  pendingTotal: number
  onChange: (labels: OverlayLabel[], badge: OverlayBadge | null) => void
}) {
  const lastKey = useRef('')
  useFrame(({ camera, size }) => {
    if (size.width < 8 || size.height < 8) return
    const labels: OverlayLabel[] = []
    let badge: OverlayBadge | null = null
    for (const room of ROOMS) {
      const [hx, , hz] = room.position
      const halfD = room.size[2] / 2
      const locked = !isDeptEnabled(room.id, enabled)
      const active = !locked && (lights[room.id] === 'on' || lights[room.id] === 'soft')
      const pt = projectToCssPx(hx, 1.72, hz + halfD * 0.18, camera, size.width, size.height)
      labels.push({
        id: room.id,
        hotspot: room.hotspot,
        label: room.label,
        locked,
        lit: active,
        x: pt.x,
        y: pt.y,
      })
      if (!locked && room.id === 'direzione' && pendingTotal > 0) {
        const b = projectToCssPx(
          hx + 1.05,
          1.85,
          hz + halfD * 0.15,
          camera,
          size.width,
          size.height,
        )
        badge = { x: b.x, y: b.y, count: pendingTotal }
      }
    }
    const key = JSON.stringify({ labels, badge })
    if (key === lastKey.current) return
    lastKey.current = key
    onChange(labels, badge)
  })
  return null
}

/** Crisp DOM chips over the WebGL stage (not Troika / canvas textures). */
function OfficeLabelOverlay({
  labels,
  badge,
  onSelect,
}: {
  labels: OverlayLabel[]
  badge: OverlayBadge | null
  onSelect: (id: DeptId) => void
}) {
  return (
    <div className="office-label-layer" data-testid="office-label-layer">
      {labels.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`office-label-chip${item.locked ? ' is-locked' : ''}${
            item.lit ? ' is-lit' : ''
          }`}
          style={{ left: item.x, top: item.y }}
          data-testid="office-room-label"
          title={item.locked ? lockedHintIt(item.id) : `Entra in ${item.label}`}
          aria-label={item.locked ? lockedHintIt(item.id) : `Entra in ${item.label}`}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(item.id)
          }}
        >
          <span className="office-label-chip-num">{item.hotspot}</span>
          <span className="office-label-chip-text">
            {item.locked ? `${item.label} · chiuso` : item.label}
          </span>
        </button>
      ))}
      {badge && (
        <span
          className="office-decision-count"
          style={{ left: badge.x, top: badge.y }}
          aria-hidden
        >
          {badge.count}
        </span>
      )}
    </div>
  )
}

/** Ease-in-out wave in [0,1] — calm bob without hard snaps. */
function easeWave(t: number) {
  return 0.5 - 0.5 * Math.cos(t)
}

/** Stylized person — slow idle bob, slightly livelier when lit, staggered phases. */
function Ometto({
  position,
  accent,
  active,
  phase = 0,
  reduceMotion,
}: {
  position: [number, number, number]
  accent: string
  active: boolean
  phase?: number
  reduceMotion: boolean
}) {
  const ref = useRef<Group>(null)
  const shirtMat = useRef<MeshStandardMaterial>(null)
  const armL = useRef<MeshStandardMaterial>(null)
  const armR = useRef<MeshStandardMaterial>(null)
  const activity = useRef(active ? 1 : 0)
  const idleColor = useMemo(() => new Color('#ffffff'), [])
  const accentColor = useMemo(() => new Color(accent), [accent])
  const black = useMemo(() => new Color('#000000'), [])
  const tmp = useMemo(() => new Color(), [])

  useFrame(({ clock }, dt) => {
    const target = active ? 1 : 0
    const k = reduceMotion ? 1 : 1 - Math.exp(-EASE * dt)
    activity.current = lerp(activity.current, target, k)
    const a = activity.current

    if (ref.current) {
      // ~2.5–3× slower than before; idle calm, active only a bit livelier
      const speed = lerp(0.36, 0.88, a)
      const amp = reduceMotion ? 0 : lerp(0.016, 0.038, a)
      const t = clock.elapsedTime * speed + phase
      const bob = (easeWave(t) * 2 - 1) * amp
      ref.current.position.y = position[1] + bob
      ref.current.position.x = position[0]
      ref.current.position.z =
        position[2] +
        (reduceMotion
          ? 0
          : Math.sin(clock.elapsedTime * lerp(0.22, 0.55, a) + phase * 1.37) *
            lerp(0.012, 0.028, a))
      ref.current.rotation.y = reduceMotion
        ? 0
        : Math.sin(clock.elapsedTime * lerp(0.32, 0.72, a) + phase * 0.9) *
          lerp(0.05, 0.11, a)
    }

    tmp.copy(idleColor).lerp(accentColor, a)
    for (const mat of [shirtMat.current, armL.current, armR.current]) {
      if (!mat) continue
      mat.color.copy(tmp)
      mat.emissive.copy(black).lerp(accentColor, a)
      mat.emissiveIntensity = 0.22 * a
    }
  })

  const skin = '#f3d5b5'
  const pants = '#5d5b54'

  return (
    <group ref={ref} position={position}>
      <mesh position={[-0.07, 0.18, 0]}>
        <boxGeometry args={[0.1, 0.36, 0.1]} />
        <FlatMat color={pants} />
      </mesh>
      <mesh position={[0.07, 0.18, 0]}>
        <boxGeometry args={[0.1, 0.36, 0.1]} />
        <FlatMat color={pants} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[0.32, 0.38, 0.22]} />
        <meshStandardMaterial ref={shirtMat} color="#ffffff" {...MATTE} />
      </mesh>
      <mesh position={[-0.22, 0.5, 0]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[0.08, 0.32, 0.08]} />
        <meshStandardMaterial ref={armL} color="#ffffff" {...MATTE} />
      </mesh>
      <mesh position={[0.22, 0.5, 0]} rotation={[0, 0, -0.15]}>
        <boxGeometry args={[0.08, 0.32, 0.08]} />
        <meshStandardMaterial ref={armR} color="#ffffff" {...MATTE} />
      </mesh>
      <mesh position={[0, 0.82, 0]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <FlatMat color={skin} />
      </mesh>
    </group>
  )
}

/** Contemporary task chair — soft blue seat, slim base. */
function FlatChair({ position, rotY = 0 }: { position: [number, number, number]; rotY?: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <RoundedBox args={[0.34, 0.06, 0.34]} radius={0.03} position={[0, 0.3, 0]}>
        <meshStandardMaterial color={CHAIR} {...SOFT} />
      </RoundedBox>
      <RoundedBox args={[0.32, 0.38, 0.06]} radius={0.02} position={[0, 0.52, -0.14]}>
        <meshStandardMaterial color={CHAIR} {...SOFT} />
      </RoundedBox>
      <mesh position={[-0.14, 0.42, 0]}>
        <boxGeometry args={[0.04, 0.16, 0.22]} />
        <meshStandardMaterial color="#4a5a8c" {...SOFT} />
      </mesh>
      <mesh position={[0.14, 0.42, 0]}>
        <boxGeometry args={[0.04, 0.16, 0.22]} />
        <meshStandardMaterial color="#4a5a8c" {...SOFT} />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.035, 0.045, 0.26, 10]} />
        <FlatMat color={WOOD_DARK} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.03, 12]} />
        <FlatMat color="#8a7355" />
      </mesh>
    </group>
  )
}

function FlatDesk({
  position,
  accent,
  light = 'off',
}: {
  position: [number, number, number]
  accent: string
  light?: RoomLightState
}) {
  const screenMat = useRef<MeshStandardMaterial>(null)
  const litAmt = useRef(lightLevel(light))
  const accentCol = useMemo(() => new Color(accent), [accent])
  const idle = useMemo(() => new Color('#b8d4f0'), [])
  const tmp = useMemo(() => new Color(), [])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-EASE * dt)
    litAmt.current = lerp(litAmt.current, lightLevel(light), k)
    const lit = litAmt.current
    if (!screenMat.current) return
    tmp.copy(idle).lerp(accentCol, lit)
    screenMat.current.color.copy(tmp)
    screenMat.current.emissive.copy(accentCol)
    screenMat.current.emissiveIntensity = 0.18 + 0.58 * lit
  })

  return (
    <group position={position}>
      {/* Slim oak desktop */}
      <RoundedBox args={[1.12, 0.045, 0.55]} radius={0.015} position={[0, 0.42, 0]}>
        <meshStandardMaterial color={DESK_TOP} {...SOFT} />
      </RoundedBox>
      {/* Thin tapered legs */}
      {(
        [
          [-0.46, 0.2, 0.2],
          [0.46, 0.2, 0.2],
          [-0.46, 0.2, -0.2],
          [0.46, 0.2, -0.2],
        ] as [number, number, number][]
      ).map((p, i) => (
        <mesh key={i} position={p}>
          <cylinderGeometry args={[0.022, 0.028, 0.4, 8]} />
          <FlatMat color={WOOD_DARK} />
        </mesh>
      ))}
      {/* Slim monitor + stand */}
      <RoundedBox args={[0.52, 0.34, 0.03]} radius={0.01} position={[0, 0.68, -0.16]}>
        <meshStandardMaterial ref={screenMat} color="#b8d4f0" {...SOFT} />
      </RoundedBox>
      <mesh position={[0, 0.48, -0.14]}>
        <cylinderGeometry args={[0.03, 0.05, 0.1, 8]} />
        <FlatMat color="#6b6258" />
      </mesh>
      <FlatChair position={[0, 0, 0.46]} rotY={Math.PI} />
    </group>
  )
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.13, 0.1, 0.2, 12]} />
        <meshStandardMaterial color="#c9a888" {...SOFT} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.2, 6]} />
        <FlatMat color="#5f8a62" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.2, 12, 12]} />
        <FlatMat color="#5faf7f" />
      </mesh>
      <mesh position={[0.12, 0.58, 0.06]}>
        <sphereGeometry args={[0.13, 10, 10]} />
        <FlatMat color="#7ec994" />
      </mesh>
      <mesh position={[-0.1, 0.56, -0.08]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <FlatMat color="#4f9a6e" />
      </mesh>
    </group>
  )
}

/** Slim open shelving — warm wood, not grey cubes. */
function Cabinet({
  position,
  rotY = 0,
  wide = 0.7,
}: {
  position: [number, number, number]
  rotY?: number
  wide?: number
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[wide, 0.04, 0.3]} />
        <meshStandardMaterial color={SHELF} {...SOFT} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[wide, 0.04, 0.3]} />
        <meshStandardMaterial color={SHELF} {...SOFT} />
      </mesh>
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[wide, 0.04, 0.3]} />
        <meshStandardMaterial color={SHELF} {...SOFT} />
      </mesh>
      <mesh position={[-wide / 2 + 0.03, 0.3, 0]}>
        <boxGeometry args={[0.04, 0.58, 0.28]} />
        <FlatMat color={WOOD} />
      </mesh>
      <mesh position={[wide / 2 - 0.03, 0.3, 0]}>
        <boxGeometry args={[0.04, 0.58, 0.28]} />
        <FlatMat color={WOOD} />
      </mesh>
      {/* Accent books */}
      <mesh position={[-0.12, 0.4, 0]}>
        <boxGeometry args={[0.08, 0.16, 0.12]} />
        <FlatMat color="#7eb8e8" />
      </mesh>
      <mesh position={[-0.02, 0.39, 0]}>
        <boxGeometry args={[0.07, 0.14, 0.12]} />
        <FlatMat color="#e890b8" />
      </mesh>
      <mesh position={[0.08, 0.41, 0]}>
        <boxGeometry args={[0.07, 0.18, 0.12]} />
        <FlatMat color="#f5d75e" />
      </mesh>
    </group>
  )
}

function Whiteboard({
  position,
  rotY = 0,
  light = 'off',
  accent,
}: {
  position: [number, number, number]
  rotY?: number
  light?: RoomLightState
  accent: string
}) {
  const board = useRef<MeshStandardMaterial>(null)
  const litAmt = useRef(lightLevel(light))
  const accentCol = useMemo(() => new Color(accent), [accent])
  const idle = useMemo(() => new Color('#fffdf8'), [])
  const tmp = useMemo(() => new Color(), [])
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-EASE * dt)
    litAmt.current = lerp(litAmt.current, lightLevel(light), k)
    const lit = litAmt.current
    if (!board.current) return
    tmp.copy(idle).lerp(accentCol, lit * 0.35)
    board.current.color.copy(tmp)
    board.current.emissive.copy(accentCol)
    board.current.emissiveIntensity = 0.08 + 0.42 * lit
  })
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <RoundedBox args={[1.4, 0.86, 0.05]} radius={0.02} position={[0, 0, 0]}>
        <meshStandardMaterial color={WOOD} {...SOFT} />
      </RoundedBox>
      <RoundedBox args={[1.26, 0.72, 0.035]} radius={0.012} position={[0, 0, 0.03]}>
        <meshStandardMaterial ref={board} color="#fffdf8" {...SOFT} />
      </RoundedBox>
      <mesh position={[0.12, 0.14, 0.055]}>
        <boxGeometry args={[0.78, 0.09, 0.01]} />
        <FlatMat color="#dcecfa" />
      </mesh>
      <mesh position={[-0.16, -0.1, 0.055]}>
        <boxGeometry args={[0.55, 0.06, 0.01]} />
        <FlatMat color="#e6e0f5" />
      </mesh>
    </group>
  )
}

function Rug({
  position,
  size,
  color,
}: {
  position: [number, number, number]
  size: [number, number]
  color: string
}) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} {...MATTE} />
    </mesh>
  )
}

function MeetingTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.6, 0.05, 0.88]} radius={0.04} position={[0, 0.44, 0]}>
        <meshStandardMaterial color={DESK_TOP} {...SOFT} />
      </RoundedBox>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.07, 0.11, 0.4, 12]} />
        <FlatMat color={WOOD} />
      </mesh>
      <FlatChair position={[0, 0, 0.68]} rotY={Math.PI} />
      <FlatChair position={[-0.52, 0, -0.68]} />
      <FlatChair position={[0.52, 0, -0.68]} />
    </group>
  )
}

/** Soft lounge sofa for Leadership. */
function LoungeSofa({ position, rotY = 0 }: { position: [number, number, number]; rotY?: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <RoundedBox args={[1.2, 0.28, 0.48]} radius={0.06} position={[0, 0.28, 0]}>
        <meshStandardMaterial color="#d8c4e8" {...SOFT} />
      </RoundedBox>
      <RoundedBox args={[1.2, 0.36, 0.12]} radius={0.04} position={[0, 0.5, -0.18]}>
        <meshStandardMaterial color="#cbb6e0" {...SOFT} />
      </RoundedBox>
      <RoundedBox args={[0.12, 0.28, 0.42]} radius={0.03} position={[-0.54, 0.4, 0]}>
        <meshStandardMaterial color="#cbb6e0" {...SOFT} />
      </RoundedBox>
      <RoundedBox args={[0.12, 0.28, 0.42]} radius={0.03} position={[0.54, 0.4, 0]}>
        <meshStandardMaterial color="#cbb6e0" {...SOFT} />
      </RoundedBox>
    </group>
  )
}

/** Warm plaster body + glass-ish frosted top rail. */
function LowPartition({
  position,
  size,
  color = SAND,
}: {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
}) {
  const glassH = Math.min(0.22, size[1] * 0.28)
  const bodyH = size[1] - glassH
  return (
    <group position={position}>
      <mesh position={[0, -glassH / 2, 0]}>
        <boxGeometry args={[size[0], bodyH, size[2]]} />
        <meshStandardMaterial color={color} {...SOFT} />
      </mesh>
      <mesh position={[0, bodyH / 2 - 0.01, 0]}>
        <boxGeometry args={[size[0] * 0.98, glassH, size[2] * 0.7]} />
        <meshStandardMaterial
          color={GLASS}
          transparent
          opacity={0.45}
          roughness={0.25}
          metalness={0.15}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

const SKY_GLASS = '#c8e4f5'
const FRAME = WOOD_DARK

/** Modern office window — warm wood frame + soft daylight glass. */
function ExteriorWindow({
  position,
  rotY = 0,
  width = 1.35,
  height = 1.05,
}: {
  position: [number, number, number]
  rotY?: number
  width?: number
  height?: number
}) {
  const paneW = width - 0.12
  const paneH = height - 0.12
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      {/* Outer frame */}
      <mesh>
        <boxGeometry args={[width, height, 0.08]} />
        <meshStandardMaterial color={FRAME} {...SOFT} />
      </mesh>
      {/* Inner reveal */}
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[paneW + 0.04, paneH + 0.04, 0.04]} />
        <meshStandardMaterial color={WOOD} {...SOFT} />
      </mesh>
      {/* Sky-tinted glass with soft daylight emissive */}
      <mesh position={[0, 0, 0.05]}>
        <boxGeometry args={[paneW, paneH, 0.03]} />
        <meshStandardMaterial
          color={SKY_GLASS}
          emissive="#c5e6f8"
          emissiveIntensity={0.55}
          transparent
          opacity={0.78}
          roughness={0.16}
          metalness={0.04}
          depthWrite={false}
        />
      </mesh>
      {/* Mullion cross */}
      <mesh position={[0, 0, 0.065]}>
        <boxGeometry args={[0.04, paneH, 0.02]} />
        <FlatMat color={FRAME} />
      </mesh>
      <mesh position={[0, 0, 0.065]}>
        <boxGeometry args={[paneW, 0.04, 0.02]} />
        <FlatMat color={FRAME} />
      </mesh>
      {/* Soft sill */}
      <mesh position={[0, -height / 2 - 0.03, 0.04]}>
        <boxGeometry args={[width + 0.08, 0.05, 0.12]} />
        <meshStandardMaterial color={DESK_TOP} {...SOFT} />
      </mesh>
    </group>
  )
}

/** Slim interior glass panel between corridor and rooms. */
function InteriorGlass({
  position,
  rotY = 0,
  width = 1.1,
  height = 1.2,
}: {
  position: [number, number, number]
  rotY?: number
  width?: number
  height?: number
}) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[width, height, 0.04]} />
        <meshStandardMaterial color={FRAME} {...SOFT} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[width - 0.1, height - 0.1, 0.025]} />
        <meshStandardMaterial
          color={GLASS}
          emissive="#dff0f8"
          emissiveIntensity={0.18}
          transparent
          opacity={0.4}
          roughness={0.2}
          metalness={0.12}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/** Count badge + soft pulse ring when Direzione has pending decisions. */
function DecisionHotspotBadge({
  position,
  reduceMotion,
}: {
  position: [number, number, number]
  /** Count numeral is rendered by OfficeLabelOverlay. */
  count?: number
  reduceMotion: boolean
}) {
  const disc = useRef<MeshStandardMaterial>(null)
  const ring = useRef<MeshStandardMaterial>(null)
  useFrame(({ clock }) => {
    const pulse = reduceMotion
      ? 1
      : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.6))
    if (disc.current) disc.current.emissiveIntensity = 0.35 + 0.45 * pulse
    if (ring.current) {
      ring.current.opacity = 0.22 + 0.35 * pulse
      ring.current.emissiveIntensity = 0.4 * pulse
    }
  })
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.9, 0]}>
        <ringGeometry args={[0.55, 0.82, 36]} />
        <meshStandardMaterial
          ref={ring}
          color="#f5d75e"
          emissive="#f5d75e"
          emissiveIntensity={0.4}
          transparent
          opacity={0.4}
          depthWrite={false}
          {...MATTE}
        />
      </mesh>
      <Billboard>
        <mesh>
          <circleGeometry args={[0.3, 28]} />
          <meshStandardMaterial
            ref={disc}
            color="#5645d4"
            emissive="#5645d4"
            emissiveIntensity={0.6}
            {...MATTE}
          />
        </mesh>
      </Billboard>
      {/* Count numeral is drawn by OfficeLabelOverlay (DOM), not Troika Text */}
    </group>
  )
}

function RoomZone({
  room,
  light,
  locked,
  attentionCount = 0,
  onSelect,
  reduceMotion,
  focusId,
}: {
  room: RoomLayout
  light: RoomLightState
  locked: boolean
  attentionCount?: number
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
  /** When set, other rooms dim so the focused department reads clearly. */
  focusId: DeptId | null
}) {
  const [hx, , hz] = room.position
  const level = useRef(lightLevel(light))
  const dimAmt = useRef(0)
  const floorMat = useRef<MeshStandardMaterial>(null)
  const hotMat = useRef<MeshStandardMaterial>(null)
  const lamp = useRef<PointLightType>(null)
  const groupRef = useRef<Group>(null)
  const needsAttention = attentionCount > 0
  const isDimmed = Boolean(focusId && focusId !== room.id)
  const isFocus = focusId === room.id

  const floorIdle = useMemo(() => new Color(room.floor), [room.floor])
  const floorLit = useMemo(() => new Color(room.floorLit), [room.floorLit])
  const accent = useMemo(() => new Color(room.accent), [room.accent])
  const white = useMemo(() => new Color('#ffffff'), [])
  const lockedFloor = useMemo(() => new Color('#c8c4be'), [])
  const lockedHot = useMemo(() => new Color('#9a9690'), [])
  const lampWarm = useMemo(() => new Color('#fff8f0'), [])
  const dimTone = useMemo(() => new Color('#b8b2a8'), [])
  const tmp = useMemo(() => new Color(), [])

  const halfW = room.size[0] / 2
  const halfD = room.size[2] / 2
  const phaseBase = room.hotspot * 2.7

  const peopleOffsets = useMemo(() => {
    const offsets: [number, number, number][] = []
    for (let i = 0; i < room.people; i++) {
      const side = i % 2 === 0 ? -1 : 1
      offsets.push([hx + side * 0.55, 0, hz + (i < 2 ? 0.2 : -0.35)])
    }
    return offsets
  }, [hx, hz, room.people])

  useFrame(({ clock }, dt) => {
    const target = locked ? 0 : lightLevel(light)
    const k = reduceMotion ? 1 : 1 - Math.exp(-EASE * dt)
    level.current = lerp(level.current, target, k)
    dimAmt.current = lerp(dimAmt.current, isDimmed ? 1 : 0, reduceMotion ? 1 : k)
    let L = level.current
    if (needsAttention) {
      const pulse = reduceMotion
        ? 1
        : 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4))
      L = Math.max(L, pulse)
    }
    if (isFocus) L = Math.max(L, 0.55)

    if (groupRef.current) {
      // Soft visual dim for non-focused rooms (opacity via material paths below).
      groupRef.current.visible = true
    }

    if (floorMat.current) {
      tmp.copy(floorIdle).lerp(floorLit, L)
      if (locked) tmp.copy(floorIdle).lerp(lockedFloor, 0.45)
      if (dimAmt.current > 0.01) tmp.lerp(dimTone, dimAmt.current * 0.55)
      floorMat.current.color.copy(tmp)
      floorMat.current.emissive.copy(accent)
      floorMat.current.emissiveIntensity =
        (locked ? 0 : (needsAttention || isFocus ? 0.42 : 0.28) * L) * (1 - dimAmt.current * 0.85)
    }
    if (hotMat.current) {
      if (locked) {
        hotMat.current.color.copy(lockedHot)
        hotMat.current.emissive.copy(lockedHot)
      } else {
        tmp.copy(white).lerp(accent, L)
        hotMat.current.color.copy(tmp)
        hotMat.current.emissive.copy(tmp)
      }
      hotMat.current.emissiveIntensity =
        (locked ? 0.02 : lerp(0.05, needsAttention || isFocus ? 0.55 : 0.35, L)) *
        (1 - dimAmt.current * 0.9)
    }
    if (lamp.current) {
      lamp.current.intensity =
        (locked ? 0.02 : lerp(0.08, needsAttention || isFocus ? 1.45 : 1.1, L)) *
        (1 - dimAmt.current * 0.92)
      lamp.current.color.copy(lampWarm).lerp(accent, L)
    }
  })

  const active = (!locked && light === 'on') || needsAttention
  const rugColor =
    room.id === 'direzione'
      ? '#f3e7b0'
      : room.id === 'spend'
        ? '#c9dff3'
        : room.id === 'seo'
          ? '#c6e8d2'
          : room.id === 'shopify'
            ? '#ffd9c0'
            : room.id === 'lead'
              ? '#f5c9db'
              : room.id === 'ops'
                ? '#e8d5b5'
                : room.id === 'design'
                  ? '#d8cef0'
                  : room.id === 'it'
                    ? '#c8d4e4'
                    : '#cfe0c0'

  return (
    <group ref={groupRef}>
      <mesh
        position={room.position}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(room.id)
        }}
        onPointerOver={() => {
          document.body.style.cursor = locked ? 'not-allowed' : 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default'
        }}
      >
        <boxGeometry args={room.size} />
        <meshStandardMaterial ref={floorMat} color={room.floor} {...MATTE} />
      </mesh>

      {/* Soft rug so ometti sit in a furnished zone, not bare mat */}
      <Rug
        position={[hx, 0.055, hz]}
        size={[room.size[0] * 0.72, room.size[2] * 0.62]}
        color={rugColor}
      />

      {/* Warm plaster back wall + glass-topped partitions */}
      <mesh position={[hx, 0.55, hz - halfD + 0.05]}>
        <boxGeometry args={[room.size[0] * 0.92, 1.05, 0.07]} />
        <meshStandardMaterial color={room.wall} {...SOFT} />
      </mesh>
      <LowPartition
        position={[hx - halfW + 0.05, 0.48, hz]}
        size={[0.08, 0.92, room.size[2] * 0.82]}
        color={SAND}
      />
      <LowPartition
        position={[hx + halfW - 0.05, 0.48, hz]}
        size={[0.08, 0.92, room.size[2] * 0.82]}
        color={SAND}
      />
      <LowPartition
        position={[hx, 0.28, hz + halfD - 0.06]}
        size={[room.size[0] * 0.55, 0.52, 0.07]}
        color={CREAM}
      />

      <Whiteboard
        position={[hx, 1.15, hz - halfD + 0.14]}
        light={light === 'off' && needsAttention ? 'on' : light}
        accent={room.accent}
      />

      {room.id === 'direzione' ? (
        <>
          <MeetingTable position={[hx + 0.35, 0, hz + 0.15]} />
          <LoungeSofa position={[hx - 1.15, 0, hz + 0.55]} rotY={0.35} />
          <FlatDesk position={[hx - 1.2, 0, hz - 0.65]} accent={room.accent} light={light} />
          <Cabinet position={[hx + 1.4, 0, hz - 0.75]} rotY={-0.12} wide={0.62} />
          <Plant position={[hx - 1.55, 0, hz + 0.95]} scale={1.05} />
          <Plant position={[hx + 1.5, 0, hz + 0.85]} scale={0.95} />
        </>
      ) : (
        <>
          <FlatDesk position={[hx - 0.7, 0, hz + 0.15]} accent={room.accent} light={light} />
          <FlatDesk position={[hx + 0.7, 0, hz - 0.4]} accent={room.accent} light={light} />
          <Cabinet
            position={[hx + halfW - 0.38, 0, hz - halfD + 0.4]}
            rotY={0.08}
            wide={0.58}
          />
          <Plant position={[hx - halfW + 0.38, 0, hz + halfD - 0.38]} scale={1} />
          <Plant position={[hx + halfW - 0.4, 0, hz + halfD - 0.4]} scale={0.75} />
        </>
      )}

      {peopleOffsets.map((pos, i) => (
        <group
          key={`${room.id}-p${i}`}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(room.id)
          }}
          onPointerOver={() => {
            document.body.style.cursor = locked ? 'not-allowed' : 'pointer'
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'default'
          }}
        >
          <Ometto
            position={pos}
            accent={room.accent}
            active={active}
            phase={phaseBase + i * 2.35 + i * 0.41}
            reduceMotion={reduceMotion}
          />
        </group>
      ))}

      {/* Invisible warm fill only — no floating ceiling slabs / pendant fixtures */}
      <pointLight ref={lamp} position={[hx, 2.0, hz]} intensity={0.08} distance={5.5} color="#fff8f0" />

      <mesh
        position={[hx, 1.28, hz + halfD * 0.15]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(room.id)
        }}
      >
        <cylinderGeometry
          args={[needsAttention ? 0.22 : 0.16, needsAttention ? 0.22 : 0.16, 0.05, 24]}
        />
        <meshStandardMaterial ref={hotMat} color="#ffffff" {...MATTE} />
      </mesh>
      {/* Room name chips live in OfficeLabelOverlay (DOM over canvas). */}
      {needsAttention && (
        <DecisionHotspotBadge
          position={[hx + 1.05, 1.85, hz + halfD * 0.15]}
          count={attentionCount}
          reduceMotion={reduceMotion}
        />
      )}
    </group>
  )
}

/** Warm matte city façade tones — commercial / office, never neon. */
const CITY_TONES = [
  '#c9b7a2',
  '#b7c2cc',
  '#d5c6b4',
  '#a9b6c2',
  '#cfc3b4',
  '#9eaea8',
  '#d8cfc2',
  '#b4a697',
  '#c2ced8',
] as const

type CityBuildingSpec = {
  id: string
  x: number
  z: number
  w: number
  d: number
  h: number
  color: string
  /** 0 = simple mass; 1 = mid setback; 2 = tall tower setbacks */
  tier: 0 | 1 | 2
  hasAwning: boolean
}

/** Shared window-grid map tinted by mesh color — reads as office façades. */
function makeCityFacadeTexture(): Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  // Soft floor band
  ctx.fillStyle = 'rgba(40, 48, 58, 0.1)'
  ctx.fillRect(0, size * 0.82, size, size * 0.18)
  const cols = 5
  const rows = 7
  const marginX = 18
  const marginY = 22
  const gapX = 10
  const gapY = 12
  const cellW = (size - marginX * 2 - gapX * (cols - 1)) / cols
  const cellH = (size * 0.78 - marginY * 2 - gapY * (rows - 1)) / rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = marginX + c * (cellW + gapX)
      const y = marginY + r * (cellH + gapY)
      const lit = (r + c) % 5 !== 0
      ctx.fillStyle = lit ? 'rgba(55, 72, 92, 0.38)' : 'rgba(120, 150, 175, 0.22)'
      ctx.fillRect(x, y, cellW, cellH)
      ctx.fillStyle = 'rgba(230, 242, 250, 0.18)'
      ctx.fillRect(x + 1, y + 1, cellW * 0.45, cellH * 0.35)
    }
  }
  // Vertical mullion rhythm
  ctx.strokeStyle = 'rgba(70, 60, 50, 0.08)'
  ctx.lineWidth = 2
  for (let i = 1; i < 4; i++) {
    const x = (size / 4) * i
    ctx.beginPath()
    ctx.moveTo(x, 8)
    ctx.lineTo(x, size - 8)
    ctx.stroke()
  }
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.anisotropy = 2
  return tex
}

/** Deterministic commercial blocks outside the office apron. */
function buildCityLayout(): CityBuildingSpec[] {
  const out: CityBuildingSpec[] = []
  const officePad = 10.4
  // [x, z, w, d, h, tier, awning]
  const sites: Array<[number, number, number, number, number, 0 | 1 | 2, boolean]> = [
    // Back row (−Z) — strongest silhouette from fixed cam
    [-18, -16, 3.4, 2.8, 5.8, 1, true],
    [-13.5, -17.2, 3.0, 2.6, 7.6, 2, false],
    [-9.2, -18.4, 3.6, 3.0, 4.6, 0, true],
    [-4.5, -17.6, 2.8, 2.7, 8.8, 2, false],
    [0.2, -18.8, 4.0, 2.8, 6.4, 1, true],
    [4.8, -17.4, 3.1, 2.6, 9.6, 2, false],
    [9.4, -18.2, 3.4, 2.9, 5.4, 1, true],
    [14.2, -16.8, 3.8, 3.0, 8.0, 2, false],
    [18.6, -15.6, 3.0, 2.7, 4.8, 0, true],
    // Second back band
    [-16.2, -13.6, 2.6, 2.4, 4.0, 0, false],
    [-7.0, -14.2, 2.7, 2.3, 5.0, 1, true],
    [2.8, -14.0, 2.8, 2.4, 3.6, 0, false],
    [11.6, -13.8, 2.7, 2.5, 5.6, 1, true],
    // Left (−X)
    [-17.8, -11.2, 2.8, 3.2, 6.6, 1, true],
    [-18.6, -6.4, 3.0, 3.0, 8.4, 2, false],
    [-17.4, -1.6, 2.7, 3.4, 5.2, 1, true],
    [-18.2, 3.2, 3.1, 2.8, 7.4, 2, false],
    [-17.0, 7.8, 2.9, 3.1, 4.4, 0, true],
    [-18.8, 12.2, 3.2, 2.7, 6.8, 1, false],
    // Right (+X)
    [17.6, -11.0, 2.9, 3.1, 7.2, 2, true],
    [18.4, -6.2, 3.1, 2.9, 5.6, 1, false],
    [17.2, -1.4, 2.8, 3.3, 9.2, 2, true],
    [18.8, 3.4, 3.3, 2.8, 6.2, 1, false],
    [17.4, 8.0, 3.0, 3.0, 4.6, 0, true],
    [19.0, 12.4, 3.1, 2.7, 7.6, 2, false],
    // Front (+Z) — lower so Leadership stays focal
    [-16.5, 14.8, 3.2, 2.6, 3.8, 0, true],
    [-11.2, 15.6, 3.0, 2.5, 4.8, 1, true],
    [-5.8, 14.6, 3.4, 2.7, 3.4, 0, false],
    [0.4, 16.0, 2.8, 2.4, 4.2, 0, true],
    [5.6, 15.2, 3.2, 2.6, 3.2, 0, false],
    [11.0, 15.8, 3.1, 2.5, 5.0, 1, true],
    [16.2, 14.4, 3.3, 2.7, 3.6, 0, true],
    // Mid-depth fillers
    [-14.6, -13.0, 2.6, 2.4, 3.6, 0, false],
    [13.8, -13.2, 2.7, 2.5, 4.2, 0, true],
    [-15.2, 10.4, 2.5, 2.4, 3.4, 0, false],
    [15.0, 10.6, 2.6, 2.3, 3.8, 0, true],
  ]
  let i = 0
  for (const [x, z, w, d, h, tier, hasAwning] of sites) {
    if (Math.abs(x) < officePad && Math.abs(z) < officePad) continue
    out.push({
      id: `city-${i}`,
      x,
      z,
      w,
      d,
      h,
      color: CITY_TONES[i % CITY_TONES.length],
      tier,
      hasAwning,
    })
    i += 1
  }
  return out
}

/** One commercial building: windowed mass, optional setbacks, roof, awning. */
function CityBuildingMesh({
  building,
  facadeMap,
}: {
  building: CityBuildingSpec
  facadeMap: Texture
}) {
  const { x, z, w, d, h, color, tier, hasAwning } = building
  const baseH = tier === 0 ? h : tier === 1 ? h * 0.62 : h * 0.48
  const midH = tier === 0 ? 0 : tier === 1 ? h * 0.38 : h * 0.32
  const topH = tier === 2 ? h * 0.2 : 0
  const midScale = tier === 0 ? 1 : 0.82
  const topScale = 0.64
  const y0 = -0.08

  return (
    <group position={[x, y0, z]} raycast={() => null}>
      {/* Ground mass */}
      <mesh position={[0, baseH / 2, 0]} raycast={() => null}>
        <boxGeometry args={[w, baseH, d]} />
        <meshStandardMaterial
          color={color}
          map={facadeMap}
          roughness={0.9}
          metalness={0.04}
        />
      </mesh>
      {/* Mid setback */}
      {midH > 0 && (
        <mesh position={[0, baseH + midH / 2, 0]} raycast={() => null}>
          <boxGeometry args={[w * midScale, midH, d * midScale]} />
          <meshStandardMaterial
            color={color}
            map={facadeMap}
            roughness={0.9}
            metalness={0.04}
          />
        </mesh>
      )}
      {/* Tower crown */}
      {topH > 0 && (
        <mesh position={[0, baseH + midH + topH / 2, 0]} raycast={() => null}>
          <boxGeometry args={[w * topScale, topH, d * topScale]} />
          <meshStandardMaterial
            color={color}
            map={facadeMap}
            roughness={0.88}
            metalness={0.05}
          />
        </mesh>
      )}
      {/* Parapet / roof slab */}
      <mesh position={[0, h + 0.08, 0]} raycast={() => null}>
        <boxGeometry
          args={[
            w * (tier === 2 ? topScale * 1.05 : tier === 1 ? midScale * 1.05 : 0.92),
            0.16,
            d * (tier === 2 ? topScale * 1.05 : tier === 1 ? midScale * 1.05 : 0.92),
          ]}
        />
        <meshStandardMaterial color="#e6ddd0" roughness={1} metalness={0} />
      </mesh>
      {/* Mechanical penthouse on taller buildings */}
      {tier >= 1 && (
        <mesh position={[w * 0.12, h + 0.32, -d * 0.08]} raycast={() => null}>
          <boxGeometry args={[w * 0.28, 0.42, d * 0.28]} />
          <meshStandardMaterial color="#d2c6b6" roughness={1} metalness={0} />
        </mesh>
      )}
      {/* Soft ground-floor awning / storefront ledge */}
      {hasAwning && (
        <mesh position={[0, 0.95, d / 2 + 0.12]} raycast={() => null}>
          <boxGeometry args={[w * 0.88, 0.1, 0.32]} />
          <meshStandardMaterial color="#c4b09a" roughness={0.95} metalness={0} />
        </mesh>
      )}
      {/* Darker podium band so mass reads as a building base */}
      <mesh position={[0, 0.28, 0]} raycast={() => null}>
        <boxGeometry args={[w * 1.01, 0.56, d * 1.01]} />
        <meshStandardMaterial color="#8f8478" roughness={1} metalness={0} />
      </mesh>
    </group>
  )
}

/**
 * Stylized city around the office twin — atmosphere only (no clicks).
 * Windowed commercial masses with setbacks so they read as other buildings.
 */
function CityAroundOffice() {
  const buildings = useMemo(() => buildCityLayout(), [])
  const facadeMap = useMemo(() => {
    const tex = makeCityFacadeTexture()
    tex.repeat.set(1, 1)
    return tex
  }, [])

  return (
    <group raycast={() => null}>
      {/* Soft urban ground + plaza so the twin sits in a city block, not a void */}
      <mesh position={[0, -0.14, -0.4]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[52, 48]} />
        <meshStandardMaterial color="#d5e2ec" roughness={1} metalness={0} />
      </mesh>
      {/* Street grid (matte asphalt ribbons) */}
      <mesh position={[0, -0.11, -0.4]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[48, 2.2]} />
        <meshStandardMaterial color="#b6c0ca" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0, -0.105, -0.4]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} raycast={() => null}>
        <planeGeometry args={[44, 2.0]} />
        <meshStandardMaterial color="#b6c0ca" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0, -0.108, -14.2]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[42, 1.6]} />
        <meshStandardMaterial color="#aeb8c2" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0, -0.108, 13.6]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[40, 1.5]} />
        <meshStandardMaterial color="#aeb8c2" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[-14.6, -0.108, -0.4]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} raycast={() => null}>
        <planeGeometry args={[38, 1.5]} />
        <meshStandardMaterial color="#aeb8c2" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[14.6, -0.108, -0.4]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} raycast={() => null}>
        <planeGeometry args={[38, 1.5]} />
        <meshStandardMaterial color="#aeb8c2" roughness={1} metalness={0} />
      </mesh>
      {/* Soft plaza ring around the office pad */}
      <mesh position={[0, -0.1, -0.4]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[13.2, 48]} />
        <meshStandardMaterial color="#cfe0ec" roughness={1} metalness={0} transparent opacity={0.7} />
      </mesh>
      {buildings.map((b) => (
        <CityBuildingMesh key={b.id} building={b} facadeMap={facadeMap} />
      ))}
    </group>
  )
}

function OfficeBuilding({
  lights,
  enabled,
  pendingCount,
  onSelect,
  reduceMotion,
  focusId,
}: {
  lights: Record<DeptId, RoomLightState>
  enabled: SubscriptionSkills
  pendingCount: number
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
  focusId: DeptId | null
}) {
  const woodTex = useMemo(() => makeWoodFloorTexture(), [])

  return (
    <group>
      <CityAroundOffice />
      {/* Soft exterior apron so the building sits in daylight, not a void */}
      <mesh position={[0, -0.09, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[18.4, 16.2]} />
        <meshStandardMaterial color="#d9e6f0" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0, -0.085, -0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[11.2, 48]} />
        <meshStandardMaterial color="#cfe0ec" roughness={1} metalness={0} transparent opacity={0.45} />
      </mesh>
      {/* Warm oak plank building floor (not grey) — expanded for back wing */}
      <mesh position={[0, -0.02, -0.35]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[16.6, 14.4]} />
        <meshStandardMaterial map={woodTex} {...SOFT} />
      </mesh>
      <mesh position={[0, -0.06, -0.35]}>
        <boxGeometry args={[16.6, 0.08, 14.4]} />
        <meshStandardMaterial color={WOOD} {...SOFT} />
      </mesh>
      {/* Soft corridor runner + cross aisle to the new back wing */}
      <mesh position={[0, 0.03, -0.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.35, 12.8]} />
        <meshStandardMaterial color="#e8dcc8" {...MATTE} />
      </mesh>
      <mesh position={[0, 0.035, 2.2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.4, 1.05]} />
        <meshStandardMaterial color="#e8dcc8" {...MATTE} />
      </mesh>
      <mesh position={[0, 0.035, -3.85]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14.2, 1.0]} />
        <meshStandardMaterial color="#e8dcc8" {...MATTE} />
      </mesh>

      {/* Exterior walls */}
      <mesh position={[0, 1.05, -7.4]}>
        <boxGeometry args={[16.6, 2.1, 0.1]} />
        <meshStandardMaterial color={CREAM} {...SOFT} />
      </mesh>
      <mesh position={[-8.25, 1.05, -0.35]}>
        <boxGeometry args={[0.1, 2.1, 14.4]} />
        <meshStandardMaterial color={SAND} {...SOFT} />
      </mesh>
      <mesh position={[8.25, 1.05, -0.35]}>
        <boxGeometry args={[0.1, 2.1, 14.4]} />
        <meshStandardMaterial color={SAND} {...SOFT} />
      </mesh>
      <mesh position={[0, 1.05, 6.7]}>
        <boxGeometry args={[16.6, 2.1, 0.08]} />
        <meshStandardMaterial color={BLUSH_WALL} {...SOFT} />
      </mesh>

      {/* Exterior windows — soft daylight (camera sees +X/+Z corner) */}
      {/* Back wall (−Z) — Ops / Design / IT / Controlling wing */}
      <ExteriorWindow position={[-5.7, 1.15, -7.32]} width={1.45} height={1.1} />
      <ExteriorWindow position={[-1.9, 1.15, -7.32]} width={1.45} height={1.1} />
      <ExteriorWindow position={[1.9, 1.15, -7.32]} width={1.45} height={1.1} />
      <ExteriorWindow position={[5.7, 1.15, -7.32]} width={1.45} height={1.1} />
      {/* Left wall (−X) */}
      <ExteriorWindow position={[-8.17, 1.15, -5.4]} rotY={Math.PI / 2} width={1.4} height={1.1} />
      <ExteriorWindow position={[-8.17, 1.15, -2.1]} rotY={Math.PI / 2} width={1.4} height={1.1} />
      <ExteriorWindow position={[-8.17, 1.15, 1.1]} rotY={Math.PI / 2} width={1.4} height={1.1} />
      <ExteriorWindow position={[-8.17, 1.15, 4.0]} rotY={Math.PI / 2} width={1.4} height={1.1} />
      {/* Right wall (+X) — most visible from fixed cam */}
      <ExteriorWindow position={[8.17, 1.15, -5.4]} rotY={-Math.PI / 2} width={1.4} height={1.1} />
      <ExteriorWindow position={[8.17, 1.15, -2.1]} rotY={-Math.PI / 2} width={1.4} height={1.1} />
      <ExteriorWindow position={[8.17, 1.15, 1.1]} rotY={-Math.PI / 2} width={1.4} height={1.1} />
      <ExteriorWindow position={[8.17, 1.15, 4.0]} rotY={-Math.PI / 2} width={1.4} height={1.1} />
      {/* Front wall (+Z) near Leadership */}
      <ExteriorWindow position={[-2.6, 1.15, 6.62]} rotY={Math.PI} width={1.55} height={1.05} />
      <ExteriorWindow position={[2.6, 1.15, 6.62]} rotY={Math.PI} width={1.55} height={1.05} />

      {/* Soft interior glass toward corridor (reads between rooms) */}
      <InteriorGlass position={[-2.65, 1.0, 1.15]} rotY={Math.PI / 2} width={1.5} height={1.25} />
      <InteriorGlass position={[2.65, 1.0, 1.15]} rotY={Math.PI / 2} width={1.5} height={1.25} />
      <InteriorGlass position={[-2.65, 1.0, -2.15]} rotY={Math.PI / 2} width={1.3} height={1.2} />
      <InteriorGlass position={[2.65, 1.0, -2.15]} rotY={Math.PI / 2} width={1.3} height={1.2} />
      <InteriorGlass position={[-3.7, 1.0, -3.85]} width={1.2} height={1.15} />
      <InteriorGlass position={[3.7, 1.0, -3.85]} width={1.2} height={1.15} />

      {/* Corridor props */}
      <Plant position={[0, 0, 2.2]} scale={1.05} />
      <Plant position={[-0.95, 0, -0.8]} scale={0.8} />
      <Plant position={[0.95, 0, -0.8]} scale={0.8} />
      <Plant position={[-0.9, 0, -3.85]} scale={0.85} />
      <Plant position={[0.9, 0, -3.85]} scale={0.85} />
      <Cabinet position={[0, 0, -0.4]} wide={1.05} />
      <RoundedBox args={[0.72, 0.05, 0.48]} radius={0.03} position={[0, 0.4, 0.55]}>
        <meshStandardMaterial color={DESK_TOP} {...SOFT} />
      </RoundedBox>
      <mesh position={[0, 0.18, 0.55]}>
        <cylinderGeometry args={[0.04, 0.06, 0.36, 10]} />
        <FlatMat color={WOOD} />
      </mesh>

      {ROOMS.map((room) => (
        <RoomZone
          key={room.id}
          room={room}
          light={lights[room.id]}
          locked={!isDeptEnabled(room.id, enabled)}
          attentionCount={room.id === 'direzione' ? pendingCount : 0}
          onSelect={onSelect}
          reduceMotion={reduceMotion}
          focusId={focusId}
        />
      ))}
    </group>
  )
}

/** Intentional light (2D/CSS) twin — same spatial map as 3D, lights, HITL, click-to-dept. */
function OfficeLightTwin({
  lights,
  pending,
  enabled,
  onSelect,
  reduceMotion,
  focusId,
}: {
  lights: Record<DeptId, RoomLightState>
  pending: Record<DeptId, number>
  enabled: SubscriptionSkills
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
  focusId: DeptId | null
}) {
  const direzionePending = pending.direzione || 0
  const focusXf = focusId ? LIGHT_FOCUS[focusId] : null
  return (
    <div
      className={`office-light-twin${reduceMotion ? ' reduce-motion' : ''}${
        focusId ? ' is-focusing' : ''
      }`}
      data-testid="office-floorplan-2d"
      data-focus-dept={focusId ?? undefined}
    >
      <div className="office-light-blueprint" aria-hidden>
        <div className="office-light-sky" />
        {/* Stylized commercial cityscape around the floor plate (Leggera) */}
        <div className="office-light-cityscape" data-testid="office-cityscape-2d">
          <div className="office-city-ring city-n">
            <span className="city-bldg tone-a" style={{ height: '64%' }} />
            <span className="city-bldg tone-b tall" style={{ height: '92%' }} />
            <span className="city-bldg tone-c" style={{ height: '52%' }} />
            <span className="city-bldg tone-a mid" style={{ height: '78%' }} />
            <span className="city-bldg tone-d" style={{ height: '58%' }} />
            <span className="city-bldg tone-b tall" style={{ height: '96%' }} />
            <span className="city-bldg tone-c" style={{ height: '46%' }} />
            <span className="city-bldg tone-a mid" style={{ height: '74%' }} />
            <span className="city-bldg tone-d" style={{ height: '60%' }} />
          </div>
          <div className="office-city-ring city-s">
            <span className="city-bldg tone-d" style={{ height: '48%' }} />
            <span className="city-bldg tone-a mid" style={{ height: '62%' }} />
            <span className="city-bldg tone-c" style={{ height: '40%' }} />
            <span className="city-bldg tone-b" style={{ height: '56%' }} />
            <span className="city-bldg tone-a" style={{ height: '44%' }} />
            <span className="city-bldg tone-d mid" style={{ height: '68%' }} />
            <span className="city-bldg tone-c" style={{ height: '42%' }} />
          </div>
          <div className="office-city-ring city-w">
            <span className="city-bldg tone-b" style={{ width: '58%' }} />
            <span className="city-bldg tone-a mid" style={{ width: '82%' }} />
            <span className="city-bldg tone-c" style={{ width: '50%' }} />
            <span className="city-bldg tone-d tall" style={{ width: '92%' }} />
            <span className="city-bldg tone-a" style={{ width: '64%' }} />
            <span className="city-bldg tone-b mid" style={{ width: '76%' }} />
          </div>
          <div className="office-city-ring city-e">
            <span className="city-bldg tone-a mid" style={{ width: '68%' }} />
            <span className="city-bldg tone-c" style={{ width: '52%' }} />
            <span className="city-bldg tone-b tall" style={{ width: '88%' }} />
            <span className="city-bldg tone-d" style={{ width: '60%' }} />
            <span className="city-bldg tone-a mid" style={{ width: '78%' }} />
            <span className="city-bldg tone-c" style={{ width: '54%' }} />
          </div>
          <div className="office-city-blocks" />
        </div>
        <div className="office-light-floor-grain" />
        <div className="office-light-wall wall-n" />
        <div className="office-light-wall wall-s" />
        <div className="office-light-wall wall-w" />
        <div className="office-light-wall wall-e" />
        <div className="office-light-window-row north">
          <span className="office-light-pane" />
          <span className="office-light-pane" />
          <span className="office-light-pane" />
          <span className="office-light-pane" />
        </div>
        <div className="office-light-window-row south">
          <span className="office-light-pane" />
          <span className="office-light-pane" />
        </div>
        <div className="office-light-corridor" />
        <div className="office-light-corridor-cross" />
        <div className="office-light-corridor-wing" />
      </div>
      <div
        className="office-floorplan office-floorplan-light"
        data-testid="office-floorplan-focus"
        style={
          focusXf
            ? {
                transform: `translate(${focusXf.x}%, ${focusXf.y}%) scale(${focusXf.scale})`,
                transition: reduceMotion
                  ? 'none'
                  : `transform ${FOCUS_DURATION}s ${FOCUS_EASE_CSS}`,
              }
            : {
                transform: 'translate(0%, 0%) scale(1)',
                transition: reduceMotion
                  ? 'none'
                  : `transform ${FOCUS_DURATION}s ${FOCUS_EASE_CSS}`,
              }
        }
      >
        {ROOMS.map((room) => {
          const light = lights[room.id]
          const dept = DEPARTMENTS.find((d) => d.id === room.id)
          const locked = !isDeptEnabled(room.id, enabled)
          const needsDecision = !locked && room.id === 'direzione' && direzionePending > 0
          const isFocus = focusId === room.id
          const isDimmed = Boolean(focusId && !isFocus)
          return (
            <button
              key={room.id}
              type="button"
              className={`floor-room light-${locked ? 'off' : light} tint-${dept?.tint ?? 'gray'}${
                locked ? ' is-locked' : ''
              }${needsDecision ? ' needs-decision' : ''}${isFocus ? ' is-focus' : ''}${
                isDimmed ? ' is-dimmed' : ''
              }`}
              style={{ gridArea: room.id }}
              onClick={() => onSelect(room.id)}
              title={locked ? lockedHintIt(room.id) : `Entra in ${room.label}`}
            >
              <span className="floor-room-furniture" aria-hidden>
                <span className="floor-desk" />
                <span className="floor-desk" />
              </span>
              <span className="floor-hotspot-row">
                <span className="floor-hotspot">{room.hotspot}</span>
                {needsDecision && (
                  <span
                    className="decision-count-badge"
                    aria-label={`${direzionePending} decisioni`}
                  >
                    {direzionePending}
                  </span>
                )}
              </span>
              <strong>{room.label}</strong>
              <div className="floor-people" aria-hidden>
                {Array.from({ length: room.people }).map((_, i) => (
                  <span
                    key={i}
                    className={`ometto-2d ${
                      !locked && (light === 'on' || needsDecision) ? 'active' : ''
                    }`}
                    style={{ animationDelay: `${-i * 0.7}s` }}
                  />
                ))}
              </div>
              <span className="floor-state">
                {locked
                  ? 'Non nel piano'
                  : needsDecision
                    ? 'Decisioni in attesa'
                    : light === 'on'
                      ? 'Luci accese'
                      : light === 'soft'
                        ? 'Si stanno spegnendo…'
                        : 'In attesa'}
              </span>
              {!locked && (pending[room.id] || 0) > 0 && room.id !== 'direzione' && (
                <span className="dept-pending">{pending[room.id]} in attesa</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const OFFICE_SHORTCUTS = [
  { label: 'Controlla le ads', goal: 'report spend ultimi 7 giorni' },
  { label: 'Controlla SEO', goal: 'seo audit of priority pages' },
] as const

function useOfficeCapability(): OfficeCapability | null {
  const [cap, setCap] = useState<OfficeCapability | null>(null)
  useEffect(() => {
    setCap(probeOfficeCapability())
  }, [])
  return cap
}

function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])
  return reduced
}

class CanvasErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}

/** Safer R3F Canvas: low DPR, soft WebGL attrs, context-loss / 0-size → light twin. */
function HardenedOfficeCanvas({
  lights,
  pendingTotal,
  enabled,
  onSelect,
  reduceMotion,
  onContextLost,
  focusId,
  onFocusArrived,
}: {
  lights: Record<DeptId, RoomLightState>
  pendingTotal: number
  enabled: SubscriptionSkills
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
  onContextLost: () => void
  focusId: DeptId | null
  onFocusArrived: (id: DeptId) => void
}) {
  const [overlayLabels, setOverlayLabels] = useState<OverlayLabel[]>([])
  const [overlayBadge, setOverlayBadge] = useState<OverlayBadge | null>(null)

  return (
    <div className="office-canvas-stack">
      <Canvas
        camera={{ position: [...OVERVIEW_POS], fov: 38, near: 0.1, far: 120 }}
        dpr={[1, 1.25]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'default',
          failIfMajorPerformanceCaveat: false,
          stencil: false,
          depth: true,
        }}
        frameloop="always"
        style={{ touchAction: 'manipulation', width: '100%', height: '100%' }}
        onCreated={({ gl, camera, scene }) => {
          gl.setClearColor('#d9e8f2')
          gl.shadowMap.enabled = false
          scene.fog = null
          camera.lookAt(...OVERVIEW_LOOK)
          const canvas = gl.domElement
          const onLost = (e: Event) => {
            e.preventDefault()
            onContextLost()
          }
          const onRestored = () => {
            // Stay on light after a loss — safer than re-entering a flaky GPU path.
          }
          canvas.addEventListener('webglcontextlost', onLost, false)
          canvas.addEventListener('webglcontextrestored', onRestored, false)
          // Collapsed CSS stage (0×0) → fall back to Leggera instead of a blank WebGL plane.
          requestAnimationFrame(() => {
            if (canvas.clientWidth < 8 || canvas.clientHeight < 8) onContextLost()
          })
        }}
      >
        <Suspense fallback={null}>
          <ScriptedCamera
            focusId={focusId}
            reduceMotion={reduceMotion}
            onArrived={onFocusArrived}
          />
          <ambientLight intensity={0.78} />
          <hemisphereLight args={['#f5fbff', '#d8c9b2', 0.62]} />
          <directionalLight position={[7, 12, 4]} intensity={0.55} color="#fff6ea" />
          <directionalLight position={[-6, 6, -2]} intensity={0.22} color="#cfe6f5" />
          <pointLight position={[5.4, 1.4, 2.4]} intensity={0.35} distance={8} color="#dff2ff" />
          <pointLight position={[-5.4, 1.4, -2.2]} intensity={0.28} distance={8} color="#fff1df" />
          <OfficeBuilding
            lights={lights}
            enabled={enabled}
            pendingCount={pendingTotal}
            onSelect={onSelect}
            reduceMotion={reduceMotion}
            focusId={focusId}
          />
          <LabelAnchorPublisher
            lights={lights}
            enabled={enabled}
            pendingTotal={pendingTotal}
            onChange={(labels, badge) => {
              setOverlayLabels(labels)
              setOverlayBadge(badge)
            }}
          />
        </Suspense>
      </Canvas>
      <OfficeLabelOverlay
        labels={
          focusId ? overlayLabels.filter((l) => l.id === focusId) : overlayLabels
        }
        badge={focusId && focusId !== 'direzione' ? null : overlayBadge}
        onSelect={onSelect}
      />
    </div>
  )
}

export function OfficeTwin({
  lights,
  pending,
  enabled,
  officeMode = 'auto',
  officeViewEntitled = false,
  statusLine,
  busy,
  tenantId = 'demo',
  approvals = [],
  audit = [],
  sessionQueries = {},
  liveSteps = [],
  onSelect,
  onQuickAction,
  onDecideApproval,
}: {
  lights: Record<DeptId, RoomLightState>
  pending: Record<DeptId, number>
  enabled: SubscriptionSkills
  /** Effective preference (already gated by entitlement on the server/client). */
  officeMode?: OfficeMode
  officeViewEntitled?: boolean
  statusLine?: string | null
  busy?: boolean
  tenantId?: string
  approvals?: Approval[]
  audit?: AuditEvent[]
  sessionQueries?: Partial<Record<DeptId, number>>
  liveSteps?: TimelineStep[]
  onSelect: (id: DeptId) => void
  onQuickAction: (goal: string) => void
  onDecideApproval?: (id: string, decision: 'approved' | 'rejected') => void
}) {
  const capability = useOfficeCapability()
  const reduceMotion = useReduceMotion()
  const [failed, setFailed] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  /** Scripted department focus — null = overview framing. */
  const [focusId, setFocusId] = useState<DeptId | null>(null)
  const [focusBusy, setFocusBusy] = useState(false)
  /** Closable dept modal after dolly — open | leaving (fade) | closed. */
  const [modalPhase, setModalPhase] = useState<'closed' | 'open' | 'leaving'>('closed')
  const [officeOpens, setOfficeOpens] = useState(0)
  const pendingOpen = useRef<DeptId | null>(null)
  const lastFocusDept = useRef<DeptId | null>(null)
  const lightFocusTimer = useRef<number | null>(null)
  const modalLeaveTimer = useRef<number | null>(null)
  const pendingTotal = pending.direzione || 0
  const focusModalVisible = modalPhase === 'open' || modalPhase === 'leaving'
  const modalDept = focusId ?? lastFocusDept.current

  useEffect(() => {
    return () => {
      if (lightFocusTimer.current != null) window.clearTimeout(lightFocusTimer.current)
      if (modalLeaveTimer.current != null) window.clearTimeout(modalLeaveTimer.current)
    }
  }, [])

  const desired = useMemo(() => {
    if (!capability) return null
    return resolvePresentation(officeMode, capability)
  }, [capability, officeMode])

  const useLight = desired === 'light' || failed || (desired === 'full' && capability && !capability.webgl)

  const litNames = useMemo(
    () =>
      DEPARTMENTS.filter((d) => lights[d.id] === 'on' && isDeptEnabled(d.id, enabled))
        .map((d) => d.name)
        .join(', '),
    [lights, enabled],
  )

  const spendOn = isDeptEnabled('spend', enabled)
  const seoOn = isDeptEnabled('seo', enabled)

  const sendGoal = (goal: string) => {
    const text = goal.trim()
    if (!text || busy) return
    onQuickAction(text)
    setGoalDraft('')
  }

  const clearLightFocusTimer = () => {
    if (lightFocusTimer.current != null) {
      window.clearTimeout(lightFocusTimer.current)
      lightFocusTimer.current = null
    }
  }

  const clearModalLeaveTimer = () => {
    if (modalLeaveTimer.current != null) {
      window.clearTimeout(modalLeaveTimer.current)
      modalLeaveTimer.current = null
    }
  }

  const returnToOverview = () => {
    clearLightFocusTimer()
    pendingOpen.current = null
    setFocusBusy(false)
    // Fade modal out while the reverse dolly starts — no hard unmount snap.
    if (modalPhase === 'open') {
      setModalPhase('leaving')
      clearModalLeaveTimer()
      modalLeaveTimer.current = window.setTimeout(() => {
        setModalPhase('closed')
        modalLeaveTimer.current = null
      }, reduceMotion ? 0 : MODAL_FADE_MS)
    } else {
      setModalPhase('closed')
    }
    setFocusId(null)
  }

  const openFocusModal = (id: DeptId) => {
    if (pendingOpen.current !== id) return
    clearLightFocusTimer()
    clearModalLeaveTimer()
    pendingOpen.current = null
    setFocusBusy(false)
    lastFocusDept.current = id
    setOfficeOpens(bumpOfficeFocusCount(tenantId, id))
    setModalPhase('open')
  }

  const beginFocus = (id: DeptId) => {
    if (!isDeptEnabled(id, enabled)) {
      onSelect(id)
      return
    }
    if (focusBusy && focusId === id && modalPhase === 'open') return
    clearLightFocusTimer()
    clearModalLeaveTimer()
    // Soft-dismiss any open modal before a new dolly (same fade curve).
    if (modalPhase === 'open' || modalPhase === 'leaving') {
      setModalPhase('leaving')
      modalLeaveTimer.current = window.setTimeout(() => {
        setModalPhase('closed')
        modalLeaveTimer.current = null
      }, reduceMotion ? 0 : MODAL_FADE_MS)
    } else {
      setModalPhase('closed')
    }
    pendingOpen.current = id
    setFocusBusy(true)
    setFocusId(id)
    if (useLight) {
      // Leggera: CSS transform; open modal after the same calm duration.
      if (reduceMotion) {
        openFocusModal(id)
        return
      }
      lightFocusTimer.current = window.setTimeout(
        () => openFocusModal(id),
        FOCUS_DURATION * 1000,
      )
    }
    // Completa: ScriptedCamera calls onFocusArrived when the dolly finishes.
  }

  const openFullPanel = () => {
    if (!focusId) return
    const id = focusId
    clearModalLeaveTimer()
    setModalPhase('closed')
    setFocusId(null)
    setFocusBusy(false)
    onSelect(id)
  }

  const modeBadge = useLight ? 'Vista leggera' : 'Vista completa'
  const focusLabel = focusId ? ROOMS.find((r) => r.id === focusId)?.label : null
  const modeHint =
    modalPhase === 'open'
      ? 'Chiudi il riquadro per tornare alla vista ufficio (zoom calmo indietro).'
      : focusId
        ? `Ingrandisco ${focusLabel ?? 'il reparto'}… Tocca Indietro per la vista ufficio.`
        : useLight
          ? 'Vista leggera — tocca una stanza: zoom calmo, poi decisioni e metriche.'
          : 'Vista fissa 3D (niente orbita). Tocca un reparto: zoom lungo e fluido, poi il riquadro.'

  return (
    <section
      className="office-twin"
      data-testid="office-twin"
      data-office-mode={useLight ? 'light' : 'full'}
      data-camera={focusId ? 'focus' : 'overview'}
      style={
        {
          ['--office-focus-duration']: `${FOCUS_DURATION}s`,
          ['--office-focus-ease']: FOCUS_EASE_CSS,
          ['--office-modal-fade']: `${MODAL_FADE_MS}ms`,
        } as CSSProperties
      }
    >
      <div className="office-hero">
        <header className="office-hero-head">
          <div>
            <div className="office-brand-lockup">
              <p className="office-brand-mark">Atrium</p>
              <p className="office-brand-sub">Workspace marketing</p>
            </div>
            <h1>Ufficio digitale</h1>
            <p className="office-lede">
              Scrivi cosa vuoi fare: luci e ometti si accendono mentre i reparti lavorano.
            </p>
          </div>
          <span
            className={`office-mode-badge ${useLight ? 'is-light' : 'is-full'}`}
            data-testid="office-mode-badge"
            title={
              officeViewEntitled
                ? `Preferenza: ${officeMode}`
                : 'Modalità automatica (upgrade piano per scegliere Completa / Leggera)'
            }
          >
            {modeBadge}
          </span>
        </header>

        <div className="office-stage" data-testid="office-stage">
          <div className="office-stage-chrome">
            <form
              className="office-compose"
              data-testid="office-compose"
              onSubmit={(e) => {
                e.preventDefault()
                sendGoal(goalDraft)
              }}
            >
              <label className="sr-only" htmlFor="office-goal">
                Richiesta per Atrium
              </label>
              <textarea
                id="office-goal"
                rows={2}
                value={goalDraft}
                disabled={busy}
                placeholder="Scrivi cosa vuoi che Atrium faccia…"
                onChange={(e) => setGoalDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    sendGoal(goalDraft)
                  }
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={busy || !goalDraft.trim()}
              >
                {busy ? 'In corso…' : 'Avvia'}
              </button>
            </form>

            <div className="office-shortcuts">
              <span className="office-shortcuts-label">Suggerimenti</span>
              {OFFICE_SHORTCUTS.map((s) => {
                const allowed = s.goal.includes('seo') ? seoOn : spendOn
                return (
                  <button
                    key={s.goal}
                    type="button"
                    className="chip-shortcut"
                    disabled={busy || !allowed}
                    title={allowed ? undefined : lockedHintIt(s.goal.includes('seo') ? 'seo' : 'spend')}
                    onClick={() => sendGoal(s.goal)}
                  >
                    {s.label}
                  </button>
                )
              })}
              {statusLine && <span className="office-status">{statusLine}</span>}
              {litNames && <span className="office-status lit">Luci: {litNames}</span>}
              {pendingTotal > 0 && (
                <span className="office-status decisions">
                  {pendingTotal} {pendingTotal === 1 ? 'decisione' : 'decisioni'} · Direzione
                </span>
              )}
            </div>
          </div>

          <div
            className={`office-viewport flat-pastel locked-view ${useLight ? 'is-2d is-light' : 'is-3d'}${
              pendingTotal > 0 ? ' has-decisions' : ''
            }${focusId ? ' is-dept-focus' : ''}`}
          >
            {focusId && (
              <div className="office-focus-bar" data-testid="office-focus-bar">
                <button
                  type="button"
                  className="btn btn-ghost office-back-overview"
                  data-testid="office-back-overview"
                  onClick={returnToOverview}
                >
                  ← Indietro · Vista ufficio
                </button>
                <span className="office-focus-label">
                  {focusLabel ? `Focus · ${focusLabel}` : 'Focus reparto'}
                </span>
              </div>
            )}
            {desired === null ? (
              <div className="office-viewport-loading" aria-busy="true">
                Preparo l’ufficio…
              </div>
            ) : useLight ? (
              <OfficeLightTwin
                lights={lights}
                pending={pending}
                enabled={enabled}
                onSelect={beginFocus}
                reduceMotion={reduceMotion}
                focusId={focusId}
              />
            ) : (
              <CanvasErrorBoundary onError={() => setFailed(true)}>
                <HardenedOfficeCanvas
                  lights={lights}
                  pendingTotal={pendingTotal}
                  enabled={enabled}
                  onSelect={beginFocus}
                  reduceMotion={reduceMotion}
                  onContextLost={() => setFailed(true)}
                  focusId={focusId}
                  onFocusArrived={openFocusModal}
                />
              </CanvasErrorBoundary>
            )}
          </div>
        </div>

        <p className="office-hint">{modeHint}</p>
      </div>

      {focusModalVisible && modalDept && (
        <DeptFocusModal
          dept={modalDept}
          pendingApprovals={approvals}
          audit={audit}
          sessionQueries={sessionQueries[modalDept] || 0}
          light={lights[modalDept]}
          liveSteps={liveSteps}
          officeOpens={officeOpens}
          closing={modalPhase === 'leaving'}
          onClose={returnToOverview}
          onOpenFullPanel={openFullPanel}
          onDecide={onDecideApproval}
        />
      )}
    </section>
  )
}
