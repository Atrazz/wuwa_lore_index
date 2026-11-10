import { useCallback, useEffect, useMemo, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCollide, forceRadial } from 'd3-force'
import { KINDS, EDGE, id } from '../lib/kinds'

const ORBIT = 620 // radius of the real-world ring
const INK = '#0c0c0e'
const PAPER = '#ece4d4'
const SEAL = '#d9473a'

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
const radius = (n) => (n.kind === 'character' ? 8.5 : 3.5 + Math.sqrt(n.degree || 1) * 1.4)

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
    case 'star': // real world: a plain square, like a catalogue card
      ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8); break
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2)
  }
}

// four corner ticks around the selected entry
function brackets(ctx, x, y, r, scale) {
  const d = r + 5 / scale, l = 4 / scale
  ctx.strokeStyle = SEAL; ctx.lineWidth = 1.4 / scale
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath()
    ctx.moveTo(x + sx * d, y + sy * (d - l)); ctx.lineTo(x + sx * d, y + sy * d); ctx.lineTo(x + sx * (d - l), y + sy * d)
    ctx.stroke()
  }
}

export default function Graph({ data, selected, focusLink, hoverId, onHover, onSelect, onLinkSelect, width, height }) {
  const fg = useRef()

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
    g.d3Force('link').distance((l) => (l.vis === 'inspired' || l.vis === 'parallel' ? 140 : l.vis === 'cotag' ? 90 : 60))
      .strength((l) => (l.vis === 'cotag' ? 0.03 : l.vis === 'inspired' || l.vis === 'parallel' ? 0.04 : 0.15))
    g.d3Force('collide', forceCollide((n) => radius(n) + 6))
    g.d3Force('radial', forceRadial((n) => (n.kind === 'realworld' ? ORBIT : 0)).strength((n) => (n.kind === 'realworld' ? 0.9 : 0.035)))
    g.d3ReheatSimulation()
  }, [data])

  useEffect(() => {
    const t = setTimeout(() => fg.current?.zoomToFit(1000, 60), 2000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const n = data.nodes.find((x) => x.id === selected)
    if (n && n.x != null) { fg.current?.centerAt(n.x - 120, n.y, 800); fg.current?.zoom(Math.max(fg.current.zoom(), 1.4), 800) }
  }, [selected])

  const active = useCallback((l) => !selected || id(l.source) === selected || id(l.target) === selected || l === focusLink, [selected, focusLink])

  // a measured ring with degree ticks, labelled like a chart
  const drawBackdrop = useCallback((ctx, scale) => {
    ctx.save()
    ctx.strokeStyle = rgba(PAPER, 0.14); ctx.lineWidth = 1 / scale
    ctx.beginPath(); ctx.arc(0, 0, ORBIT, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = rgba(PAPER, 0.07)
    ctx.beginPath(); ctx.arc(0, 0, ORBIT * 0.5, 0, Math.PI * 2); ctx.stroke()
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180, long = deg % 30 === 0
      const r1 = ORBIT - (long ? 14 : 6) / scale, r2 = ORBIT
      ctx.strokeStyle = rgba(PAPER, long ? 0.3 : 0.12)
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke()
    }
    ctx.setLineDash([2 / scale, 6 / scale]); ctx.strokeStyle = rgba(PAPER, 0.06)
    ctx.beginPath(); ctx.moveTo(-ORBIT - 40, 0); ctx.lineTo(ORBIT + 40, 0); ctx.moveTo(0, -ORBIT - 40); ctx.lineTo(0, ORBIT + 40); ctx.stroke()
    ctx.setLineDash([])
    ctx.font = `${10.5 / scale}px "IBM Plex Mono", monospace`
    ctx.fillStyle = rgba(PAPER, 0.42); ctx.textAlign = 'left'
    ctx.fillText('OUTER RING — THE REAL WORLD', ORBIT * 0.72, -ORBIT * 0.72)
    ctx.fillText('INNER FIELD — SOLARIS-3', 10 / scale, -ORBIT * 0.5 - 8 / scale)
    ctx.restore()
  }, [])

  const drawNode = useCallback((n, ctx, scale) => {
    const k = KINDS[n.kind] || KINDS.concept
    const isSel = n.id === selected, isHover = n.id === hoverId
    const inFocus = focusLink && (id(focusLink.source) === n.id || id(focusLink.target) === n.id)
    const lit = isSel || isHover || inFocus
    const dim = selected && !isSel && !neigh.has(n.id) && !inFocus
    const r = radius(n) * (isSel ? 1.35 : lit ? 1.15 : 1)
    ctx.save()
    ctx.globalAlpha = dim ? 0.12 : 1

    const im = n.kind === 'character' ? img(n.portrait) : null
    if (im?.complete && im.naturalWidth) {
      ctx.save()
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.clip()
      ctx.filter = lit || neigh.has(n.id) ? 'none' : 'grayscale(1) contrast(1.05) brightness(0.9)'
      ctx.drawImage(im, n.x - r, n.y - r, r * 2, r * 2)
      ctx.restore()
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = lit ? k.color : rgba(PAPER, 0.5); ctx.lineWidth = 1 / Math.sqrt(scale); ctx.stroke()
    } else {
      shape(ctx, n.kind, n.x, n.y, r)
      ctx.fillStyle = INK; ctx.fill()
      if (n.kind === 'theory') ctx.setLineDash([1.5 / scale, 1.5 / scale])
      ctx.strokeStyle = k.color; ctx.lineWidth = (lit ? 1.6 : 1.1) / Math.sqrt(scale); ctx.stroke()
      ctx.setLineDash([])
      // a solid centre mark for the bigger hubs
      if (n.kind !== 'theory' && (n.degree || 0) > 12) {
        ctx.fillStyle = k.color; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1, r * 0.28), 0, Math.PI * 2); ctx.fill()
      }
      if (n.kind === 'theory') {
        ctx.fillStyle = k.color; ctx.font = `italic ${r * 1.5}px "Instrument Serif", serif`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', n.x, n.y + r * 0.08)
      }
    }
    if (isSel) brackets(ctx, n.x, n.y, r, scale)

    const big = (n.degree || 0) > 25 || n.kind === 'realworld' || n.kind === 'place'
    if (lit || neigh.has(n.id) || scale > 1.7 || (big && scale > 0.75)) {
      ctx.save(); ctx.translate(n.x + r + 4 / scale, n.y); ctx.scale(1 / scale, 1 / scale)
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
      const label = n.kind === 'realworld' ? n.id : n.id.toUpperCase()
      ctx.font = n.kind === 'realworld' ? `italic ${isSel ? 15 : 13}px "Instrument Serif", serif` : `${isSel ? 500 : 400} ${isSel ? 11 : 9.5}px "IBM Plex Mono", monospace`
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText(label, 0, 0)
      ctx.fillStyle = isSel ? SEAL : lit ? PAPER : rgba(PAPER, 0.78); ctx.fillText(label, 0, 0)
      if (n.zh && (lit || scale > 2.3)) {
        ctx.font = '500 11px "Noto Serif SC", serif'; ctx.fillStyle = rgba(k.color, 0.95)
        const w = ctx.measureText(label).width
        ctx.strokeText(n.zh, w + 6, 0); ctx.fillText(n.zh, w + 6, 0)
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
      linkColor={(l) => (active(l) ? rgba(EDGE[l.vis].color, selected || focusLink === l ? 0.8 : l.vis === 'cotag' ? 0.1 : l.vis === 'inspired' || l.vis === 'parallel' ? 0.45 : 0.22) : 'rgba(236,228,212,0.025)')}
      linkWidth={(l) => (active(l) ? 0.35 + Math.log2(1 + l.score) * (selected ? 0.32 : 0.16) : 0.2)}
      linkLineDash={(l) => EDGE[l.vis].dash}
      linkCurvature={0}
      linkDirectionalArrowLength={(l) => (selected && active(l) && (l.vis === 'part_of' || l.vis === 'inspired') ? 3 : 0)}
      linkDirectionalArrowRelPos={0.92}
      linkDirectionalArrowColor={(l) => EDGE[l.vis].color}
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
