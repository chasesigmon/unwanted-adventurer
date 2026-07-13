import { CLASSROOM_MAPS } from './constants.js';
import type { MapName } from './constants.js';

// Quest definitions live entirely in code (not the DB) — a player's own
// `quests` field (see shared/types.ts's PlayerSnapshot) only ever stores
// which quest ids have been started and which of ITS objective ids are
// done; the title/description/objective list itself is always looked up
// from here, same "content in code, progress in the DB" split the
// vendor/teacher NPCs already use.
export interface QuestObjective {
  id: string;
  // "Visit the Elemental Casting Classroom" — shown struck through once
  // complete, plain otherwise (see src/ui/questLog.ts).
  label: string;
  // The classroom map that marks this objective complete just by being
  // walked into (see game.gateway.ts's handleMove) — every objective
  // today is "visit this classroom," but kept separate from `label` in
  // case a future objective isn't map-triggered at all.
  map: MapName;
}

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  objectives: QuestObjective[];
}

// The Headmistress's own opening quest (item 2's follow-up ask) — "visit
// all of the classrooms and begin learning magic," one objective per
// classroom. Deliberately the only quest that exists today; the
// Headmistress's own dialogue says "more details to come" on purpose —
// no completion reward is defined yet.
export const LEARN_SPELLS_QUEST_ID = 'learn-spells';

export const QUESTS: Record<string, QuestDefinition> = {
  [LEARN_SPELLS_QUEST_ID]: {
    id: LEARN_SPELLS_QUEST_ID,
    title: 'Learn Spells',
    description:
      "Welcome to Grimoak Academy! To start your journey I would like for you to visit all of the classrooms and begin learning magic! It's your pick for where you start, the classrooms are located behind me. Good luck!",
    objectives: (CLASSROOM_MAPS as readonly MapName[]).map((map) => ({
      id: map,
      label: `Visit the ${map}`,
      map,
    })),
  },
};

export function questDefinition(questId: string): QuestDefinition | undefined {
  return QUESTS[questId];
}
