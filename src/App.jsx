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

  useEffect(() => { const t = setTimeout(() => setIntro(false), 2600); return () => clearTimeout(t) }, [])

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
          SELECT A NODE TO OPEN ITS RECORD · OUTER RING = REAL-WORLD SOURCES
        </motion.div>
      )}

      <AnimatePresence>{about && <About meta={raw} onClose={() => setAbout(false)} onExample={() => { setAbout(false); openPair('Jué', 'Twenty-Eight Mansions') }} />}</AnimatePresence>
      <AnimatePresence>
        {intro && (
          <motion.div className="splash" onClick={() => setIntro(false)} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.6 }}>
            <motion.div className="boot-hex" initial={{ opacity: 0, rotate: -60, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}>
              <svg viewBox="0 0 84 96"><polygon points="42,2 82,25 82,71 42,94 2,71 2,25" /><polygon className="core" points="42,24 63,36 63,60 42,72 21,60 21,36" /></svg>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.28em' }} transition={{ delay: 0.3, duration: 0.9 }}>ECHO CODEX</motion.h1>
            <div className="boot-log">
              {[`mounting lore archive`, `${NODES.length} entries indexed`, `${LINKS.length} cross-references linked`, `external sources: real world`, `status: online`].map((line, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.28 }}>
                  <span>[{String(i + 1).padStart(2, '0')}]</span> {line}{i === 4 && <b> ●</b>}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
