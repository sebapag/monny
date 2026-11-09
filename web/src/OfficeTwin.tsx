import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, RoundedBox, Text } from '@react-three/drei'
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  CanvasTexture,
  Color,
  RepeatWrapping,
  SRGBColorSpace,
  type Group,
  type MeshStandardMaterial,
  type PointLight as PointLightType,
  type Texture,
} from 'three'
import type { OfficeMode, SubscriptionSkills } from './api'
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
    position: [0, 0.04, 3.5],
    size: [4.0, 0.1, 2.5],
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
    position: [-3.3, 0.04, 0.35],
    size: [3.3, 0.1, 3.1],
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
    position: [3.3, 0.04, 0.35],
    size: [3.3, 0.1, 3.1],
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
    position: [-3.3, 0.04, -3.1],
    size: [3.3, 0.1, 2.9],
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
    position: [3.3, 0.04, -3.1],
    size: [3.3, 0.1, 2.9],
    floor: '#fde0ec',
    floorLit: '#f7c5d9',
    wall: '#fef1f6',
    accent: '#e890b8',
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
  tex.repeat.set(4.5, 4)
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

/** Fixed isometric camera — no orbit / pan / zoom. */
function FixedCamera() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(9.1, 10.2, 11.0)
    camera.lookAt(0, 0.45, 0.15)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

/** Soft room label chip — readable against warm oak / pastels. */
function RoomLabelChip({
  label,
  hotspot,
  locked,
  lit,
}: {
  label: string
  hotspot: number
  locked: boolean
  lit: boolean
}) {
  const bg = locked ? '#e8e4de' : lit ? '#fff4c8' : '#ffffff'
  const ink = locked ? '#787671' : '#1a1a1a'
  return (
    <Billboard follow>
      <RoundedBox args={[locked ? 2.55 : 2.15, 0.42, 0.06]} radius={0.08} position={[0, 0, 0]}>
        <meshStandardMaterial color={bg} roughness={0.85} metalness={0} />
      </RoundedBox>
      <mesh position={[-0.82, 0, 0.04]}>
        <circleGeometry args={[0.14, 20]} />
        <meshStandardMaterial color="#0a1530" roughness={1} metalness={0} />
      </mesh>
      <Text
        position={[-0.82, 0, 0.06]}
        fontSize={0.15}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {String(hotspot)}
      </Text>
      <Text
        position={[0.12, 0, 0.06]}
        fontSize={0.18}
        color={ink}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.7}
      >
        {locked ? `${label} · chiuso` : label}
      </Text>
    </Billboard>
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
  count,
  reduceMotion,
}: {
  position: [number, number, number]
  count: number
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
        <Text
          position={[0, 0, 0.03]}
          fontSize={0.28}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {String(count)}
        </Text>
      </Billboard>
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
}: {
  room: RoomLayout
  light: RoomLightState
  locked: boolean
  attentionCount?: number
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
}) {
  const [hx, , hz] = room.position
  const level = useRef(lightLevel(light))
  const floorMat = useRef<MeshStandardMaterial>(null)
  const ceilMat = useRef<MeshStandardMaterial>(null)
  const hotMat = useRef<MeshStandardMaterial>(null)
  const lamp = useRef<PointLightType>(null)
  const needsAttention = attentionCount > 0

  const floorIdle = useMemo(() => new Color(room.floor), [room.floor])
  const floorLit = useMemo(() => new Color(room.floorLit), [room.floorLit])
  const accent = useMemo(() => new Color(room.accent), [room.accent])
  const white = useMemo(() => new Color('#ffffff'), [])
  const lockedFloor = useMemo(() => new Color('#c8c4be'), [])
  const lockedHot = useMemo(() => new Color('#9a9690'), [])
  const ceilIdle = useMemo(() => new Color('#f7f2ea'), [])
  const ceilWarm = useMemo(() => new Color('#fff8ec'), [])
  const black = useMemo(() => new Color('#000000'), [])
  const lampWarm = useMemo(() => new Color('#fff8f0'), [])
  const tmp = useMemo(() => new Color(), [])
  const tmp2 = useMemo(() => new Color(), [])

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
    let L = level.current
    if (needsAttention) {
      const pulse = reduceMotion
        ? 1
        : 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.4))
      L = Math.max(L, pulse)
    }

    if (floorMat.current) {
      tmp.copy(floorIdle).lerp(floorLit, L)
      if (locked) tmp.copy(floorIdle).lerp(lockedFloor, 0.45)
      floorMat.current.color.copy(tmp)
      floorMat.current.emissive.copy(accent)
      floorMat.current.emissiveIntensity = locked ? 0 : (needsAttention ? 0.42 : 0.28) * L
    }
    if (ceilMat.current) {
      tmp.copy(ceilIdle).lerp(ceilWarm, Math.min(1, L * 1.4))
      ceilMat.current.color.copy(tmp)
      tmp2.copy(black).lerp(accent, L)
      ceilMat.current.emissive.copy(tmp2)
      ceilMat.current.emissiveIntensity = locked ? 0 : (needsAttention ? 0.62 : 0.45) * L
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
      hotMat.current.emissiveIntensity = locked ? 0.02 : lerp(0.05, needsAttention ? 0.55 : 0.35, L)
    }
    if (lamp.current) {
      lamp.current.intensity = locked ? 0.02 : lerp(0.08, needsAttention ? 1.45 : 1.1, L)
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
            : '#f5c9db'

  return (
    <group>
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
        <Ometto
          key={`${room.id}-p${i}`}
          position={pos}
          accent={room.accent}
          active={active}
          phase={phaseBase + i * 2.35 + i * 0.41}
          reduceMotion={reduceMotion}
        />
      ))}

      {/* Soft ceiling panels only — no hanging/pendant fixtures */}
      <mesh position={[hx - 0.55, 2.15, hz]}>
        <boxGeometry args={[0.95, 0.04, 0.4]} />
        <meshStandardMaterial ref={ceilMat} color="#f7f2ea" {...SOFT} />
      </mesh>
      <mesh position={[hx + 0.55, 2.15, hz]}>
        <boxGeometry args={[0.95, 0.04, 0.4]} />
        <meshStandardMaterial color="#f7f2ea" {...SOFT} />
      </mesh>
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
      <group position={[hx, 1.72, hz + halfD * 0.18]}>
        <RoomLabelChip
          label={room.label}
          hotspot={room.hotspot}
          locked={locked}
          lit={active}
        />
      </group>
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

function OfficeBuilding({
  lights,
  enabled,
  pendingCount,
  onSelect,
  reduceMotion,
}: {
  lights: Record<DeptId, RoomLightState>
  enabled: SubscriptionSkills
  pendingCount: number
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
}) {
  const woodTex = useMemo(() => makeWoodFloorTexture(), [])

  return (
    <group>
      {/* Soft exterior apron so the building sits in daylight, not a void */}
      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[28, 24]} />
        <meshStandardMaterial color="#d9e6f0" roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9.5, 48]} />
        <meshStandardMaterial color="#cfe0ec" roughness={1} metalness={0} transparent opacity={0.55} />
      </mesh>
      {/* Warm oak plank building floor (not grey) */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12.2, 10.6]} />
        <meshStandardMaterial map={woodTex} {...SOFT} />
      </mesh>
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[12.2, 0.08, 10.6]} />
        <meshStandardMaterial color={WOOD} {...SOFT} />
      </mesh>
      {/* Soft corridor runner */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.25, 9.2]} />
        <meshStandardMaterial color="#e8dcc8" {...MATTE} />
      </mesh>
      <mesh position={[0, 0.035, 1.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6.8, 1.05]} />
        <meshStandardMaterial color="#e8dcc8" {...MATTE} />
      </mesh>

      {/* Exterior walls */}
      <mesh position={[0, 1.05, -5.2]}>
        <boxGeometry args={[12.2, 2.1, 0.1]} />
        <meshStandardMaterial color={CREAM} {...SOFT} />
      </mesh>
      <mesh position={[-6.05, 1.05, 0]}>
        <boxGeometry args={[0.1, 2.1, 10.6]} />
        <meshStandardMaterial color={SAND} {...SOFT} />
      </mesh>
      <mesh position={[6.05, 1.05, 0]}>
        <boxGeometry args={[0.1, 2.1, 10.6]} />
        <meshStandardMaterial color={SAND} {...SOFT} />
      </mesh>
      <mesh position={[0, 1.05, 5.2]}>
        <boxGeometry args={[12.2, 2.1, 0.08]} />
        <meshStandardMaterial color={BLUSH_WALL} {...SOFT} />
      </mesh>

      {/* Exterior windows — soft daylight (camera sees +X/+Z corner) */}
      {/* Back wall (−Z) */}
      <ExteriorWindow position={[-3.6, 1.15, -5.12]} width={1.5} height={1.1} />
      <ExteriorWindow position={[-1.2, 1.15, -5.12]} width={1.5} height={1.1} />
      <ExteriorWindow position={[1.2, 1.15, -5.12]} width={1.5} height={1.1} />
      <ExteriorWindow position={[3.6, 1.15, -5.12]} width={1.5} height={1.1} />
      {/* Left wall (−X) facing Media / Commerce */}
      <ExteriorWindow position={[-5.97, 1.15, -3.0]} rotY={Math.PI / 2} width={1.45} height={1.1} />
      <ExteriorWindow position={[-5.97, 1.15, -0.2]} rotY={Math.PI / 2} width={1.45} height={1.1} />
      <ExteriorWindow position={[-5.97, 1.15, 2.6]} rotY={Math.PI / 2} width={1.45} height={1.1} />
      {/* Right wall (+X) facing SEO / Leads — most visible from fixed cam */}
      <ExteriorWindow position={[5.97, 1.15, -3.0]} rotY={-Math.PI / 2} width={1.45} height={1.1} />
      <ExteriorWindow position={[5.97, 1.15, -0.2]} rotY={-Math.PI / 2} width={1.45} height={1.1} />
      <ExteriorWindow position={[5.97, 1.15, 2.6]} rotY={-Math.PI / 2} width={1.45} height={1.1} />
      {/* Front wall (+Z) near Leadership */}
      <ExteriorWindow position={[-2.4, 1.15, 5.12]} rotY={Math.PI} width={1.55} height={1.05} />
      <ExteriorWindow position={[2.4, 1.15, 5.12]} rotY={Math.PI} width={1.55} height={1.05} />

      {/* Soft interior glass toward corridor (reads between rooms) */}
      <InteriorGlass position={[-1.55, 1.0, 0.35]} rotY={Math.PI / 2} width={1.4} height={1.25} />
      <InteriorGlass position={[1.55, 1.0, 0.35]} rotY={Math.PI / 2} width={1.4} height={1.25} />
      <InteriorGlass position={[-1.55, 1.0, -2.6]} rotY={Math.PI / 2} width={1.2} height={1.2} />
      <InteriorGlass position={[1.55, 1.0, -2.6]} rotY={Math.PI / 2} width={1.2} height={1.2} />

      {/* Corridor props */}
      <Plant position={[0, 0, 1.7]} scale={1.05} />
      <Plant position={[-0.85, 0, -1.4]} scale={0.8} />
      <Plant position={[0.85, 0, -1.4]} scale={0.8} />
      <Cabinet position={[0, 0, -4.55]} wide={1.1} />
      <RoundedBox args={[0.72, 0.05, 0.48]} radius={0.03} position={[0, 0.4, 0.25]}>
        <meshStandardMaterial color={DESK_TOP} {...SOFT} />
      </RoundedBox>
      <mesh position={[0, 0.18, 0.25]}>
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
}: {
  lights: Record<DeptId, RoomLightState>
  pending: Record<DeptId, number>
  enabled: SubscriptionSkills
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
}) {
  const direzionePending = pending.direzione || 0
  return (
    <div
      className={`office-light-twin${reduceMotion ? ' reduce-motion' : ''}`}
      data-testid="office-floorplan-2d"
    >
      <div className="office-light-blueprint" aria-hidden>
        <div className="office-light-sky" />
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
      </div>
      <div className="office-floorplan office-floorplan-light">
        {ROOMS.map((room) => {
          const light = lights[room.id]
          const dept = DEPARTMENTS.find((d) => d.id === room.id)
          const locked = !isDeptEnabled(room.id, enabled)
          const needsDecision = !locked && room.id === 'direzione' && direzionePending > 0
          return (
            <button
              key={room.id}
              type="button"
              className={`floor-room light-${locked ? 'off' : light} tint-${dept?.tint ?? 'gray'}${
                locked ? ' is-locked' : ''
              }${needsDecision ? ' needs-decision' : ''}`}
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
}: {
  lights: Record<DeptId, RoomLightState>
  pendingTotal: number
  enabled: SubscriptionSkills
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
  onContextLost: () => void
}) {
  return (
    <Canvas
      camera={{ position: [9.1, 10.2, 11.0], fov: 38, near: 0.1, far: 80 }}
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
        camera.lookAt(0, 0.45, 0.15)
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
        <FixedCamera />
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
        />
      </Suspense>
    </Canvas>
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
  onSelect,
  onQuickAction,
}: {
  lights: Record<DeptId, RoomLightState>
  pending: Record<DeptId, number>
  enabled: SubscriptionSkills
  /** Effective preference (already gated by entitlement on the server/client). */
  officeMode?: OfficeMode
  officeViewEntitled?: boolean
  statusLine?: string | null
  busy?: boolean
  onSelect: (id: DeptId) => void
  onQuickAction: (goal: string) => void
}) {
  const capability = useOfficeCapability()
  const reduceMotion = useReduceMotion()
  const [failed, setFailed] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const pendingTotal = pending.direzione || 0

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

  const modeBadge = useLight ? 'Vista leggera' : 'Vista completa'
  const modeHint = useLight
    ? 'Vista leggera — stessa pianta dei reparti, pensata per ogni browser. Tocca una stanza.'
    : 'Vista fissa 3D. Tocca hotspot, ometti o pavimento per entrare nel reparto.'

  return (
    <section className="office-twin" data-testid="office-twin" data-office-mode={useLight ? 'light' : 'full'}>
      <div className="office-hero">
        <header className="office-hero-head">
          <div>
            <p className="office-brand-mark">Monny</p>
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
                Richiesta per Monny
              </label>
              <textarea
                id="office-goal"
                rows={2}
                value={goalDraft}
                disabled={busy}
                placeholder="Scrivi cosa vuoi che Monny faccia…"
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
            }`}
          >
            {desired === null ? (
              <div className="office-viewport-loading" aria-busy="true">
                Preparo l’ufficio…
              </div>
            ) : useLight ? (
              <OfficeLightTwin
                lights={lights}
                pending={pending}
                enabled={enabled}
                onSelect={onSelect}
                reduceMotion={reduceMotion}
              />
            ) : (
              <CanvasErrorBoundary onError={() => setFailed(true)}>
                <HardenedOfficeCanvas
                  lights={lights}
                  pendingTotal={pendingTotal}
                  enabled={enabled}
                  onSelect={onSelect}
                  reduceMotion={reduceMotion}
                  onContextLost={() => setFailed(true)}
                />
              </CanvasErrorBoundary>
            )}
          </div>
        </div>

        <p className="office-hint">{modeHint}</p>
      </div>
    </section>
  )
}
