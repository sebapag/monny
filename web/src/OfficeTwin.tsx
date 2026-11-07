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

  const peopleOffsets = useMemo(() => {
    const offsets: [number, number, number][] = []
    for (let i = 0; i < room.people; i++) {
      const side = i % 2 === 0 ? -1 : 1
      offsets.push([hx + side * 0.55, 0, hz + (i < 2 ? 0.15 : -0.45)])
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
        <cylinderGeometry args={[needsAttention ? 0.26 : 0.2, needsAttention ? 0.26 : 0.2, 0.06, 24]} />
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
      {needsAttention && (
        <DecisionHotspotBadge
          position={[hx + 0.72, 1.7, hz]}
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
