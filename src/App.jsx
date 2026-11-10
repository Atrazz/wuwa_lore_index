import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import raw from './data/lore.json'
import Graph from './components/Graph.jsx'
import Starfield from './components/Starfield.jsx'
import Sidebar from './components/Sidebar.jsx'
import NodePanel from './components/NodePanel.jsx'
import EdgePanel from './components/EdgePanel.jsx'
import About from './components/About.jsx'
import { EDGES, KINDS, id } from './lib/kinds'

const NODES = raw.nodes.map((n) => ({ ...n }))
const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]))
const LINKS = raw.links.map((l) => ({ ...l }))
const PAIR = Object.fromEntries(LINKS.map((l) => [[l.source, l.target].sort().join('|'), l]))

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
  const [edgeKinds, setEdgeKinds] = useState(() => new Set(['inspired', 'part_of', 'role', 'defined']))
  const [nodeKinds, setNodeKinds] = useState(() => new Set(Object.keys(KINDS)))
  const [selected, setSelected] = useState(null)
  const [link, setLink] = useState(null)
  const [hover, setHover] = useState(null)
  const [about, setAbout] = useState(false)
  const [intro, setIntro] = useState(true)

  useEffect(() => { const t = setTimeout(() => setIntro(false), 2400); return () => clearTimeout(t) }, [])

  const data = useMemo(() => {
    const links = []
    const deg = {}
    for (const l of LINKS) {
      const vis = EDGES.find((e) => edgeKinds.has(e.key) && l.kinds[e.key])
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
  const openPair = (a, b) => { const l = PAIR[[a, b].sort().join('|')]; if (l) openLink(l) }
  const toggle = (setter) => (k) => setter((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n.size ? n : s })

  return (
    <div className="app">
      <Starfield />
      <div className="vignette" />
      <Graph data={data} selected={selected} focusLink={link} hoverId={hover} onHover={setHover}
        onSelect={pick} onLinkSelect={openLink} width={w} height={h} />

      <Sidebar nodes={NODES} links={LINKS} onPick={pick} edgeKinds={edgeKinds} toggleEdge={toggle(setEdgeKinds)}
        nodeKinds={nodeKinds} toggleNode={toggle(setNodeKinds)} onAbout={() => setAbout(true)} visible={data} />

      <AnimatePresence mode="wait">
        {link ? (
          <EdgePanel key={'e' + id(link.source) + id(link.target)} link={link} nodes={BY_ID} from={selected}
            onBack={() => setLink(null)} onClose={() => { setLink(null); setSelected(null) }} onPick={pick} />
        ) : selected ? (
          <NodePanel key={'n' + selected} node={BY_ID[selected]} links={LINKS} nodes={BY_ID}
            onOpen={openLink} onPick={pick} onClose={() => setSelected(null)} />
        ) : null}
      </AnimatePresence>

      {!selected && !intro && (
        <motion.div className="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          Select anything on the map · the outer ring is the real world
        </motion.div>
      )}

      <AnimatePresence>{about && <About meta={raw} onClose={() => setAbout(false)} onExample={() => { setAbout(false); openPair('Jué', 'Twenty-Eight Mansions') }} />}</AnimatePresence>
      <AnimatePresence>
        {intro && (
          <motion.div className="splash" onClick={() => setIntro(false)} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            <motion.div className="splash-ring" initial={{ scale: 0.4, opacity: 0, rotate: -40 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ duration: 1.6, ease: [0.2, 0.8, 0.2, 1] }} />
            <motion.div className="splash-title" initial={{ letterSpacing: '0.9em', opacity: 0 }} animate={{ letterSpacing: '0.32em', opacity: 1 }} transition={{ duration: 1.3 }}>ECHO CODEX</motion.div>
            <motion.div className="splash-sub" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
              {NODES.length} entries · {LINKS.length} connections
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
