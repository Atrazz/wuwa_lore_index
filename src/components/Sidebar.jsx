import { useMemo, useRef, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { KINDS, EDGES } from '../lib/kinds'
import Glyph from './Glyph'

export default function Sidebar({ nodes, links, onPick, edgeKinds, toggleEdge, nodeKinds, toggleNode, onAbout, visible }) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const box = useRef()
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const score = (n) => (n.id.toLowerCase().startsWith(s) ? 0 : n.zh?.includes(q.trim()) ? 0 : 1) * 1000 - (n.degree || 0)
    return nodes.filter((n) => n.id.toLowerCase().includes(s) || n.zh?.includes(q.trim()) || n.aliases?.some((a) => a.toLowerCase().includes(s)))
      .sort((a, b) => score(a) - score(b)).slice(0, 8)
  }, [q, nodes])
  useEffect(() => {
    const f = (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); box.current?.focus() } }
    addEventListener('keydown', f); return () => removeEventListener('keydown', f)
  }, [])
  const pick = (n) => { onPick(n.id); setQ(''); box.current?.blur() }
  const kindCount = useMemo(() => Object.fromEntries(Object.keys(KINDS).map((k) => [k, nodes.filter((n) => n.kind === k).length])), [nodes])
  const edgeCount = useMemo(() => Object.fromEntries(EDGES.map((e) => [e.key, links.filter((l) => l.kinds[e.key]).length])), [links])

  return (
    <motion.aside className="sidebar" initial={{ x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 2.2, duration: 0.6 }}>
      <div className="brand">
        <div className="brand-mark"><span /><span /></div>
        <div>
          <div className="brand-title">ECHO CODEX</div>
          <div className="brand-sub">Wuthering Waves lore and its real-world roots</div>
        </div>
      </div>

      <div className="search">
        <input ref={box} value={q} placeholder="Search lore, 中文 or a myth…" onChange={(e) => { setQ(e.target.value); setIdx(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, hits.length - 1))
            if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0))
            if (e.key === 'Enter' && hits[idx]) pick(hits[idx])
          }} />
        <kbd>/</kbd>
        <AnimatePresence>
          {hits.length > 0 && (
            <motion.ul className="drop" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {hits.map((n, i) => (
                <li key={n.id} className={i === idx ? 'on' : ''} onMouseDown={() => pick(n)} onMouseEnter={() => setIdx(i)}>
                  <Glyph kind={n.kind} />
                  <span className="d-name">{n.id}</span>
                  {n.zh && <span className="d-zh">{n.zh}</span>}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      <div className="group">
        <div className="group-title">Entries</div>
        {Object.entries(KINDS).map(([k, v]) => (
          <button key={k} className={'row' + (nodeKinds.has(k) ? ' on' : '')} onClick={() => toggleNode(k)} title={v.rule} style={{ '--c': v.color }}>
            <Glyph kind={k} /><span>{v.label}</span><b>{kindCount[k]}</b>
          </button>
        ))}
      </div>

      <div className="group">
        <div className="group-title">Connections <span>strongest first</span></div>
        {EDGES.map((e) => (
          <button key={e.key} className={'row' + (edgeKinds.has(e.key) ? ' on' : '')} onClick={() => toggleEdge(e.key)} title={e.rule} style={{ '--c': e.color }}>
            <i className={'line ' + e.key} /><span>{e.label}</span><b>{edgeCount[e.key]}</b>
          </button>
        ))}
      </div>

      <div className="side-foot">
        <span>{visible.nodes.length} shown · {visible.links.length} lines</span>
        <button onClick={onAbout}>How it works</button>
      </div>
    </motion.aside>
  )
}
