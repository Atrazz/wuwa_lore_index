"""Build src/data/lore.json: a knowledge graph of Wuthering Waves lore.

Sources (all cached in scripts/raw/):
  pages.json            Fandom wiki pages: terminology, factions, locations, Resonators, pages with Wikipedia links
  notion_entries.json   Solaris Archives community "Lore Entries Dataset" (2k entries tagged with concepts)
  datamine/             Dimbreath/WutheringData: official en/zh text map + readable documents (InfoDisplay)
  wikipedia.json        summaries for the real-world references (written by fetch_wikipedia.py)
  curated.json          hand-checked real-world references from articles we can only read, each with a citation

Node kinds: concept, being, faction, place, character, realworld
Edge kinds (strongest evidence first):
  part_of     hierarchy: location region/nation fields, faction bases, community tag paths ("Rinascita - Septimont")
  role        faction infobox fields: leader, founder, ally, enemy
  inspired    real-world reference named in an Etymology/Trivia note or a cited article
  defined     one wiki page links to the other in its own text
  cotag       community entries tagged with both concepts
"""
import collections, datetime, json, math, os, re, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "src", "data", "lore.json")
WIKI = "https://wutheringwaves.fandom.com/wiki/"


def load(name, default=None):
    p = os.path.join(RAW, name)
    return json.load(open(p)) if os.path.exists(p) else default


P = load("pages.json", {})
G = load("groups.json", {})
NOTION = load("notion_entries.json", {"entries": []})["entries"]
WP = load("wikipedia.json", {})
CURATED = json.load(open(os.path.join(HERE, "curated.json"))) if os.path.exists(os.path.join(HERE, "curated.json")) else []
DM_EN = load("datamine/text_en.json", {})
DM_ZH = load("datamine/text_zh-Hans.json", {})
DM_DOCS = load("datamine/cfg_InfoDisplay.json", [])


# ---------------------------------------------------------------- wikitext helpers
def _tpl(inner):
    parts = [p.strip() for p in inner.split("|")]
    name = parts[0].lower()
    pos = [p for p in parts[1:] if not re.match(r"^\w[\w-]*\s*=", p)]
    kw = dict(re.match(r"^(\w[\w-]*)\s*=\s*(.*)$", p, re.S).groups() for p in parts[1:] if re.match(r"^\w[\w-]*\s*=", p))
    if name == "lang": return pos[0] if pos else kw.get("zh", kw.get("zhs", ""))
    if name == "w": return pos[1] if len(pos) > 1 else (pos[0] if pos else "")
    if name in ("extra effect",): return pos[0] if pos else ""
    if name in ("color",): return pos[-1] if pos else ""
    if name in ("rover",): return "Rover"
    if name == "description": return pos[-1] if pos else ""
    return ""


def clean(t):
    t = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", t, flags=re.S)
    for _ in range(6):
        t2 = re.sub(r"\{\{([^{}]*)\}\}", lambda m: _tpl(m.group(1)), t)
        if t2 == t: break
        t = t2
    t = re.sub(r"\[\[(?:File|Image|Category):[^\]]*\]\]", "", t)
    t = re.sub(r"\[\[(?:wp:|w:)?(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", t)
    t = re.sub(r"\[https?://\S+ ([^\]]+)\]", r"\1", t)
    t = re.sub(r"<br\s*/?>", " ", t)
    t = re.sub(r"<[^>]+>|'''|''", "", t)
    return re.sub(r"[ \t]+", " ", t).strip()


def infobox(wt, name):
    m = re.search(r"\{\{" + name.replace(" ", "[ _]") + r"(.*?)\n\}\}", wt, re.S)
    return {k: v.strip() for k, v in re.findall(r"^\|[ \t]*(\w+)[ \t]*=[ \t]*(.*)$", m.group(1), re.M)} if m else {}


def strip_templates(wt, name_rx):
    """Remove every {{<name> …}} whose name matches, honouring nested braces."""
    out, i = [], 0
    for m in re.finditer(r"\{\{\s*(" + name_rx + r")", wt):
        if m.start() < i: continue
        depth, j = 0, m.start()
        while j < len(wt) - 1:
            if wt.startswith("{{", j): depth += 1; j += 2; continue
            if wt.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0: break
                continue
            j += 1
        out.append(wt[i:m.start()]); i = j
    out.append(wt[i:])
    return "".join(out)


def body(wt):
    """Page text without infoboxes, galleries, language tables and navigation."""
    wt = strip_templates(wt, r"[\w ]*Infobox|CustomTabs|Resonator Tabs")
    wt = re.split(r"\n==\s*(?:Other Languages|Change History|References|Navigation|Gallery)\s*==", wt)[0]
    return wt


def lead(wt):
    b = strip_templates(body(wt), r"Quote|Description|Main|About|Stub|Spoiler")
    b = re.split(r"\n==", b)[0]
    paras = [clean(p) for p in b.split("\n\n")]
    paras = [p for p in paras if len(p) > 60 and not p.startswith("{|") and not p.startswith("|")]
    return paras[0][:700] if paras else ""


def section(wt, *names):
    out = []
    for n in names:
        for m in re.finditer(r"\n(=+)\s*" + n + r"\s*\1\s*\n(.*?)(?=\n=+[^=\n]+=+\s*\n|\Z)", wt, re.S | re.I):
            out.append(m.group(2))
    return "\n".join(out)


def other_langs(wt, title=""):
    """{{Other Languages}} can hold several rows (1_en, 1_zhs, 2_en, …); use the row for this title."""
    m = re.search(r"\{\{Other Languages(.*?)\n\}\}", wt, re.S)
    if not m: return {}
    rows = collections.defaultdict(dict)
    for num, lang, v in re.findall(r"^\|[ \t]*(?:(\d+)_)?(\w+)[ \t]*=[ \t]*(.*)$", m.group(1), re.M):
        rows[num or "1"][lang] = clean(v)
    for r in rows.values():
        if norm(r.get("en", "")) == norm(title): return r
    return rows.get("1", next(iter(rows.values()), {}))


def zh_from_lang(wt, term):
    """{{Lang|Tacet Cores|zh=声核|lit=Sound Nucleus}} next to the term itself."""
    for m in re.finditer(r"\{\{[Ll]ang\|([^{}]*)\}\}", wt):
        parts = m.group(1).split("|")
        kw = dict(p.split("=", 1) for p in parts if "=" in p)
        label = clean(parts[0]) if "=" not in parts[0] else ""
        if label and norm(label).rstrip("s") == norm(term).rstrip("s") and (kw.get("zh") or kw.get("zhs")):
            return clean(kw.get("zh") or kw.get("zhs")), clean(kw.get("lit", ""))
    return "", ""


# ---------------------------------------------------------------- names
def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(ch for ch in s if not unicodedata.combining(ch))  # Jué == Jue
    s = re.sub(r"\(.*?\)", "", s)
    s = s.replace("’", "'").replace('"', "").replace("“", "").replace("”", "")
    s = re.sub(r"\s+", " ", s).strip().lower()
    return re.sub(r"^the ", "", s)


STRIP_PREFIX = re.compile(r"^(sentinel|threnodian|member|the)\s+", re.I)

nodes, by_key = {}, {}


def add_node(name, kind, **kw):
    key = norm(name)
    if not key or len(key) < 2: return None
    if key in by_key:
        n = nodes[by_key[key]]
        for k, v in kw.items():
            if v and not n.get(k): n[k] = v
        if KIND_RANK[kind] < KIND_RANK[n["kind"]]: n["kind"] = kind
        return n
    n = dict(id=name, kind=kind, aliases=[], **kw)
    nodes[name] = n
    by_key[key] = name
    return n


def alias(node, name):
    k = norm(name)
    if k and k not in by_key: by_key[k] = node["id"]
    if name != node["id"] and name not in node["aliases"]: node["aliases"].append(name)


def find(name):
    k = norm(name)
    if k in by_key: return nodes[by_key[k]]
    k2 = norm(STRIP_PREFIX.sub("", name))
    return nodes[by_key[k2]] if k2 in by_key else None


KIND_RANK = {"character": 0, "faction": 1, "place": 2, "being": 3, "concept": 4, "realworld": 5, "theory": 6}
BEING = re.compile(r"sentinel|threnodian|tacet discord|exostrider|crownless|whisperin|howler|tranquilite|clamorling|staticoid|leviathan|jué|imperator|lorelei|dreamless|voidworm|exoswarm", re.I)
BEING_CLASSES = {"threnodian", "sentinel", "tacet discord", "exostrider", "whisperin", "howler", "tranquilite", "clamorling", "staticoid"}
META = re.compile(r"glossary|tokens?$|common echoes|\becho(es)?$|battle beneath|wutherium geographic|preview|crescendo|event|twitch|discord|creator|program|showcase|video|podcast|soundtrack|comic|campaign|drop|sign-in|simulation|battle rush|illusive realm|alloy smelt|tactical|beyond the waves|glamour|couture|excerpt|notice|manual|report|cherished item|evaluation|^lore$|^unknown$|^npc$|game systems|^remnant$|ascendant aces|lollo", re.I)

# ---------------------------------------------------------------- 1. Fandom nodes
LORE_TYPES = {"Lore", "Wuthering Waves", "Factions", "Rinascita Culture", "Recurring Events", "Enemy Class", "Characters"}
PLACE_TYPES = {"Region", "Province", "City", "World", "Village", "Town", "Lore"}
page_of = {}

for t in G.get("resonator", []):
    if t.startswith("Rover-") or ":" in t: continue
    wt = P.get(t, "")
    ib = infobox(wt, "Resonator Infobox")
    n = add_node(t, "character", nation=clean(ib.get("nation", "")), summary=lead(wt))
    page_of[n["id"]] = t
for t in G.get("faction", []):
    wt = P.get(t, "")
    n = add_node(t, "faction", summary=lead(wt))
    if n: page_of[n["id"]] = t
for t in G.get("nation", []):
    wt = P.get(t, "")
    n = add_node(t, "place", summary=lead(wt))
    if n: page_of[n["id"]] = t
nations = {clean(infobox(P.get(t, ""), "Location Infobox").get("nation", "")) for t in G.get("location", [])}
for t in G.get("location", []):
    wt = P.get(t, "")
    ib = infobox(wt, "Location Infobox")
    types = {clean(ib.get(k, "")) for k in ("type", "type2")}
    if not types & PLACE_TYPES and t not in nations: continue
    n = add_node(t, "place", summary=lead(wt), nation=clean(ib.get("nation", "")))
    if n: page_of[n["id"]] = t
for t in G.get("term", []):
    wt = P.get(t, "")
    typ = clean(infobox(wt, "Terminology Infobox").get("type", ""))
    if typ not in LORE_TYPES or META.search(t): continue
    n = add_node(t, "being" if BEING.search(t) or typ == "Enemy Class" else "concept", summary=lead(wt))
    if n: page_of[n["id"]] = t
for t in ("Sentinel", "Jué", "Shorekeeper", "Imperator", "Lorelei", "Threnodian", "Tacet Discord"):
    if t in P and not find(t):
        n = add_node(t, "being", summary=lead(P[t])); page_of[n["id"]] = t

for t in list(G.get("location", [])) + list(G.get("faction", [])) + list(G.get("resonator", [])):
    wt = P.get(t, "")
    for box in ("Location Infobox", "Faction Infobox", "Resonator Infobox"):
        nat = find(clean(infobox(wt, box).get("nation", "")))
        if nat and nat["kind"] in ("concept", "being"): nat["kind"] = "place"

# ---------------------------------------------------------------- 2. community tags (Notion)
tag_count = collections.Counter(t.strip() for e in NOTION for t in (e.get("Tags") or "").split(",") if t.strip())
SKIP_TAG = re.compile(r"^(member|item|quest|dish|video|image|notes?|speculation|users? showcase|act \d|chapter|cbt|funds|rolling)\b|version|showcase|navigation", re.I)


def tag_parts(tag):
    """'Rinascita - Sentinel Imperator' -> ['Rinascita', 'Imperator']; 'Phrolova/"Hecate"' -> ['Phrolova'] (+aliases)."""
    segs = [s.strip() for s in tag.split(" - ") if s.strip()]
    out = []
    for s in segs:
        names = [x.strip().strip('"') for x in re.split(r"/|\|", s) if x.strip().strip('"')]
        out.append(names)
    return out


tag_node = {}
for tag, cnt in tag_count.items():
    if cnt < 3 or SKIP_TAG.search(tag): continue
    parts = tag_parts(tag)
    if not parts: continue
    # The tag names its last segment ("Huanglong - Central Plains" -> Central Plains, a child of
    # Huanglong). Only the segment's first name is used to match; the others
    # ('Exostrider/"Baldur"/"Lahai-Roi"') become aliases of that node and are never used to match.
    if META.search(parts[-1][0]): continue
    n = find(parts[-1][0])
    if not n:  # "Carlotta Montelli" -> the Resonator Carlotta
        n = next((c for c in nodes.values() if c["kind"] == "character" and norm(parts[-1][0]).startswith(norm(c["id"]) + " ")), None)
    if not n and len(parts) > 1:
        owner = find(parts[-2][0])
        # "Sentinel Jué - Sui'guang": an unknown name under a known being qualifies that being
        # ...but not under a whole class: "Threnodian - Leviathan" is its own being, part of the class
        if owner and owner["kind"] == "being" and norm(owner["id"]) not in BEING_CLASSES: n = owner
    n = n or add_node(parts[-1][0], "being" if BEING.search(tag) else "concept")
    if not n: continue
    for nm in parts[-1]: alias(n, nm)
    n["tag"] = n.get("tag") or tag
    n["tagCount"] = n.get("tagCount", 0) + cnt
    tag_node[tag] = n["id"]

# ---------------------------------------------------------------- edges
edges = {}


def edge(a, b, kind, **ev):
    if not a or not b or a == b: return
    key = tuple(sorted((a, b)))
    e = edges.setdefault(key, dict(source=key[0], target=key[1], kinds={}))
    lst = e["kinds"].setdefault(kind, [])
    if ev and ev not in lst and len(lst) < 8: lst.append(ev)
    elif not ev and not lst: lst.append({})


# part_of from community tag paths
for tag, nid in tag_node.items():
    parts = tag_parts(tag)
    for parent_names in parts[:-1][::-1]:
        parent = find(parent_names[0])
        if parent and parent["id"] != nid:
            edge(nid, parent["id"], "part_of", child=nid, parent=parent["id"], source="Community tag", note=tag)
            break

# Fandom infobox structure
for nid, page in page_of.items():
    wt = P.get(page, "")
    n = nodes[nid]
    if n["kind"] == "place":
        ib = infobox(wt, "Location Infobox")
        for f in ("region", "nation", "area"):
            parent = find(clean(ib.get(f, "")))
            if parent and parent["kind"] == "place":
                edge(nid, parent["id"], "part_of", child=nid, parent=parent["id"], source=f"{page} — wiki ({f})", url=WIKI + page.replace(" ", "_"))
                break
    if n["kind"] == "faction":
        ib = infobox(wt, "Faction Infobox")
        for f in ("base", "region", "nation"):
            for v in re.split(r"<br\s*/?>|;|,", ib.get(f, "")):
                parent = find(clean(v))
                if parent:
                    edge(nid, parent["id"], "part_of", child=nid, parent=parent["id"], source=f"{page} — wiki ({f})", url=WIKI + page.replace(" ", "_"))
        for f in ("leader", "founder", "ally", "enemy", "affiliation"):
            for v in re.split(r"<br\s*/?>|;|,", ib.get(f, "")):
                other = find(clean(v))
                if other:
                    edge(nid, other["id"], "role", role=f, of=nid, who=other["id"], source=f"{page} — wiki ({f})", url=WIKI + page.replace(" ", "_"))
    if n["kind"] == "character" and n.get("nation"):
        parent = find(n["nation"])
        if parent: edge(nid, parent["id"], "part_of", child=nid, parent=parent["id"], source=f"{page} — wiki (nation)", url=WIKI + page.replace(" ", "_"))

# defined: wiki page text links to another node, with the sentence as context
for nid, page in page_of.items():
    wt = body(P.get(page, ""))
    for para in wt.split("\n"):
        for m in re.finditer(r"\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]", para):
            other = find(m.group(1))
            if not other or other["id"] == nid: continue
            sent = clean(para)
            if len(sent) > 320:
                i = sent.find(clean(m.group(0)))
                sent = ("…" if i > 160 else "") + sent[max(0, i - 160): i + 160] + "…"
            edge(nid, other["id"], "defined", **{"from": nid, "to": other["id"], "text": sent, "url": WIKI + page.replace(" ", "_")})

# cotag: community entries tagged with both concepts, scored by lift so hubs don't dominate
entry_tags = []
for e in NOTION:
    ids = sorted({tag_node[t.strip()] for t in (e.get("Tags") or "").split(",") if t.strip() in tag_node})
    if len(ids) >= 2: entry_tags.append((e, ids))
occ = collections.Counter(i for _, ids in entry_tags for i in ids)
pair_entries = collections.defaultdict(list)
for e, ids in entry_tags:
    if len(ids) > 25: continue  # catch-all pages tag everything
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            pair_entries[(a, b)].append(e)
N = max(len(entry_tags), 1)
scored = []
for (a, b), es in pair_entries.items():
    if len(es) < 3: continue
    lift = len(es) * N / (occ[a] * occ[b])
    scored.append((len(es) * math.log2(1 + lift), a, b, es))
per_node = collections.Counter()
for score, a, b, es in sorted(scored, reverse=True):
    if per_node[a] >= 10 and per_node[b] >= 10: continue
    per_node[a] += 1; per_node[b] += 1
    for e in es[:6]:
        edge(a, b, "cotag", entry=e["Name"][:140], type=(e.get("Type") or "").split(",")[0], url=e["url"])
    edges[tuple(sorted((a, b)))]["cotagCount"] = len(es)

# ---------------------------------------------------------------- real-world references
rw_sources = collections.defaultdict(list)
DEBUNKED = re.compile(r"falsely|incorrect(ly)?|debunk|not true|misconception", re.I)
HEDGED = re.compile(r"\b(may|might|likely|possibly|perhaps|suggests?|resembles?|similar|theor)", re.I)
VA_LINE = re.compile(r"voice|VA\b|actor|actress|seiyuu|CV\b|cast", re.I)
for nid, page in page_of.items():
    wt = P.get(page, "")
    notes = section(wt, "Trivia", "Etymology", "Name", "Names", "Inspiration")
    for line in notes.split("\n"):
        if VA_LINE.search(line) or DEBUNKED.search(line): continue
        certainty = "possible" if HEDGED.search(line) else "stated"
        for j, m in enumerate(re.finditer(r"\{\{[Ww]\|([^}|]+)(?:\|[^}]*)?\}\}|\[\[wp:([^|\]]+)(?:\|[^\]]*)?\]\]", line)):
            title = (m.group(1) or m.group(2)).strip()
            if title.startswith(("ja:", "ko:", "zh:", "c:")) or j >= 3: continue
            rw_sources[title].append(dict(node=nid, text=clean(line.lstrip("*: ")), source=f"{page} — wiki", certainty=certainty,
                                          url=WIKI + page.replace(" ", "_") + "#Trivia"))
for c in CURATED:
    rw_sources[c["wikipedia"]].append(dict(node=c["node"], text=c["text"], source=c["source"], url=c["url"], quote=c.get("quote", ""),
                                           certainty=c.get("certainty", "stated")))

for title, refs in rw_sources.items():
    info = WP.get(title, {})
    if info.get("missing"): continue
    rw = add_node(info.get("title") or title, "realworld", summary=info.get("extract", ""), wiki=info.get("url") or "https://en.wikipedia.org/wiki/" + title.replace(" ", "_"),
                  zh=info.get("zh", ""), wikiZh=info.get("zhUrl", ""), category=info.get("description", ""), image=info.get("thumb", ""))
    if not rw: continue
    for r in refs:
        target = find(r["node"]) or nodes.get(r["node"])
        if target: edge(target["id"], rw["id"], "inspired", **r)

# ---------------------------------------------------------------- Chinese names (official text map) + literal meanings
en_index = collections.defaultdict(list)
for k, v in DM_EN.items():
    if isinstance(v, str) and len(v) <= 40: en_index[v.strip().lower()].append(k)
for n in nodes.values():
    if n["kind"] == "realworld": continue
    page = page_of.get(n["id"])
    wt = P.get(page, "") if page else ""
    zh, lit = zh_from_lang(wt, n["id"]) if wt else ("", "")
    if wt: zh = other_langs(wt, page).get("zhs", "") or zh
    if not zh:
        # only the node's own name: community aliases can be fan identifications ("Grand Architect | Triss")
        for names in ([n["id"]],):
            cands = collections.Counter(DM_ZH.get(k, "") for name in names for k in en_index.get(name.lower(), []))
            cands.pop("", None)
            if cands:
                zh = re.sub(r"^【|】$", "", cands.most_common(1)[0][0]); break
    n["zh"] = zh
    if lit: n["lit"] = lit
    if wt:
        n["page"] = WIKI + page.replace(" ", "_")
        ety = section(wt, "Etymology")
        if ety: n["etymology"] = [clean(l.lstrip("*: ")) for l in ety.split("\n") if clean(l.lstrip("*: "))][:5]

# ---------------------------------------------------------------- official documents mentioning each concept
docs = []
for d in DM_DOCS:
    title, text = DM_EN.get(d.get("Title", ""), ""), DM_EN.get(d.get("Text", ""), "")
    if title and text: docs.append((title, DM_ZH.get(d.get("Title", ""), ""), re.sub(r"<[^>]+>", "", text)))
for n in nodes.values():
    if n["kind"] == "realworld" or len(n["id"]) < 4: continue
    names = [n["id"]] + [a for a in n["aliases"] if len(a) >= 4]
    rx = re.compile(r"(?<![\w-])(" + "|".join(re.escape(x) for x in names) + r")(?![\w-])")
    hits = []
    for title, zh, text in docs:
        m = rx.search(text)
        if m:
            i = m.start()
            hits.append(dict(title=title, zh=zh, text=("…" if i > 140 else "") + text[max(0, i - 140): i + 220].replace("\n", " ") + "…"))
    if hits: n["documents"] = hits[:6]; n["documentCount"] = len(hits)

# community entries per node
by_node = collections.defaultdict(list)
for e in NOTION:
    for t in (e.get("Tags") or "").split(","):
        nid = tag_node.get(t.strip())
        if nid: by_node[nid].append(e)
for nid, es in by_node.items():
    es = sorted({e["id"]: e for e in es}.values(), key=lambda e: -len(e.get("Text") or ""))
    nodes[nid]["entries"] = [dict(name=e["Name"][:140], type=(e.get("Type") or "").split(",")[0], url=e["url"],
                                  official=e.get("URL", "") if "kurogames" in (e.get("URL") or "") else "") for e in es[:10]]
    nodes[nid]["entryCount"] = len(es)

# ---------------------------------------------------------------- unverified theories
# Kept apart from sourced lore: kind "theory", edge "theorized", hidden by default in the UI.
#   - community write-ups typed "Speculation" in the Solaris Archives dataset
#   - scripts/theories.json: theories noted by hand from livestreams/videos, with a timestamped link
def excerpt(text, n=320):
    t = re.sub(r"^#+\s*", "", (text or "").strip(), flags=re.M)
    t = re.sub(r"\s+", " ", t).strip()
    return (t[:n].rsplit(" ", 1)[0] + "…") if len(t) > n else t


theories = []
for e in NOTION:
    if "Speculation" not in (e.get("Type") or ""): continue
    m = re.search(r"\[([^\]]+)\]\s*$", e["Name"])
    concepts = [tag_node.get(t.strip()) or (find(t.strip()) or {}).get("id") for t in (e.get("Tags") or "").split(",") if t.strip()]
    theories.append(dict(title=re.sub(r"\s*\[[^\]]+\]\s*$", "", e["Name"]).strip(), author=m.group(1) if m else "",
                         source="Solaris Archives community", url=e["url"], summary=excerpt(e.get("Text")),
                         concepts=[c for c in dict.fromkeys(concepts) if c]))
THEORY_FILE = os.path.join(HERE, "theories.json")


unknown = []
for t in (json.load(open(THEORY_FILE)) if os.path.exists(THEORY_FILE) else []):
    if t.get("example"): continue
    ids = []
    for c in t.get("concepts", []):
        n = find(c)
        if n: ids.append(n["id"])
        else: unknown.append(f'{t.get("title")}: "{c}"')
    # Livestream theories are published without their source: no creator, channel, video title,
    # link or timestamp reaches the site. ("video"/"timestamp" stay in theories.json for your own reference.)
    theories.append(dict(title=t["title"], author="", source="Fan theory", url="", date="",
                         summary=t.get("summary", ""), concepts=ids, timestamp="",
                         plausibility=t.get("plausibility", ""), basis=t.get("basis", "")))
if unknown: print("theories.json: no entry found for", "; ".join(unknown))

for t in theories:
    if not t["concepts"]:  # untagged write-up: link the names its title mentions
        t["concepts"] = [n["id"] for n in list(nodes.values()) if n["kind"] != "theory" and len(n["id"]) >= 5
                         and re.search(r"(?<![\w-])" + re.escape(n["id"]) + r"(?![\w-])", t["title"])]
    if not t["concepts"]: continue
    n = add_node(t["title"], "theory", summary=t["summary"], author=t["author"], source=t["source"], url=t["url"],
                 date=t.get("date", ""), timestamp=t.get("timestamp", ""), plausibility=t.get("plausibility", ""),
                 basis=t.get("basis", ""), video=t.get("video", ""), channel=t.get("channel", ""))
    if not n: continue
    for c in t["concepts"]:
        edge(n["id"], c, "theorized", theory=n["id"], concept=c, source=t["source"], author=t["author"], url=t["url"])
        nodes[c].setdefault("theories", []).append(n["id"])

# ---------------------------------------------------------------- prune and score
W = dict(part_of=8, role=8, inspired=10, defined=4, cotag=1, theorized=2)
out_edges = []
for e in edges.values():
    score = sum(W[k] * (min(len(v), 3) if k != "cotag" else math.log2(1 + e.get("cotagCount", 1)) * 2) for k, v in e["kinds"].items())
    e["score"] = round(score, 1)
    e["strongest"] = min(e["kinds"], key=lambda k: ["inspired", "part_of", "role", "defined", "cotag", "theorized"].index(k))
    out_edges.append(e)
deg = collections.Counter()
for e in out_edges: deg[e["source"]] += 1; deg[e["target"]] += 1
# a concept needs two links that aren't just theories (theories alone shouldn't put a node on the map)
real_deg = collections.Counter()
for e in out_edges:
    if set(e["kinds"]) != {"theorized"}: real_deg[e["source"]] += 1; real_deg[e["target"]] += 1
keep = {nid for nid, n in nodes.items() if deg[nid] > 0 and (n["kind"] == "theory" or real_deg[nid] > 0)
        and (n["kind"] != "concept" or real_deg[nid] >= 2 or n.get("summary"))}
out_edges = [e for e in out_edges if e["source"] in keep and e["target"] in keep]
deg = collections.Counter()
for e in out_edges: deg[e["source"]] += 1; deg[e["target"]] += 1
out_nodes = []
for nid in keep:
    if not deg[nid]: continue
    n = nodes[nid]
    n["degree"] = deg[nid]
    if n.get("theories"): n["theories"] = [t for t in n["theories"] if t in keep]
    out_nodes.append(n)

PORTRAITS = os.path.join(HERE, "..", "public", "portraits")
for n in out_nodes:
    if n["kind"] != "character": continue
    slug = re.sub(r"[^a-z0-9]+", "-", n["id"].lower()).strip("-")
    for ext in (".png", ".jpg"):
        if os.path.exists(os.path.join(PORTRAITS, slug + ext)): n["portrait"] = "portraits/" + slug + ext

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(dict(nodes=out_nodes, links=out_edges, generated=datetime.date.today().isoformat(),
               counts=dict(fandomPages=len(P), communityEntries=len(NOTION), documents=len(docs))),
          open(OUT, "w"), ensure_ascii=False)
kc = collections.Counter(n["kind"] for n in out_nodes)
ec = collections.Counter(k for e in out_edges for k in e["kinds"])
print(len(out_nodes), "nodes", dict(kc), "|", len(out_edges), "edges", dict(ec))
print("real-world refs:", len(rw_sources), "| with zh name:", sum(1 for n in out_nodes if n.get("zh")), "| size", os.path.getsize(OUT) // 1024, "KB")
