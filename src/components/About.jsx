import { motion } from 'framer-motion'
import { KINDS, EDGES } from '../lib/kinds'
import Glyph from './Glyph'

export default function About({ meta, onClose, onExample }) {
  return (
    <motion.div className="modal-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="modal" onClick={(e) => e.stopPropagation()} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        <h2>Method</h2>
        <p className="lead">The inner map is the world of Solaris-3. The outer ring holds the real-world myths, places, books and science the game draws on. Every line links back to its source.</p>
        <h3>Connections</h3>
        <ul className="rules">
          {EDGES.map((e) => (
            <li key={e.key} style={{ '--c': e.color }}><i className={'line ' + e.key} /><div><b>{e.label}</b><span>{e.rule}</span></div></li>
          ))}
        </ul>
        <h3>Entries</h3>
        <ul className="kinds">
          {Object.entries(KINDS).map(([k, v]) => <li key={k}><Glyph kind={k} /> <b>{v.label}</b> <span>{v.rule}</span></li>)}
        </ul>
        <dl className="notes">
          <dt>Real-world roots</dt>
          <dd>Marked <span className="cert stated">stated</span> when the source says it plainly, <span className="cert possible">possible</span> when it hedges (“may be based on”). Notes the wiki itself calls false are left out.</dd>
          <dt>Possible parallels</dt>
          <dd>Real events and places that big moments in the game resemble, like the Resonator War and the Russian or American civil wars. These are our comparisons, not stated by any source: every matching point quotes the wiki for the game and Wikipedia for history, and each lists what doesn’t fit. Rated <b>strong</b>, <b>moderate</b> or <b>loose</b>.</dd>
          <dt>Relationships</dt>
          <dd>Each pair of characters gets a relation and one line of context, written from their own quotes, voice lines and conversations (<b>From the game text</b>). Pairs that only appear in the same quests get a line read from their sides and affiliations (<b>Inferred</b>). The small tag says how much evidence there is, from “Crossed paths” to “Family”.</dd>
          <dt>Theories</dt>
          <dd>Fan theories are off by default (turn them on under Entries) and always marked unverified. They come from the Solaris Archives “Speculation” write-ups and from theories summarised by hand.</dd>
          <dt>Grain of salt</dt>
          <dd>Hand-summarised theories are rated by how much game material they lean on, not by whether they're right: <b>grounded</b> (a small step from what's shown), <b>stretch</b> (an interpretive leap or outside comparison), <b>wild</b> (symbolism or prediction).</dd>
          <dt>Chinese</dt>
          <dd>Names come from the wiki’s language tables and the game’s own text; “literal” meanings from the wiki.</dd>
          <dt>Sources</dt>
          <dd>
            <a href="https://wutheringwaves.fandom.com/" target="_blank" rel="noreferrer">Fandom wiki</a> ({meta.counts.fandomPages} pages) ·{' '}
            <a href="https://wutheringwaves.notion.site/Wuthering-Waves-Lore-Dataset-91344f91cb8b4adca6455470f823dd12" target="_blank" rel="noreferrer">Solaris Archives lore dataset</a> ({meta.counts.communityEntries} entries) ·{' '}
            game text via <a href="https://github.com/Dimbreath/WutheringData" target="_blank" rel="noreferrer">Dimbreath/WutheringData</a> ({meta.counts.documents} documents, up to March 2026) ·{' '}
            <a href="https://www.gamekee.com/mc/624299.html" target="_blank" rel="noreferrer">GameKee 世界观文化考据</a> · Wikipedia. Updated {meta.generated}.
          </dd>
        </dl>
        <button className="pill" onClick={onExample}>Example: Jué & the Twenty-Eight Mansions →</button>
      </motion.div>
    </motion.div>
  )
}
