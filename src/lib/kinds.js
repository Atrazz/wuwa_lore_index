// Node and edge vocabulary for the lore graph. Rules are shown in the "How it works" panel.
export const KINDS = {
  concept:   { label: 'Concept',    color: '#4cc9ff', shape: 'circle',  rule: 'Lore terms: phenomena, technology, history.' },
  being:     { label: 'Being',      color: '#a28bff', shape: 'hexagon', rule: 'Sentinels, Threnodians and Tacet Discords.' },
  faction:   { label: 'Faction',    color: '#ff5f7e', shape: 'diamond', rule: 'Organisations, orders and families.' },
  place:     { label: 'Place',      color: '#3ff0b2', shape: 'triangle', rule: 'Nations, regions and cities.' },
  character: { label: 'Playable',   color: '#e9fbff', shape: 'portrait', group: 'Character', rule: 'Playable characters.' },
  unique_npc: { label: 'Unique NPC', color: '#d5b7ff', shape: 'portrait', group: 'Character', rule: 'Distinct story characters, such as Cristoforo, Scar, and Abby.' },
  npc:       { label: 'General NPC', color: '#9ab7ad', shape: 'portrait', defaultVisible: false, rule: 'World NPCs, vendors, and other everyday characters, such as Yhan. Hidden by default.' },
  realworld: { label: 'Real world', color: '#ffcf6b', shape: 'star',    rule: 'Myths, places, books and science the game draws on.' },
  theory:    { label: 'Theory',     color: '#ff74d4', shape: 'question', defaultVisible: false, rule: 'Unverified fan theories. Not confirmed by the game.' },
}
export const DEFAULT_NODE_KINDS = Object.keys(KINDS).filter((key) => KINDS[key].defaultVisible !== false)
export const isCharacter = (node) => ['character', 'unique_npc', 'npc'].includes(node.kind)

export const EDGES = [
  { key: 'inspired', label: 'Inspired by',  color: '#ffcf6b', dash: [6, 4], rule: 'A wiki Etymology or Trivia note, or a cited article, names the real-world source; links marked possible are our own reading.' },
  { key: 'parallel', label: 'Possible parallel', color: '#ff9a4a', dash: [1, 4], rule: 'Our comparison, stated by no source: matching points quote the wiki and Wikipedia, with what doesn’t fit.' },
  { key: 'part_of',  label: 'Part of',      color: '#7ee8ff', dash: null,   rule: 'Region, nation or base on the wiki, or the community tag path (“Rinascita - Septimont”).' },
  { key: 'role',     label: 'Role',         color: '#ff5f7e', dash: null,   rule: 'Leader, founder, ally or enemy in a faction’s wiki profile.' },
  { key: 'bond',     label: 'Bond',         color: '#dfe9f2', dash: null,   rule: 'Between characters: family on the wiki profiles, quests they talk in, voice lines about each other, mentions.' },
  { key: 'text',     label: 'Game text',    color: '#99d8ad', dash: [2, 3], rule: 'An identified speaker refers to an entry, or a source passage names both. Co-mentions do not prove a relationship; each passage keeps its type and source reference.' },
  { key: 'defined',  label: 'In the wiki', color: '#4cc9ff', dash: null,   rule: 'A wiki article connects the two: the sentence that says how, or the list it puts one in.' },
  { key: 'theorized', label: 'Theorized', color: '#ff74d4', dash: [1, 3], rule: 'A fan theory discusses this entry. Unverified.' },
]
export const EDGE = Object.fromEntries(EDGES.map((e) => [e.key, e]))

export const id = (x) => x?.id ?? x
export const other = (l, n) => (id(l.source) === n ? id(l.target) : id(l.source))

export const huiji = (zh) => `https://wuwa.huijiwiki.com/wiki/${encodeURIComponent(zh)}`
export const moegirl = (zh) => `https://zh.moegirl.org.cn/${encodeURIComponent(zh)}`
export const SEARCHER = 'https://mc.yakitahome.com/search'
