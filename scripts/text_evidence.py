"""Attach attributable game-text evidence without turning co-occurrence into a bond."""
import collections
import itertools
import json
import os
import re


def plain(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


# Names that are also ordinary English words only count when capitalised ("left behind" is not the
# Left Behind), and alternate names that never match English text on their own ("common" is not the
# Common Class). Both lists live in scripts/concept_filter.json.
_FILTER = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "concept_filter.json")))
CASE_SENSITIVE = set(_FILTER.get("caseSensitive", []))
NO_TEXT_MATCH = set(_FILTER.get("noTextMatch", []))
# Chinese names that are too generic to match on (天的 is inside 今天的, "today's"), and Chinese names of
# people or things outside the map that contain an entry's name (莉莉贝 Lillibet contains 莉莉 Lily).
UNRELIABLE_ZH = set(_FILTER.get("unreliableZh", []))
ZH_IGNORE = _FILTER.get("zhIgnore", [])


def name_pattern(name):
    flags = 0 if name in CASE_SENSITIVE else re.I
    return re.compile(r"(?<![\w-])" + re.escape(name).replace("’", "['’]") + r"(?![\w-])", flags)


def speaker_name(raw):
    # A choice, narration, and an anonymous voice are not an identified speaker.
    if re.search(r"选项|旁白|跳过|总结|[？?]|^\d|^剧情|^\s*$", raw):
        return ""
    return raw.split("档案_", 1)[0].strip()


def excerpt(text, names, limit=1200):
    if len(text) <= limit:
        return text
    sentences = re.split(r"(?<=[.!?])\s+|\n\s*\n", text)
    chosen = set()
    for name in names:
        pattern = name_pattern(name)
        index = next((i for i, sentence in enumerate(sentences) if pattern.search(sentence)), None)
        if index is not None:
            chosen.add(index)
            if index and re.match(r"^(?:He|She|They|It|His|Her|Their|This|These)\b", sentences[index]):
                chosen.add(index - 1)
    if not chosen:
        return text[:limit].rsplit(" ", 1)[0] + "…"
    pieces, previous = [], -2
    for index in sorted(chosen):
        if index > previous + 1:
            pieces.append("[…]")
        pieces.append(sentences[index].strip())
        previous = index
    if previous < len(sentences) - 1:
        pieces.append("[…]")
    return "\n\n".join(pieces)


def enrich(nodes, edges, add_node, find, edge, source, reviews, text_en, text_zh, documents, definitions=(), aliases=None):
    source_text = dict(text_en)
    source_text.update((r["textKey"], r["text"]) for r in source.get("records", []))
    context_for = {}
    for definition in definitions:
        if not definition["textKeys"] or not all(key in source_text and name_pattern(definition["id"]).search(source_text[key]) for key in definition["textKeys"]):
            raise ValueError(f"Missing source for text entry: {definition['id']}")
        # Reviewed passages about the entry that refer to it only by pronoun ("he", "this person").
        for key in definition.get("contextKeys", []):
            if key not in source_text:
                raise ValueError(f"Missing context passage for text entry: {definition['id']} {key}")
            context_for[key] = definition["id"]
        add_node(definition["id"], definition["kind"], summary=definition["summary"], page=definition.get("page", ""),
                 zh=definition.get("zh", ""), summarySource="Game text", sourceTextKeys=definition["textKeys"])
    subjects = [n for n in nodes.values() if n["kind"] in {"character", "being", "place", "faction", "concept"}]
    patterns = [(n["id"], name_pattern(n["id"])) for n in subjects if len(n["id"]) >= 4]
    # Reviewed source names can be aliases of an existing canonical entry.
    for definition in definitions:
        canonical = find(definition["id"])
        if canonical and canonical["id"] != definition["id"]:
            patterns.append((canonical["id"], name_pattern(definition["id"])))
    for alternate, canonical_name in (aliases or {}).items():
        canonical = find(canonical_name)
        if canonical and alternate not in NO_TEXT_MATCH:
            patterns.append((canonical["id"], name_pattern(alternate)))
    by_zh = {n["zh"]: n["id"] for n in subjects if n.get("zh")}
    # Reviewed speaker tags that differ from the plain name, e.g. 「梅塔」 for Meta.
    # Quoted tags such as “莉莉” mark a persona, so they are never mapped automatically.
    for definition in definitions:
        for tag in definition.get("speakers", []):
            by_zh[tag] = find(definition["id"])["id"]
    translation = collections.defaultdict(collections.Counter)
    for key, zh in text_zh.items():
        en = text_en.get(key, "")
        if isinstance(zh, str) and isinstance(en, str) and 1 < len(zh) < 18 and 1 < len(en) < 45 and "\n" not in en:
            translation[zh][en] += 1

    # A Chinese name inside a longer entry name is not a mention: 莉莉 (Lily) in 莉莉兰德 (Lilyland).
    zh_names = {n["zh"] for n in subjects if len(n.get("zh", "")) >= 2}
    longer = {zh: sorted((o for o in zh_names if zh in o and o != zh), key=len, reverse=True) for zh in zh_names}

    def zh_mentions(zh, text):
        for other in [*longer.get(zh, ()), *ZH_IGNORE]:
            text = text.replace(other, "")
        return zh in text

    records = source.get("records", [])
    speaker_hits = collections.defaultdict(set)
    for r in records:
        raw = speaker_name(r.get("speakerZh", ""))
        if raw and r["kind"] in {"Dialogue", "World dialogue"}:
            speaker_hits[raw].add(re.sub(r'\s+', ' ', r['text']).strip())
    for zh, hits in sorted(speaker_hits.items()):
        if zh in by_zh or len(hits) < 2 or not translation.get(zh):
            continue
        # Only import a speaker with an exact bilingual name in the cached game map.
        name = translation[zh].most_common(1)[0][0]
        if not re.fullmatch(r"[A-Za-zÀ-ž][A-Za-zÀ-ž .’'\-]{1,39}", name):
            continue
        if re.search(r"\b(?:unknown|option|narrator|citizen|student|guard|soldier|man|woman|voice|customer|researcher|villager|staff|patroller|member|engineer|keeper|senator|storyteller|soliskin|shaper|cat|child|boy|girl|merchant|bulletin|cursing|explorer|truck|patrol unit|fisherman)\b", name, re.I):
            continue
        existing = find(name)
        if existing and existing["kind"] not in {"character", "being"}:
            continue
        npc = existing or add_node(name, "character", zh=zh, playable=False, textSearcherNPC=True,
                                    summary=f"An NPC identified as {name} in the game's dialogue. The passages below preserve their remarks and chapter references.")
        by_zh[zh] = npc["id"]

    attached = {}
    # Passages reviewed as naming someone else ("Hoda Theophilus Anna" is not Lily's friend Anna).
    excluded = {find(d["id"])["id"]: set(d.get("notTextKeys", [])) for d in definitions}

    def attach(record, mentions, speaker=None):
        mentions = [nid for nid in dict.fromkeys(mentions) if record["textKey"] not in excluded.get(nid, ())]
        if speaker and speaker not in mentions:
            mentions.insert(0, speaker)
        if not mentions:
            return
        evidence = dict(record, entities=mentions, speaker=speaker or "")
        evidence["text"] = excerpt(record["text"], mentions)
        # Preserve the bilingual text without claiming sentence alignment for long excerpts.
        if len(evidence.get("zh", "")) > 900:
            evidence["zh"] = evidence["zh"][:900] + "…"
        evidence["excerpted"] = evidence["text"] != record["text"]
        attached[evidence["id"]] = evidence
        for nid in mentions:
            nodes[nid].setdefault("textEvidence", []).append(evidence)
        # Named speech is directional; a document co-mention is only a reference.
        if speaker:
            pairs = [(speaker, nid) for nid in mentions if nid != speaker]
        elif len(mentions) <= 6:
            pairs = itertools.combinations(mentions, 2)
        else:
            anchors = {find(d["id"])["id"] for d in definitions}
            pairs = [(a, b) for a in mentions if a in anchors for b in mentions if a != b]
            pairs.extend((a, b) for a, b in itertools.combinations(mentions, 2)
                         if edges.get(tuple(sorted((a, b))), {}).get('kinds', {}).get('bond'))
        for a, b in pairs:
            edge(a, b, "text", **evidence)
            if not speaker or nodes[a]["kind"] != "character" or nodes[b]["kind"] != "character":
                continue
            pair = edges[tuple(sorted((a, b)))]
            if "bond" not in pair["kinds"]:
                key = "|".join(sorted((a, b)))
                edge(a, b, "bond", key=key, pair=sorted((a, b)), label="Mentions", tier="mention", score=1,
                     family=[], quests=[], voicelines=[], mentions=[], scenes=0, sceneQuests=[],
                     rel="Mentioned in game text", ctx=f"{a} refers to {b} in the sourced passage below. A mention alone does not establish that they have met.", basis="stated")

    for record in records:
        speaker = by_zh.get(speaker_name(record.get("speakerZh", "")))
        # Profile ownership is provenance, not a claim that the owner speaks the prose.
        if record["kind"] not in {"Dialogue", "World dialogue", "Voice line"}:
            speaker = None
        mentions = [nid for nid, pattern in patterns if pattern.search(record["text"])]
        mentions.extend(n["id"] for n in subjects if n["id"] != 'Scar' and n["id"] not in UNRELIABLE_ZH and len(n.get("zh", "")) >= 2 and zh_mentions(n["zh"], record.get("zh", "")))
        for target in (record.get('contextFor'), context_for.get(record["textKey"])):
            if target and find(target):
                mentions.insert(0, find(target)["id"])
        owner = by_zh.get(speaker_name(record.get("speakerZh", "")))
        if owner and record["kind"] == "Character profile":
            mentions.insert(0, owner)
        attach(record, mentions, speaker)

    # Local documents add coverage beyond the searcher's bounded result windows.
    for document in documents:
        text = plain(text_en.get(document.get("Text", ""), ""))
        title = plain(text_en.get(document.get("Title", ""), ""))
        if not text or not title:
            continue
        mentions = [nid for nid, pattern in patterns if pattern.search(text)]
        if not mentions:
            continue
        key = document["Text"]
        if any(r["textKey"] == key and re.sub(r"\s+", " ", r["text"]) == re.sub(r"\s+", " ", text) for r in records):
            continue
        attach(dict(id="datamine:" + key, textKey=key, kind="Readable document", title=title,
                    text=text, zh=plain(text_zh.get(key, "")), source="In-game readable · WutheringData",
                    url="https://github.com/Dimbreath/WutheringData", chapter="", version="Cached data · March 2026", retrieved=""), mentions)

    for n in nodes.values():
        if n.get("textEvidence"):
            n["textEvidence"] = sorted({r["id"]: r for r in n["textEvidence"]}.values(), key=lambda r: (r["kind"] != "World dialogue", r["kind"] not in {"Readable document", "Document / item lore"}, r["id"]))
            n["textEvidenceCount"] = len(n["textEvidence"])
    for pair in edges.values():
        if not pair["kinds"].get("text") or not pair["kinds"].get("bond"):
            continue
        bond = pair["kinds"]["bond"][0]
        review = reviews.get(bond["key"])
        if review:
            if not review['textKeys']:
                raise ValueError(f"Reviewed bond has no source: {bond['key']}")
            cited = [r for r in attached.values() if r["textKey"] in review["textKeys"] and set(bond["pair"]) <= set(r["entities"])]
            if not set(review["textKeys"]) <= {r["textKey"] for r in cited}:
                raise ValueError(f"Missing source for reviewed bond: {bond['key']}")
            combined = cited + pair["kinds"]["text"]
            pair["kinds"]["text"] = list({r["id"]: r for r in combined}.values())[:8]
            bond.update(rel=review["rel"], ctx=review["ctx"], basis="stated", contextSources=review["textKeys"])
            if bond["tier"] == "scene":
                bond.update(label="Linked in lore", tier="mention")
        bond["textEvidence"] = pair["kinds"]["text"]
        bond["textContext"] = f"{len(bond['textEvidence'])} additional sourced passages; speaker and chapter are recorded below."
    reviewed = {b["key"] for pair in edges.values() for b in pair["kinds"].get("bond", []) if b.get("contextSources")}
    if set(reviews) - reviewed:
        raise ValueError(f"Reviewed bonds have no matching evidence: {sorted(set(reviews) - reviewed)}")
    return dict(passages=len(attached), searcherPassages=sum(r["id"].startswith("yakita:") for r in attached.values()),
                coveredEntries=sum(bool(n.get("textEvidence")) for n in nodes.values()),
                newNPCs=sum(bool(n.get("textSearcherNPC")) for n in nodes.values()),
                searches=len(source.get("coverage", [])), version=source.get("version", ""), retrieved=source.get("retrieved", ""),
                truncatedSearches=sum(bool(s.get("truncated")) for s in source.get("coverage", [])),
                failedSearches=sum(bool(s.get("error")) for s in source.get("coverage", [])), reviewedBonds=len(reviewed))
