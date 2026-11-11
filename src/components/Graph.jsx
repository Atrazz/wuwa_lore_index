import { useCallback, useEffect, useMemo, useRef } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCollide, forceRadial, forceX, forceY } from 'd3-force'
import { KINDS, EDGE, id, isCharacter } from '../lib/kinds'
import { bondRank } from './Bond'

const ORBIT = 880 // radius of the real-world ring
const INNER = ORBIT * 0.84 // lore entries stay inside this; the ring outside is for real-world sources
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
// bond lines fade with weaker evidence: same quest only < mention < voice line < talk < family
const BOND_ALPHA = [0.24, 0.16, 0.22, 0.28, 0.36, 0.6]
// co-mention links (game text, wiki mentions, theories) are quieter than the main links until something is selected
const WEAK = new Set(['text', 'defined', 'theorized'])
const baseAlpha = (l) => (l.vis === 'bond' ? BOND_ALPHA[bondRank(l)] : l.vis === 'inspired' || l.vis === 'parallel' ? 0.5 : WEAK.has(l.vis) ? 0.26 : 0.4)
// Keeps lore entries inside the real-world ring without lining them up along an edge: a soft inward pull
// that grows from 80% of the radius outwards, plus a safety boundary that returns each node to its own
// slightly different depth (so nothing forms a visible circle).
const jitter = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return ((h >>> 0) % 1000) / 1000 }
function contain(limit) {
  let nodes = []
  const start = limit * 0.8
  const force = (alpha) => {
    for (const n of nodes) {
      if (n.kind === 'realworld' || n.fx != null) continue
      const r = Math.hypot(n.x, n.y)
      if (r > start) {
        const pull = ((r - start) / (limit - start)) ** 2 * 0.07 * Math.max(alpha, 0.2)
        n.vx -= (n.x / r) * (r - start) * pull; n.vy -= (n.y / r) * (r - start) * pull
      }
      if (r > limit) { const k = (limit * (0.78 + 0.18 * jitter(n.id))) / r; n.x *= k; n.y *= k; n.vx *= 0.2; n.vy *= 0.2 }
    }
  }
  force.initialize = (ns) => { nodes = ns }
  return force
}
// "Group by": each group gets an anchor; Across Solaris sits in the middle when grouping by region
const REGIONS = ['Huanglong', 'Rinascita', 'Lahai-Roi', 'Black Shores', 'New Federation', 'Ashinohara', 'Somnoire']
const KIND_GROUP = { concept: 'Concepts', being: 'Beings', faction: 'Factions', place: 'Places', character: 'Characters', unique_npc: 'Characters', npc: 'Characters', theory: 'Theories' }
const KIND_ORDER = ['Characters', 'Places', 'Factions', 'Concepts', 'Beings', 'Theories']
export const groupOf = (n, by) => (by === 'region' ? n.region || 'Across Solaris' : by === 'kind' ? KIND_GROUP[n.kind] || 'Concepts' : null)
function groupCenters(nodes, by) {
  if (by === 'none') return {}
  const present = new Set(nodes.filter((n) => n.kind !== 'realworld').map((n) => groupOf(n, by)))
  const order = (by === 'region' ? REGIONS : KIND_ORDER).filter((g) => present.has(g))
  const R = INNER * (order.length > 4 ? 0.6 : 0.5), out = {}
  order.forEach((g, i) => { const a = -Math.PI / 2 + (i / order.length) * Math.PI * 2; out[g] = { x: Math.cos(a) * R, y: Math.sin(a) * R } })
  if (by === 'region') out['Across Solaris'] = { x: 0, y: 0 }
  return out
}
// The soft glow behind each node is the same radial gradient for a given colour, so it is drawn once into a
// small canvas and reused, instead of building a new gradient for every node on every frame.
const glowCache = new Map()
function glowSprite(color, alpha) {
  const key = color + alpha
  let c = glowCache.get(key)
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 128
    const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, rgba(color, alpha)); grad.addColorStop(1, rgba(color, 0))
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128)
    glowCache.set(key, c)
  }
  return c
}
const radius = (n) => (isCharacter(n) ? 8.5 : 3.5 + Math.sqrt(n.degree || 1) * 1.45)

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

export default function Graph({ data, selected, focusLink, hoverId, onHover, onSelect, onLinkSelect, width, height, groupBy = 'none', lite = false, peek = false }) {
  const fg = useRef()
  const t0 = useRef(performance.now())
  const wrap = useRef()
  if (import.meta.env.DEV) { window.__fg = fg; window.__data = data } // test hook, stripped from builds

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
    // moderate spacing; weak co-mention links pull less than the main ones
    g.d3Force('charge').strength((n) => (n.kind === 'realworld' ? -80 : isCharacter(n) ? -340 : -260)).distanceMax(700) // local repulsion: no constant outward pressure
    g.d3Force('link').distance((l) => (l.vis === 'inspired' || l.vis === 'parallel' ? 200 : l.vis === 'bond' ? 105 : WEAK.has(l.vis) ? 120 : 80))
      .strength((l) => (l.vis === 'inspired' || l.vis === 'parallel' ? 0.03 : l.vis === 'bond' ? 0.03 + bondRank(l) * 0.02 : WEAK.has(l.vis) ? 0.03 : 0.15))
    g.d3Force('collide', forceCollide((n) => radius(n) + (isCharacter(n) ? 16 : 9)))
    g.d3Force('radial', forceRadial((n) => (n.kind === 'realworld' ? ORBIT : 0)).strength((n) => (n.kind === 'realworld' ? 0.9 : 0.02)))
    g.d3Force('contain', contain(INNER))
    if (groupBy !== 'none') {
      // pull each group toward its anchor; links between groups pull less so clusters can separate
      const centers = groupCenters(data.nodes, groupBy), at = (n) => centers[groupOf(n, groupBy)] || { x: 0, y: 0 }
      g.d3Force('gx', forceX((n) => at(n).x).strength((n) => (n.kind === 'realworld' ? 0 : 0.16)))
      g.d3Force('gy', forceY((n) => at(n).y).strength((n) => (n.kind === 'realworld' ? 0 : 0.16)))
      g.d3Force('radial').strength((n) => (n.kind === 'realworld' ? 0.9 : 0))
      const base = g.d3Force('link').strength()
      g.d3Force('link').strength((l) => base(l) * (groupOf(l.source, groupBy) === groupOf(l.target, groupBy) ? 1 : 0.25))
    } else {
      g.d3Force('gx', null); g.d3Force('gy', null)
    }
    g.d3ReheatSimulation()
  }, [data, groupBy])

  // phones, "See connections": frame the selection and its neighbours in the space between toolbar and bottom bar
  useEffect(() => {
    if (!peek || !selected || !fg.current) return
    const keep = new Set([selected, ...neigh])
    if (focusLink) { keep.add(id(focusLink.source)); keep.add(id(focusLink.target)) }
    const pts = data.nodes.filter((n) => keep.has(n.id) && Number.isFinite(n.x))
    if (!pts.length) return
    const xs = pts.map((n) => n.x), ys = pts.map((n) => n.y)
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const top = (document.querySelector('.toolbar')?.getBoundingClientRect().bottom || 0) + 12
    const bottom = (document.querySelector('.peek-bar')?.getBoundingClientRect().top ?? height - 140) - 12
    const k = Math.min(8, (width - 48) / Math.max(x1 - x0, 1), Math.max(bottom - top, 120) / Math.max(y1 - y0, 1))
    const shift = ((top + bottom) / 2 - height / 2) / k // put the box in the middle of the free space, not of the screen
    fg.current.zoom(k, 700)
    fg.current.centerAt((x0 + x1) / 2, (y0 + y1) / 2 - shift, 700)
  }, [peek])

  // refit the view once a new grouping has settled
  const firstFit = useRef(true)
  useEffect(() => {
    if (firstFit.current) { firstFit.current = false; return }
    const t = setTimeout(() => fg.current?.zoomToFit(900, 60), 1800)
    return () => clearTimeout(t)
  }, [groupBy])

  useEffect(() => {
    const t = setTimeout(() => fg.current?.zoomToFit(1000, 60), 2400)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const n = data.nodes.find((x) => x.id === selected)
    if (n && n.x != null) { fg.current?.centerAt(n.x - 120, n.y, 800); fg.current?.zoom(Math.max(fg.current.zoom(), 1.4), 800) }
  }, [selected])

  // Hit-testing done here, from node positions, instead of force-graph's colour-picking shadow canvas:
  // browsers with canvas fingerprint protection (Brave, hardened Firefox) add noise to pixel reads,
  // which made some nodes unclickable.
  const hit = useCallback((ev) => {
    const g = fg.current, box = wrap.current?.getBoundingClientRect()
    if (!g || !box) return null
    const p = g.screen2GraphCoords(ev.clientX - box.left, ev.clientY - box.top), k = g.zoom()
    let node = null, best = Infinity
    for (const n of data.nodes) {
      if (!Number.isFinite(n.x)) continue
      const d = Math.hypot(n.x - p.x, n.y - p.y)
      if (d < radius(n) * (n.id === selected ? 1.35 : 1) + 4 / k && d < best) { node = n; best = d }
    }
    if (node) return { node }
    let link = null; best = 6 / k
    for (const l of data.links) {
      const a = l.source, b = l.target
      if (!Number.isFinite(a?.x) || !Number.isFinite(b?.x)) continue
      const curve = l.vis === 'inspired' || l.vis === 'parallel' ? 0.18 : 0
      const len = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x)
      const cx = (a.x + b.x) / 2 + len * curve * Math.cos(ang - Math.PI / 2), cy = (a.y + b.y) / 2 + len * curve * Math.sin(ang - Math.PI / 2)
      let px = a.x, py = a.y
      for (let i = 1; i <= (curve ? 12 : 1); i++) { // the curve as short segments (one segment when straight)
        const t = i / (curve ? 12 : 1), u = 1 - t
        const qx = curve ? u * u * a.x + 2 * u * t * cx + t * t * b.x : b.x, qy = curve ? u * u * a.y + 2 * u * t * cy + t * t * b.y : b.y
        const vx = qx - px, vy = qy - py, w = Math.max(0, Math.min(1, ((p.x - px) * vx + (p.y - py) * vy) / (vx * vx + vy * vy || 1)))
        const d = Math.hypot(p.x - (px + w * vx), p.y - (py + w * vy))
        if (d < best) { best = d; link = l }
        px = qx; py = qy
      }
    }
    return link ? { link } : null
  }, [data, selected])

  const down = useRef(null), frame = useRef(0), drag = useRef(null)
  const toGraph = (ev) => {
    const box = wrap.current.getBoundingClientRect()
    return fg.current.screen2GraphCoords(ev.clientX - box.left, ev.clientY - box.top)
  }

  // Node dragging. Pressing on a node is caught in the capture phase, before d3-zoom on the canvas
  // sees it, so the map doesn't pan while a node is being moved.
  const hitRef = useRef(hit); hitRef.current = hit
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const start = (ev) => {
      const pt = ev.touches ? ev.touches[0] : ev
      const h = hitRef.current(pt)
      if (!h?.node) return
      ev.stopPropagation()
      drag.current = { node: h.node, x: pt.clientX, y: pt.clientY, moved: false }
    }
    const move = (ev) => {
      const d = drag.current
      if (!d) return
      if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return
      if (!d.moved) { d.moved = true; fg.current?.d3ReheatSimulation(); el.style.cursor = 'grabbing' }
      const p = toGraph(ev)
      d.node.fx = p.x; d.node.fy = p.y
    }
    const end = () => {
      const d = drag.current
      if (d?.moved) { d.node.fx = undefined; d.node.fy = undefined; el.style.cursor = 'grab' }
      drag.current = null
    }
    el.addEventListener('mousedown', start, true)
    el.addEventListener('touchstart', start, { capture: true, passive: true })
    addEventListener('pointermove', move)
    addEventListener('pointerup', end)
    return () => {
      el.removeEventListener('mousedown', start, true)
      el.removeEventListener('touchstart', start, { capture: true })
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', end)
    }
  }, [])

  const onPointerDown = (ev) => { down.current = { x: ev.clientX, y: ev.clientY } }
  const onPointerUp = (ev) => {
    const d = down.current, dragged = drag.current?.moved
    down.current = null
    if (dragged || !d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) return // a drag or a pan, not a click
    const h = hit(ev)
    if (h?.node) onSelect(h.node.id)
    else if (h?.link) onLinkSelect(h.link)
    else onSelect(null)
  }
  const onPointerMove = (ev) => {
    if (down.current) return
    const { clientX, clientY } = ev
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const h = hit({ clientX, clientY })
      onHover(h?.node?.id || null)
      if (wrap.current) wrap.current.style.cursor = h?.node ? 'grab' : h ? 'pointer' : ''
    })
  }
  const onPointerLeave = () => { if (!drag.current) { onHover(null); if (wrap.current) wrap.current.style.cursor = '' } }

  const active = useCallback((l) => !selected || id(l.source) === selected || id(l.target) === selected || l === focusLink, [selected, focusLink])

  // a few faint rings around Solaris, and the real-world orbit
  const labelBoxes = useRef([]) // phones: names already drawn this frame, so overlapping ones are skipped
  const drawBackdrop = useCallback((ctx, scale) => {
    labelBoxes.current = []
    ctx.save()
    ctx.lineWidth = 1 / scale
    for (const r of [ORBIT * 0.33, ORBIT * 0.66]) {
      ctx.strokeStyle = rgba(WHITE, 0.035); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.strokeStyle = rgba(HUD, 0.16); ctx.setLineDash([2 / scale, 6 / scale])
    ctx.beginPath(); ctx.arc(0, 0, ORBIT, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    screenText(ctx, 'Real-world sources', 0, -ORBIT - 26 / scale, scale, '500 12px Sora, sans-serif', rgba(HUD, 0.55))
    if (groupBy !== 'none') {
      // a label above each cluster, placed from where its members actually are
      const box = {}
      for (const n of data.nodes) {
        if (n.kind === 'realworld' || !Number.isFinite(n.x)) continue
        const k = groupOf(n, groupBy), b = (box[k] ||= { x: 0, y: Infinity, n: 0 })
        b.x += n.x; b.n += 1; b.y = Math.min(b.y, n.y)
      }
      for (const [k, b] of Object.entries(box)) {
        if (b.n < 2) continue
        screenText(ctx, `${k}  ${b.n}`, b.x / b.n, b.y - 30 / scale, scale, '600 13px Sora, sans-serif', rgba(WHITE, 0.82))
      }
    }
    ctx.restore()
  }, [groupBy, data])

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
    const G = r * (lit ? 4 : 2.4)
    if (!lite || lit) ctx.drawImage(glowSprite(k.color, lit ? 0.45 : 0.18), n.x - G, n.y - G, G * 2, G * 2) // light mode: glow only on the highlighted entry

    const im = isCharacter(n) ? img(n.portrait) : null
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
      ctx.shadowColor = k.color; ctx.shadowBlur = lite ? 0 : lit ? 12 : 4
      ctx.strokeStyle = k.color; ctx.lineWidth = (lit ? 1.8 : 1.2) / Math.sqrt(scale); ctx.stroke()
      ctx.shadowBlur = 0; ctx.setLineDash([])
      if (n.kind !== 'theory') { ctx.fillStyle = k.color; ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(0.8, r * 0.3), 0, Math.PI * 2); ctx.fill() }
      else { ctx.fillStyle = k.color; ctx.font = `600 ${r * 1.3}px Sora, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', n.x, n.y + r * 0.05) }
    }
    if (isSel) halo(ctx, n.x, n.y, r, lite ? 0 : t, scale, k.color) // light mode: a still ring

    const big = (n.degree || 0) > 25 || n.kind === 'realworld' || n.kind === 'place'
    // label zoom thresholds scale with screen width, so a phone (which fits the map at a much smaller zoom)
    // shows names after the same relative zoom as desktop
    const fit = Math.min(1, width / 1200), phone = width < 900
    // phones bring names in by tier so they don't all appear at once: hubs, then places/factions/sources, then the rest
    const named = phone
      ? scale > (lite ? 2.0 : 1.7) * fit || ((n.degree || 0) > 25 && scale > 0.75 * fit) || (big && scale > 1.15 * fit) || (n.kind === 'faction' && scale > 1.15 * fit)
      : scale > (lite ? 2.0 : 1.7) * fit || (big && scale > 0.75 * fit)
    let showName = lit || neigh.has(n.id) || named
    if (showName && phone) {
      // skip a name that would overlap one already drawn (the selection and its neighbours always show)
      ctx.font = `${isSel ? 600 : 500} ${isSel ? 13 : 11}px Manrope, sans-serif`
      const w = (ctx.measureText(n.id).width + 6) / scale, hgt = 15 / scale, x0 = n.x - w / 2, y0 = n.y + r + 5 / scale
      const clash = labelBoxes.current.some((b) => x0 < b[0] + b[2] && b[0] < x0 + w && y0 < b[1] + b[3] && b[1] < y0 + hgt)
      if (clash && !(lit || neigh.has(n.id))) showName = false
      else labelBoxes.current.push([x0, y0, w, hgt])
    }
    if (showName) {
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
  }, [selected, hoverId, neigh, focusLink, lite, width])

  return (
    <div ref={wrap} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
    <ForceGraph2D
      ref={fg}
      width={width}
      height={height}
      graphData={data}
      backgroundColor="rgba(0,0,0,0)"
      onRenderFramePre={(ctx, scale) => drawBackdrop(ctx, scale)}
      nodeCanvasObject={drawNode}
      enablePointerInteraction={false}
      linkColor={(l) => (active(l) ? rgba(EDGE[l.vis].color, focusLink === l ? 0.9 : selected ? (l.vis === 'bond' && bondRank(l) <= 1 ? 0.3 : 0.85) : baseAlpha(l)) : 'rgba(255,255,255,0.1)')}
      linkWidth={(l) => (active(l) ? (WEAK.has(l.vis) && !selected ? 0.6 : 0.5 + Math.log2(1 + l.score) * (selected ? 0.4 : 0.18)) : 0.2)}
      linkLineDash={(l) => EDGE[l.vis].dash}
      linkCurvature={(l) => (l.vis === 'inspired' || l.vis === 'parallel' ? 0.18 : 0)}
      linkDirectionalParticles={(l) => (lite ? 0 : (selected && active(l)) || focusLink === l ? 3 : 0)}
      linkDirectionalParticleWidth={2}
      linkDirectionalParticleSpeed={0.008}
      linkDirectionalParticleColor={(l) => EDGE[l.vis].color}
      autoPauseRedraw={lite || !selected} // idle map: redraw only on change; a selected node keeps animating (halo, particles)
      cooldownTicks={lite ? 260 : 700}
      warmupTicks={lite ? 0 : 140}
      d3AlphaDecay={lite ? 0.045 : 0.0228}
      cooldownTime={lite ? 6000 : 15000}
      minZoom={0.06}
      maxZoom={8}
    />
    </div>
  )
}
