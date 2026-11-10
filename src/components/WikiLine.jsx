// One wiki sentence that ties two entries together, with both names highlighted.
// Links that only appear in a list or table say where they are listed instead.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export default function WikiLine({ ev }) {
  if (!ev.text) {
    return <p className="wiki-line listed">Listed under <i>{ev.listed}</i> on the <b>{ev.from}</b> page.</p>
  }
  const names = [ev.from, ev.to].filter(Boolean).sort((a, b) => b.length - a.length)
  const parts = ev.text.split(new RegExp(`(${names.map(esc).join('|')})`, 'g'))
  return <p className="wiki-line">{parts.map((p, i) => (names.includes(p) ? <b key={i}>{p}</b> : p))}</p>
}
