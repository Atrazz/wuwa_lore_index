import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Glyph from './Glyph'
import ReadMore from './ReadMore'
import { KINDS, EDGE, id, other } from '../lib/kinds'

export const panelAnim = {
  initial: { x: 480, opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 220, damping: 28 } },
  exit: { x: 480, opacity: 0, transition: { duration: 0.22 } },
}

function Section({ title, count, color, children, open: open0 = true }) {
  const [open, setOpen] = useState(open0)
  return (
    <section className="sec" style={{ '--c': color || 'var(--gold)' }}>
      <button className="sec-head" onClick={() => setOpen(!open)}>
        <span>{title}</span>{count != null && <b>{count}</b>}<i className={open ? 'open' : ''}>⌃</i>
      </button>
      <AnimatePresence initial={false}>
        {open && <motion.div className="sec-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{children}</motion.div>}
      </AnimatePresence>
    </section>
  )
}

// How much a theory leans on game material, not whether it's right.
export const SALT = {
  grounded: { label: 'Grounded', note: 'A small step from game material he points to.' },
  stretch: { label: 'Stretch', note: 'An interpretive leap or an outside-work comparison.' },
  wild: { label: 'Wild', note: 'Mostly symbolism, prediction or speculation.' },
}
const Salt = ({ p }) => (SALT[p] ? <span className={'salt ' + p} title={SALT[p].note}>{SALT[p].label}</span> : null)

const Certainty = ({ c }) => <span className={'cert ' + (c || 'stated')}>{c === 'possible' ? 'possible' : 'stated'}</span>

function Chip({ node, onPick, extra }) {
  return (
    <button className="chip" onClick={() => onPick(node.id)} style={{ '--c': KINDS[node.kind].color }}>
      <Glyph kind={node.kind} size={12} />{node.id}{node.zh && <small>{node.zh}</small>}{extra && <em>{extra}</em>}
    </button>
  )
}

export default function NodePanel({ node, links, nodes, onOpen, onPick, onClose }) {
  const k = KINDS[node.kind]
  const mine = useMemo(() => links.filter((l) => id(l.source) === node.id || id(l.target) === node.id), [links, node])
  const by = (kind) => mine.filter((l) => l.kinds[kind])
  const parents = by('part_of').filter((l) => l.kinds.part_of.some((e) => e.child === node.id)).map((l) => nodes[other(l, node.id)])
  const children = by('part_of').filter((l) => l.kinds.part_of.every((e) => e.parent === node.id)).map((l) => nodes[other(l, node.id)])
  const inspired = by('inspired')
  const roles = by('role')
  const defined = by('defined').sort((a, b) => b.score - a.score)
  const cotag = by('cotag').sort((a, b) => (b.cotagCount || 0) - (a.cotagCount || 0))
  const [moreDef, setMoreDef] = useState(false)
  // etymology lines already shown as a real-world card aren't repeated
  const shownRefs = new Set(inspired.flatMap((l) => l.kinds.inspired.map((e) => e.text)))
  const etymology = (node.etymology || []).filter((e) => !shownRefs.has(e))

  return (
    <motion.aside className="panel" {...panelAnim} style={{ '--k': k.color }}>
      <button className="close" onClick={onClose} aria-label="Close">✕</button>
      <header className="p-head">
        <div className="p-kind"><Glyph kind={node.kind} size={13} /> {k.label}{node.category && <span> · {node.category}</span>}</div>
        <motion.h2 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>{node.id}</motion.h2>
        {node.zh && (
          <div className="p-zh">
            <span className="zh-big">{node.zh}</span>
            {node.lit && <span className="lit">“{node.lit}”</span>}
          </div>
        )}
        {node.aliases?.length > 0 && <div className="p-alias">Also: {node.aliases.slice(0, 4).join(' · ')}</div>}
      </header>

      <div className="p-scroll">
        {node.kind === 'theory' && (
          <div className="unverified">
            <b>Unverified theory</b>
            <span>A fan interpretation, not confirmed by the game.</span>
          </div>
        )}
        {node.kind === 'theory' && (
          <div className="theory-meta">
            {node.author && <span>by <b>{node.author}</b></span>}
            {node.source && <span>{node.source}</span>}
            {node.date && <span>{node.date}</span>}
            {node.url
              ? <a className="pill" href={node.url} target="_blank" rel="noreferrer">{node.timestamp ? `Watch at ${node.timestamp} ↗` : 'Read the full theory ↗'}</a>
              : node.channel && <a className="pill" href={node.channel} target="_blank" rel="noreferrer">Channel ↗{node.timestamp && <small> · at {node.timestamp}</small>}</a>}
          </div>
        )}
        {node.kind === 'theory' && node.video && <p className="theory-video">From “{node.video}”{node.timestamp && <> at <b>{node.timestamp}</b></>}. Summary in our words.</p>}
        {node.kind === 'theory' && node.plausibility && (
          <div className={'salt-box ' + node.plausibility}>
            <div className="salt-scale">
              {Object.keys(SALT).map((k) => <i key={k} className={k === node.plausibility ? 'on ' + k : ''} />)}
            </div>
            <div><b>Grain of salt: {SALT[node.plausibility].label}</b><span>{SALT[node.plausibility].note}</span>
              {node.basis && <span className="basis">Points to: {node.basis}</span>}</div>
          </div>
        )}
        {node.kind === 'realworld' && node.image && <img className="rw-img" src={node.image} alt="" />}
        {node.summary && (
          <p className="p-summary">
            {node.summary}
            {node.kind !== 'theory' && <a className="src" href={node.wiki || node.page} target="_blank" rel="noreferrer"> {node.kind === 'realworld' ? 'Wikipedia' : 'Wiki'} ↗</a>}
          </p>
        )}

        {etymology.length > 0 && (
          <Section title="Etymology" color="#ffd9a0">
            <ul className="ety">{etymology.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </Section>
        )}

        {inspired.length > 0 && (
          <Section title={node.kind === 'realworld' ? 'Echoes in the game' : 'Real-world roots'} count={inspired.length} color="#ffd9a0">
            {inspired.map((l) => {
              const o = nodes[other(l, node.id)]
              const ev = l.kinds.inspired[0]
              return (
                <div key={o.id} className="rw-card" onClick={() => onOpen(l)}>
                  <div className="rw-top"><Glyph kind={o.kind} /><b>{o.id}</b>{o.zh && <small>{o.zh}</small>}<Certainty c={ev.certainty} /></div>
                  <p>{ev.text}</p>
                  {ev.quote && <p className="zh-quote">「{ev.quote}」</p>}
                  <span className="src">{ev.source}</span>
                </div>
              )
            })}
          </Section>
        )}

        {(parents.length > 0 || children.length > 0 || roles.length > 0) && (
          <Section title="Structure" color={EDGE.part_of.color}>
            {parents.length > 0 && <div className="kv"><span>Part of</span><div>{parents.map((n) => <Chip key={n.id} node={n} onPick={onPick} />)}</div></div>}
            {children.length > 0 && <div className="kv"><span>Contains</span><div>{children.slice(0, 24).map((n) => <Chip key={n.id} node={n} onPick={onPick} />)}</div></div>}
            {roles.map((l) => (
              <div key={id(l.source) + id(l.target)} className="kv"><span>{l.kinds.role.map((r) => r.of === node.id ? r.role : `${r.role} of`).join(', ')}</span>
                <div><Chip node={nodes[other(l, node.id)]} onPick={onPick} /></div></div>
            ))}
          </Section>
        )}

        {defined.length > 0 && (
          <Section title="Defined with" count={defined.length} color={EDGE.defined.color}>
            {(moreDef ? defined : defined.slice(0, 6)).map((l) => {
              const o = nodes[other(l, node.id)]
              const ev = l.kinds.defined.find((e) => e.from === node.id) || l.kinds.defined[0]
              return (
                <div key={o.id} className="ctx" onClick={() => onOpen(l)}>
                  <Chip node={o} onPick={onPick} />
                  <p>{ev.text}</p>
                </div>
              )
            })}
            {defined.length > 6 && <button className="more" onClick={() => setMoreDef(!moreDef)}>{moreDef ? 'Show fewer' : `Show all ${defined.length}`}</button>}
          </Section>
        )}

        {cotag.length > 0 && (
          <Section title="Discussed together" count={cotag.length} color={EDGE.cotag.color} open={false}>
            <div className="chips">{cotag.map((l) => <Chip key={other(l, node.id)} node={nodes[other(l, node.id)]} onPick={onPick} extra={`${l.cotagCount}×`} />)}</div>
            <p className="note">How many community lore entries carry both tags.</p>
          </Section>
        )}

        {node.kind === 'theory' && (
          <Section title="Discusses" count={by('theorized').length} color="#ff8fc8">
            <div className="chips">{by('theorized').map((l) => <Chip key={other(l, node.id)} node={nodes[other(l, node.id)]} onPick={onPick} />)}</div>
          </Section>
        )}

        {node.kind !== 'theory' && node.theories?.length > 0 && (
          <Section title="Fan theories" count={node.theories.length} color="#ff8fc8" open={false}>
            {node.theories.map((tid) => {
              const t = nodes[tid]
              return t ? (
                <button key={tid} className="theory-row" onClick={() => onPick(tid)}>
                  <span>{t.id}</span><Salt p={t.plausibility} />{t.author && <small>{t.author}</small>}
                </button>
              ) : null
            })}
            <p className="note">Unverified. Turn on “Theory” in Entries to see them on the map.</p>
          </Section>
        )}

        {node.documents?.length > 0 && (
          <Section title="In-game documents" count={node.documentCount} color="#9fd3ff" open={false}>
            {node.documents.map((d, i) => (
              <div key={i} className="doc"><b>{d.title}</b>{d.zh && <small>{d.zh}</small>}<p>{d.text}</p></div>
            ))}
            <p className="note">Readable items in the game that mention this name.</p>
          </Section>
        )}

        {node.entries?.length > 0 && (
          <Section title="Community lore entries" count={node.entryCount} color="#b9a2ff" open={false}>
            {node.entries.map((e, i) => (
              <a key={i} className="entry" href={e.official || e.url} target="_blank" rel="noreferrer">
                <span>{e.name}</span><small>{e.official ? 'official · ' : ''}{e.type}</small>
              </a>
            ))}
            <p className="note">From the Solaris Archives community dataset.</p>
          </Section>
        )}

        {node.kind !== 'realworld' && node.kind !== 'theory' && <ReadMore node={node} />}
        {node.kind === 'realworld' && node.wikiZh && (
          <a className="zh-wiki" href={node.wikiZh} target="_blank" rel="noreferrer">维基百科 · {node.zh} ↗</a>
        )}
      </div>
    </motion.aside>
  )
}
