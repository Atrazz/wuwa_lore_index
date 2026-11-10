"""Download lore pages from the Wuthering Waves Fandom wiki (MediaWiki API) into scripts/raw/.
Re-run with --force to refresh the cache."""
import json, os, sys, time, urllib.parse, urllib.request

API = "https://wutheringwaves.fandom.com/api.php"
UA = "WuwaLore/0.1 (fan project; lore graph)"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "raw")
FORCE = "--force" in sys.argv
os.makedirs(OUT, exist_ok=True)


def api(**params):
    params["format"] = "json"
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print("retry", attempt, e, file=sys.stderr); time.sleep(2 + attempt * 3)
    raise RuntimeError(url)


def list_all(listname, **params):
    out, cont = [], {}
    while True:
        d = api(action="query", list=listname, **params, **cont)
        out += d["query"][listname]
        if "continue" not in d: return out
        cont = d["continue"]


def embedded(template):
    return [m["title"] for m in list_all("embeddedin", eititle="Template:" + template, eilimit=500, einamespace=0)]


def category(cat):
    return [m["title"] for m in list_all("categorymembers", cmtitle="Category:" + cat, cmlimit=500, cmnamespace=0)]


def contents(titles):
    res = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        q = api(action="query", prop="revisions", rvprop="content", rvslots="main", titles="|".join(chunk), redirects=1)["query"]
        back = {}
        for r in q.get("redirects", []) + q.get("normalized", []): back.setdefault(r["to"], []).append(r["from"])
        for p in q["pages"].values():
            if "revisions" not in p: continue
            txt = p["revisions"][0]["slots"]["main"]["*"]
            res[p["title"]] = txt
        time.sleep(0.4)
        print(f"  {min(i + 50, len(titles))}/{len(titles)}", file=sys.stderr)
    return res


def cached(name, fn):
    path = os.path.join(OUT, name)
    if os.path.exists(path) and not FORCE: return json.load(open(path))
    data = fn(); json.dump(data, open(path, "w"), ensure_ascii=False); return data


groups = cached("groups.json", lambda: {
    "term": embedded("Terminology_Infobox"),
    "faction": embedded("Faction_Infobox"),
    "location": embedded("Location_Infobox"),
    "nation": embedded("Nation_Infobox") + embedded("Region_Infobox"),
    "sonoro": embedded("Sonoro_Sphere_Infobox"),
    "wikipedia": embedded("W"),
    "resonator": category("Playable_Resonators"),
})
print({k: len(v) for k, v in groups.items()}, file=sys.stderr)
titles = sorted({t for v in groups.values() for t in v})
cached("pages.json", lambda: contents(titles))
print("done", file=sys.stderr)
