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
  bond        character relationships from WuWa Interact (family, shared quests, voice lines, mentions)
  defined     one wiki page links to the other in its own text
"""
import collections, datetime, json, math, os, re, unicodedata, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from text_evidence import enrich
from character_types import character_kind
from concept_summaries import add_concept_summaries

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
OUT = os.path.join(HERE, "..", "src", "data", "lore.json")
WIKI = "https://wutheringwaves.fandom.com/wiki/"


def load(name, default=None):
    p = os.path.join(RAW, name)
    return json.load(open(p)) if os.path.exists(p) else default


P = load("pages.json", {})
P.update({k: v for k, v in load("npc_pages.json", {}).items() if k not in P})  # NPC pages via import_bonds.py
P = {k: re.sub(r"\{\{\s*PAGENAME\s*\}\}", k, v) for k, v in P.items()}  # "'''{{PAGENAME}}''' is a …" leads
BONDS = json.load(open(os.path.join(HERE, "bonds.json"))) if os.path.exists(os.path.join(HERE, "bonds.json")) else {"characters": [], "bonds": []}
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
    if name in ("location", "quest", "item", "character", "char", "faction", "term", "event", "enemy", "echo", "weapon", "resonator", "npc"):
        return pos[0] if pos else ""  # link-style templates: keep the name they point at
    return ""


def clean(t):
    t = re.sub(r"__[A-Z_]+__", "", t)
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
    paras = [p for p in paras if re.search(r"\w", p) and not p.startswith("{|") and not p.startswith("|")]
    text = ""
    for p in paras:  # a short opening sentence ("The X is one of …") joins the paragraph after it
        text = (text + " " + p).strip()
        if len(text) > 60: return text[:700]
    return ""


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
    if k in by_key: return nodes.get(by_key[k])  # None once an entry was filtered out
    k2 = norm(STRIP_PREFIX.sub("", name))
    return nodes.get(by_key[k2]) if k2 in by_key else None


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
    # Ostina (Phrolova's birthplace, rebuilt in the Lost Beyond) was relabelled "Area" in Nov 2026; keep it.
    if not types & PLACE_TYPES and t not in nations and t not in ("Ostina",): continue
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

# Reviewed alternate names resolve before community tags or edges create another
# entry. Honami City is the historical name of Chronorift Metropolis; Neo Honami
# City is its separately documented surviving portion, not an alias.
ENTITY_ALIASES = json.load(open(os.path.join(HERE, "entity_aliases.json")))
for alternate, canonical in ENTITY_ALIASES.items():
    target = find(canonical)
    if not target:
        wt = P.get(canonical, "")
        target = add_node(canonical, "concept", summary=lead(wt))
        if wt: page_of[target["id"]] = canonical
    alias(target, alternate)

PENDING = []  # (a, b, kind, evidence) for edges made before edge() exists
# Every character from the relationship graph, NPCs included. Existing concept nodes for them
# (Abby, Scar, …) become characters; beings such as Jué keep their kind.
for c in BONDS["characters"]:
    n = find(c["id"])
    if n and n["kind"] == "being":
        n.setdefault("zh", c["zh"])
    else:
        wt = P.get(c["id"], "")
        n = add_node(c["id"], "character", nation=c["nation"], summary=lead(wt) or c["intro"], zh=c["zh"])
        if wt and n["id"] not in page_of: page_of[n["id"]] = c["id"]
    n.update(playable=c["playable"], attribute=c["attribute"])
    if c["title"]: n["title"] = c["title"]  # in-game title, e.g. Aalto “Mistcloak Strike”
    for f in c["affiliations"]:
        org = find(f)
        if org and org["id"] != n["id"] and org["kind"] in ("faction", "place"):
            PENDING.append((n["id"], org["id"], "role", dict(role="member", of=org["id"], who=n["id"], source=f"{c['id']} — wiki profile", url=c["page"])))
# What each bond means: hand-written relation + context (scripts/bond_context.json) for every bond with
# quotes or conversations; pairs that only share quests get a rule-based line from sides and affiliations.
CONTEXT = json.load(open(os.path.join(HERE, "bond_context.json"))) if os.path.exists(os.path.join(HERE, "bond_context.json")) else {}
OVERSEERS = {"Scar", "Cristoforo", "Phrolova"}
NPC_HOME = {"Cosmos": "Black Shores", "Platya": "Black Shores", "Valentina": "Black Shores", "Margherita": "Ragunna",
            "Fulmine": "Ragunna", "Lenore": "Ragunna", "Fenrico": "Ragunna", "Alannah": "Ragunna", "Uncle Li": "Jinzhou",
            "Xinyi": "Jinzhou", "Jué": "Jinzhou", "Liangyu": "Mengzhou", "Avidius": "Septimont", "Maji": "Lollo Logistics"}
CITIES = {"Jinzhou", "Ragunna", "Mengzhou", "Septimont", "Lahai-Roi", "Chongzhou"}
ORG_REL = {"Black Shores": "Black Shores colleagues", "Startorch Academy": "Startorch Academy", "Midnight Rangers": "Midnight Rangers",
           "Order of the Deep": "Order of the Deep", "Troupe of Fools": "Fool's Troupe", "Montelli Family": "Montelli family",
           "Huaxu Academy": "Huaxu Academy colleagues", "Spacetrek Collective": "Spacetrek Collective", "Jinzhou City Hall": "Jinzhou City Hall"}
CHAR = {c["id"]: c for c in BONDS["characters"]}


def affil(name):
    c = CHAR.get(name, {})
    return set(c.get("affiliations", [])) | ({NPC_HOME[name]} if name in NPC_HOME else set())


def bond_context(b):
    if b["key"] in CONTEXT: return CONTEXT[b["key"]]
    a, z, qs, n = b["a"], b["b"], b.get("sceneQuests", []), b["scenes"]
    where = ", ".join(qs[:2]) + (f" and {n - 2} more" if n > 2 else "")
    plural = "quest" if n == 1 else "quests"
    if (a in OVERSEERS) != (z in OVERSEERS):
        ov, other = (a, z) if a in OVERSEERS else (z, a)
        return dict(rel="Opposite sides", ctx=f"{ov}, a Fractsidus Overseer, is in the same {plural} as {other} ({where}) but they never speak.", basis="inferred")
    if "Abby" in (a, z):
        other = z if a == "Abby" else a
        return dict(rel="Seen with Rover", ctx=f"Abby travels with Rover, so it was there when Rover met {other} ({where}).", basis="inferred")
    shared = affil(a) & affil(z)
    org = next((o for o in ORG_REL if o in shared), None)
    if org: return dict(rel=ORG_REL[org] if org == "Black Shores" or org.endswith("colleagues") else f"Both of the {ORG_REL[org]}" if org != "Startorch Academy" else "Startorch Academy",
                        ctx=f"Both belong to the {org}; they share {n} {plural} ({where}) without speaking on screen.", basis="inferred")
    city = next((o for o in shared if o in CITIES), None)
    if city: return dict(rel=f"Both of {city}", ctx=f"Both are from {city}; they share {n} {plural} ({where}) without speaking on screen.", basis="inferred")
    return dict(rel="Crossed paths", ctx=f"In the same {plural} ({where}) without speaking to each other.", basis="inferred")


for b in BONDS["bonds"]:
    b.update(bond_context(b))
    a, z = find(b["a"]), find(b["b"])
    if a and z: PENDING.append((a["id"], z["id"], "bond", dict({k: v for k, v in b.items() if k not in ("a", "b")}, pair=[a["id"], z["id"]])))

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

# Existing place and faction pages can be introduced through community tags when
# their wiki subtype (such as Area or Point of Interest) was excluded above.
# Restore their actual entity type and introduction instead of treating them as
# unexplained concepts.
for n in list(nodes.values()):
    if n["kind"] != "concept": continue
    wt = P.get(n["id"], "")
    box = "Location Infobox" if re.search(r"\{\{\s*Location Infobox\b", wt) else "Faction Infobox" if re.search(r"\{\{\s*Faction Infobox\b", wt) else None
    if not box: continue
    n["kind"] = "place" if box == "Location Infobox" else "faction"
    if not n.get("summary"): n["summary"] = lead(wt)
    n["nation"] = clean(infobox(wt, box).get("nation", ""))
    page_of[n["id"]] = n["id"]

# ---------------------------------------------------------------- edges
edges = {}


def edge(a, b, edge_kind, **ev):
    if not a or not b or a == b: return
    key = tuple(sorted((a, b)))
    e = edges.setdefault(key, dict(source=key[0], target=key[1], kinds={}))
    lst = e["kinds"].setdefault(edge_kind, [])
    if ev and ev not in lst and len(lst) < 8: lst.append(ev)
    elif not ev and not lst: lst.append({})


for a, b, kind, ev in PENDING: edge(a, b, kind, **ev)


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

# defined: wiki page text links to another node. The evidence is the whole sentence that makes the link
# (plus the one before it when it opens with "It/They/This…"), never a cut-off window or a table cell.
ABBR = r"\b(Mt|Dr|St|Mr|Mrs|Ms|Jr|vs|No|Vol|ca|approx|e\.g|i\.e)\."
PRONOUN = re.compile(r"^(It|Its|They|Their|Them|He|His|Him|She|Her|This|These|Those|That|There|Here|However|Both|Such|Afterwards|Later|Thus|Therefore|Meanwhile)\b")


def sentences(text):
    t = re.sub(ABBR, lambda m: m.group(0).replace(".", "\u2024"), text)
    parts = re.split(r"(?:(?<=[.!?])|(?<=[.!?][\"”’)]))\s+(?=[\"“(\[]?[A-Z0-9])", t)
    return [x.replace("\u2024", ".").strip() for x in parts if x.strip()]


def good_sentence(x):
    words = x.split()
    return (len(words) >= 7 and len(x) <= 520 and re.search(r"[.!?][\"”’)]?$", x)
            and not x.startswith(("|", "!", "{", "*", "#", ":", "=")) and x.count("|") == 0)


defined_ev = collections.defaultdict(list)  # (from, to) -> [(rank, text)]
listed = {}                                  # (from, to) -> heading of the list/table that links them
page_sents = collections.defaultdict(list)   # nid -> [(section no, sentence)]
for nid, page in page_of.items():
    wt = strip_templates(body(P.get(page, "")), r"Quote|Description|Main|About|Stub|Spoiler|Dialogue[\w ]*")
    sec_no, heading = 0, ""
    for para in wt.split("\n"):
        if para.startswith("=="): sec_no += 1; heading = clean(para.strip("= ")).strip("[] "); continue
        links = list(re.finditer(r"\[\[([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\]\]", para))
        if para.lstrip().startswith(("{|", "|", "!", "<gallery", "{{", "[[File", "[[Image", "*", "#", ":", ";")):
            for m in links:  # list / table row: no sentence, but still says where it is listed
                other = find(m.group(1))
                if other and other["id"] != nid: listed.setdefault((nid, other["id"]), heading)
            continue
        sents = sentences(clean(para))
        page_sents[nid] += [(sec_no, x) for x in sents if good_sentence(x)]
        if not links: continue
        for m in links:
            other = find(m.group(1))
            if not other or other["id"] == nid: continue
            label = clean(m.group(0))
            idx = next((i for i, x in enumerate(sents) if label and label in x), None)
            if idx is None or not good_sentence(sents[idx]): continue
            text = sents[idx]
            if PRONOUN.match(text) and idx > 0 and good_sentence(sents[idx - 1]) and len(sents[idx - 1]) + len(text) < 520:
                text = sents[idx - 1] + " " + text
            # prefer the lead section, sentences naming both sides, and a readable length
            rank = sec_no * 2 + (0 if nid.lower() in text.lower() or (nodes[nid].get("zh") or "\0") in text else 1) \
                   + (0 if 60 <= len(text) <= 340 else 1)
            defined_ev[(nid, other["id"])].append((rank, text))

# list/table-only links: look for a sentence on the other page that names this one, else say where it is listed
for (a, b), heading in listed.items():
    if (a, b) in defined_ev or (b, a) in defined_ev: continue
    name = re.compile(r"(?<![\w-])" + re.escape(a) + r"(?![\w-])")
    hit = next((x for _, x in sorted(page_sents.get(b, []), key=lambda t: t[0]) if name.search(x)), None)
    if hit: defined_ev[(b, a)].append((0, hit))
    else: listed_only = edge(a, b, "defined", **{"from": a, "to": b, "listed": heading or "the page", "text": "",
                                                "url": WIKI + page_of[a].replace(" ", "_")})

for (a, b), evs in defined_ev.items():
    seen = []
    for _, text in sorted(evs, key=lambda x: x[0]):
        if any(text in t or t in text for t in seen): continue
        seen.append(text)
        if len(seen) == 2: break
    page = page_of[a]
    for text in seen:
        edge(a, b, "defined", **{"from": a, "to": b, "text": text, "url": WIKI + page.replace(" ", "_")})

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
    rw_name = info.get("title") or title
    clash = find(rw_name)
    if clash and clash["kind"] != "realworld":  # same name as the game term (Abraxas, Overclocking, Chimera)
        rw_name = re.sub(r"\s*\((.*?)\)", r" – \1", rw_name) if "(" in rw_name else rw_name + " – real world"
    rw = add_node(rw_name, "realworld", summary=info.get("extract", ""), wiki=info.get("url") or "https://en.wikipedia.org/wiki/" + title.replace(" ", "_"),
                  zh=info.get("zh", ""), wikiZh=info.get("zhUrl", ""), category=info.get("description", ""), image=info.get("thumb", ""))
    if not rw: continue
    for r in refs:
        target = find(r["node"]) or nodes.get(r["node"])
        if target: edge(target["id"], rw["id"], "inspired", **r)

# ---------------------------------------------------------------- possible parallels (our comparisons)
# scripts/parallels.json pairs a game event/place with a real one. No source states the link: each matching
# point quotes the wiki for the game side and Wikipedia for the real side, and "against" lists what doesn't fit.
PARALLEL_FILE = os.path.join(HERE, "parallels.json")
for par in (json.load(open(PARALLEL_FILE)) if os.path.exists(PARALLEL_FILE) else []):
    info = WP.get(par["real"], {})
    rw = add_node(info.get("title") or par["real"], "realworld", summary=info.get("extract", ""),
                  wiki=info.get("url") or "https://en.wikipedia.org/wiki/" + par["real"].replace(" ", "_"),
                  zh=info.get("zh", ""), wikiZh=info.get("zhUrl", ""), category=info.get("description", ""), image=info.get("thumb", ""))
    game = [find(g) for g in par["game"]]
    missing = [g for g, n in zip(par["game"], game) if not n]
    if missing: print("parallels.json: no entry found for", missing)
    record = dict(real=rw["id"], game=[n["id"] for n in game if n], confidence=par["confidence"], summary=par["summary"],
                  points=par["points"], against=par.get("against", []))
    for n in game:
        if not n: continue
        edge(n["id"], rw["id"], "parallel", **record)
        n.setdefault("parallels", []).append(record)
    rw.setdefault("parallels", []).append(record)

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
    n["zh"] = zh or n.get("zh", "")
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

# Game-text passages retain their own provenance and evidence type. Mentions are
# distinct from wiki definitions and do not establish meetings or affiliations.
TEXT_FILE = os.path.join(HERE, "text_searcher.json")
TEXT_CONTEXT_FILE = os.path.join(HERE, "text_context.json")
text_source = json.load(open(TEXT_FILE)) if os.path.exists(TEXT_FILE) else {}
text_reviews = json.load(open(TEXT_CONTEXT_FILE)) if os.path.exists(TEXT_CONTEXT_FILE) else {}
TEXT_ENTITIES_FILE = os.path.join(HERE, "text_entities.json")
text_entities = json.load(open(TEXT_ENTITIES_FILE)) if os.path.exists(TEXT_ENTITIES_FILE) else []
text_counts = enrich(nodes, edges, add_node, find, edge, text_source, text_reviews, DM_EN, DM_ZH, DM_DOCS, text_entities, ENTITY_ALIASES)

# Reviewed notes where game text is in tension with a wiki introduction (scripts/wiki_caveats.json).
# The cited passage joins the entry's evidence without creating new links.
CAVEATS_FILE = os.path.join(HERE, "wiki_caveats.json")
attached_text = {r["textKey"]: r for n in nodes.values() for r in n.get("textEvidence", [])}
for name, notes in (json.load(open(CAVEATS_FILE)) if os.path.exists(CAVEATS_FILE) else {}).items():
    n = find(name)
    if not n: raise ValueError(f"Caveat for unknown entry: {name}")
    for note in notes:
        records = [attached_text.get(k) for k in note["textKeys"]]
        if not note["textKeys"] or not all(records): raise ValueError(f"Missing source for caveat: {name}")
        for r in records:
            if n["id"] not in r["entities"]: r["entities"].append(n["id"])
            if r not in n.setdefault("textEvidence", []): n["textEvidence"].append(r)
        n["textEvidenceCount"] = len(n["textEvidence"])
        n.setdefault("caveats", []).append(dict(note=note["note"], citation=r["id"], textKey=r["textKey"], source=r["source"]))

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

# ---------------------------------------------------------------- general bond types
# Specific relation labels ("Magistrate & guard", "Schemer & target"…) are shown as one of a few general types
# (scripts/bond_types.json); the one-line context keeps the specifics.
BOND_TYPES = {r: cat for cat, rels in json.load(open(os.path.join(HERE, "bond_types.json"))).items() if not cat.startswith("_") for r in rels} \
    if os.path.exists(os.path.join(HERE, "bond_types.json")) else {}
_untyped = set()
for e in edges.values():
    for b in e["kinds"].get("bond", []):
        if b.get("rel") in BOND_TYPES: b["rel"] = BOND_TYPES[b["rel"]]
        elif b.get("rel") and b["rel"] != "Mentioned in game text" and b.get("tier") != "scene": _untyped.add(b["rel"])  # scene-only bonds are removed below
if _untyped: print("bond_types.json: no general type for", sorted(_untyped))

# ---------------------------------------------------------------- concept filter
# scripts/concept_filter.json: concept entries that are only ordinary words, game modes, puzzle items or one-off
# names are removed; duplicates are folded into the entry they name (their links move with them).
FILTER = json.load(open(os.path.join(HERE, "concept_filter.json"))) if os.path.exists(os.path.join(HERE, "concept_filter.json")) else {}


def drop_node(nid):
    for key in [k for k in edges if nid in k]: edges.pop(key)
    nodes.pop(nid, None)


for old, new in FILTER.get("merge", {}).items():
    o, t = nodes.get(old), find(new)
    if not o or not t or o is t: continue
    for key in [k for k in edges if old in k]:
        e = edges.pop(key)
        other = key[1] if key[0] == old else key[0]
        if other == t["id"]: continue
        for kind, evs in e["kinds"].items():
            for ev in evs: edge(t["id"], other, kind, **ev)
    nodes.pop(old)
    by_key[norm(old)] = t["id"]
    if old not in t["aliases"]: t["aliases"].append(old)
for name in FILTER.get("drop", []):
    if nodes.get(name, {}).get("kind") == "concept": drop_node(name)

# Bonds that only share quests ("Crossed paths") aren't shown. Pairs promoted by a reviewed game-text note
# (text_context.json) are no longer "scene" and stay; other link kinds between the pair stay too.
for key in list(edges):
    e = edges[key]
    if any(b.get("tier") == "scene" for b in e["kinds"].get("bond", [])):
        e["kinds"].pop("bond")
        if not e["kinds"]: edges.pop(key)

# ---------------------------------------------------------------- prune and score
W = dict(part_of=8, role=8, inspired=10, parallel=6, bond=5, text=3, defined=4, theorized=2)
out_edges = []
for e in edges.values():
    score = sum(W[k] * min(len(v), 3) for k, v in e["kinds"].items())
    e["score"] = round(score, 1)
    e["strongest"] = min(e["kinds"], key=lambda k: ["inspired", "parallel", "part_of", "role", "bond", "text", "defined", "theorized"].index(k))
    out_edges.append(e)
deg = collections.Counter()
for e in out_edges: deg[e["source"]] += 1; deg[e["target"]] += 1
# a concept needs two links that aren't just theories (theories alone shouldn't put a node on the map)
# ...unless two or more theories discuss it (Abby, the Goddess, the lost civilisation are mostly theory territory)
real_deg, theory_deg = collections.Counter(), collections.Counter()
for e in out_edges:
    c = real_deg if set(e["kinds"]) != {"theorized"} else theory_deg
    c[e["source"]] += 1; c[e["target"]] += 1
keep = {nid for nid, n in nodes.items() if deg[nid] > 0 and (n["kind"] == "theory" or real_deg[nid] > 0 or theory_deg[nid] >= 2)
        and (n["kind"] != "concept" or real_deg[nid] >= 2 or n.get("summary") or theory_deg[nid] >= 2)}
out_edges = [e for e in out_edges if e["source"] in keep and e["target"] in keep]
deg = collections.Counter()
for e in out_edges: deg[e["source"]] += 1; deg[e["target"]] += 1
out_nodes = []
for nid in sorted(keep):
    if not deg[nid]: continue
    n = nodes[nid]
    n["degree"] = deg[nid]
    if n.get("theories"): n["theories"] = [t for t in n["theories"] if t in keep]
    out_nodes.append(n)

SUMMARY_FILE = os.path.join(HERE, "concept_summaries.json")
reviewed_summaries = json.load(open(SUMMARY_FILE)) if os.path.exists(SUMMARY_FILE) else {}
canonical_summaries = {}
FILTERED = set(FILTER.get("drop", []))
for name, review in reviewed_summaries.items():
    target = find(name)
    if not target and (name in FILTERED or name.rstrip("s") in FILTERED): continue  # term removed by concept_filter.json
    canonical_summaries.setdefault(target["id"] if target else name, review)
add_concept_summaries(out_nodes, canonical_summaries)
# Written overviews replace quoted mentions (never reviewed summaries); the citation stays for the "Sources" link.
OVERVIEWS = json.load(open(os.path.join(HERE, "concept_overviews.json"))) if os.path.exists(os.path.join(HERE, "concept_overviews.json")) else {}
for n in out_nodes:
    if n["id"] in OVERVIEWS and n.get("summaryMode") != "reviewed" and (n.get("summaryMode") == "excerpt" or not n.get("summary")):
        n.update(summary=OVERVIEWS[n["id"]], summaryMode="overview", summarySource="Overview")

# ---------------------------------------------------------------- region (for "Group by region")
# Own nation first, then a place's parent, then the regions of linked entries; entries spread across several
# regions (the Lament, Resonators, the Fractsidus…) go to "Across Solaris".
REGION_OF = {"Huanglong": "Huanglong", "Jinzhou": "Huanglong", "Mengzhou": "Huanglong", "Rinascita": "Rinascita",
             "Ragunna": "Rinascita", "Septimont": "Rinascita", "Lahai-Roi": "Lahai-Roi", "Roya Frostlands": "Lahai-Roi",
             "The Black Shores": "Black Shores", "Black Shores": "Black Shores", "New Federation": "New Federation",
             "Ashinohara": "Ashinohara", "Chronorift Metropolis": "Ashinohara", "Somnoire": "Somnoire"}
by_id = {n["id"]: n for n in out_nodes}
for nid, reg in list(REGION_OF.items()):
    if nid in by_id: by_id[nid]["region"] = reg
for n in out_nodes:
    if not n.get("region") and REGION_OF.get(n.get("nation", "")): n["region"] = REGION_OF[n["nation"]]
nbrs = collections.defaultdict(list)
STRONG = {"part_of": 4, "role": 3, "bond": 2, "defined": 1, "text": 1}
for e in out_edges:
    w = max((STRONG.get(k, 0) for k in e["kinds"]), default=0)
    if w: nbrs[e["source"]].append((e["target"], w)); nbrs[e["target"]].append((e["source"], w))
for _ in range(3):  # spread outwards from entries that know their region
    for n in out_nodes:
        if n.get("region") or n["kind"] == "realworld": continue
        if n["kind"] == "place":
            parent = next((o for o, w in nbrs[n["id"]] if w == 4 and by_id[o].get("region")), None)
            if parent: n["region"] = by_id[parent]["region"]; continue
        votes = collections.Counter()
        for o, w in nbrs[n["id"]]:
            r = by_id[o].get("region")
            if r and r != "Across Solaris": votes[r] += w
        if votes:
            total = sum(votes.values())
            top, cnt = votes.most_common(1)[0]
            spread = sum(1 for v in votes.values() if v / total >= 0.12)
            if spread >= 3: n["region"] = "Across Solaris"  # substantial ties to three or more regions
            elif cnt / total >= 0.55 and cnt >= 2: n["region"] = top
for n in out_nodes:
    if n["kind"] != "realworld" and not n.get("region"): n["region"] = "Across Solaris"

PORTRAITS = os.path.join(HERE, "..", "public", "portraits")
unique_npcs = set(json.load(open(os.path.join(HERE, "character_types.json")))["uniqueNPCs"])
for n in out_nodes:
    if n["kind"] != "character": continue
    slug = re.sub(r"[^a-z0-9]+", "-", n["id"].lower()).strip("-")
    for ext in (".png", ".jpg"):
        if os.path.exists(os.path.join(PORTRAITS, slug + ext)): n["portrait"] = "portraits/" + slug + ext
    n["kind"] = character_kind(n, unique_npcs)

# Keep passages out of the initial graph bundle, and store each source only once.
evidence_file = {}
for n in out_nodes:
    if n.get("textEvidence"):
        evidence_file.update((r["id"], dict(r, entities=[nid for nid in r["entities"] if nid in keep],
                                         speaker=r.get("speaker", "") if r.get("speaker") in keep else "")) for r in n["textEvidence"])
        n["textEvidence"] = [r["id"] for r in n["textEvidence"]]
for e in out_edges:
    if e["kinds"].get("text"):
        e["kinds"]["text"] = [r["id"] for r in e["kinds"]["text"]]
    for b in e["kinds"].get("bond", []):
        if b.get("textEvidence"):
            # quest dialogue already appears under Conversations; world dialogue and other sources stay
            b["textEvidence"] = [r["id"] for r in b["textEvidence"] if r.get("kind") != "Dialogue"]
            if not b["textEvidence"]: del b["textEvidence"]
json.dump(evidence_file, open(os.path.join(HERE, "..", "public", "game-text.json"), "w"), ensure_ascii=False, separators=(",", ":"))
text_counts.update(passages=len(evidence_file), searcherPassages=sum(k.startswith("yakita:") for k in evidence_file),
                   coveredEntries=sum(bool(n.get("textEvidence")) for n in out_nodes),
                   newNPCs=sum(bool(n.get("textSearcherNPC")) for n in out_nodes))
out_edges.sort(key=lambda e: (e["source"], e["target"]))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(dict(nodes=out_nodes, links=out_edges, generated=datetime.date.today().isoformat(),
               counts=dict(fandomPages=len(P), communityEntries=len(NOTION), documents=len(docs)), textSearch=text_counts),
          open(OUT, "w"), ensure_ascii=False)
kc = collections.Counter(n["kind"] for n in out_nodes)
ec = collections.Counter(k for e in out_edges for k in e["kinds"])
print(len(out_nodes), "nodes", dict(kc), "|", len(out_edges), "edges", dict(ec))
print("real-world refs:", len(rw_sources), "| with zh name:", sum(1 for n in out_nodes if n.get("zh")), "| size", os.path.getsize(OUT) // 1024, "KB")
