import { useEffect, useMemo, useState } from 'react'

let evidenceFile
const loadEvidence = () => (evidenceFile ||= fetch('game-text.json').then((r) => {
  if (!r.ok) throw new Error('Unable to load passages')
  return r.json()
}).catch((error) => { evidenceFile = null; throw error }))

const isDocument = (r) => /document|item lore|report|description/i.test(r.kind)
const groups = ['All', 'World dialogue', 'Documents', 'Profiles', 'Dialogue']
const inGroup = (r, group) => group === 'All' || (group === 'Documents' ? isDocument(r) : group === 'Profiles' ? /profile|voice line/i.test(r.kind) : group === 'Dialogue' ? ['Dialogue', 'Quest summary'].includes(r.kind) : r.kind === group)

export function TextPassage({ record: r, onPick }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${r.queries?.[0] || r.entities?.[0] || ''}\n${r.textKey}\n${r.chapter || r.title || ''}`)
      setCopied(true)
    } catch { setCopied(false) }
  }
  return (
    <article className="text-passage">
      <div className="text-passage-meta"><span className="text-kind">{r.kind}</span>{r.version && <small>{r.version}</small>}</div>
      {r.title && <h4>{r.title}</h4>}
      {(r.speaker || r.speakerZh) && <p className="text-speaker">{r.kind === 'Character profile' ? 'Profile' : 'Speaker'}: {r.speaker && onPick
        ? <button onClick={() => onPick(r.speaker)}>{r.speaker}</button>
        : <b>{r.speaker || r.speakerZh}</b>}{r.speaker && r.speakerZh && <small> · {r.speakerZh}</small>}</p>}
      <blockquote>{r.text}</blockquote>
      {onPick && r.entities?.length > 1 && <div className="text-names" aria-label="Entries mentioned in this source">{r.entities.map((name) => <button key={name} onClick={() => onPick(name)}>{name}</button>)}</div>}
      {r.excerpted && <span className="text-excerpt-note">Excerpt · shortened from the source passage</span>}
      {r.zh && <details className="text-original"><summary>Chinese text</summary><p lang="zh">{r.zh}</p></details>}
      <details className="text-reference">
        <summary>Source reference</summary>
        <dl>
          {r.chapter && <><dt>Chapter</dt><dd>{r.chapter}</dd></>}
          <dt>Text ID</dt><dd>{r.textKey}</dd>
          {r.titleKey && <><dt>Heading ID</dt><dd>{r.titleKey}</dd></>}
          {r.queries?.length > 0 && <><dt>Search</dt><dd>{r.queries.join(' · ')}</dd></>}
          {r.retrieved && <><dt>Retrieved</dt><dd>{r.retrieved}</dd></>}
        </dl>
        {r.queries?.length > 0 && <button className="text-copy" onClick={copy}>{copied ? 'Reference copied' : 'Copy search reference'}</button>}
      </details>
      <a className="src" href={r.url} target="_blank" rel="noreferrer">{r.source} ↗</a>
    </article>
  )
}

export default function TextEvidence({ records: refs, onPick, filterable = true }) {
  const [file, setFile] = useState(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setError(false)
    loadEvidence().then((data) => { if (live) setFile(data) }).catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [attempt])
  const records = useMemo(() => refs.map((r) => typeof r === 'string' ? file?.[r] : r).filter(Boolean), [refs, file])
  const [group, setGroup] = useState('All')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(4)
  const available = groups.filter((g) => records.some((r) => inGroup(r, g)))
  const hits = useMemo(() => records.filter((r) => inGroup(r, group) && `${r.text} ${r.zh || ''} ${r.speaker || ''} ${r.speakerZh || ''} ${r.title || ''} ${r.chapter || ''}`.toLowerCase().includes(query.trim().toLowerCase())), [records, group, query])
  if (error) return <p className="note">Passages could not be loaded. <button className="text-copy" onClick={() => setAttempt(attempt + 1)}>Retry</button></p>
  if (!file) return <p className="note" role="status">Loading source passages…</p>
  return (
    <div className="text-evidence">
      {filterable && records.length > 4 && <div className="text-controls">
        <input aria-label="Search game-text evidence" placeholder="Search these passages…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(4) }} />
        <div className="text-filters" aria-label="Evidence type">{available.map((g) => <button key={g} aria-pressed={group === g} onClick={() => { setGroup(g); setLimit(4) }}>{g}<small>{records.filter((r) => inGroup(r, g)).length}</small></button>)}</div>
      </div>}
      {hits.slice(0, limit).map((r) => <TextPassage key={r.id} record={r} onPick={onPick} />)}
      {!hits.length && <p className="note">No passages match these filters.</p>}
      {hits.length > limit && <button className="more" onClick={() => setLimit(limit + 10)}>Show more passages ({hits.length - limit} remaining)</button>}
      <p className="note">A mention records what a source says. Shared names alone do not establish a meeting, friendship, or affiliation. Searcher links open its search page; use the reference to find the passage.</p>
    </div>
  )
}
