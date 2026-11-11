import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import raw from './data/lore.json'
import Graph from './components/Graph.jsx'
import Toolbar from './components/Toolbar.jsx'
import NodePanel from './components/NodePanel.jsx'
import EdgePanel from './components/EdgePanel.jsx'
import About from './components/About.jsx'
import { EDGES, DEFAULT_NODE_KINDS, id } from './lib/kinds'

const NODES = raw.nodes.map((n) => ({ ...n }))
const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]))
const LINKS = raw.links.map((l) => ({ ...l }))
// catalogue numbers, alphabetical, shown on each entry's dossier
const INDEX = Object.fromEntries([...NODES].sort((a, b) => a.id.localeCompare(b.id)).map((n, i) => [n.id, i + 1]))
const PAIR = Object.fromEntries(LINKS.map((l) => [[l.source, l.target].sort().join('|'), l]))

// Performance mode for phones and weak devices: asked once on the splash (touch or narrow screens), remembered.
const MOBILE = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || innerWidth < 820)
const LITE_KEY = 'echo-codex-lite'
const readLite = () => { try { const v = localStorage.getItem(LITE_KEY); return v === null ? null : v === '1' } catch { return null } }
const saveLite = (on) => { try { localStorage.setItem(LITE_KEY, on ? '1' : '0') } catch { /* private mode */ } }
const HEAVY_LINKS = ['text', 'defined'] // the two most numerous link types, hidden by default in light mode
// Phones render the canvas at up to 3x pixel density; light mode caps it, which is most of the drawing cost.
const REAL_DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
let dprCap = Infinity
if (typeof window !== 'undefined') Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => Math.min(REAL_DPR, dprCap) })

function useSize() {
  const [s, set] = useState({ w: innerWidth, h: innerHeight })
  useEffect(() => {
    const f = () => set({ w: innerWidth, h: innerHeight })
    addEventListener('resize', f); return () => removeEventListener('resize', f)
  }, [])
  return s
}

export default function App() {
  const { w, h } = useSize()
  const storedLite = useMemo(readLite, [])
  const [lite, setLite] = useState(storedLite === true)
  const [askLite, setAskLite] = useState(MOBILE && storedLite === null)
  dprCap = lite ? 1.5 : Infinity
  const [edgeKinds, setEdgeKinds] = useState(() => new Set(['inspired', 'parallel', 'part_of', 'role', 'bond', ...(storedLite ? [] : HEAVY_LINKS)]))
  // General NPCs and unverified theories are opt-in layers.
  const [nodeKinds, setNodeKinds] = useState(() => new Set(DEFAULT_NODE_KINDS))
  const [groupBy, setGroupBy] = useState('none')
  const [selected, setSelected] = useState(null)
  const [link, setLink] = useState(null)
  const [hover, setHover] = useState(null)
  const [about, setAbout] = useState(false)
  const [intro, setIntro] = useState(true)
  // phones: the panel can be lowered into a bar so the selection's connections stay visible on the map
  const [peek, setPeek] = useState(false)
  useEffect(() => setPeek(false), [selected, link])

  useEffect(() => { if (askLite) return; const t = setTimeout(() => setIntro(false), 2600); return () => clearTimeout(t) }, [askLite])
  const chooseLite = (on) => {
    setLite(on); saveLite(on); setAskLite(false)
    setEdgeKinds((s) => { const n = new Set(s); for (const k of HEAVY_LINKS) on ? n.delete(k) : n.add(k); return n })
  }
  const enter = (on) => { chooseLite(on); setIntro(false) }

  const data = useMemo(() => {
    const links = []
    const deg = {}
    for (const l of LINKS) {
      const vis = EDGES.find((e) => (edgeKinds.has(e.key) || (e.key === 'theorized' && nodeKinds.has('theory'))) && l.kinds[e.key])
      if (!vis) continue
      const a = BY_ID[id(l.source)], b = BY_ID[id(l.target)]
      if (!nodeKinds.has(a.kind) || !nodeKinds.has(b.kind)) continue
      l.vis = vis.key
      links.push(l)
      deg[a.id] = 1; deg[b.id] = 1
    }
    return { nodes: NODES.filter((n) => nodeKinds.has(n.kind) && (deg[n.id] || n.id === selected)), links }
  }, [edgeKinds, nodeKinds, selected])

  useEffect(() => {
    const f = (e) => {
      if (e.key !== 'Escape') return
      if (about) setAbout(false); else if (link) setLink(null); else setSelected(null)
    }
    addEventListener('keydown', f); return () => removeEventListener('keydown', f)
  }, [about, link])

  const pick = (nid) => { setSelected(nid); setLink(null) }
  const openLink = (l) => { setLink(l); if (!selected || (id(l.source) !== selected && id(l.target) !== selected)) setSelected(id(l.source)) }
  // With an entry open, clicking one of its neighbours on the map opens the connection between them
  // (like a character bond) instead of jumping to the neighbour; the header still links to the neighbour.
  const clickNode = (nid) => {
    if (selected && nid && nid !== selected) {
      const l = data.links.find((x) => { const a = id(x.source), b = id(x.target); return (a === selected && b === nid) || (b === selected && a === nid) })
      if (l) { setLink(l); return }
    }
    pick(nid)
  }
  const openPair = (a, b) => { const l = PAIR[[a, b].sort().join('|')]; if (l) openLink(l) }
  const toggle = (setter) => (k) => setter((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n.size ? n : s })

  return (
    <MotionConfig reducedMotion={lite ? 'always' : 'never'}>
    <div className={'app' + (lite ? ' lite' : '') + ((selected || link) && !peek ? ' has-panel' : '')}>
      <div className="paper" />
      {!askLite && <Graph data={data} selected={selected} focusLink={link} hoverId={hover} onHover={setHover}
        onSelect={clickNode} onLinkSelect={openLink} width={w} height={h} groupBy={groupBy} lite={lite} peek={peek} key={lite ? 'lite' : 'full'} />} {/* built once the phone prompt is answered, so it starts in the chosen mode */}

      <Toolbar nodes={NODES} links={LINKS} onPick={pick} edgeKinds={edgeKinds} toggleEdge={toggle(setEdgeKinds)}
        nodeKinds={nodeKinds} toggleNode={toggle(setNodeKinds)} onAbout={() => setAbout(true)} visible={data} groupBy={groupBy} setGroupBy={setGroupBy} lite={lite} toggleLite={() => chooseLite(!lite)} />

      <AnimatePresence mode="wait">
        {peek ? null : link ? (
          <EdgePanel key={'e' + id(link.source) + id(link.target)} link={link} nodes={BY_ID} from={selected}
            onBack={() => setLink(null)} onClose={() => { setLink(null); setSelected(null) }} onPick={pick} onPeek={() => setPeek(true)} />
        ) : selected ? (
          <NodePanel key={'n' + selected} index={INDEX[selected]} node={BY_ID[selected]} links={LINKS} nodes={BY_ID}
            onOpen={openLink} onPick={pick} onClose={() => setSelected(null)} onPeek={() => setPeek(true)} />
        ) : null}
      </AnimatePresence>

      {peek && (selected || link) && (
        <motion.div className="peek-bar" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span>{link ? `${id(link.source)} ↔ ${id(link.target)}` : selected}</span>
          <button className="peek-open" onClick={() => setPeek(false)}>Details</button>
          <button className="peek-clear" onClick={() => { setLink(null); setSelected(null) }}>Clear</button>
        </motion.div>
      )}

      {!selected && !intro && (
        <motion.div className="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          Select a node to open its record · the outer ring holds real-world sources
        </motion.div>
      )}

      <AnimatePresence>{about && <About meta={raw} onClose={() => setAbout(false)} onExample={() => { setAbout(false); openPair('Jué', 'Twenty-Eight Mansions') }} />}</AnimatePresence>
      <AnimatePresence>
        {intro && (
          <motion.div className="splash" onClick={() => { if (!askLite) setIntro(false) }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.6 }}>
            <motion.div className="orbit" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}>
              <i /><i /><b />
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.8 }}>Echo <em>Codex</em></motion.h1>
            <motion.p className="splash-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.8 }}>
              Solaris lore archive · {NODES.length} entries · {LINKS.length} links
            </motion.p>
            {askLite && (
              <motion.div className="lite-ask" onClick={(e) => e.stopPropagation()} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
                <b>Use performance mode?</b>
                <span>Smoother on phones.</span>
                <div className="lite-actions">
                  <button className="pill" onClick={() => enter(true)}>Performance mode</button>
                  <button className="lite-full" onClick={() => enter(false)}>Full</button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  )
}
