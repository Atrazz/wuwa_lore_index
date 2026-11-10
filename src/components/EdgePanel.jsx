import { motion } from 'framer-motion'
import Glyph from './Glyph'
import { panelAnim } from './NodePanel'
import { KINDS, EDGES, id } from '../lib/kinds'
import ParallelCard from './ParallelCard'

function End({ node, onPick }) {
  return (
    <button className="end" onClick={() => onPick(node.id)} style={{ '--c': KINDS[node.kind].color }}>
      <Glyph kind={node.kind} size={22} />
      <b>{node.id}</b>
      {node.zh && <small>{node.zh}</small>}
    </button>
  )
}

export default function EdgePanel({ link, nodes, from, onBack, onClose, onPick }) {
  const s = id(link.source), t = id(link.target)
  const A = nodes[from === t ? t : s], B = nodes[from === t ? s : t]
  return (
    <motion.aside className="panel" {...panelAnim}>
      <div className="e-top">
        <button className="back" onClick={onBack}>← {A.id}</button>
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="e-hero">
        <End node={A} onPick={onPick} />
        <svg className="e-link" viewBox="0 0 100 30" preserveAspectRatio="none">
          <path d="M0 15 Q50 0 100 15" className="flow" />
          <path d="M0 15 Q50 30 100 15" className="flow rev" />
        </svg>
        <End node={B} onPick={onPick} />
      </div>
      <div className="p-scroll">
        {EDGES.filter((e) => link.kinds[e.key]).map((e) => (
          <section key={e.key} className="sec" style={{ '--c': e.color }}>
            <div className="sec-head static"><span>{e.label}</span><b>{e.key === 'cotag' ? link.cotagCount : link.kinds[e.key].length}</b></div>
            <p className="note rule">{e.rule}</p>
            {e.key === 'parallel' ? link.kinds.parallel.map((p, i) => <ParallelCard key={i} p={p} open title={p.real} />) :
            link.kinds[e.key].map((ev, i) => (
              <div key={i} className="ev">
                {e.key === 'part_of' && <p><b>{ev.child}</b> is part of <b>{ev.parent}</b>{ev.note && <span className="dim"> · tag “{ev.note}”</span>}</p>}
                {e.key === 'role' && <p><b>{ev.who}</b> — {ev.role} of <b>{ev.of}</b></p>}
                {(e.key === 'defined' || e.key === 'inspired') && <p>{ev.text}</p>}
                {e.key === 'theorized' && <p><span className="cert possible">unverified</span> <b>{ev.theory}</b> discusses <b>{ev.concept}</b>{ev.author && <span className="dim"> · {ev.author}</span>}</p>}
                {ev.quote && <p className="zh-quote">「{ev.quote}」</p>}
                {e.key === 'inspired' && <span className={'cert ' + (ev.certainty || 'stated')}>{ev.certainty === 'possible' ? 'possible' : 'stated'}</span>}
                {e.key === 'cotag' && <p><a href={ev.url} target="_blank" rel="noreferrer">{ev.entry}</a> <span className="dim">{ev.type}</span></p>}
                {ev.url && e.key !== 'cotag' && <a className="src" href={ev.url} target="_blank" rel="noreferrer">{ev.source || (e.key === 'defined' ? `${ev.from} on the wiki` : 'source')} ↗</a>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </motion.aside>
  )
}
