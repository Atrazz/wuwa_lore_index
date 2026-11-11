"""Semantic checks for mentions, NPC identity, source-backed reviews, and artifacts."""
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from text_evidence import enrich, name_pattern, excerpt
from character_types import character_kind
from concept_summaries import add_concept_summaries


class Fixture:
    def __init__(self):
        self.nodes = {}
        self.edges = {}

    def add(self, name, kind, **fields):
        n = self.nodes.setdefault(name, dict(id=name, kind=kind, aliases=[], **fields))
        return n

    def edge(self, a, b, edge_kind, **record):
        key = tuple(sorted((a, b)))
        e = self.edges.setdefault(key, dict(source=key[0], target=key[1], kinds={}))
        e["kinds"].setdefault(edge_kind, []).append(record)

    def run(self, records=(), reviews=None, text_en=None, text_zh=None, documents=(), definitions=()):
        return enrich(self.nodes, self.edges, self.add, self.nodes.get, self.edge,
                      {"records": records}, reviews or {}, text_en or {}, text_zh or {}, documents, definitions)


def passage(key, text, speaker="", kind="World dialogue"):
    return dict(id="yakita:" + key, textKey=key, kind=kind, text=text, zh="", speakerZh=speaker,
                source="Test source", url="https://mc.yakitahome.com/search", chapter="Test chapter", queries=[])


class EvidenceTests(unittest.TestCase):
    def test_concept_description_prefers_explanation_over_a_question(self):
        question = passage('question', 'What exactly is a Necrostar?', '漂泊者_选项', 'Dialogue')
        definition = passage('definition', 'The Necrostar is the black hole that destroyed the Port City of Guixu.', kind='Dialogue')
        node = dict(id='Necrostar', kind='concept', textEvidence=[question, definition])
        add_concept_summaries([node])
        self.assertIn('black hole', node['summary'])
        self.assertEqual(node['summaryCitation']['id'], definition['id'])
        self.assertEqual(node['summarySource'], 'Game text')

    def test_concept_description_preserves_a_speakers_uncertainty(self):
        r = passage('rumor', 'Perhaps the Lost Beyond is a haven for the departed.', kind='World dialogue')
        r['speaker'] = 'Witness'
        node = dict(id='Lost Beyond', kind='concept', textEvidence=[r])
        add_concept_summaries([node])
        self.assertIn('Witness says', node['summary'])
        self.assertIn('Perhaps', node['summary'])

    def test_existing_wiki_introduction_is_preserved(self):
        node = dict(id='Necrostar', kind='concept', summary='Existing introduction.', textEvidence=[passage('a', 'The Necrostar is a black hole.')])
        add_concept_summaries([node])
        self.assertEqual(node['summary'], 'Existing introduction.')
        self.assertNotIn('summaryCitation', node)

    def test_reviewed_concept_summary_requires_its_source(self):
        node = dict(id='Necrostar', kind='concept', textEvidence=[passage('a', 'The Necrostar is a black hole.')])
        with self.assertRaises(ValueError):
            add_concept_summaries([node], {'Necrostar': {'summary': 'A black hole.', 'textKeys': ['missing']}})

    def test_character_categories_keep_playable_unique_and_general_distinct(self):
        unique = {'Cristoforo', 'Scar'}
        self.assertEqual(character_kind({'id': 'Jiyan', 'playable': True}, unique), 'character')
        self.assertEqual(character_kind({'id': 'Cristoforo', 'playable': False}, unique), 'unique_npc')
        self.assertEqual(character_kind({'id': 'Yhan', 'playable': False}, unique), 'npc')
        self.assertEqual(character_kind({'id': 'Scar', 'playable': True}, unique), 'character')

    def test_attributed_mention_is_directional_and_does_not_invent_meeting(self):
        f = Fixture()
        f.add("Jiyan", "character", zh="忌炎")
        f.add("Verina", "character", zh="维里奈")
        f.run([passage("a", "General Jiyan has been away with the Vanguard for ten days.", "维里奈")])
        bond = f.edges[("Jiyan", "Verina")]["kinds"]["bond"][0]
        self.assertEqual(bond["tier"], "mention")
        self.assertEqual(bond["quests"], [])
        self.assertEqual(bond["textEvidence"][0]["speaker"], "Verina")
        self.assertIn("does not establish", bond["ctx"])

    def test_document_comention_does_not_create_character_bond(self):
        f = Fixture()
        f.add("Jiyan", "character")
        f.add("Verina", "character")
        f.run(text_en={"title": "Garden notice", "doc": "Jiyan tends the memorial flowers. Verina cultivated the seeds."},
              documents=[{"Title": "title", "Text": "doc"}])
        kinds = f.edges[("Jiyan", "Verina")]["kinds"]
        self.assertIn("text", kinds)
        self.assertNotIn("bond", kinds)

    def test_narration_does_not_become_an_attributed_character(self):
        f = Fixture()
        f.add("Jiyan", "character", zh="忌炎")
        f.add("Verina", "character", zh="维里奈")
        f.run([passage("a", "Jiyan arrives, and Verina sees him by the gate.", "维里奈_旁白")])
        self.assertNotIn("bond", f.edges[("Jiyan", "Verina")]["kinds"])

    def test_new_npc_requires_two_passages_and_exact_bilingual_name(self):
        for count, translated, expected in [(1, True, False), (2, False, False), (2, True, True)]:
            with self.subTest(count=count, translated=translated):
                f = Fixture()
                f.add("Jiyan", "character", zh="忌炎")
                records = [passage(str(i), f"General Jiyan has asked our unit to watch gate number {i}.", "莉娜") for i in range(count)]
                f.run(records, text_en={"name": "Lena"} if translated else {}, text_zh={"name": "莉娜"} if translated else {})
                self.assertEqual("Lena" in f.nodes, expected)

    def test_profile_ownership_does_not_turn_description_into_speech(self):
        f = Fixture()
        f.add("Jiyan", "character", zh="忌炎")
        f.add("Verina", "character", zh="维里奈")
        f.run([passage("a", "Verina cultivated the seeds that Jiyan planted in the garden.", "维里奈", "Character profile")])
        kinds = f.edges[("Jiyan", "Verina")]["kinds"]
        self.assertNotIn("bond", kinds)
        self.assertFalse(kinds["text"][0]["speaker"])

    def test_review_requires_sources_and_can_correct_scene_only_context(self):
        f = Fixture()
        f.add("Jiyan", "character")
        f.add("Verina", "character")
        f.edge("Jiyan", "Verina", "bond", key="Jiyan|Verina", pair=["Jiyan", "Verina"], tier="scene", label="Crossed paths")
        review = {"Jiyan|Verina": {"rel": "Memorial contributors", "ctx": "They both contribute to the same memorial garden.", "textKeys": ["doc"]}}
        f.run(reviews=review, text_en={"title": "Garden notice", "doc": "Jiyan tends flowers and Verina cultivated their seeds."}, documents=[{"Title": "title", "Text": "doc"}])
        b = f.edges[("Jiyan", "Verina")]["kinds"]["bond"][0]
        self.assertEqual(b["basis"], "stated")
        self.assertEqual(b["label"], "Linked in lore")
        self.assertEqual(b["contextSources"], ["doc"])
        with self.assertRaises(ValueError):
            Fixture().run(reviews=review)

    def test_missing_source_for_new_place_fails(self):
        with self.assertRaises(ValueError):
            Fixture().run(definitions=[dict(id="Garden of Bells", kind="place", summary="A memorial.", textKeys=["missing"])])

    def test_long_cast_passage_still_supplies_context_for_existing_bond(self):
        f = Fixture()
        names = ['Jiyan', 'Verina', 'Chisa', 'Encore', 'Buling', 'Yangyang', 'Sanhua']
        for name in names:
            f.add(name, 'character')
        f.edge('Chisa', 'Encore', 'bond', key='Chisa|Encore', pair=['Chisa', 'Encore'], tier='mention')
        f.run([passage('many', ', '.join(names) + ' feature in this account of Chisa tutoring Encore.', kind='Quest summary')])
        b = f.edges[('Chisa', 'Encore')]['kinds']['bond'][0]
        self.assertEqual(b['textEvidence'][0]['textKey'], 'many')
        self.assertNotIn(('Jiyan', 'Verina'), f.edges)

    def test_ambiguous_proper_names_are_not_lowercase_nouns(self):
        self.assertIsNone(name_pattern("Scar").search("a scar on her hand"))
        self.assertIsNone(name_pattern("Cosmos").search("the wonders of the cosmos"))
        self.assertIsNotNone(name_pattern("Scar").search("Scar left the village."))
        self.assertIsNone(name_pattern("Lumi").search("Lumiel speaks."))

    def test_excerpt_keeps_context_for_each_named_subject(self):
        text = "Jiyan planted the memorial garden. " + "Unrelated background. " * 100 + "Verina cultivated the seeds for it."
        quote = excerpt(text, ["Jiyan", "Verina"])
        self.assertIn("Jiyan planted the memorial garden.", quote)
        self.assertIn("Verina cultivated the seeds for it.", quote)
        self.assertIn("[…]", quote)
        self.assertLess(len(quote), len(text))

    def test_generated_references_and_review_citations_resolve(self):
        root = Path(__file__).resolve().parent.parent
        graph = json.loads((root / "src/data/lore.json").read_text())
        evidence = json.loads((root / "public/game-text.json").read_text())
        ids = {n["id"] for n in graph["nodes"]}
        people = {n['id']: n for n in graph['nodes'] if n['kind'] in {'character', 'unique_npc', 'npc'}}
        self.assertEqual(people['Cristoforo']['kind'], 'unique_npc')
        self.assertEqual(people['Yhan']['kind'], 'npc')
        self.assertTrue(all((n['kind'] == 'character') == bool(n.get('playable')) for n in people.values()))
        for n in graph["nodes"]:
            for ref in n.get("textEvidence", []):
                self.assertIn(ref, evidence, n["id"])
                self.assertIn(n["id"], evidence[ref]["entities"])
            if n['kind'] == 'concept' and n.get('textEvidence'):
                self.assertTrue(n.get('summary'), n['id'])
            if n.get('summaryCitation'):
                self.assertIn(n['summaryCitation']['id'], n.get('textEvidence', []), n['id'])
                self.assertIn(n['summaryCitation']['id'], evidence, n['id'])
                self.assertEqual(n['summarySource'], 'Game text')
        for e in graph["links"]:
            self.assertIn(e["source"], ids)
            self.assertIn(e["target"], ids)
            for ref in e["kinds"].get("text", []):
                self.assertIn(ref, evidence)
            for b in e["kinds"].get("bond", []):
                texts = [evidence[ref] for ref in b.get("textEvidence", [])]
                self.assertTrue(set(b.get("contextSources", [])) <= {r["textKey"] for r in texts}, b["key"])
        for r in evidence.values():
            self.assertTrue(r.get("textKey") and r.get("source") and r.get("url"))
            self.assertTrue(set(r["entities"]) <= ids)
            if r.get("speaker"):
                self.assertIn(r["speaker"], ids)

    def test_confirmed_aliases_do_not_create_duplicate_nodes(self):
        root = Path(__file__).resolve().parent.parent
        nodes = {n['id']: n for n in json.loads((root / 'src/data/lore.json').read_text())['nodes']}
        aliases = json.loads((root / 'scripts/entity_aliases.json').read_text())
        for alternate, canonical in aliases.items():
            self.assertNotIn(alternate, nodes)
            self.assertIn(alternate, nodes[canonical]['aliases'])
        self.assertEqual(nodes['Chronorift Metropolis']['kind'], 'place')
        self.assertEqual(nodes['Neo Honami City']['kind'], 'place')
        self.assertEqual(nodes['Capitoline Hill']['kind'], 'place')
        self.assertEqual(nodes['Cathedral of Mercury']['kind'], 'place')


if __name__ == "__main__":
    unittest.main()
