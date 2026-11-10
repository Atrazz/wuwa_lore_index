import { useCallback, useEffect, useMemo, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCollide, forceRadial } from 'd3-force'
import { KINDS, EDGE, id } from '../lib/kinds'

const ORBIT = 620 // radius of the real-world ring
const BG = '#050b10'
const HUD = '#6fe6dc'
const WHITE = '#eef8fa'

const imgs = {}
const img = (src) => {
  if (!src) return null
  if (!imgs[src]) { imgs[src] = new Image(); imgs[src].src = src }
  return imgs[src]
}
const rgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
const radius = (n) => (n.kind === 'character' ? 8.5 : 3.5 + Math.sqrt(n.degree || 1) * 1.45)

function shape(ctx, kind, x, y, r) {
  ctx.beginPath()
  switch (KINDS[kind]?.shape) {
    case 'hexagon':
      for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) }
      ctx.closePath(); break
    case 'diamond':
      ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.15); ctx.lineTo(x - r, y); ctx.closePath(); break
    case 'triangle':
      ctx.moveTo(x, y - r * 1.15); ctx.lineTo(x + r * 1.1, y + r * 0.8); ctx.lineTo(x - r * 1.1, y + r * 0.8); ctx.closePath(); break
    case 'star':
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2)
  }
}

// text drawn at a fixed screen size (scaling the font itself garbles letter spacing)
function screenText(ctx, text, x, y, scale, font, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1 / scale, 1 / scale)
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0); ctx.restore()
}

// soft breathing halo around the selected entry
function halo(ctx, x, y, r, t, scale, color) {
  const p = (Math.sin(t * 2.2) + 1) / 2
  ctx.save()
  ctx.strokeStyle = rgba(color, 0.9); ctx.lineWidth = 1.4 / scale
  ctx.beginPath(); ctx.arc(x, y, r + 5 / scale, 0, Math.PI * 2); ctx.stroke()
  ctx.strokeStyle = rgba(color, 0.35 * (1 - p)); ctx.lineWidth = 1 / scale
  ctx.beginPath(); ctx.arc(x, y, r + (8 + p * 10) / scale, 0, Math.PI * 2); ctx.stroke()
  ctx.restore()
}

export default function Graph({ data, selected, focusLink, hoverId, onHover, onSelect, onLinkSelect, width, height }) {
  const fg = useRef()
  const t0 = useRef(performance.now())

  const neigh = useMemo(() => {
    const s = new Set()
    if (!selected) return s
    for (const l of data.links) {
      if (id(l.source) === selected) s.add(id(l.target))
      if (id(l.target) === selected) s.add(id(l.source))
    }
    return s
  }, [data, selected])

  useEffect(() => {
    const g = fg.current
    if (!g) return
    g.d3Force('charge').strength((n) => (n.kind === 'realworld' ? -60 : -120)).distanceMax(500)
    g.d3Force('link').distance((l) => (l.vis === 'inspired' || l.vis === 'parallel' ? 140 : 60))
      .strength((l) => (l.vis === 'inspired' || l.vis === 'parallel' ? 0.04 : 0.15))
    g.d3Force('collide', forceCollide((n) => radius(n) + 6))
    g.d3Force('radial', forceRadial((n) => (n.kind === 'realworld' ? ORBIT : 0)).strength((n) => (n.kind === 'realworld' ? 0.9 : 0.035)))
    g.d3ReheatSimulation()
  }, [data])

  useEffect(() => {
    const t = setTimeout(() => fg.current?.zoomToFit(1000, 60), 2400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const n = data.nodes.find((x) => x.id === selected)
    if (n && n.x != null) { fg.current?.centerAt(n.x - 120, n.y, 800); fg.current?.zoom(Math.max(fg.current.zoom(), 1.4), 800) }
  }, [selected])

  const active = useCallback((l) => !selected || id(l.source) === selected || id(l.target) === selected || l === focusLink, [selected, focusLink])

  // a few faint rings around Solaris, and the real-world orbit
  const drawBackdrop = useCallback((ctx, scale) => {
    ctx.save()
    ctx.lineWidth = 1 / scale
    for (const r of [ORBIT * 0.33, ORBIT * 0.66]) {
      ctx.strokeStyle = rgba(WHITE, 0.035); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.strokeStyle = rgba(HUD, 0.16); ctx.setLineDash([2 / scale, 6 / scale])
    ctx.beginPath(); ctx.arc(0, 0, ORBIT, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    screenText(ctx, 'Real-world sources', 0, -ORBIT - 26 / scale, scale, '500 12px Sora, sans-serif', rgba(HUD, 0.55))
    ctx.restore()
  }, [])

  const drawNode = useCallback((n, ctx, scale) => {
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return // not positioned yet
    const t = (performance.now() - t0.current) / 1000
    const k = KINDS[n.kind] || KINDS.concept
    const isSel = n.id === selected, isHover = n.id === hoverId
    const inFocus = focusLink && (id(focusLink.source) === n.id || id(focusLink.target) === n.id)
    const lit = isSel || isHover || inFocus
    const dim = selected && !isSel && !neigh.has(n.id) && !inFocus
    const r = radius(n) * (isSel ? 1.35 : lit ? 1.15 : 1)
    ctx.save()
    ctx.globalAlpha = dim ? 0.1 : 1

    // soft light behind every node, stronger when lit
    const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * (lit ? 4 : 2.4))
    glow.addColorStop(0, rgba(k.color, lit ? 0.45 : 0.18)); glow.addColorStop(1, rgba(k.color, 0))
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(n.x, n.y, r * (lit ? 4 : 2.4), 0, Math.PI * 2); ctx.fill()

    const im = n.kind === 'character' ? img(n.portrait) : null
    if (im?.complete && im.naturalWidth) {
      ctx.save(); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.clip()
      ctx.drawImage(im, n.x - r, n.y - r, r * 2, r * 2)
      ctx.fillStyle = rgba(HUD, 0.12); ctx.fill() // cool tint
      ctx.restore()
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = lit ? HUD : rgba(HUD, 0.6); ctx.lineWidth = 1.2 / Math.sqrt(scale); ctx.stroke()
    } else {
      shape(ctx, n.kind, n.x, n.y, r)
      ctx.fillStyle = rgba(k.color, n.kind === 'theory' ? 0.08 : 0.16); ctx.fill()
      if (n.kind === 'theory') ctx.setLineDash([1.5 / scale, 1.5 / scale])
      ctx.shadowColor = k.color; ctx.shadowBlur = lit ? 12 : 4
      ctx.strokeStyle = k.color; ctx.lineWidth = (lit ? 1.8 : 1.2) / Math.sqrt(scale); ctx.stroke()
      ctx.shadowBlur = 0; ctx.setLineDash([])
      if (n.kind !== 'theory') { ctx.fillStyle = k.color; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.8, r * 0.3), 0, Math.PI * 2); ctx.fill() }
      else { ctx.fillStyle = k.color; ctx.font = `600 ${r * 1.3}px Sora, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', n.x, n.y + r * 0.05) }
    }
    if (isSel) halo(ctx, n.x, n.y, r, t, scale, k.color)

    const big = (n.degree || 0) > 25 || n.kind === 'realworld' || n.kind === 'place'
    if (lit || neigh.has(n.id) || scale > 1.7 || (big && scale > 0.75)) {
      ctx.save(); ctx.translate(n.x, n.y + r + 5 / scale); ctx.scale(1 / scale, 1 / scale)
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      const label = n.id
      ctx.font = `${isSel ? 600 : 500} ${isSel ? 13 : 11}px Manrope, sans-serif`
      ctx.lineWidth = 3; ctx.strokeStyle = BG; ctx.strokeText(label, 0, 0)
      ctx.fillStyle = isSel ? WHITE : lit ? WHITE : rgba(WHITE, 0.78); ctx.fillText(label, 0, 0)
      if (n.zh && (lit || scale > 2.3)) {
        ctx.font = '500 10.5px "Noto Sans SC", sans-serif'; ctx.fillStyle = rgba(k.color, 0.95)
        ctx.strokeText(n.zh, 0, 14); ctx.fillText(n.zh, 0, 14)
      }
      ctx.restore()
    }
    ctx.restore()
  }, [selected, hoverId, neigh, focusLink])

  return (
    <ForceGraph2D
      ref={fg}
      width={width}
      height={height}
      graphData={data}
      backgroundColor="rgba(0,0,0,0)"
      onRenderFramePre={(ctx, scale) => drawBackdrop(ctx, scale)}
      nodeCanvasObject={drawNode}
      nodePointerAreaPaint={(n, c, ctx) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(n.x, n.y, radius(n) + 3, 0, Math.PI * 2); ctx.fill() }}
      linkColor={(l) => (active(l) ? rgba(EDGE[l.vis].color, selected || focusLink === l ? 0.85 : l.vis === 'inspired' || l.vis === 'parallel' ? 0.5 : 0.24) : 'rgba(255,255,255,0.025)')}
      linkWidth={(l) => (active(l) ? 0.4 + Math.log2(1 + l.score) * (selected ? 0.4 : 0.18) : 0.2)}
      linkLineDash={(l) => EDGE[l.vis].dash}
      linkCurvature={(l) => (l.vis === 'inspired' || l.vis === 'parallel' ? 0.18 : 0)}
      linkDirectionalParticles={(l) => ((selected && active(l)) || focusLink === l ? 3 : 0)}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleSpeed={0.008}
      linkDirectionalParticleColor={(l) => EDGE[l.vis].color}
      onNodeHover={(n) => { onHover(n?.id || null); document.body.style.cursor = n ? 'pointer' : '' }}
      onLinkHover={(l) => { document.body.style.cursor = l ? 'pointer' : '' }}
      onNodeClick={(n) => onSelect(n.id)}
      onLinkClick={onLinkSelect}
      onBackgroundClick={() => onSelect(null)}
      autoPauseRedraw={false}
      cooldownTicks={400}
      warmupTicks={60}
      minZoom={0.2}
      maxZoom={8}
    />
  )
}
