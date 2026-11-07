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
  Color,
  type Group,
  type MeshStandardMaterial,
  type PointLight as PointLightType,
} from 'three'
import { DEPARTMENTS, type DeptId } from './depts'
import type { RoomLightState } from './lights'

/** Soft Notion pastels — always readable, brighter when lit. */
type RoomLayout = {
  id: DeptId
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
    label: 'Direzione',
    hotspot: 1,
    position: [0, 0.04, 3.5],
    size: [4.0, 0.1, 2.5],
    floor: '#fef7d6',
    floorLit: '#f9e79f',
    wall: '#f8f5e8',
    accent: '#f5d75e',
    people: 2,
  },
  {
    id: 'spend',
    label: 'Spend',
    hotspot: 2,
    position: [-3.3, 0.04, 0.35],
    size: [3.3, 0.1, 3.1],
    floor: '#dcecfa',
    floorLit: '#b8daf5',
    wall: '#e8f3fb',
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
    wall: '#e8f7ed',
    accent: '#6fbf8f',
    people: 2,
  },
  {
    id: 'shopify',
    label: 'Shopify',
    hotspot: 4,
    position: [-3.3, 0.04, -3.1],
    size: [3.3, 0.1, 2.9],
    floor: '#ffe8d4',
    floorLit: '#ffd4b0',
    wall: '#fff1e6',
    accent: '#f0a878',
    people: 2,
  },
  {
    id: 'lead',
    label: 'Lead',
    hotspot: 5,
    position: [3.3, 0.04, -3.1],
    size: [3.3, 0.1, 2.9],
    floor: '#fde0ec',
    floorLit: '#f7c5d9',
    wall: '#fef0f5',
    accent: '#e890b8',
    people: 2,
  },
]

const MATTE = { roughness: 1, metalness: 0 } as const
/** Seconds-ish easing: higher = snappier. ~3.2 ≈ soft 0.6–0.8s feel. */
const EASE = 3.2

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
    camera.position.set(8.6, 9.6, 10.6)
    camera.lookAt(0, 0.3, 0)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
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

function FlatChair({ position, rotY = 0 }: { position: [number, number, number]; rotY?: number }) {
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <RoundedBox args={[0.32, 0.05, 0.32]} radius={0.02} position={[0, 0.28, 0]}>
        <FlatMat color="#e8e4df" />
      </RoundedBox>
      <mesh position={[0, 0.48, -0.12]}>
        <boxGeometry args={[0.3, 0.34, 0.05]} />
        <FlatMat color="#ddd8d1" />
      </mesh>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 0.26, 8]} />
        <FlatMat color="#c8c4be" />
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
  const idle = useMemo(() => new Color('#c5d9ef'), [])
  const tmp = useMemo(() => new Color(), [])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-EASE * dt)
    litAmt.current = lerp(litAmt.current, lightLevel(light), k)
    const lit = litAmt.current
    if (!screenMat.current) return
    tmp.copy(idle).lerp(accentCol, lit)
    screenMat.current.color.copy(tmp)
    screenMat.current.emissive.copy(accentCol)
    screenMat.current.emissiveIntensity = 0.15 + 0.55 * lit
  })

  return (
    <group position={position}>
      <RoundedBox args={[1.05, 0.06, 0.52]} radius={0.02} position={[0, 0.4, 0]}>
        <FlatMat color="#f0eeec" />
      </RoundedBox>
      <mesh position={[-0.38, 0.2, 0.18]}>
        <boxGeometry args={[0.06, 0.38, 0.06]} />
        <FlatMat color="#e5e3df" />
      </mesh>
      <mesh position={[0.38, 0.2, 0.18]}>
        <boxGeometry args={[0.06, 0.38, 0.06]} />
        <FlatMat color="#e5e3df" />
      </mesh>
      <mesh position={[-0.38, 0.2, -0.18]}>
        <boxGeometry args={[0.06, 0.38, 0.06]} />
        <FlatMat color="#e5e3df" />
      </mesh>
      <mesh position={[0.38, 0.2, -0.18]}>
        <boxGeometry args={[0.06, 0.38, 0.06]} />
        <FlatMat color="#e5e3df" />
      </mesh>
      <mesh position={[0, 0.62, -0.14]}>
        <boxGeometry args={[0.48, 0.32, 0.04]} />
        <meshStandardMaterial ref={screenMat} color="#c5d9ef" {...MATTE} />
      </mesh>
      <mesh position={[0, 0.44, -0.1]}>
        <boxGeometry args={[0.12, 0.08, 0.08]} />
        <FlatMat color="#d8d4ce" />
      </mesh>
      <FlatChair position={[0, 0, 0.42]} rotY={Math.PI} />
    </group>
  )
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.14, 0.11, 0.2, 10]} />
        <FlatMat color="#d9b89a" />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.22, 6]} />
        <FlatMat color="#6a8f6a" />
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
      <RoundedBox args={[wide, 0.72, 0.32]} radius={0.02} position={[0, 0.36, 0]}>
        <FlatMat color="#efebe6" />
      </RoundedBox>
      <mesh position={[0, 0.36, 0.165]}>
        <boxGeometry args={[wide * 0.08, 0.12, 0.02]} />
        <FlatMat color="#c8c4be" />
      </mesh>
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[wide * 0.92, 0.04, 0.28]} />
        <FlatMat color="#e5e3df" />
      </mesh>
    </group>
  )
}

function SoftLamp({
  position,
  light = 'off',
  accent,
}: {
  position: [number, number, number]
  light?: RoomLightState
  accent: string
}) {
  const shade = useRef<MeshStandardMaterial>(null)
  const litAmt = useRef(lightLevel(light))
  const accentCol = useMemo(() => new Color(accent), [accent])
  const warm = useMemo(() => new Color('#fff6e8'), [])
  const tmp = useMemo(() => new Color(), [])
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-EASE * dt)
    litAmt.current = lerp(litAmt.current, lightLevel(light), k)
    const lit = litAmt.current
    if (!shade.current) return
    tmp.copy(warm).lerp(accentCol, lit * 0.55)
    shade.current.color.copy(tmp)
    shade.current.emissive.copy(tmp)
    shade.current.emissiveIntensity = 0.12 + 0.55 * lit
  })
  return (
    <group position={position}>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.26, 0.34, 0.12, 16]} />
        <meshStandardMaterial ref={shade} color="#fff6e8" {...MATTE} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.22, 6]} />
        <FlatMat color="#d8d4ce" />
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
  const idle = useMemo(() => new Color('#f7f6f3'), [])
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
      <RoundedBox args={[1.35, 0.82, 0.06]} radius={0.02} position={[0, 0, 0]}>
        <FlatMat color="#d8d4ce" />
      </RoundedBox>
      <RoundedBox args={[1.22, 0.7, 0.04]} radius={0.015} position={[0, 0, 0.03]}>
        <meshStandardMaterial ref={board} color="#f7f6f3" {...MATTE} />
      </RoundedBox>
      <mesh position={[0.1, 0.12, 0.06]}>
        <boxGeometry args={[0.75, 0.1, 0.01]} />
        <FlatMat color="#dcecfa" />
      </mesh>
      <mesh position={[-0.18, -0.08, 0.06]}>
        <boxGeometry args={[0.55, 0.07, 0.01]} />
        <FlatMat color="#e6e0f5" />
      </mesh>
      <mesh position={[0.2, -0.22, 0.06]}>
        <boxGeometry args={[0.4, 0.05, 0.01]} />
        <FlatMat color="#fde0ec" />
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
      <RoundedBox args={[1.55, 0.07, 0.85]} radius={0.035} position={[0, 0.44, 0]}>
        <FlatMat color="#f3efe8" />
      </RoundedBox>
      <mesh position={[0, 0.21, 0]}>
        <cylinderGeometry args={[0.1, 0.14, 0.4, 10]} />
        <FlatMat color="#ddd6cc" />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[0.35, 0.03, 0.25]} />
        <FlatMat color="#e6e0f5" />
      </mesh>
      <FlatChair position={[0, 0, 0.65]} rotY={Math.PI} />
      <FlatChair position={[-0.5, 0, -0.65]} />
      <FlatChair position={[0.5, 0, -0.65]} />
    </group>
  )
}

function LowPartition({
  position,
  size,
  color = '#e2ddd6',
}: {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
}) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={size} />
        <FlatMat color={color} />
      </mesh>
      {/* Soft top rail so partitions read clearly from isometric view */}
      <mesh position={[0, size[1] / 2 + 0.025, 0]}>
        <boxGeometry args={[size[0] * 1.05, 0.05, size[2] * 1.05]} />
        <FlatMat color="#d0cbc3" />
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
  attentionCount = 0,
  onSelect,
  reduceMotion,
}: {
  room: RoomLayout
  light: RoomLightState
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
  const ceilIdle = useMemo(() => new Color('#f6f5f4'), [])
  const ceilWarm = useMemo(() => new Color('#fffdf5'), [])
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
    const target = lightLevel(light)
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
      floorMat.current.color.copy(tmp)
      floorMat.current.emissive.copy(accent)
      floorMat.current.emissiveIntensity = (needsAttention ? 0.42 : 0.28) * L
    }
    if (ceilMat.current) {
      tmp.copy(ceilIdle).lerp(ceilWarm, Math.min(1, L * 1.4))
      ceilMat.current.color.copy(tmp)
      tmp2.copy(black).lerp(accent, L)
      ceilMat.current.emissive.copy(tmp2)
      ceilMat.current.emissiveIntensity = (needsAttention ? 0.62 : 0.45) * L
    }
    if (hotMat.current) {
      tmp.copy(white).lerp(accent, L)
      hotMat.current.color.copy(tmp)
      hotMat.current.emissive.copy(tmp)
      hotMat.current.emissiveIntensity = lerp(0.05, needsAttention ? 0.55 : 0.35, L)
    }
    if (lamp.current) {
      lamp.current.intensity = lerp(0.08, needsAttention ? 1.45 : 1.1, L)
      lamp.current.color.copy(lampWarm).lerp(accent, L)
    }
  })

  const active = light === 'on' || needsAttention
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
          document.body.style.cursor = 'pointer'
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

      {/* Back wall + low side partitions */}
      <mesh position={[hx, 0.55, hz - halfD + 0.05]}>
        <boxGeometry args={[room.size[0] * 0.92, 1.05, 0.07]} />
        <FlatMat color={room.wall} />
      </mesh>
      <LowPartition
        position={[hx - halfW + 0.05, 0.48, hz]}
        size={[0.08, 0.92, room.size[2] * 0.82]}
      />
      <LowPartition
        position={[hx + halfW - 0.05, 0.48, hz]}
        size={[0.08, 0.92, room.size[2] * 0.82]}
      />
      {/* Front low half-wall so rooms feel enclosed without blocking labels */}
      <LowPartition
        position={[hx, 0.28, hz + halfD - 0.06]}
        size={[room.size[0] * 0.55, 0.52, 0.07]}
      />

      <Whiteboard
        position={[hx, 1.15, hz - halfD + 0.14]}
        light={light === 'off' && needsAttention ? 'on' : light}
        accent={room.accent}
      />

      {room.id === 'direzione' ? (
        <>
          <MeetingTable position={[hx + 0.15, 0, hz + 0.25]} />
          <FlatDesk position={[hx - 1.15, 0, hz - 0.55]} accent={room.accent} light={light} />
          <Cabinet position={[hx + 1.35, 0, hz - 0.75]} rotY={-0.12} wide={0.62} />
          <Cabinet position={[hx - 1.45, 0, hz - 0.75]} rotY={0.12} wide={0.5} />
          <Plant position={[hx - 1.55, 0, hz + 0.9]} scale={1.05} />
          <Plant position={[hx + 1.5, 0, hz + 0.8]} scale={0.95} />
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

      {/* Ceiling soft panels + hanging lamps */}
      <mesh position={[hx - 0.55, 2.15, hz]}>
        <boxGeometry args={[0.95, 0.04, 0.4]} />
        <meshStandardMaterial ref={ceilMat} color="#f6f5f4" {...MATTE} />
      </mesh>
      <mesh position={[hx + 0.55, 2.15, hz]}>
        <boxGeometry args={[0.95, 0.04, 0.4]} />
        <FlatMat color="#f6f5f4" />
      </mesh>
      <SoftLamp position={[hx - 0.55, 1.95, hz]} accent={room.accent} light={light} />
      <SoftLamp
        position={[hx + 0.55, 1.95, hz]}
        accent={room.accent}
        light={light === 'off' && needsAttention ? 'on' : light}
      />
      <pointLight ref={lamp} position={[hx, 2.0, hz]} intensity={0.08} distance={5.5} color="#fff8f0" />

      <mesh
        position={[hx, 1.35, hz + halfD * 0.15]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(room.id)
        }}
      >
        <cylinderGeometry
          args={[needsAttention ? 0.26 : 0.2, needsAttention ? 0.26 : 0.2, 0.06, 24]}
        />
        <meshStandardMaterial ref={hotMat} color="#ffffff" {...MATTE} />
      </mesh>
      <Billboard position={[hx, 1.65, hz + halfD * 0.15]}>
        <Text
          fontSize={0.26}
          color="#37352f"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#ffffff"
        >
          {`${room.hotspot} · ${room.label}`}
        </Text>
      </Billboard>
      {needsAttention && (
        <DecisionHotspotBadge
          position={[hx + 0.72, 1.8, hz + halfD * 0.15]}
          count={attentionCount}
          reduceMotion={reduceMotion}
        />
      )}
    </group>
  )
}

function OfficeBuilding({
  lights,
  pendingCount,
  onSelect,
  reduceMotion,
}: {
  lights: Record<DeptId, RoomLightState>
  pendingCount: number
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
}) {
  return (
    <group>
      {/* Building shell + shared corridor floor */}
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[12.2, 0.08, 10.6]} />
        <FlatMat color="#f3f1ee" />
      </mesh>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.35, 9.4]} />
        <meshStandardMaterial color="#e9e5df" {...MATTE} />
      </mesh>
      <mesh position={[0, 0.035, 1.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7.2, 1.15]} />
        <meshStandardMaterial color="#e9e5df" {...MATTE} />
      </mesh>

      <mesh position={[0, 1.05, -5.2]}>
        <boxGeometry args={[12.2, 2.1, 0.1]} />
        <FlatMat color="#f0eeec" />
      </mesh>
      <mesh position={[-6.05, 1.05, 0]}>
        <boxGeometry args={[0.1, 2.1, 10.6]} />
        <FlatMat color="#f0eeec" />
      </mesh>
      <mesh position={[6.05, 1.05, 0]}>
        <boxGeometry args={[0.1, 2.1, 10.6]} />
        <FlatMat color="#f0eeec" />
      </mesh>
      <mesh position={[0, 1.05, 5.2]}>
        <boxGeometry args={[12.2, 2.1, 0.08]} />
        <FlatMat color="#e6e0f5" />
      </mesh>

      {/* Corridor props */}
      <Plant position={[0, 0, 1.7]} scale={1.05} />
      <Plant position={[-0.85, 0, -1.4]} scale={0.8} />
      <Plant position={[0.85, 0, -1.4]} scale={0.8} />
      <Cabinet position={[0, 0, -4.55]} wide={1.1} />
      <RoundedBox args={[0.7, 0.05, 0.45]} radius={0.02} position={[0, 0.38, 0.2]}>
        <FlatMat color="#efebe6" />
      </RoundedBox>
      <mesh position={[0, 0.18, 0.2]}>
        <cylinderGeometry args={[0.05, 0.07, 0.34, 8]} />
        <FlatMat color="#d8d4ce" />
      </mesh>

      {ROOMS.map((room) => (
        <RoomZone
          key={room.id}
          room={room}
          light={lights[room.id]}
          attentionCount={room.id === 'direzione' ? pendingCount : 0}
          onSelect={onSelect}
          reduceMotion={reduceMotion}
        />
      ))}
    </group>
  )
}

function FloorPlan2D({
  lights,
  pending,
  onSelect,
}: {
  lights: Record<DeptId, RoomLightState>
  pending: Record<DeptId, number>
  onSelect: (id: DeptId) => void
}) {
  const direzionePending = pending.direzione || 0
  return (
    <div className="office-floorplan" data-testid="office-floorplan-2d">
      {ROOMS.map((room) => {
        const light = lights[room.id]
        const dept = DEPARTMENTS.find((d) => d.id === room.id)
        const needsDecision = room.id === 'direzione' && direzionePending > 0
        return (
          <button
            key={room.id}
            type="button"
            className={`floor-room light-${light} tint-${dept?.tint ?? 'gray'}${
              needsDecision ? ' needs-decision' : ''
            }`}
            style={{ gridArea: room.id }}
            onClick={() => onSelect(room.id)}
          >
            <span className="floor-hotspot-row">
              <span className="floor-hotspot">{room.hotspot}</span>
              {needsDecision && (
                <span className="decision-count-badge" aria-label={`${direzionePending} decisioni`}>
                  {direzionePending}
                </span>
              )}
            </span>
            <strong>{dept?.name ?? room.label}</strong>
            <div className="floor-people" aria-hidden>
              {Array.from({ length: room.people }).map((_, i) => (
                <span
                  key={i}
                  className={`ometto-2d ${light === 'on' || needsDecision ? 'active' : ''}`}
                />
              ))}
            </div>
            <span className="floor-state">
              {needsDecision
                ? 'Decisioni in attesa'
                : light === 'on'
                  ? 'Luci accese'
                  : light === 'soft'
                    ? 'Si stanno spegnendo…'
                    : 'In attesa'}
            </span>
            {(pending[room.id] || 0) > 0 && room.id !== 'direzione' && (
              <span className="dept-pending">{pending[room.id]} in attesa</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

const OFFICE_SHORTCUTS = [
  { label: 'Controlla le ads', goal: 'report spend ultimi 7 giorni' },
  { label: 'Controlla SEO', goal: 'seo audit of priority pages' },
] as const

function usePreferFallback(): boolean {
  const [fallback, setFallback] = useState(false)
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let webgl = true
    try {
      const canvas = document.createElement('canvas')
      webgl = !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    } catch {
      webgl = false
    }
    setFallback(reduced || !webgl)
  }, [])
  return fallback
}

function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
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

export function OfficeTwin({
  lights,
  pending,
  statusLine,
  busy,
  onSelect,
  onQuickAction,
}: {
  lights: Record<DeptId, RoomLightState>
  pending: Record<DeptId, number>
  statusLine?: string | null
  busy?: boolean
  onSelect: (id: DeptId) => void
  onQuickAction: (goal: string) => void
}) {
  const fallback = usePreferFallback()
  const reduceMotion = useReduceMotion()
  const [failed, setFailed] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const use2d = fallback || failed
  const pendingTotal = pending.direzione || 0

  const litNames = useMemo(
    () =>
      DEPARTMENTS.filter((d) => lights[d.id] === 'on')
        .map((d) => d.name)
        .join(', '),
    [lights],
  )

  const sendGoal = (goal: string) => {
    const text = goal.trim()
    if (!text || busy) return
    onQuickAction(text)
    setGoalDraft('')
  }

  return (
    <section className="office-twin" data-testid="office-twin">
      <div className="page-intro">
        <div>
          <h1>Ufficio Monny</h1>
          <p>
            Ufficio digitale dei reparti. Scrivi cosa vuoi che Monny faccia, oppure
            scegli un suggerimento. Quando una skill lavora, si accendono luci e ometti.
          </p>
        </div>
      </div>

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
        {OFFICE_SHORTCUTS.map((s) => (
          <button
            key={s.goal}
            type="button"
            className="chip-shortcut"
            disabled={busy}
            onClick={() => sendGoal(s.goal)}
          >
            {s.label}
          </button>
        ))}
        {statusLine && <span className="office-status">{statusLine}</span>}
        {litNames && <span className="office-status lit">Luci: {litNames}</span>}
        {pendingTotal > 0 && (
          <span className="office-status decisions">
            {pendingTotal} {pendingTotal === 1 ? 'decisione' : 'decisioni'} · Direzione
          </span>
        )}
      </div>

      <div
        className={`office-viewport flat-pastel locked-view ${use2d ? 'is-2d' : 'is-3d'}${
          pendingTotal > 0 ? ' has-decisions' : ''
        }`}
      >
        {use2d ? (
          <FloorPlan2D lights={lights} pending={pending} onSelect={onSelect} />
        ) : (
          <CanvasErrorBoundary onError={() => setFailed(true)}>
            <Canvas
              camera={{ position: [8.6, 9.6, 10.6], fov: 40, near: 0.1, far: 80 }}
              dpr={[1, 1.5]}
              gl={{ antialias: true }}
              style={{ touchAction: 'manipulation' }}
              onCreated={({ gl, camera }) => {
                gl.setClearColor('#f0eeec')
                gl.shadowMap.enabled = false
                camera.lookAt(0, 0.3, 0)
              }}
            >
              <Suspense fallback={null}>
                <FixedCamera />
                <ambientLight intensity={0.92} />
                <hemisphereLight args={['#ffffff', '#e8e4d8', 0.45]} />
                <directionalLight position={[5, 10, 3]} intensity={0.35} />
                <OfficeBuilding
                  lights={lights}
                  pendingCount={pendingTotal}
                  onSelect={onSelect}
                  reduceMotion={reduceMotion}
                />
              </Suspense>
            </Canvas>
          </CanvasErrorBoundary>
        )}
      </div>

      <p className="office-hint">
        {use2d
          ? 'Vista pianta 2D (WebGL non disponibile o motion ridotta). Clicca una stanza.'
          : 'Vista fissa dell’ufficio. Clicca hotspot, ometti o pavimento per entrare nel reparto.'}
      </p>
    </section>
  )
}
