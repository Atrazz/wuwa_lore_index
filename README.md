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
| Game text | An identified speaker mentions an entry, or a source passage names both. World dialogue, profiles, quest summaries, item lore, and readable documents keep their type, chapter, language, version, and text ID. Shared names do not establish a meeting or affiliation. |
| Defined with | One wiki page links to the other in its own text (the sentence is kept as context). |
| Discussed together | Community lore entries tagged with both, at least three times (scored by lift so hubs don't dominate). |

## Sources

| Source | Used for | Access |
|---|---|---|
| [Wuthering Waves Fandom wiki](https://wutheringwaves.fandom.com/) | terms, factions, places, etymology, trivia, Chinese names | MediaWiki API |
| [Solaris Archives lore dataset](https://wutheringwaves.notion.site/Wuthering-Waves-Lore-Dataset-91344f91cb8b4adca6455470f823dd12) | concept tags across ~2,200 lore entries, links to official publications | public Notion site (robots: allow) |
| [Dimbreath/WutheringData](https://github.com/Dimbreath/WutheringData) | official en/zh text map (Chinese names), in-game readable documents | public GitHub repo, no licence, last updated March 2026 |
| [GameKee 鸣潮wiki](https://www.gamekee.com/mc/624299.html) | cultural-reference article (hand-checked into `scripts/curated.json`) | robots: allow |
| [WuWa Text Searcher · Yakitahome](https://mc.yakitahome.com/search) | missing mentions, ambient NPC dialogue, profiles, quest and item lore | bounded browser searches; source snapshot and coverage in `scripts/text_searcher.json` |
| Wikipedia | summaries and Chinese titles of real-world references | official REST/action APIs |

Huiji, BWIKI and Moegirl are linked from each entry for further reading. The text searcher is now also a source of attributed game-text passages, collected through its browser search interface at the user's request.

## Game-text evidence

The Entries controls group **Playable** and **Unique NPC** under **Character**. **General NPC** is a separate layer, hidden by default. `scripts/character_types.json` lists the unique story NPCs (including Cristoforo and Scar); other non-playable characters, such as Yhan and ordinary world NPCs, are general NPCs. Categories are applied after evidence building, so changing a character's category preserves their bonds, sources, and portraits.

Each character and place can show **In-game mentions**, with filters for world dialogue, documents, profiles, and other dialogue. Bonds show **Additional game-text context**. Chinese text and exact source references expand separately. Source links open the searcher's search page; copy the query and text ID to reproduce a reference (no passage permalink is assumed).

The **In-game mentions** section sits immediately before **In the wiki** and is collapsed by default. Concepts without an existing introduction receive a cited description from their game-text evidence: reviewed explanations in `scripts/concept_summaries.json`, or an explicitly attributed source excerpt when only limited context is available. The description's **Game text** button opens the supporting passage first. Existing wiki introductions are preserved.

`scripts/entity_aliases.json` merges confirmed alternate names and singular/plural duplicates before edges and evidence are built, preserving aliases for search. Honami City resolves to the place **Chronorift Metropolis**; **Neo Honami City** remains separate as its documented surviving portion. Existing wiki location infoboxes also correct concepts that are actually areas or points of interest, including Capitoline Hill and the Cathedral of Mercury.

`scripts/search_text.py` uses Python Playwright with an installed Chromium to search existing characters and places and make additional searches in ambient chapters (`生态`). It saves resumable raw results to the ignored `scripts/raw/text_searcher.json`. The default limit is 100 rows per search; total, loaded, truncated, and failed searches are recorded. This is bounded coverage, not a complete crawl. For example, using the Python environment where Playwright is installed:

```bash
python scripts/search_text.py --browser /path/to/chrome
npm run data:text
npm run test:data
```

`scripts/import_text_search.py` selects lore passages and excludes combat mechanics, short labels, and tutorial strings. Its tracked output is `scripts/text_searcher.json`, so ordinary `npm run data` builds work without visiting the searcher again. `scripts/text_evidence.py` also indexes the cached readable documents. Named world NPCs require two distinct dialogue passages and an exact bilingual name in the cached game map. Anonymous or generic speakers remain attributed text rather than new named characters.

Only an attributed speaker's mention can add a mention-tier character bond. Document and profile co-mentions remain Game text references. Reviewed relationship summaries in `scripts/text_context.json` must cite text IDs attached to that pair; missing evidence fails the build. Existing family, conversation, and voice-line evidence is preserved.

The build deduplicates passages into `public/game-text.json`, loaded only when an evidence panel opens. The graph stores passage IDs. To refresh searches, use `--refresh`; `--only 'Character Name'` limits a run. `--language zh` checks Chinese names, and `--title-context` opens loading-tip headings to capture their matching descriptions. Exploration reports and map descriptions are also retained. Reviewed entries in `scripts/text_entities.json` must cite the passage that names them; existing canonical names can retain their source aliases. Searcher version and retrieval date describe the source snapshot independently of the older local document cache.

## Unverified theories

Fan theories are a separate layer: off by default, drawn as dashed “?” nodes, and always labelled unverified.

- **Solaris Archives “Speculation” write-ups** (20, from the community dataset), linked to the concepts they're tagged with.
- **`scripts/theories.json`**: theories summarised by hand, in your own words. Only the title, summary,
  rating and concepts are published; `video` and `timestamp` are private notes for you and never reach the site.
  Entries with `"example": true` are ignored.

```json
{
  "title": "The Lament is a cycle, not an event",
  "summary": "One or two sentences on the claim.",
  "plausibility": "stretch",
  "basis": "What in-game material it points to.",
  "concepts": ["The Lament", "Threnodian"],
  "video": "my-notes", "timestamp": "20:34"
}
```

`plausibility` is `grounded`, `stretch` or `wild`: how much the theory leans on game material, not whether it's right.
`concepts` are entry names as shown on the map (English); the build prints any it can't find. Run
`python3 -I scripts/build_lore.py` after editing.

## Data pipeline

```bash
npm run data           # use cached downloads, rebuild src/data/lore.json
npm run data:refresh   # re-download wiki + community dataset
```

`scripts/curated.json` holds real-world references taken by hand from articles, each with a citation.
Game text and assets © Kuro Games. Wiki text CC BY-SA. Community dataset by the Solaris Archives community.
