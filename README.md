# Echo Codex — Wuthering Waves lore graph

An interactive map of Wuthering Waves lore. The inner map is the world of Solaris-3. The outer ring holds the
real-world myths, places, books and science the game draws on. Every line links back to its source.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/ (Netlify config included)
```

## Connections (strongest first)

| Kind | Rule |
|---|---|
| Inspired by | A wiki Etymology/Trivia note, or a cited article, names the real-world source. Marked *stated* or *possible* (hedged wording); notes the wiki calls false are dropped. |
| Part of | Region / nation / base fields on the wiki, or the community tag path ("Rinascita - Septimont"). |
| Role | Leader, founder, ally, enemy in a faction's wiki profile. |
| Defined with | One wiki page links to the other in its own text (the sentence is kept as context). |
| Discussed together | Community lore entries tagged with both, at least three times (scored by lift so hubs don't dominate). |

## Sources

| Source | Used for | Access |
|---|---|---|
| [Wuthering Waves Fandom wiki](https://wutheringwaves.fandom.com/) | terms, factions, places, etymology, trivia, Chinese names | MediaWiki API |
| [Solaris Archives lore dataset](https://wutheringwaves.notion.site/Wuthering-Waves-Lore-Dataset-91344f91cb8b4adca6455470f823dd12) | concept tags across ~2,200 lore entries, links to official publications | public Notion site (robots: allow) |
| [Dimbreath/WutheringData](https://github.com/Dimbreath/WutheringData) | official en/zh text map (Chinese names), in-game readable documents | public GitHub repo, no licence, last updated March 2026 |
| [GameKee 鸣潮wiki](https://www.gamekee.com/mc/624299.html) | cultural-reference article (hand-checked into `scripts/curated.json`) | robots: allow |
| Wikipedia | summaries and Chinese titles of real-world references | official REST/action APIs |

Huiji, BWIKI, Moegirl and the WuWa text searcher ask AI tools not to collect their content (robots.txt /
content signals), so they are only linked from each entry for reading by hand.

## Data pipeline

```bash
npm run data           # use cached downloads, rebuild src/data/lore.json
npm run data:refresh   # re-download wiki + community dataset
```

`scripts/curated.json` holds real-world references taken by hand from articles, each with a citation.
Game text and assets © Kuro Games. Wiki text CC BY-SA. Community dataset by the Solaris Archives community.
