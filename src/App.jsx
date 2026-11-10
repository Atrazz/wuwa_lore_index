import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import raw from './data/lore.json'
import Graph from './components/Graph.jsx'
import Toolbar from './components/Toolbar.jsx'
import NodePanel from './components/NodePanel.jsx'
import EdgePanel from './components/EdgePanel.jsx'
import About from './components/About.jsx'
import { EDGES, KINDS, id } from './lib/kinds'

const NODES = raw.nodes.map((n) => ({ ...n }))
const BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]))
const LINKS = raw.links.map((l) => ({ ...l }))
// catalogue numbers, alphabetical, shown on each entry's dossier
const INDEX = Object.fromEntries([...NODES].sort((a, b) => a.id.localeCompare(b.id)).map((n, i) => [n.id, i + 1]))
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
  const [edgeKinds, setEdgeKinds] = useState(() => new Set(['inspired', 'parallel', 'part_of', 'role', 'defined']))
  // theories are unverified, so they stay off until the viewer turns them on
  const [nodeKinds, setNodeKinds] = useState(() => new Set(Object.keys(KINDS).filter((k) => k !== 'theory')))
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
  const openPair = (a, b) => { const l = PAIR[[a, b].sort().join('|')]; if (l) openLink(l) }
  const toggle = (setter) => (k) => setter((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n.size ? n : s })

  return (
    <div className="app">
      <div className="paper" />
      <Graph data={data} selected={selected} focusLink={link} hoverId={hover} onHover={setHover}
        onSelect={pick} onLinkSelect={openLink} width={w} height={h} />

      <Toolbar nodes={NODES} links={LINKS} onPick={pick} edgeKinds={edgeKinds} toggleEdge={toggle(setEdgeKinds)}
        nodeKinds={nodeKinds} toggleNode={toggle(setNodeKinds)} onAbout={() => setAbout(true)} visible={data} />

      <AnimatePresence mode="wait">
        {link ? (
          <EdgePanel key={'e' + id(link.source) + id(link.target)} link={link} nodes={BY_ID} from={selected}
            onBack={() => setLink(null)} onClose={() => { setLink(null); setSelected(null) }} onPick={pick} />
        ) : selected ? (
          <NodePanel key={'n' + selected} index={INDEX[selected]} node={BY_ID[selected]} links={LINKS} nodes={BY_ID}
            onOpen={openLink} onPick={pick} onClose={() => setSelected(null)} />
        ) : null}
      </AnimatePresence>

      {!selected && !intro && (
        <motion.div className="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          Select an entry to open its file · the outer ring is the real world
        </motion.div>
      )}

      <AnimatePresence>{about && <About meta={raw} onClose={() => setAbout(false)} onExample={() => { setAbout(false); openPair('Jué', 'Twenty-Eight Mansions') }} />}</AnimatePresence>
      <AnimatePresence>
        {intro && (
          <motion.div className="splash" onClick={() => setIntro(false)} exit={{ opacity: 0 }} transition={{ duration: 0.7 }}>
            <motion.div className="splash-seal" initial={{ scale: 1.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -4 }}
              transition={{ delay: 0.35, duration: 0.45, ease: [0.3, 1.4, 0.5, 1] }}>E</motion.div>
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.6 }}>Echo <em>Codex</em></motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
              {NODES.length} entries indexed · {LINKS.length} cross-references
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
