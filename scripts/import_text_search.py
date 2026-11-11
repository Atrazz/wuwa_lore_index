"""Select source passages from the cached browser searches, retaining their provenance.

This does not infer relationships. build_lore.py resolves names and creates typed
references; actual relationship summaries live in text_context.json.
"""
import collections
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent


def clean(text):
    return re.sub(r"<[^>]+>", "", text or "").strip()


def classify(row):
    key = row["textKey"]
    tags = row["tags"]
    chapter = next((t for t in tags if "剧情_" in t), "")
    profile = next((t for t in tags if "档案_" in t), "")
    if chapter:
        speaker = next((t for t in tags if t != chapter and not re.search(r"版本|沿用|变更", t)), "")
        return ("Quest summary" if chapter.startswith("跳过") else "World dialogue" if "生态" in chapter else "Dialogue", speaker, chapter)
    if profile:
        return ("Voice line" if "角色语音" in profile else "Character profile", profile.split("档案_", 1)[0], profile)
    if re.match(r"AreaReportContent_Text\d+$", key):
        return ("Exploration report", "", "")
    if re.match(r"MapMark_\d+_MarkDesc$", key):
        return ("Map description", "", "")
    if re.match(r"LoadingTipsText_.*_TipsText$|DIY_FurnitureDic_Desc_", key):
        return ("World description", "", "")
    if re.search(r"^(?:InfoDisplay|Book|Geography|Noun|Term\d+).*?(?:Text|Content|Desc)$|^ItemInfo_\d+_BgDescription$|^FavorGoods_.*_Content$", key):
        return ("Document / item lore", "", "")
    return None


def import_cache():
    cache = json.loads((ROOT / "scripts/raw/text_searcher.json").read_text())
    records, coverage = {}, []
    for search in cache["searches"]:
        coverage.append({k: v for k, v in search.items() if k not in {"rows", "contextRows"}} | {"loaded": len(search.get("rows", [])), "contextLoaded": len(search.get('contextRows', []))})
        for row in search.get("rows", []) + search.get('contextRows', []):
            info = classify(row)
            text = clean(row["text"])
            if info and info[0] == 'Map description':
                text = re.split(r"\n\s*\n\*", text, maxsplit=1)[0].strip()
            if not info or len(text.split()) < 7 or len(text) < 45:
                continue
            if re.search(r"\{\d+\}|\b(?:DMG|ATK|Cooldown|HP|Crit\. Rate)\b", text):
                continue
            kind, speaker, chapter = info
            if not row["textKey"]:
                continue
            record = records.setdefault(row["textKey"], dict(
                id="yakita:" + row["textKey"], textKey=row["textKey"], kind=kind,
                speakerZh=speaker, chapter=chapter, version=next((t for t in row["tags"] if re.search(r"版本|沿用", t)), ""),
                text=text, zh=clean(row["zh"]), file=row["file"], anchor=row["anchor"],
                story=row["story"], queries=[], source="WuWa Text Searcher · Yakitahome",
                url=cache["source"], retrieved=cache["retrieved"],
            ))
            for key in ('title', 'titleKey', 'contextFor'):
                if row.get(key):
                    record[key] = row[key]
            term = search.get("searchTerm", search["query"])
            if term not in record["queries"]:
                record["queries"].append(term)
    output = dict(source=cache["source"], retrieved=cache["retrieved"], version=cache["version"],
                  coverage=sorted(coverage, key=lambda s: (s["query"], s["chapterFilter"])),
                  records=sorted(records.values(), key=lambda r: r["id"]))
    (ROOT / "scripts/text_searcher.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(records)} passages from {len(coverage)} searches", dict(collections.Counter(r["kind"] for r in records.values())))


if __name__ == "__main__":
    import_cache()
