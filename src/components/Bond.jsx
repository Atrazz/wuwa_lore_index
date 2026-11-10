import { useState } from 'react'

// Character relationships (scripts/bonds.json).
// Strongest evidence first: family listing > talking in a quest > voice line > mention > same quest.
export const TIER_RANK = { family: 5, dialogue: 4, voiceline: 3, mention: 2, scene: 1 }
export const bondRank = (l) => TIER_RANK[l.kinds.bond?.[0]?.tier] || 0

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

export function bondFacts(b) {
  const out = []
  if (b.quests.length) {
    const main = b.quests.filter((q) => q.type === 'Main').length
    out.push(`${plural(b.quests.length, 'quest')} together${main ? ` (${main} main)` : ''}`)
  }
  const froms = [...new Set(b.voicelines.map((v) => v.source_of))]
  if (froms.length === 2) out.push('voice lines both ways')
  else if (froms.length === 1) out.push(`voice line from ${froms[0]}`)
  if (!b.quests.length && !b.voicelines.length && b.mentions.length) out.push(plural(b.mentions.length, 'mention'))
  if (!out.length && b.scenes) out.push(`${plural(b.scenes, 'shared quest')}, no conversation`)
  return out
}

// compact line for a character's panel
export function BondRow({ b }) {
  return (
    <div className="bond-row-meta">
      <span className={'bond-label t-' + b.tier}>{b.label}</span>
      <span>{bondFacts(b).join(' · ')}</span>
    </div>
  )
}

// full evidence for the link panel
export function BondDetail({ b }) {
  const [allQ, setAllQ] = useState(false)
  const qs = allQ ? b.quests : b.quests.slice(0, 6)
  return (
    <div className="bond">
      <div className="bond-head">
        <span className={'bond-label big t-' + b.tier}>{b.label}</span>
        <span className="dim">{bondFacts(b).join(' · ')}</span>
      </div>

      {b.family.length > 0 && (
        <div className="bond-block">
          <small>Family</small>
          {b.family.map((f, i) => (
            <p key={i}><b>{f.source_of}</b>’s wiki profile lists <b>{f.to}</b> as <i>{f.role.toLowerCase()}</i>
              {f.url && <a className="src" href={f.url} target="_blank" rel="noreferrer"> ↗</a>}</p>
          ))}
        </div>
      )}

      {b.quests.length > 0 && (
        <div className="bond-block">
          <small>Talk to each other in</small>
          {qs.map((q, i) => (
            <a key={i} className="bond-quest" href={q.url} target="_blank" rel="noreferrer">
              <span>{q.quest}</span>
              <em>{[q.type, q.chapter, q.act && `Act ${q.act}`].filter(Boolean).join(' · ')}</em>
              <b>{plural(q.exchanges, 'line')}{q.channel && q.channel !== 'talk' ? ` · ${q.channel === 'phone' ? 'WavesLine' : 'call'}` : ''}</b>
            </a>
          ))}
          {b.quests.length > 6 && <button className="more" onClick={() => setAllQ(!allQ)}>{allQ ? 'Show fewer' : `Show all ${b.quests.length}`}</button>}
        </div>
      )}

      {b.voicelines.length > 0 && (
        <div className="bond-block">
          <small>Voice lines</small>
          {b.voicelines.map((v, i) => (
            <figure key={i} className="bond-quote">
              <blockquote>{v.text}</blockquote>
              <figcaption><b>{v.source_of}</b> · “{v.title}”{v.url && <a className="src" href={v.url} target="_blank" rel="noreferrer"> ↗</a>}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {b.mentions.length > 0 && (
        <div className="bond-block">
          <small>Mentions</small>
          {b.mentions.map((m, i) => (
            <figure key={i} className="bond-quote">
              <blockquote>{m.text}</blockquote>
              <figcaption><b>{m.source_of}</b> names {m.to} · {m.kind}{m.title && ` “${m.title}”`}{m.url && <a className="src" href={m.url} target="_blank" rel="noreferrer"> ↗</a>}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {b.scenes > 0 && <p className="note">Also in {plural(b.scenes, 'quest')} together without talking to each other.</p>}
    </div>
  )
}
