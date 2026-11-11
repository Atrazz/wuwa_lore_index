import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { KINDS, EDGES } from '../lib/kinds'
import Glyph from './Glyph'

function Menu({ label, count, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()
  useEffect(() => {
    const f = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const k = (e) => { if (e.key === 'Escape') setOpen(false) }
    addEventListener('pointerdown', f, true); addEventListener('keydown', k)
    return () => { removeEventListener('pointerdown', f, true); removeEventListener('keydown', k) }
  }, [])
  return (
    <div className="menu" ref={ref}>
      <button className={'menu-btn' + (open ? ' open' : '')} onClick={() => setOpen(!open)}>
        {label}<span className="menu-count">{count}</span><i>▾</i>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="menu-pop" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const GROUPINGS = [['none', 'None', 'Free layout'], ['kind', 'Type', 'Concepts, places, factions, characters…'], ['region', 'Region', 'Huanglong, Rinascita, Lahai-Roi… with Across Solaris in the middle']]

export default function Toolbar({ nodes, links, onPick, edgeKinds, toggleEdge, nodeKinds, toggleNode, onAbout, visible, groupBy, setGroupBy, lite, toggleLite }) {
  // the toolbar's height (it wraps on phones) as a CSS variable, so phone panels can start just below it
  const headerRef = useRef()
  useEffect(() => {
    const el = headerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--tb-h', `${el.offsetHeight}px`))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const box = useRef()
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    const rank = (n) => (n.id.toLowerCase().startsWith(s) || n.zh?.startsWith(q.trim()) ? 0 : 1) * 1000 - (n.degree || 0)
    return nodes.filter((n) => n.id.toLowerCase().includes(s) || n.zh?.includes(q.trim()) || n.aliases?.some((a) => a.toLowerCase().includes(s)))
      .sort((a, b) => rank(a) - rank(b)).slice(0, 9)
  }, [q, nodes])
  useEffect(() => {
    const f = (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); box.current?.focus() } }
    addEventListener('keydown', f); return () => removeEventListener('keydown', f)
  }, [])
  const pick = (n) => { onPick(n.id); setQ(''); box.current?.blur() }
  const kindCount = useMemo(() => Object.fromEntries(Object.keys(KINDS).map((k) => [k, nodes.filter((n) => n.kind === k).length])), [nodes])
  const edgeCount = useMemo(() => Object.fromEntries(EDGES.map((e) => [e.key, links.filter((l) => l.kinds[e.key]).length])), [links])

  return (
    <motion.header ref={headerRef} className={'toolbar' + (open ? ' tb-open' : '')} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6, duration: 0.5 }}>
      <div className="mast">
        <span className="mast-title"><i className="mast-hex" />Echo <em>Codex</em></span>
        <span className="mast-sub">Solaris lore archive</span>
      </div>
      {/* phones: the controls and entry chips fold behind this button */}
      <button className={'burger' + (open ? ' open' : '')} onClick={() => setOpen(!open)} aria-label={open ? 'Hide controls' : 'Show controls'} aria-expanded={open}>
        <i /><i /><i />
      </button>

      <div className="find">
        <svg className="find-label" viewBox="0 0 16 16" width="15" height="15"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg>
        <input ref={box} value={q} placeholder="Search entries, 中文 names, myths…" onChange={(e) => { setQ(e.target.value); setIdx(0) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, hits.length - 1))
            if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0))
            if (e.key === 'Enter' && hits[idx]) pick(hits[idx])
            if (e.key === 'Escape') { setQ(''); box.current?.blur() }
          }} />
        <kbd>/</kbd>
        <AnimatePresence>
          {hits.length > 0 && (
            <motion.ol className="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
              {hits.map((n, i) => (
                <li key={n.id} className={i === idx ? 'on' : ''} onMouseDown={() => pick(n)} onMouseEnter={() => setIdx(i)}>
                  <Glyph kind={n.kind} size={12} />
                  <span className="r-name">{n.id}</span>
                  {n.zh && <span className="r-zh">{n.zh}</span>}
                  <span className="r-kind">{KINDS[n.kind].label}</span>
                </li>
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
      </div>

      <nav className="tools">
        <Menu label="Group by" count={GROUPINGS.find((g) => g[0] === groupBy)[1]}>
          {GROUPINGS.map(([k, label, note]) => (
            <label key={k} className={'opt grp' + (groupBy === k ? ' on' : '')} title={note}>
              <input type="radio" name="groupby" checked={groupBy === k} onChange={() => setGroupBy(k)} />
              <span className="grp-text"><span>{label}</span><small>{note}</small></span>
            </label>
          ))}
        </Menu>
        <Menu label="Links" count={`${EDGES.filter((e) => e.key !== 'theorized' && edgeKinds.has(e.key)).length}/${EDGES.length - 1}`}>
          {EDGES.filter((e) => e.key !== 'theorized').map((e) => (
            <label key={e.key} className={'opt' + (edgeKinds.has(e.key) ? ' on' : '')} title={e.rule} style={{ '--c': e.color }}>
              <input type="checkbox" checked={edgeKinds.has(e.key)} onChange={() => toggleEdge(e.key)} />
              <i className={'stroke ' + e.key} /><span>{e.label}</span><b>{edgeCount[e.key]}</b>
            </label>
          ))}
        </Menu>
        <button className={'lite-btn' + (lite ? ' on' : '')} onClick={toggleLite} title={lite ? 'Performance mode is on: no glows or animations, busiest links hidden. Click for the full experience.' : 'Performance mode for phones and slower devices'}>
          <i />Performance
        </button>
        <button className="about-btn" onClick={onAbout}>Method</button>
      </nav>

      <div className="tally">{visible.nodes.length}<span>nodes</span>{visible.links.length}<span>links</span></div>

      <aside className="entries" aria-label="Entries shown on the map">
        <div className="entries-head">Entries<b>{nodeKinds.size}/{Object.keys(KINDS).length}</b></div>
        {Object.entries(KINDS).map(([k, v]) => (
          <Fragment key={k}>
          {k === 'character' && <div className="entries-group">Character</div>}
          <label className={'ent' + (v.group ? ' ent-child' : '') + (nodeKinds.has(k) ? ' on' : '')} title={v.rule} style={{ '--c': v.color }}>
            <input type="checkbox" checked={nodeKinds.has(k)} onChange={() => toggleNode(k)} />
            <Glyph kind={k} size={13} /><span>{v.label}</span><b>{kindCount[k]}</b>
          </label>
          </Fragment>
        ))}
      </aside>
    </motion.header>
  )
}
