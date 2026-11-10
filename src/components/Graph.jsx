import { useCallback, useEffect, useMemo, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCollide, forceRadial } from 'd3-force'
import { KINDS, EDGE, id } from '../lib/kinds'

const ORBIT = 620 // radius of the real-world ring

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
const radius = (n) => (n.kind === 'character' ? 9 : 4 + Math.sqrt(n.degree || 1) * 1.6)

function shape(ctx, kind, x, y, r) {
  ctx.beginPath()
  switch (KINDS[kind]?.shape) {
    case 'hexagon':
      for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)) }
      ctx.closePath(); break
    case 'diamond':
      ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.2); ctx.lineTo(x - r, y); ctx.closePath(); break
    case 'triangle':
      ctx.moveTo(x, y - r * 1.2); ctx.lineTo(x + r * 1.1, y + r * 0.8); ctx.lineTo(x - r * 1.1, y + r * 0.8); ctx.closePath(); break
    case 'question':
      ctx.arc(x, y, r, 0, Math.PI * 2); break
    case 'star':
      for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.42 : r * 1.25; const a = Math.PI / 4 * i - Math.PI / 2; ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)) }
      ctx.closePath(); break
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2)
  }
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
    g.d3Force('link').distance((l) => (l.vis === 'inspired' ? 140 : l.vis === 'cotag' ? 90 : 60)).strength((l) => (l.vis === 'cotag' ? 0.03 : l.vis === 'inspired' ? 0.04 : 0.15))
    g.d3Force('collide', forceCollide((n) => radius(n) + 6))
    g.d3Force('radial', forceRadial((n) => (n.kind === 'realworld' ? ORBIT : 0)).strength((n) => (n.kind === 'realworld' ? 0.9 : 0.035)))
    g.d3ReheatSimulation()
  }, [data])

  useEffect(() => {
    const t = setTimeout(() => fg.current?.zoomToFit(1200, 40), 2200)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const n = data.nodes.find((x) => x.id === selected)
    if (n && n.x != null) { fg.current?.centerAt(n.x + 80, n.y, 900); fg.current?.zoom(Math.max(fg.current.zoom(), 1.4), 900) }
  }, [selected])

  const active = useCallback((l) => !selected || id(l.source) === selected || id(l.target) === selected || l === focusLink, [selected, focusLink])

  const drawBackdrop = useCallback((ctx, scale) => {
    const t = (performance.now() - t0.current) / 1000
    ctx.save()
    ctx.strokeStyle = 'rgba(255,217,160,0.16)'
    ctx.lineWidth = 1 / scale
    ctx.setLineDash([3 / scale, 9 / scale]); ctx.lineDashOffset = -t * 6 / scale
    ctx.beginPath(); ctx.arc(0, 0, ORBIT, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.font = `${12 / scale}px Cinzel, serif`
    ctx.fillStyle = 'rgba(255,217,160,0.45)'; ctx.textAlign = 'center'
    ctx.fillText('THE REAL WORLD', 0, -ORBIT - 14 / scale)
    ctx.fillStyle = 'rgba(94,230,255,0.35)'
    ctx.fillText('SOLARIS-3', 0, -ORBIT * 0.55)
    ctx.restore()
  }, [])

  const drawNode = useCallback((n, ctx, scale) => {
    const t = (performance.now() - t0.current) / 1000
    const k = KINDS[n.kind] || KINDS.concept
    const isSel = n.id === selected, isHover = n.id === hoverId
    const inFocus = focusLink && (id(focusLink.source) === n.id || id(focusLink.target) === n.id)
    const dim = selected && !isSel && !neigh.has(n.id) && !inFocus
    const r = radius(n) * (isSel ? 1.5 : isHover || inFocus ? 1.25 : 1)
    ctx.save()
    ctx.globalAlpha = dim ? 0.1 : 1
    if (isSel || isHover || inFocus) {
      const p = 1 + 0.12 * Math.sin(t * 3)
      const g = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, r * 3 * p)
      g.addColorStop(0, rgba(k.color, 0.5)); g.addColorStop(1, rgba(k.color, 0))
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(n.x, n.y, r * 3 * p, 0, Math.PI * 2); ctx.fill()
    }
    const im = n.kind === 'character' ? img(n.portrait) : null
    if (im?.complete && im.naturalWidth) {
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.save(); ctx.clip()
      ctx.drawImage(im, n.x - r, n.y - r, r * 2, r * 2); ctx.restore()
      ctx.strokeStyle = k.color; ctx.lineWidth = 1.4 / Math.sqrt(scale); ctx.stroke()
    } else {
      shape(ctx, n.kind, n.x, n.y, r)
      ctx.fillStyle = rgba(k.color, n.kind === 'realworld' || n.kind === 'theory' ? 0.12 : 0.28); ctx.fill()
      if (n.kind === 'theory') ctx.setLineDash([2 / scale, 2 / scale])
      ctx.strokeStyle = k.color; ctx.lineWidth = (isSel ? 2 : 1.2) / Math.sqrt(scale); ctx.stroke()
      ctx.setLineDash([])
      if (n.kind === 'theory') {
        ctx.fillStyle = k.color; ctx.font = `600 ${r * 1.3}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('?', n.x, n.y + r * 0.05)
      }
    }
    const big = (n.degree || 0) > 25 || n.kind === 'realworld' || n.kind === 'place'
    if (isSel || isHover || neigh.has(n.id) || inFocus || scale > 1.6 || (big && scale > 0.7)) {
      ctx.save(); ctx.translate(n.x, n.y + r + 3 / scale); ctx.scale(1 / scale, 1 / scale)
      ctx.font = `${isSel ? 600 : 500} ${isSel ? 13 : 11}px Inter, sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,7,11,.92)'; ctx.strokeText(n.id, 0, 0)
      ctx.fillStyle = isSel ? '#fff' : n.kind === 'realworld' ? '#ffe6c2' : 'rgba(230,236,245,.92)'; ctx.fillText(n.id, 0, 0)
      if (n.zh && (isSel || isHover || scale > 2.2)) {
        ctx.font = '10px "Noto Sans SC", sans-serif'; ctx.fillStyle = rgba(k.color, 0.9)
        ctx.strokeText(n.zh, 0, 15); ctx.fillText(n.zh, 0, 15)
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
      linkColor={(l) => (active(l) ? rgba(EDGE[l.vis].color, selected || focusLink === l ? 0.85 : l.vis === 'cotag' ? 0.12 : l.vis === 'inspired' ? 0.55 : 0.28) : 'rgba(120,130,150,0.02)')}
      linkWidth={(l) => (active(l) ? 0.4 + Math.log2(1 + l.score) * (selected ? 0.45 : 0.22) : 0.2)}
      linkLineDash={(l) => EDGE[l.vis].dash}
      linkCurvature={(l) => (l.vis === 'inspired' ? 0.25 : 0.08)}
      linkDirectionalParticles={(l) => ((selected && active(l)) || focusLink === l ? 2 : 0)}
      linkDirectionalParticleWidth={2.4}
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
