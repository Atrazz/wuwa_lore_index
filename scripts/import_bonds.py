"""Copy the character relationship graph from the sibling WuWa Interact project.

Writes
  scripts/bonds.json         characters + their bonds (tracked; read by build_lore.py)
  public/dialogue.json       the quoted dialogue per pair and quest, fetched only when a quest is expanded
  scripts/raw/npc_pages.json wiki text of the NPCs Echo Codex didn't download itself (ignored)

Run after rebuilding WuWa Interact:  python3 -I scripts/import_bonds.py
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
INTERACT = os.path.join(HERE, "..", "..", "WuwaInteract")
graph = json.load(open(os.path.join(INTERACT, "src", "data", "graph.json")))
npc_pages = json.load(open(os.path.join(INTERACT, "scripts", "raw", "npc_wikitext.json")))


def bond_label(l):  # same wording as WuWa Interact's bondLabel()
    if l["family"]: return "Family"
    vl, d = len(l["voiceline"]), len(l["dialogue"])
    mutual = len({v["from"] for v in l["voiceline"]}) > 1
    if d >= 6 and mutual: return "Close companions"
    if d >= 6: return "Often together"
    if d >= 1 and vl: return "Acquainted"
    if d >= 1: return "Have met"
    if vl: return "Know of each other"
    if l["mention"]: return "Linked in lore"
    return "Crossed paths"


characters = [dict(id=n["id"], zh=n.get("zh", ""), playable=n["playable"], title=n.get("title", ""),
                   attribute=n.get("attribute", ""), weapon=n.get("weapon", ""), rarity=n.get("rarity", 0),
                   nation=n.get("nation", ""), affiliations=n.get("affiliations", []),
                   intro=(n.get("intro") or "").split("\n\n")[0], page=n.get("page", ""))
              for n in graph["nodes"]]

bonds, dialogue = [], {}
for l in graph["links"]:
    key = "|".join(sorted((l["source"], l["target"])))
    quests = sorted(l["dialogue"], key=lambda d: d.get("order") if d.get("order") is not None else 999)
    bonds.append(dict(
        a=l["source"], b=l["target"], key=key, label=bond_label(l), tier=l["strongest"], score=l.get("score", 0),
        family=[dict(source_of=f["from"], to=f["to"], role=f["role"], url=f.get("url", "")) for f in l["family"]],
        quests=[dict(quest=d["quest"], type=d.get("type", ""), chapter=d.get("chapter", ""), act=d.get("actNum", ""),
                     url=d.get("url", ""), exchanges=d.get("exchanges", 0), channel=d.get("channel", ""),
                     nation=d.get("nation", ""), phone=d.get("phone", 0), call=d.get("call", 0)) for d in quests],
        voicelines=[dict(source_of=v["from"], to=v["to"], title=v.get("title", ""), text=v.get("text", ""),
                         url=v.get("url", ""), audio=v.get("audio", "")) for v in l["voiceline"]],
        mentions=[dict(source_of=m["from"], to=m["to"], kind=m.get("kind", ""), title=m.get("title", ""),
                       text=m.get("text", ""), url=m.get("url", ""), count=m.get("count", 1)) for m in l["mention"][:6]],
        scenes=len(l["scene"]),
    ))
    lines = {d["quest"]: dict(desc=d.get("summary") or d.get("desc") or "", lines=d.get("sample", []), phone=d.get("phoneSample", []))
             for d in l["dialogue"] if d.get("sample") or d.get("phoneSample")}
    if lines: dialogue[key] = lines

json.dump(dict(characters=characters, bonds=bonds), open(os.path.join(HERE, "bonds.json"), "w"), ensure_ascii=False, indent=0)
json.dump(dialogue, open(os.path.join(HERE, "..", "public", "dialogue.json"), "w"), ensure_ascii=False, separators=(",", ":"))
os.makedirs(os.path.join(HERE, "raw"), exist_ok=True)
json.dump(npc_pages, open(os.path.join(HERE, "raw", "npc_pages.json"), "w"), ensure_ascii=False)
print(len(characters), "characters,", len(bonds), "bonds,", len(npc_pages), "NPC pages")
