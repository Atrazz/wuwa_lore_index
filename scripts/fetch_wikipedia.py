"""Summaries + Chinese titles for the real-world references, via Wikimedia's official APIs.
Reads the real-world node titles from src/data/lore.json, writes scripts/raw/wikipedia.json."""
import json, os, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "raw", "wikipedia.json")
UA = "WuwaLore/0.1 (fan project; contact via GitHub Atrazz/wuwa_atlas)"


NOT_FOUND = object()


def get(url):
    """JSON, NOT_FOUND for a real 404, or None when the request kept failing (not cached)."""
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404: return NOT_FOUND
            time.sleep(2 + attempt * 3)
        except Exception:
            time.sleep(2 + attempt * 3)
    return None


def summary(t):
    s = get("https://en.wikipedia.org/api/rest_v1/page/summary/" + urllib.parse.quote(t.replace(" ", "_"), safe=""))
    if s is NOT_FOUND:  # titles are case-sensitive after the first letter: try an exact case-insensitive match
        r = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
            dict(action="query", list="search", srsearch=t, srlimit=3, format="json")))
        hit = next((x["title"] for x in (r or {}).get("query", {}).get("search", []) if x["title"].lower() == t.lower()), None)
        s = summary(hit) if hit and hit != t else NOT_FOUND
    return s


cache = json.load(open(OUT)) if os.path.exists(OUT) else {}
graph = json.load(open(os.path.join(HERE, "..", "src", "data", "lore.json")))
titles = sorted({urllib.parse.unquote(n["wiki"].rsplit("/wiki/", 1)[1]).replace("_", " ")
                 for n in graph["nodes"] if n["kind"] == "realworld" and n.get("wiki")})
for t in titles:
    if t in cache and "--force" not in sys.argv: continue
    s = summary(t)
    if s is None: continue  # temporary failure: try again next run
    if s is NOT_FOUND or s.get("type") == "disambiguation":
        cache[t] = {"missing": True}; continue
    ll = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        dict(action="query", titles=s["title"], prop="langlinks", lllang="zh", llprop="url", format="json", redirects=1)))
    zh, zh_url = "", ""
    for p in (ll or {}).get("query", {}).get("pages", {}).values():
        for l in p.get("langlinks", []): zh, zh_url = l.get("*", ""), l.get("url", "")
    cache[t] = dict(title=s["title"], description=s.get("description", ""), extract=s.get("extract", "")[:900],
                    url=s.get("content_urls", {}).get("desktop", {}).get("page", ""), thumb=(s.get("thumbnail") or {}).get("source", ""),
                    zh=zh, zhUrl=zh_url)
    print(f"  {t} -> {s['title']} | {zh}", file=sys.stderr)
    time.sleep(1.0)
json.dump(cache, open(OUT, "w"), ensure_ascii=False, indent=0)
print(len(cache), "references", file=sys.stderr)
