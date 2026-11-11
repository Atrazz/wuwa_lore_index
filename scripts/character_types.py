"""Presentation categories for people; applied after graph evidence is built."""


def character_kind(node, unique_npcs):
    if node.get("playable"):
        return "character"
    if node["id"] in unique_npcs:
        return "unique_npc"
    return "npc"
