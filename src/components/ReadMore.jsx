import { useState } from 'react'
import { huiji, moegirl, SEARCHER } from '../lib/kinds'

// The searcher currently has no verified passage permalink: copy the query.
export default function ReadMore({ node }) {
  const [copied, setCopied] = useState(false)
  const search = async () => {
    try { await navigator.clipboard.writeText(node.zh || node.id) } catch { /* clipboard blocked */ }
    setCopied(true); setTimeout(() => setCopied(false), 3500)
    window.open(SEARCHER, '_blank', 'noopener')
  }
  return (
    <div className="readmore">
      <span className="rm-label">Read more</span>
      {node.page && <a href={node.page} target="_blank" rel="noreferrer">Fandom wiki ↗</a>}
      {node.zh && <a href={huiji(node.zh)} target="_blank" rel="noreferrer">Huiji · {node.zh} ↗</a>}
      {node.zh && <a href={`https://wiki.biligame.com/mc/${encodeURIComponent(node.zh)}`} target="_blank" rel="noreferrer">BWIKI ↗</a>}
      {node.zh && node.kind === 'character' && <a href={moegirl(node.zh)} target="_blank" rel="noreferrer">萌娘百科 ↗</a>}
      <button onClick={search}>{copied ? `Copied “${node.zh || node.id}”` : 'Text searcher ↗'}</button>
    </div>
  )
}
