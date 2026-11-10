import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const CONF = {
  strong: 'Several specific details line up, including names.',
  moderate: 'More than one specific detail lines up, with clear differences.',
  loose: 'A general resemblance; could be coincidence.',
}

// One real-world parallel: our comparison, each point backed by the wiki (game) and Wikipedia (history).
export default function ParallelCard({ p, title, onTitle, open: open0 = false }) {
  const [open, setOpen] = useState(open0)
  return (
    <div className={'par-card' + (open ? ' open' : '')}>
      <button className="par-head" onClick={() => setOpen(!open)}>
        <span className="par-title" onClick={(e) => { if (onTitle) { e.stopPropagation(); onTitle() } }}>{title}</span>
        <span className={'conf ' + p.confidence} title={CONF[p.confidence]}>{p.confidence}</span>
      </button>
      <p className="par-sum">{p.summary}</p>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="par-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {p.points.map((pt, i) => (
              <div key={i} className="par-point">
                <div className="side game"><small>In the game</small><p>{pt.game}</p><a href={pt.gameUrl} target="_blank" rel="noreferrer">wiki ↗</a></div>
                <div className="side real"><small>In history</small><p>“{pt.real}”</p><a href={pt.realUrl} target="_blank" rel="noreferrer">Wikipedia ↗</a></div>
              </div>
            ))}
            {p.against?.length > 0 && (
              <div className="par-against"><small>Doesn't fit</small><ul>{p.against.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button className="par-toggle" onClick={() => setOpen(!open)}>{open ? 'Hide the comparison' : `See the comparison · ${p.points.length} point${p.points.length > 1 ? 's' : ''}`}</button>
    </div>
  )
}
