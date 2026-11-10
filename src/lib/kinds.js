// Node and edge vocabulary for the lore graph. Rules are shown in the "How it works" panel.
export const KINDS = {
  concept:   { label: 'Concept',    color: '#4cc9ff', shape: 'circle',  rule: 'Lore terms: phenomena, technology, history.' },
  being:     { label: 'Being',      color: '#a28bff', shape: 'hexagon', rule: 'Sentinels, Threnodians and Tacet Discords.' },
  faction:   { label: 'Faction',    color: '#ff5f7e', shape: 'diamond', rule: 'Organisations, orders and families.' },
  place:     { label: 'Place',      color: '#3ff0b2', shape: 'triangle', rule: 'Nations, regions and cities.' },
  character: { label: 'Character',  color: '#e9fbff', shape: 'portrait', rule: 'Playable Resonators.' },
  realworld: { label: 'Real world', color: '#ffcf6b', shape: 'star',    rule: 'Myths, places, books and science the game draws on.' },
  theory:    { label: 'Theory',     color: '#ff74d4', shape: 'question', rule: 'Unverified fan theories. Not confirmed by the game.' },
}

export const EDGES = [
  { key: 'inspired', label: 'Inspired by',  color: '#ffcf6b', dash: [6, 4], rule: 'A wiki Etymology or Trivia note, or a cited article, names the real-world source.' },
  { key: 'parallel', label: 'Possible parallel', color: '#ff9a4a', dash: [1, 4], rule: 'Our comparison, stated by no source: matching points quote the wiki and Wikipedia, with what doesn’t fit.' },
  { key: 'part_of',  label: 'Part of',      color: '#7ee8ff', dash: null,   rule: 'Region, nation or base on the wiki, or the community tag path (“Rinascita - Septimont”).' },
  { key: 'role',     label: 'Role',         color: '#ff5f7e', dash: null,   rule: 'Leader, founder, ally or enemy in a faction’s wiki profile.' },
  { key: 'defined',  label: 'Defined with', color: '#4cc9ff', dash: null,   rule: 'One wiki page links to the other in its own text.' },
  { key: 'cotag',    label: 'Discussed together', color: '#3e5f66', dash: [2, 4], rule: 'Community lore entries tagged with both, at least three times.' },
  { key: 'theorized', label: 'Theorized', color: '#ff74d4', dash: [1, 3], rule: 'A fan theory discusses this entry. Unverified.' },
]
export const EDGE = Object.fromEntries(EDGES.map((e) => [e.key, e]))

export const id = (x) => x?.id ?? x
export const other = (l, n) => (id(l.source) === n ? id(l.target) : id(l.source))

export const huiji = (zh) => `https://wuwa.huijiwiki.com/wiki/${encodeURIComponent(zh)}`
export const moegirl = (zh) => `https://zh.moegirl.org.cn/${encodeURIComponent(zh)}`
export const SEARCHER = 'https://mc.yakitahome.com/search'
