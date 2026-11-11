import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Glyph from './Glyph'

// Character relationships (scripts/bonds.json).
// Strongest evidence first: family listing > talking in a quest > voice line > mention > same quest.
export const TIER_RANK = { family: 5, dialogue: 4, voiceline: 3, mention: 2, scene: 1 }
export const bondRank = (l) => TIER_RANK[l.kinds.bond?.[0]?.tier] || 0

const TIERS = [
  { key: 'family', label: 'Family', color: '#f3cf7a' },
  { key: 'quests', label: 'Talk', color: '#6fe6dc' },
  { key: 'voicelines', label: 'Voice line', color: '#c3a6ff' },
  { key: 'mentions', label: 'Mention', color: '#ffa3c4' },
  { key: 'scenes', label: 'Same quest', color: '#8b9ba3' },
]
const TIER_COLOR = { family: '#f3cf7a', dialogue: '#6fe6dc', voiceline: '#c3a6ff', mention: '#ffa3c4', scene: '#8b9ba3' }
const QUEST_COLOR = { Main: '#f3cf7a', Companion: '#ffa3c4', Tales: '#ffa3c4', Episodic: '#ffa3c4', Side: '#7fd4ff', Exploration: '#7fe0a8', Event: '#c3a6ff', 'Leisure Event': '#c3a6ff' }
const KIND = { 'Story dialogue': 'Dialogue', 'WavesLine message': 'WavesLine' }

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const quote = (t) => (/^["“]/.test(t) ? t : `“${t}”`)

export function bondFacts(b) {
  const out = []
  if (b.quests.length) {
    const main = b.quests.filter((q) => q.type === 'Main').length
    out.push(`${plural(b.quests.length, 'quest')} together${main ? ` (${main} main)` : ''}`)
    const lines = b.quests.reduce((s, q) => s + (q.exchanges || 0), 0)
    if (lines) out.push(`${plural(lines, 'line')} exchanged`)
  }
  const froms = [...new Set(b.voicelines.map((v) => v.source_of))]
  if (froms.length === 2) out.push('voice lines both ways')
  else if (froms.length === 1) out.push(`voice line from ${froms[0]}`)
  if (!b.quests.length && !b.voicelines.length && b.mentions.length) out.push(plural(b.mentions.length, 'mention'))
  if (!out.length && b.scenes) out.push(`${plural(b.scenes, 'shared quest')}, no conversation`)
  return out
}

// the quoted dialogue is a separate file, fetched the first time a quest is opened
let dialogueFile = null
const loadDialogue = () => (dialogueFile ||= fetch('dialogue.json').then((r) => r.json()).catch(() => ({})))
function useDialogue(key, quest) {
  const [d, setD] = useState(undefined)
  useEffect(() => { let live = true; loadDialogue().then((all) => live && setD(all[key]?.[quest] || null)); return () => { live = false } }, [key, quest])
  return d
}

export function Avatar({ node, size = 28, ring }) {
  const style = { width: size, height: size, '--ring': ring || 'rgba(255,255,255,0.18)' }
  return (
    <span className="avatar" style={style}>
      {node?.portrait ? <img src={node.portrait} alt="" loading="lazy" /> : <Glyph kind={node?.kind || 'character'} size={size * 0.55} />}
    </span>
  )
}

let playing = null
function Play({ src }) {
  const [state, setState] = useState('idle')
  const a = useRef()
  useEffect(() => () => a.current?.pause(), [])
  if (!src) return null
  const toggle = () => {
    if (state === 'playing') { a.current.pause(); return }
    playing?.pause()
    a.current ||= new Audio(src)
    a.current.onended = a.current.onpause = () => setState('idle')
    a.current.onerror = () => setState('error')
    setState('loading'); a.current.currentTime = 0
    a.current.play().then(() => setState('playing')).catch(() => setState('error'))
    playing = a.current
  }
  return (
    <button className={'play ' + state} onClick={toggle} title="Play the English voice line">
      {state === 'playing' ? <span className="eq"><i /><i /><i /></span> : state === 'error' ? '✕' : '▶'}
    </button>
  )
}

// one relationship in a character's panel: opens the bond; the name opens the other character
export function BondItem({ node, b, onOpen, onPick }) {
  return (
    <div className="bond-item" onClick={onOpen} style={{ '--c': TIER_COLOR[b.tier] }}>
      <Avatar node={node} size={38} ring={TIER_COLOR[b.tier]} />
      <div className="bi-main">
        <div className="bi-top">
          <button className="bi-name" onClick={(e) => { e.stopPropagation(); onPick(node.id) }}>{node.id}</button>
          {node.zh && <small>{node.zh}</small>}
          <span className={'bond-label t-' + b.tier}>{b.rel || b.label}</span>
        </div>
        <div className="bi-ctx">{b.ctx || bondFacts(b).join(' · ')}</div>
      </div>
    </div>
  )
}

// header of the link panel when two characters are bonded
export function BondHero({ A, B, b, onPick }) {
  const c = TIER_COLOR[b.tier]
  return (
    <div className="bond-hero" style={{ '--c': c }}>
      <div className="bh-pair">
        <button className="bh-person" onClick={() => onPick(A.id)}><Avatar node={A} size={68} ring={c} /><b>{A.id}</b>{A.title && <em>{A.title}</em>}{A.zh && <small>{A.zh}</small>}</button>
        <div className="bh-link">
          <svg viewBox="0 0 120 30" preserveAspectRatio="none"><path d="M0 15 Q60 0 120 15" /><path d="M0 15 Q60 30 120 15" /></svg>
          <motion.span className="bh-label" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }}>{b.label}</motion.span>
        </div>
        <button className="bh-person" onClick={() => onPick(B.id)}><Avatar node={B} size={68} ring={c} /><b>{B.id}</b>{B.title && <em>{B.title}</em>}{B.zh && <small>{B.zh}</small>}</button>
      </div>
      {b.rel && <motion.h3 className="bh-rel" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>{b.rel}</motion.h3>}
      {b.ctx && <p className="bh-ctx">{b.ctx}</p>}
      <p className="bh-facts">
        <span className={'bh-basis ' + (b.basis || 'inferred')} title={b.basis === 'stated' ? 'Said in quotes, voice lines, stories or the wiki' : 'Read from the quests and affiliations they share'}>
          {b.basis === 'stated' ? 'From the game text' : 'Inferred'}
        </span>
        {bondFacts(b).join(' · ')}
      </p>
      <div className="bh-strip">
        {TIERS.map((t) => {
          const n = Array.isArray(b[t.key]) ? b[t.key].length : b[t.key] || 0
          return <div key={t.key} className={'bh-tile' + (n ? ' has' : '')} style={{ '--t': t.color }}><b>{n}</b><small>{t.label}</small></div>
        })}
      </div>
    </div>
  )
}

function Block({ title, count, color, open: open0 = true, children }) {
  const [open, setOpen] = useState(open0)
  return (
    <section className="bond-block" style={{ '--t': color }}>
      <button className="bb-head" onClick={() => setOpen(!open)}>
        <i />{title}<b>{count}</b><span className={open ? 'open' : ''}>⌃</span>
      </button>
      <AnimatePresence initial={false}>
        {open && <motion.div className="bb-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{children}</motion.div>}
      </AnimatePresence>
    </section>
  )
}

function Chat({ lines, a, b, nodes, phone }) {
  return (
    <div className={'chat' + (phone ? ' phone' : '')}>
      {phone && <div className="phone-bar">WavesLine</div>}
      {lines.map((s, i) => {
        const side = s.speaker === a ? 'l' : s.speaker === b ? 'r' : 'c'
        return (
          <motion.div key={i} className={'bubble ' + side} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            {side !== 'c' && <Avatar node={nodes[s.speaker]} size={24} />}
            <div><b>{s.speaker}</b>{s.text}</div>
          </motion.div>
        )
      })}
    </div>
  )
}

function QuestCard({ q, bkey, a, b, nodes, open: open0 }) {
  const [open, setOpen] = useState(open0)
  return (
    <div className={'quest' + (open ? ' open' : '')} style={{ '--q': QUEST_COLOR[q.type] || '#8b9ba3' }}>
      <button className="quest-head" onClick={() => setOpen(!open)}>
        <span className="qtype">{q.type || 'Quest'}</span>
        <span className="qname">{q.quest}</span>
        {q.call > 0 && <span className="qch" title="Exchanges by call">☏</span>}
        {q.phone > 0 && <span className="qch" title="Exchanges on WavesLine">✉</span>}
        <span className="qex" title="Lines between the two">{q.exchanges}</span>
        <span className={'chev' + (open ? ' open' : '')}>⌃</span>
      </button>
      {(q.chapter || q.nation) && <div className="qmeta">{[q.chapter, q.act && `Act ${q.act}`, q.nation].filter(Boolean).join(' · ')}</div>}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="quest-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <QuestDialogue q={q} bkey={bkey} a={a} b={b} nodes={nodes} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function QuestDialogue({ q, bkey, a, b, nodes }) {
  const d = useDialogue(bkey, q.quest)
  if (d === undefined) return <p className="note">Loading dialogue…</p>
  return (
    <>
      {d?.desc && <p className="qsum">{d.desc}</p>}
      {d?.lines?.length > 0 && <Chat lines={d.lines} a={a} b={b} nodes={nodes} phone={q.channel === 'phone'} />}
      {d?.phone?.length > 0 && <Chat lines={d.phone} a={a} b={b} nodes={nodes} phone />}
      {!d && <p className="note">No quoted lines for this quest.</p>}
      <a className="src" href={q.url} target="_blank" rel="noreferrer">Full quest on the wiki ↗</a>
    </>
  )
}

// full evidence for the link panel; `a` is the character the viewer came from (left side)
export function BondDetail({ b, a, nodes }) {
  const z = b.pair[0] === a ? b.pair[1] : b.pair[0]
  const [allQ, setAllQ] = useState(false)
  const qs = allQ ? b.quests : b.quests.slice(0, 6)
  const vl = [...b.voicelines].sort((x, y) => (x.source_of === a ? -1 : 1) - (y.source_of === a ? -1 : 1))
  return (
    <div className="bond">
      {b.family.length > 0 && (
        <Block title="Family" count={b.family.length} color="#f3cf7a">
          {b.family.map((f, i) => (
            <div key={i} className="fam">
              <Avatar node={nodes[f.source_of]} size={26} />
              <p><b>{f.source_of}</b>’s profile lists <b>{f.to}</b> as <em>{f.role.toLowerCase()}</em>
                {f.url && <a className="src" href={f.url} target="_blank" rel="noreferrer"> ↗</a>}</p>
            </div>
          ))}
        </Block>
      )}

      {vl.length > 0 && (
        <Block title="Voice lines" count={vl.length} color="#c3a6ff">
          {vl.map((v, i) => (
            <figure key={i} className={'vl ' + (v.source_of === a ? 'l' : 'r')}>
              <figcaption>
                <Avatar node={nodes[v.source_of]} size={28} />
                <span><b>{v.source_of}</b> on {v.to}</span>
                <Play src={v.audio} />
              </figcaption>
              <blockquote>{quote(v.text)}</blockquote>
              {v.url && <a className="src" href={v.url} target="_blank" rel="noreferrer">{v.source_of}’s voice lines ↗</a>}
            </figure>
          ))}
        </Block>
      )}

      {b.quests.length > 0 && (
        <Block title="Conversations" count={b.quests.length} color="#6fe6dc">
          {qs.map((q, i) => <QuestCard key={q.quest} q={q} bkey={b.key} a={a} b={z} nodes={nodes} open={i === 0} />)}
          {b.quests.length > 6 && <button className="more" onClick={() => setAllQ(!allQ)}>{allQ ? 'Show fewer' : `Show all ${b.quests.length} quests`}</button>}
        </Block>
      )}

      {b.mentions.length > 0 && (
        <Block title="Mentions" count={b.mentions.length} color="#ffa3c4" open={!b.quests.length}>
          {b.mentions.map((m, i) => (
            <figure key={i} className="mention">
              <figcaption><span className="mkind">{KIND[m.kind] || m.kind}</span><b>{m.source_of}</b>{m.count > 1 && m.kind !== 'Character story' && <em>{m.count}×</em>}</figcaption>
              <blockquote>{quote(m.text)}</blockquote>
              {m.url && <a className="src" href={m.url} target="_blank" rel="noreferrer">{m.title ? `“${m.title}”` : 'source'} ↗</a>}
            </figure>
          ))}
        </Block>
      )}

      {b.scenes > 0 && <p className="note bond-scenes">Also in {plural(b.scenes, 'quest')} together without talking to each other.</p>}
    </div>
  )
}
