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


def export_rows(rows):
    return [dict(text=r["c"].get("en", ""), zh=r["c"].get("zh-Hans", ""), textKey=r["id"], file=str(r.get("f", "")),
                 anchor=str(r.get("anchorId", "")), story="",
                 tags=[t for t in (r.get("stateKey"), r.get("speaker"), (r.get("versionTag") or {}).get("firstSeen")) if t])
            for r in rows]


def research_searches(path):
    """Searcher exports in the cache's row shape: version-filtered dumps (research_<version>.json,
    {"searches": {name: {filter, total, rows, complete}}}) and query cross-checks
    (wiki_text_crosscheck_<version>.json, {"queries": {term: [{version, total, rows, truncated}]}})."""
    research = json.loads(path.read_text())
    research.setdefault("version", "")
    for name, search in research.get("searches", {}).items():
        f = search["filter"]
        yield research, dict(query=f"{research['version']} {name}: {f.get('stateKeyQuery') or f.get('query') or 'all'}",
                             chapterFilter=f.get("stateKeyQuery", ""), total=search["total"],
                             truncated=not search.get("complete", False), rows=export_rows(search["rows"]))
    for term, runs in research.get("queries", {}).items():
        for run in runs:
            yield research, dict(query=f"{term} ({run['version']} text)", chapterFilter="", searchTerm=term, total=run["total"],
                                 truncated=bool(run.get("truncated")), rows=export_rows(run["rows"]))


def import_cache():
    cache = json.loads((ROOT / "scripts/raw/text_searcher.json").read_text())
    searches = [(cache, s) for s in cache["searches"]]
    research = sorted((ROOT / "scripts/raw").glob("research_*.json")) + sorted((ROOT / "scripts/raw").glob("wiki_text_crosscheck_*.json"))
    for path in research:
        searches += list(research_searches(path))
    records, coverage = {}, []
    for origin, search in searches:
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
                url=origin["source"], retrieved=origin["retrieved"],
            ))
            for key in ('title', 'titleKey', 'contextFor'):
                if row.get(key):
                    record[key] = row[key]
            term = search.get("searchTerm", search["query"])
            if term not in record["queries"]:
                record["queries"].append(term)
    origins = [cache] + [json.loads(p.read_text()) for p in research]
    version = "–".join(dict.fromkeys(o["version"] for o in origins if o.get("version")))
    retrieved = " and ".join(dict.fromkeys(o["retrieved"] for o in origins))
    output = dict(source=cache["source"], retrieved=retrieved, version=version,
                  coverage=sorted(coverage, key=lambda s: (s["query"], s["chapterFilter"])),
                  records=sorted(records.values(), key=lambda r: r["id"]))
    (ROOT / "scripts/text_searcher.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(records)} passages from {len(coverage)} searches", dict(collections.Counter(r["kind"] for r in records.values())))


if __name__ == "__main__":
    import_cache()
