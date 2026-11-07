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

/** Simple stylized person with eased active state. */
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
      const speed = lerp(1.1, 2.4, a)
      const amp = reduceMotion ? 0 : lerp(0.03, 0.06, a)
      ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * speed + phase) * amp
      ref.current.rotation.y = reduceMotion
        ? 0
        : Math.sin(clock.elapsedTime * 1.6 + phase) * 0.12 * a
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

function FlatDesk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.0, 0.06, 0.5]} radius={0.02} position={[0, 0.4, 0]}>
        <FlatMat color="#f0eeec" />
      </RoundedBox>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.9, 0.04, 0.08]} />
        <FlatMat color="#e5e3df" />
      </mesh>
      <mesh position={[0, 0.62, -0.12]}>
        <boxGeometry args={[0.42, 0.28, 0.04]} />
        <FlatMat color="#dcecfa" />
      </mesh>
    </group>
  )
}

function RoomZone({
  room,
  light,
  onSelect,
  reduceMotion,
}: {
  room: RoomLayout
  light: RoomLightState
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
}) {
  const [hx, , hz] = room.position
  const level = useRef(lightLevel(light))
  const floorMat = useRef<MeshStandardMaterial>(null)
  const ceilMat = useRef<MeshStandardMaterial>(null)
  const hotMat = useRef<MeshStandardMaterial>(null)
  const lamp = useRef<PointLightType>(null)

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

  const peopleOffsets = useMemo(() => {
    const offsets: [number, number, number][] = []
    for (let i = 0; i < room.people; i++) {
      const side = i % 2 === 0 ? -1 : 1
      offsets.push([hx + side * 0.55, 0, hz + (i < 2 ? 0.15 : -0.45)])
    }
    return offsets
  }, [hx, hz, room.people])

  useFrame((_, dt) => {
    const target = lightLevel(light)
    const k = reduceMotion ? 1 : 1 - Math.exp(-EASE * dt)
    level.current = lerp(level.current, target, k)
    const L = level.current

    if (floorMat.current) {
      tmp.copy(floorIdle).lerp(floorLit, L)
      floorMat.current.color.copy(tmp)
      floorMat.current.emissive.copy(accent)
      floorMat.current.emissiveIntensity = 0.28 * L
    }
    if (ceilMat.current) {
      tmp.copy(ceilIdle).lerp(ceilWarm, Math.min(1, L * 1.4))
      ceilMat.current.color.copy(tmp)
      tmp2.copy(black).lerp(accent, L)
      ceilMat.current.emissive.copy(tmp2)
      ceilMat.current.emissiveIntensity = 0.45 * L
    }
    if (hotMat.current) {
      tmp.copy(white).lerp(accent, L)
      hotMat.current.color.copy(tmp)
      hotMat.current.emissive.copy(tmp)
      hotMat.current.emissiveIntensity = lerp(0.05, 0.35, L)
    }
    if (lamp.current) {
      lamp.current.intensity = lerp(0.08, 1.1, L)
      lamp.current.color.copy(lampWarm).lerp(accent, L)
    }
  })

  const active = light === 'on'

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

      <mesh position={[hx, 0.42, hz - room.size[2] / 2 + 0.06]}>
        <boxGeometry args={[room.size[0] * 0.9, 0.72, 0.07]} />
        <FlatMat color={room.wall} />
      </mesh>

      <FlatDesk position={[hx - 0.75, 0, hz + 0.15]} />
      <FlatDesk position={[hx + 0.75, 0, hz - 0.4]} />

      {peopleOffsets.map((pos, i) => (
        <Ometto
          key={`${room.id}-p${i}`}
          position={pos}
          accent={room.accent}
          active={active}
          phase={i * 1.3}
          reduceMotion={reduceMotion}
        />
      ))}

      <mesh position={[hx, 2.2, hz]}>
        <boxGeometry args={[Math.min(room.size[0] * 0.5, 1.6), 0.05, 0.45]} />
        <meshStandardMaterial ref={ceilMat} color="#f6f5f4" {...MATTE} />
      </mesh>
      <pointLight ref={lamp} position={[hx, 2.0, hz]} intensity={0.08} distance={5.5} color="#fff8f0" />

      <mesh
        position={[hx, 1.25, hz]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(room.id)
        }}
      >
        <cylinderGeometry args={[0.2, 0.2, 0.06, 24]} />
        <meshStandardMaterial ref={hotMat} color="#ffffff" {...MATTE} />
      </mesh>
      <Billboard position={[hx, 1.55, hz]}>
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
    </group>
  )
}

function OfficeBuilding({
  lights,
  onSelect,
  reduceMotion,
}: {
  lights: Record<DeptId, RoomLightState>
  onSelect: (id: DeptId) => void
  reduceMotion: boolean
}) {
  return (
    <group>
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[12.2, 0.08, 10.6]} />
        <FlatMat color="#fafaf9" />
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

      {ROOMS.map((room) => (
        <RoomZone
          key={room.id}
          room={room}
          light={lights[room.id]}
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
  return (
    <div className="office-floorplan" data-testid="office-floorplan-2d">
      {ROOMS.map((room) => {
        const light = lights[room.id]
        const dept = DEPARTMENTS.find((d) => d.id === room.id)
        return (
          <button
            key={room.id}
            type="button"
            className={`floor-room light-${light} tint-${dept?.tint ?? 'gray'}`}
            style={{ gridArea: room.id }}
            onClick={() => onSelect(room.id)}
          >
            <span className="floor-hotspot">{room.hotspot}</span>
            <strong>{dept?.name ?? room.label}</strong>
            <div className="floor-people" aria-hidden>
              {Array.from({ length: room.people }).map((_, i) => (
                <span key={i} className={`ometto-2d ${light === 'on' ? 'active' : ''}`} />
              ))}
            </div>
            <span className="floor-state">
              {light === 'on' ? 'Luci accese' : light === 'soft' ? 'Attività recente' : 'In attesa'}
            </span>
            {(pending[room.id] || 0) > 0 && (
              <span className="dept-pending">{pending[room.id]} in attesa</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

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
  const use2d = fallback || failed

  const litNames = useMemo(
    () =>
      DEPARTMENTS.filter((d) => lights[d.id] === 'on')
        .map((d) => d.name)
        .join(', '),
    [lights],
  )

  return (
    <section className="office-twin" data-testid="office-twin">
      <div className="page-intro">
        <div>
          <h1>Ufficio Monny</h1>
          <p>
            Ufficio digitale dei reparti. Quando una skill lavora, si accendono le luci
            e gli ometti di quella zona. Clicca una stanza per entrare.
          </p>
        </div>
      </div>

      <div className="office-toolbar">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onQuickAction('report spend ultimi 7 giorni')}
        >
          {busy ? 'In corso…' : 'Controlla le ads'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => onQuickAction('seo audit of priority pages')}
        >
          Controlla SEO
        </button>
        {statusLine && <span className="office-status">{statusLine}</span>}
        {litNames && <span className="office-status lit">Luci: {litNames}</span>}
      </div>

      <div className={`office-viewport flat-pastel locked-view ${use2d ? 'is-2d' : 'is-3d'}`}>
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
