import { useEffect, useRef } from 'react'

// Drifting "Echo" particles + slow rotating resonance rings behind the graph.
export default function Starfield() {
  const ref = useRef()
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    let raf, W, H
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => { W = c.width = innerWidth * dpr; H = c.height = innerHeight * dpr }
    resize(); addEventListener('resize', resize)
    const stars = Array.from({ length: 180 }, () => ({
      x: Math.random(), y: Math.random(), z: Math.random(), tw: Math.random() * 6.28,
      gold: Math.random() < 0.12,
    }))
    const loop = (t) => {
      ctx.clearRect(0, 0, W, H)
      // rings
      const cx = W * 0.5, cy = H * 0.52, base = Math.min(W, H)
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((t / 1000) * (0.02 + i * 0.012) * (i % 2 ? -1 : 1))
        ctx.strokeStyle = `rgba(232,199,122,${0.05 - i * 0.012})`; ctx.lineWidth = dpr
        ctx.setLineDash([2 * dpr, (10 + i * 6) * dpr])
        ctx.beginPath(); ctx.arc(0, 0, base * (0.32 + i * 0.13), 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
        for (let k = 0; k < 6; k++) { // tick marks
          const a = (k / 6) * Math.PI * 2, r = base * (0.32 + i * 0.13)
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r - 6 * dpr), Math.sin(a) * (r - 6 * dpr)); ctx.lineTo(Math.cos(a) * (r + 6 * dpr), Math.sin(a) * (r + 6 * dpr))
          ctx.strokeStyle = 'rgba(94,230,255,0.08)'; ctx.stroke()
        }
        ctx.restore()
      }
      for (const s of stars) {
        s.y -= 0.00004 * (0.3 + s.z); if (s.y < 0) s.y = 1
        const a = 0.25 + 0.5 * Math.abs(Math.sin(t / 1400 + s.tw))
        ctx.fillStyle = s.gold ? `rgba(242,200,107,${a})` : `rgba(160,220,255,${a * 0.7})`
        ctx.beginPath(); ctx.arc(s.x * W, s.y * H, (0.4 + s.z * 1.2) * dpr, 0, Math.PI * 2); ctx.fill()
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize) }
  }, [])
  return <canvas ref={ref} className="starfield" />
}
