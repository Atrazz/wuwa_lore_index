import { KINDS } from '../lib/kinds'
const PATH = {
  circle: <circle cx="8" cy="8" r="5" />,
  hexagon: <polygon points="8,2.5 12.8,5.2 12.8,10.8 8,13.5 3.2,10.8 3.2,5.2" />,
  diamond: <polygon points="8,2 13,8 8,14 3,8" />,
  triangle: <polygon points="8,2.5 13.5,12.5 2.5,12.5" />,
  portrait: <><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="6.8" r="1.8" /><path d="M4.8 12.2c.8-1.8 2-2.6 3.2-2.6s2.4.8 3.2 2.6" /></>,
  question: <><circle cx="8" cy="8" r="5.6" strokeDasharray="2 1.6" /><path d="M6.4 6.4a1.7 1.7 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.2" /><circle cx="8" cy="11.2" r=".4" fill="currentColor" /></>,
  star: <polygon points="8,1.5 9.3,6.7 14.5,8 9.3,9.3 8,14.5 6.7,9.3 1.5,8 6.7,6.7" />,
}
export default function Glyph({ kind, size = 14 }) {
  const k = KINDS[kind] || KINDS.concept
  return (
    <svg className="glyph" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={k.color} color={k.color} strokeWidth="1.4" aria-label={k.label}>
      {PATH[k.shape]}
    </svg>
  )
}
