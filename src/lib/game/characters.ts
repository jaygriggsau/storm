import type { CardId } from "./types";

export type CharacterId = "stormcaller" | "tempest";

export type Character = {
  id: CharacterId;
  name: string;
  blurb: string;
  maxHp: number;
  starterDeck: CardId[];
  classCommon: CardId[];
  classRare: CardId[];
};

// Class card pools augment the neutral pool. A class card is offered
// only to players of that class.
export const CHARACTERS: Record<CharacterId, Character> = {
  stormcaller: {
    id: "stormcaller",
    name: "Stormcaller",
    blurb:
      "A warrior who channels lightning through steel. High HP, single-target burst, Strength powers.",
    maxHp: 60,
    starterDeck: [
      "strike", "strike", "strike", "strike", "strike",
      "defend", "defend", "defend", "defend",
      "thunderclap"
    ],
    classCommon: ["heavy_slash", "twin_strike", "pommel_strike", "sucker_punch"],
    classRare: ["bash", "surge", "pummel", "sword_boomerang", "limit_break"]
  },
  tempest: {
    id: "tempest",
    name: "Tempest",
    blurb:
      "A spellcaster of storms. Lower HP, multi-target damage and Vulnerable / Weak focus.",
    maxHp: 50,
    starterDeck: [
      "spark", "spark", "spark", "spark",
      "ward", "ward", "ward", "ward",
      "chain_bolt", "thunderclap"
    ],
    classCommon: ["jolt", "static_discharge", "lightning_rod", "insulate"],
    classRare: ["shock_wave", "conduit", "overcharge", "tempest"]
  }
};

export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

export function isCharacterId(s: string): s is CharacterId {
  return s in CHARACTERS;
}
