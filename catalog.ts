import { z } from "zod";
export const COLORS = [
  "#a78bfa",
  "#55e6ef",
  "#f4ce83",
  "#ed78b4",
  "#f0f1fa",
  "#161a2d",
  "#ed665a",
  "#70d6a1",
] as const;
export const SKINS = [
  "#f4d4bd",
  "#d8a17e",
  "#ad7156",
  "#754936",
  "#4d302b",
] as const;
export const HAIR_COLORS = [
  "#191a2d",
  "#d9e1f5",
  "#7654be",
  "#c8719e",
  "#65bacb",
  "#9c613b",
] as const;
export const outfitSchema = z.object({
  style: z.enum(["anime", "editorial"]),
  skin: z.enum(SKINS),
  hair: z.enum(["bob", "long", "ponytail"]),
  hairColor: z.enum(HAIR_COLORS),
  top: z.enum(["jacket", "corset", "armor"]),
  bottom: z.enum(["trousers", "skirt", "shorts"]),
  dress: z.enum(["none", "gown", "mini"]),
  shoes: z.enum(["boots", "heels", "sneakers"]),
  accessory: z.enum(["none", "visor", "halo", "wings", "headphones"]),
  primary: z.enum(COLORS),
  secondary: z.enum(COLORS),
  fabric: z.enum(["satin", "chrome", "matte"]),
  pattern: z.enum(["solid", "circuit", "stars"]),
});
export type Outfit = z.infer<typeof outfitSchema>;
export const DEFAULT_OUTFIT: Outfit = {
  style: "anime",
  skin: SKINS[1],
  hair: "long",
  hairColor: HAIR_COLORS[1],
  top: "jacket",
  bottom: "trousers",
  dress: "none",
  shoes: "boots",
  accessory: "halo",
  primary: COLORS[0],
  secondary: COLORS[1],
  fabric: "chrome",
  pattern: "circuit",
};
export const PRESETS: { name: string; outfit: Outfit }[] = [
  { name: "Neo Tokyo", outfit: DEFAULT_OUTFIT },
  {
    name: "Solar Empress",
    outfit: {
      ...DEFAULT_OUTFIT,
      dress: "gown",
      primary: COLORS[2],
      secondary: COLORS[4],
      hair: "ponytail",
      accessory: "halo",
      pattern: "stars",
      fabric: "satin",
    },
  },
  {
    name: "Cyber Angel",
    outfit: {
      ...DEFAULT_OUTFIT,
      dress: "mini",
      primary: COLORS[4],
      accessory: "wings",
      hair: "bob",
    },
  },
  {
    name: "Night Runner",
    outfit: {
      ...DEFAULT_OUTFIT,
      primary: COLORS[5],
      secondary: COLORS[3],
      top: "armor",
      bottom: "shorts",
      accessory: "visor",
      shoes: "sneakers",
      hair: "ponytail",
    },
  },
];
export const THEMES = [
  {
    name: "NEO TOKYO NIGHTS",
    subtitle: "Street couture beneath a thousand neon signs.",
    matches: [
      { key: "pattern", value: "circuit", label: "Circuit pattern" },
      { key: "accessory", value: "visor", label: "Visor" },
      { key: "top", value: "jacket", label: "Tech jacket" },
      { key: "primary", value: "#a78bfa", label: "Violet palette" },
    ],
  },
  {
    name: "CELESTIAL GALA",
    subtitle: "An invitation to the most exclusive party in the galaxy.",
    matches: [
      { key: "dress", value: "gown", label: "Evening gown" },
      { key: "pattern", value: "stars", label: "Star pattern" },
      { key: "accessory", value: "halo", label: "Orbital halo" },
      { key: "fabric", value: "satin", label: "Satin finish" },
    ],
  },
  {
    name: "CHROME REBELLION",
    subtitle: "Break the rules. Make the future your own.",
    matches: [
      { key: "fabric", value: "chrome", label: "Chrome finish" },
      { key: "top", value: "armor", label: "Sculpted armor" },
      { key: "shoes", value: "boots", label: "Platform boots" },
      { key: "accessory", value: "headphones", label: "Headphones" },
    ],
  },
  {
    name: "HOLOGRAPHIC HEAVEN",
    subtitle: "Airborne silhouettes and impossibly luminous details.",
    matches: [
      { key: "accessory", value: "wings", label: "Light wings" },
      { key: "primary", value: "#55e6ef", label: "Cyan palette" },
      { key: "dress", value: "mini", label: "Mini dress" },
      { key: "fabric", value: "chrome", label: "Chrome finish" },
    ],
  },
] as const;
export function themeBonus(o: Outfit, theme: number) {
  return THEMES[theme % THEMES.length].matches.reduce(
    (s, m) => s + (o[m.key as keyof Outfit] === m.value ? 5 : 0),
    0,
  );
}
export type Phase =
  "LOBBY" | "STYLING" | "RUNWAY" | "VOTING" | "RESULTS" | "FINAL";
export interface PublicPlayer {
  id: string;
  name: string;
  team: number;
  connected: boolean;
  submitted: boolean;
  total: number;
  voteTotal: number;
  roundScore: number;
  average: number;
  bonus: number;
  place: number;
  outfit?: Outfit;
}
export interface GameView {
  code: string;
  phase: Phase;
  revision: number;
  serverNow: number;
  phaseStart: number;
  deadline: number | null;
  round: number;
  theme: number;
  hostId: string;
  selfId: string;
  config: { minutes: number; rounds: number; mode: "solo" | "team" };
  players: PublicPlayer[];
  participants: string[];
  electorate: string[];
  votes: Record<string, number>;
  ownOutfit: Outfit;
  locked: boolean;
  runwayOrder: string[];
  teamScores: { team: number; score: number; place: number }[];
}
export const configSchema = z.object({
  minutes: z.union([z.literal(2), z.literal(3), z.literal(5), z.literal(10)]),
  rounds: z.number().int().min(1).max(5),
  mode: z.enum(["solo", "team"]),
});
