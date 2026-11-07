import { Canvas } from '@react-three/fiber'
import { Billboard, OrbitControls, RoundedBox, Text } from '@react-three/drei'
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEPARTMENTS, type DeptId } from './depts'
import type { RoomLightState } from './lights'

type RoomLayout = {
  id: DeptId
  label: string
  hotspot: number
  position: [number, number, number]
  size: [number, number, number]
  idle: string
  lit: string
  soft: string
}

const ROOMS: RoomLayout[] = [
  {
    id: 'direzione',
    label: 'Direzione',
    hotspot: 1,
    position: [0, 0.05, 3.6],
    size: [4.2, 0.12, 2.6],
    idle: '#e8e4d8',
    lit: '#f5d75e',
    soft: '#fef7d6',
  },
  {
    id: 'spend',
    label: 'Spend',
    hotspot: 2,
    position: [-3.4, 0.05, 0.4],
    size: [3.4, 0.12, 3.2],
    idle: '#d8dde3',
    lit: '#7eb8e8',
    soft: '#dcecfa',
  },
  {
    id: 'seo',
    label: 'SEO',
    hotspot: 3,
    position: [3.4, 0.05, 0.4],
    size: [3.4, 0.12, 3.2],
    idle: '#d5e0d8',
    lit: '#6fbf8f',
    soft: '#d9f3e1',
  },
  {
    id: 'shopify',
    label: 'Shopify',
    hotspot: 4,
    position: [-3.4, 0.05, -3.2],
    size: [3.4, 0.12, 3.0],
    idle: '#e4d8d0',
    lit: '#f0a878',
    soft: '#ffe8d4',
  },
  {
    id: 'lead',
    label: 'Lead',
    hotspot: 5,
    position: [3.4, 0.05, -3.2],
    size: [3.4, 0.12, 3.0],
    idle: '#e2d4dc',
    lit: '#e890b8',
    soft: '#fde0ec',
  },
]

function roomColor(room: RoomLayout, light: RoomLightState): string {
  if (light === 'on') return room.lit
  if (light === 'soft') return room.soft
  return room.idle
}

function Desk({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[1.1, 0.08, 0.55]} radius={0.02} position={[0, 0.42, 0]}>
        <meshStandardMaterial color="#c8c4be" roughness={0.7} />
      </RoundedBox>
      {[
        [-0.4, 0.2, 0.18],
        [0.4, 0.2, 0.18],
        [-0.4, 0.2, -0.18],
        [0.4, 0.2, -0.18],
      ].map((p, i) => (
        <mesh key={i} position={p as [number, number, number]}>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
          <meshStandardMaterial color="#a8a49e" />
        </mesh>
      ))}
    </group>
  )
}

function RoomZone({
  room,
  light,
  onSelect,
}: {
  room: RoomLayout
  light: RoomLightState
  onSelect: (id: DeptId) => void
}) {
  const color = roomColor(room, light)
  const emissive = light === 'on' ? room.lit : light === 'soft' ? room.soft : '#000000'
  const emissiveIntensity = light === 'on' ? 0.55 : light === 'soft' ? 0.18 : 0
  const pointIntensity = light === 'on' ? 2.4 : light === 'soft' ? 0.55 : 0.05
  const [hx, , hz] = room.position

  return (
    <group>
      <mesh
        position={room.position}
        receiveShadow
        castShadow
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
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      <mesh position={[hx, 0.45, hz - room.size[2] / 2 + 0.05]}>
        <boxGeometry args={[room.size[0] * 0.92, 0.7, 0.08]} />
        <meshStandardMaterial color="#f0eeec" roughness={0.9} />
      </mesh>

      <Desk position={[hx - 0.7, 0, hz + 0.2]} />
      <Desk position={[hx + 0.7, 0, hz - 0.35]} />

      <mesh position={[hx, 2.35, hz]}>
        <boxGeometry args={[Math.min(room.size[0] * 0.55, 1.8), 0.06, 0.55]} />
        <meshStandardMaterial
          color={light === 'off' ? '#ddd9d2' : '#fff8e7'}
          emissive={light === 'off' ? '#000000' : '#ffe9a8'}
          emissiveIntensity={light === 'on' ? 1.2 : light === 'soft' ? 0.35 : 0}
        />
      </mesh>
      <pointLight
        position={[hx, 2.1, hz]}
        intensity={pointIntensity}
        distance={6}
        color={light === 'on' ? '#ffe6a0' : '#f5f0e6'}
      />

      {/* Hotspot marker */}
      <mesh
        position={[hx, 1.35, hz]}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(room.id)
        }}
      >
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial
          color={light === 'on' ? '#f5d75e' : '#ffffff'}
          emissive={light === 'on' ? '#f5d75e' : '#ffffff'}
          emissiveIntensity={light === 'on' ? 0.6 : 0.15}
        />
      </mesh>
      <Billboard position={[hx, 1.75, hz]}>
        <Text
          fontSize={0.28}
          color="#0a1530"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
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
}: {
  lights: Record<DeptId, RoomLightState>
  onSelect: (id: DeptId) => void
}) {
  return (
    <group>
      <mesh position={[0, -0.02, 0]} receiveShadow>
        <boxGeometry args={[12.5, 0.08, 11]} />
        <meshStandardMaterial color="#f6f5f4" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.1, -5.4]}>
        <boxGeometry args={[12.5, 2.2, 0.12]} />
        <meshStandardMaterial color="#eceae6" />
      </mesh>
      <mesh position={[-6.2, 1.1, 0]}>
        <boxGeometry args={[0.12, 2.2, 11]} />
        <meshStandardMaterial color="#eceae6" />
      </mesh>
      <mesh position={[6.2, 1.1, 0]}>
        <boxGeometry args={[0.12, 2.2, 11]} />
        <meshStandardMaterial color="#eceae6" />
      </mesh>
      <mesh position={[0, 1.1, 5.4]}>
        <boxGeometry args={[12.5, 2.2, 0.08]} />
        <meshStandardMaterial color="#c5d6e8" transparent opacity={0.35} />
      </mesh>

      {ROOMS.map((room) => (
        <RoomZone key={room.id} room={room} light={lights[room.id]} onSelect={onSelect} />
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
            Digital twin dei reparti. Quando una skill lavora, si accendono le luci di
            quella zona. Clicca una stanza per entrare.
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

      <div className={`office-viewport ${use2d ? 'is-2d' : 'is-3d'}`}>
        {use2d ? (
          <FloorPlan2D lights={lights} pending={pending} onSelect={onSelect} />
        ) : (
          <CanvasErrorBoundary onError={() => setFailed(true)}>
            <Canvas
              shadows
              camera={{ position: [9, 10, 11], fov: 42, near: 0.1, far: 80 }}
              dpr={[1, 1.75]}
              onCreated={({ gl }) => {
                gl.setClearColor('#1a2438')
              }}
            >
              <Suspense fallback={null}>
                <ambientLight intensity={0.35} />
                <directionalLight position={[6, 12, 4]} intensity={0.55} castShadow />
                <OfficeBuilding lights={lights} onSelect={onSelect} />
                <OrbitControls
                  enablePan
                  enableZoom
                  minPolarAngle={0.35}
                  maxPolarAngle={1.25}
                  minDistance={8}
                  maxDistance={22}
                  target={[0, 0.4, 0]}
                />
              </Suspense>
            </Canvas>
          </CanvasErrorBoundary>
        )}
      </div>

      <p className="office-hint">
        {use2d
          ? 'Vista pianta 2D (WebGL non disponibile o motion ridotta).'
          : 'Trascina per orbitare · clicca hotspot o pavimento della stanza.'}
      </p>
    </section>
  )
}
