// Node and edge vocabulary for the lore graph. Rules are shown in the "How it works" panel.
export const KINDS = {
  concept:   { label: 'Concept',    color: '#7fa8cf', shape: 'circle',  rule: 'Lore terms: phenomena, technology, history.' },
  being:     { label: 'Being',      color: '#a48ad8', shape: 'hexagon', rule: 'Sentinels, Threnodians and Tacet Discords.' },
  faction:   { label: 'Faction',    color: '#e0604c', shape: 'diamond', rule: 'Organisations, orders and families.' },
  place:     { label: 'Place',      color: '#8fb48a', shape: 'triangle', rule: 'Nations, regions and cities.' },
  character: { label: 'Character',  color: '#d6a54c', shape: 'portrait', rule: 'Playable Resonators.' },
  realworld: { label: 'Real world', color: '#ece4d4', shape: 'star',    rule: 'Myths, places, books and science the game draws on.' },
  theory:    { label: 'Theory',     color: '#c879ad', shape: 'question', rule: 'Unverified fan theories. Not confirmed by the game.' },
}

export const EDGES = [
  { key: 'inspired', label: 'Inspired by',  color: '#ece4d4', dash: [6, 4], rule: 'A wiki Etymology or Trivia note, or a cited article, names the real-world source.' },
  { key: 'parallel', label: 'Possible parallel', color: '#d9473a', dash: [1, 4], rule: 'Our comparison, stated by no source: matching points quote the wiki and Wikipedia, with what doesn’t fit.' },
  { key: 'part_of',  label: 'Part of',      color: '#b8a17a', dash: null,   rule: 'Region, nation or base on the wiki, or the community tag path (“Rinascita - Septimont”).' },
  { key: 'role',     label: 'Role',         color: '#e0604c', dash: null,   rule: 'Leader, founder, ally or enemy in a faction’s wiki profile.' },
  { key: 'defined',  label: 'Defined with', color: '#7fa8cf', dash: null,   rule: 'One wiki page links to the other in its own text.' },
  { key: 'cotag',    label: 'Discussed together', color: '#6f6a62', dash: [2, 4], rule: 'Community lore entries tagged with both, at least three times.' },
  { key: 'theorized', label: 'Theorized', color: '#c879ad', dash: [1, 3], rule: 'A fan theory discusses this entry. Unverified.' },
]
export const EDGE = Object.fromEntries(EDGES.map((e) => [e.key, e]))

export const id = (x) => x?.id ?? x
export const other = (l, n) => (id(l.source) === n ? id(l.target) : id(l.source))

export const huiji = (zh) => `https://wuwa.huijiwiki.com/wiki/${encodeURIComponent(zh)}`
export const moegirl = (zh) => `https://zh.moegirl.org.cn/${encodeURIComponent(zh)}`
export const SEARCHER = 'https://mc.yakitahome.com/search'
