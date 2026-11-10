// Node and edge vocabulary for the lore graph. Rules are shown in the "How it works" panel.
export const KINDS = {
  concept:   { label: 'Concept',    color: '#5ee6ff', shape: 'circle',  rule: 'Lore terms: phenomena, technology, history.' },
  being:     { label: 'Being',      color: '#c58bff', shape: 'hexagon', rule: 'Sentinels, Threnodians and Tacet Discords.' },
  faction:   { label: 'Faction',    color: '#ff7a7a', shape: 'diamond', rule: 'Organisations, orders and families.' },
  place:     { label: 'Place',      color: '#6fe3a1', shape: 'triangle', rule: 'Nations, regions and cities.' },
  character: { label: 'Character',  color: '#f2c86b', shape: 'portrait', rule: 'Playable Resonators.' },
  realworld: { label: 'Real world', color: '#ffd9a0', shape: 'star',    rule: 'Myths, places, books and science the game draws on.' },
}

export const EDGES = [
  { key: 'inspired', label: 'Inspired by',  color: '#ffd9a0', dash: [6, 4], rule: 'A wiki Etymology or Trivia note, or a cited article, names the real-world source.' },
  { key: 'part_of',  label: 'Part of',      color: '#e8c77a', dash: null,   rule: 'Region, nation or base on the wiki, or the community tag path (“Rinascita - Septimont”).' },
  { key: 'role',     label: 'Role',         color: '#ff7a7a', dash: null,   rule: 'Leader, founder, ally or enemy in a faction’s wiki profile.' },
  { key: 'defined',  label: 'Defined with', color: '#5ee6ff', dash: null,   rule: 'One wiki page links to the other in its own text.' },
  { key: 'cotag',    label: 'Discussed together', color: '#7f8ea6', dash: [2, 4], rule: 'Community lore entries tagged with both, at least three times.' },
]
export const EDGE = Object.fromEntries(EDGES.map((e) => [e.key, e]))

export const id = (x) => x?.id ?? x
export const other = (l, n) => (id(l.source) === n ? id(l.target) : id(l.source))

export const huiji = (zh) => `https://wuwa.huijiwiki.com/wiki/${encodeURIComponent(zh)}`
export const moegirl = (zh) => `https://zh.moegirl.org.cn/${encodeURIComponent(zh)}`
export const SEARCHER = 'https://mc.yakitahome.com/search'
