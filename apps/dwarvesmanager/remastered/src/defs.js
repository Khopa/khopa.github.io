// Static game data, ported from the original Java/Tiled definitions.

// Tile ids come from the original tileset.tsx (id = gid - 1).
// collide: blocks movement. minable: can be dug. hardness: extra hits. wealth: gold on dig.
export const TILES = {
  0: { name: 'floor', collide: false },
  1: { name: 'bedrock', collide: true, minable: false },
  2: { name: 'dirt', collide: true, minable: true },
  3: { name: 'clay', collide: true, minable: true, hardness: 12 },
  4: { name: 'diamond', collide: true, minable: true, diamond: 1 },
  8: { name: 'planks', collide: false },
  9: { name: 'amethyst', collide: true, minable: true, wealth: 150 },
  10: { name: 'sapphire', collide: true, minable: true, wealth: 250 },
  11: { name: 'emerald', collide: true, minable: true, wealth: 500 },
  12: { name: 'granite', collide: true, minable: true, hardness: 25 },
  17: { name: 'poorore', collide: true, minable: true, wealth: 50 },
};
// Unused tileset slots that are marked collide/minable=0 in the tsx.
for (const id of [5, 6, 7, 13, 14, 15, 21, 22, 23, 29, 30, 31]) TILES[id] = { name: 'bedrock', collide: true, minable: false };
export function tileDef(id) {
  return TILES[id] || { name: 'floor', collide: false };
}

// Objects. size = [x, y] nominal footprint. slots: [x, y, who] where who is 'any' or a job.
export const OBJECTS = {
  Bed: { key: 'Bed', price: 150, size: [2, 1], slots: [[0, 0, 'any']] },
  TableObject: {
    key: 'Table', price: 350, size: [4, 3],
    slots: [[0, 0, 'any'], [3, 0, 'any'], [0, 1, 'any'], [3, 1, 'any'], [0, 2, 'any'], [3, 2, 'any']],
  },
  Barrel: { key: 'Barrel', price: 350, size: [1, 1], slots: [] },
  Anvil: { key: 'Anvil', price: 500, size: [2, 1], slots: [[1, 0, 'Craftman']] },
  Rack: { key: 'Rack', price: 200, size: [1, 1], slots: [], capacity: 5 },
  Counter: { key: 'Counter', price: 300, size: [3, 2], slots: [[1, 1, 'Barman'], [0, 0, 'any'], [1, 0, 'any'], [2, 0, 'any']] },
  Hearth: { key: 'Hearth', price: 550, size: [1, 1], slots: [] },
};
export const OBJECT_ORDER = ['Bed', 'TableObject', 'Barrel', 'Anvil', 'Rack', 'Counter', 'Hearth'];

export const ROOMS = {
  Dorm: { key: 'Dorm', color: 0x5a4dff, needs: { Bed: 1 } },
  Tavern: { key: 'Tavern', color: 0xffc23a, needs: { Barrel: 1, Counter: 1, TableObject: 1 } },
  Workshop: { key: 'Workshop', color: 0x3fe06a, needs: { Rack: 1, Anvil: 1 } },
};
export const ROOM_ORDER = ['Dorm', 'Tavern', 'Workshop'];

// hello = recruitment fee, salary per day, parachute = firing cost
export const JOBS = {
  Miner: { key: 'Miner', hello: 150, salary: 50, parachute: 100 },
  Barman: { key: 'Bartender', hello: 350, salary: 80, parachute: 150 },
  Craftman: { key: 'Craftsman', hello: 450, salary: 250, parachute: 250 },
  Enchanter: { key: 'Enchanter', hello: 2000, salary: 500, parachute: 500 },
};
export const JOB_ORDER = ['Miner', 'Barman', 'Craftman', 'Enchanter'];

export const COMPLAINT = { NONE: -1, NO_BED: 0, NO_PATH: 1, NO_PICKAXE: 2, NO_BEER: 3, TROLL: 4 };

export const LEVELS = [
  { file: 'tuto1', icon: 1, title: { en: 'Tutorial 1 : Mine', fr: 'Tutorial 1 : Miner' } },
  { file: 'tuto2', icon: 2, title: { en: 'Tutorial 2 : Pickaxe and Workshop', fr: 'Tutorial 2 : Pioche et Atelier' } },
  { file: 'tuto3', icon: 3, title: { en: 'Tutorial 3 : Blocks', fr: 'Tutorial 3 : Blocs' } },
  { file: 'tuto4', icon: 4, title: { en: 'Tutorial 4 : Gems', fr: 'Tutorial 4 : Gemmes' } },
  { file: 'tuto5', icon: 5, title: { en: 'Tutorial 5 : Sleep', fr: 'Tutorial 5 : Sommeil' } },
  { file: 'tuto6', icon: 6, title: { en: 'Tutorial 6 : Tavern', fr: 'Tutorial 6 : Taverne' } },
  { file: 'tuto7', icon: 7, title: { en: 'Tutorial 7 : Your first real mine', fr: 'Tutorial 7 : Une vraie mine' } },
  { file: 'level1', icon: 8, title: { en: 'Level 1 : Big cavern', fr: 'Niveau 1 : Grandes cavernes' } },
  { file: 'level2', icon: 9, title: { en: 'Level 2 : Huge empire', fr: 'Niveau 2 : Immense empire' } },
  { file: 'level3', icon: 10, title: { en: 'Level 3 : Small but tough', fr: 'Niveau 3 : Petit mais costaud' } },
  { file: 'level4', icon: 11, title: { en: 'Level 4 : Half spiral', fr: 'Niveau 4 : Demi spirale' } },
  { file: 'level5', icon: 12, title: { en: 'Level 5 : Lost temple', fr: 'Niveau 5 : Le sanctuaire perdu' } },
  { file: 'level6', icon: 13, title: { en: 'Level 6 : The Labyrinth', fr: 'Niveau 6 : Le Labyrinthe' } },
  { file: 'level7', icon: 14, title: { en: 'Level 7 : Archeology', fr: 'Niveau 7 : Archeologie' } },
  { file: 'level8', icon: 15, title: { en: 'Level 8 : Dwarf Fortress', fr: 'Niveau 8 : Forteresse' } },
];

// Simulation constants (original values)
export const NEEDS_MAX = 40000;
export const DAY_DURATION = 120; // seconds between paydays
export const GRANT = 250; // kingdom's daily grant
export const SIM_HZ = 60; // the original ran its per-frame logic at ~60 fps
