import './OrbitIllustration.css'

const CX = 200
const CY = 200

const orbits = [
  { rx: 70, ry: 42, tilt: -18 },
  { rx: 120, ry: 70, tilt: -18 },
  { rx: 175, ry: 100, tilt: -18 },
]

// Each satellite sits on an orbit at a given parametric angle (degrees).
const satellites = [
  { orbit: 0, angle: 210, accent: false },
  { orbit: 1, angle: 20, accent: true },
  { orbit: 1, angle: 150, accent: false },
  { orbit: 2, angle: 300, accent: false },
  { orbit: 2, angle: 95, accent: false },
]

function pointOnOrbit(orbitIndex: number, angleDeg: number) {
  const { rx, ry, tilt } = orbits[orbitIndex]
  const t = (angleDeg * Math.PI) / 180
  const r = (tilt * Math.PI) / 180
  const x = rx * Math.cos(t)
  const y = ry * Math.sin(t)
  return {
    x: CX + x * Math.cos(r) - y * Math.sin(r),
    y: CY + x * Math.sin(r) + y * Math.cos(r),
  }
}

export default function OrbitIllustration() {
  return (
    <svg
      className="orbit"
      viewBox="20 80 360 240"
      role="img"
      aria-label="Illustration of satellites on concentric orbits around a planet"
    >
      {orbits.map(({ rx, ry, tilt }, i) => (
        <ellipse
          key={i}
          className="orbit-path"
          cx={CX}
          cy={CY}
          rx={rx}
          ry={ry}
          transform={`rotate(${tilt} ${CX} ${CY})`}
        />
      ))}
      <circle className="orbit-body" cx={CX} cy={CY} r={26} />
      {satellites.map(({ orbit, angle, accent }, i) => {
        const { x, y } = pointOnOrbit(orbit, angle)
        return (
          <g key={i}>
            {accent && <circle className="orbit-halo" cx={x} cy={y} r={14} />}
            <circle
              className={accent ? 'orbit-sat is-accent' : 'orbit-sat'}
              cx={x}
              cy={y}
              r={accent ? 6 : 4.5}
            />
          </g>
        )
      })}
    </svg>
  )
}
