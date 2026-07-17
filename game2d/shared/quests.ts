import {
  WATERFILL_SKILL,
  AEGIS_SKILL,
  STONE_WALL_SKILL,
  LIGHT_SKILL,
  HASTE_SKILL,
  UNLOCK_SKILL,
  ARCANE_BOLT_SKILL,
  STUN_SKILL,
  DISARM_SKILL,
} from './skills.js';

// Quest definitions live entirely in code (not the DB) — a player's own
// `quests` field (see shared/types.ts's PlayerSnapshot/QuestProgress)
// only ever stores which quests have been started, per-objective kill
// counters (killMonster objectives only — everything else is checked
// live), and when a quest was actually turned in; the title/description/
// objective list itself is always looked up from here, same "content in
// code, progress in the DB" split the vendor/teacher NPCs already use.
export type QuestObjectiveKind = 'learnSkill' | 'killMonster' | 'haveItem' | 'hasFlag';

// hasFlag's own set of checkable boolean facts about a player (a follow-
// up ask's "acquire the map" quest) — a bag rather than a single
// hardcoded boolean so each new quest gated on a different flag (e.g.
// Professor Caldwell's 2nd quest, "choose a house") doesn't need its
// own new objective kind.
export type QuestFlag = 'mapUnlocked' | 'houseChosen';

export interface QuestObjective {
  id: string;
  label: string;
  kind: QuestObjectiveKind;
  // learnSkill only — the skill name that must be present in the
  // player's own skills map (see shared/skills.ts).
  skill?: string;
  // killMonster only — the monster kind to count kills of.
  monsterKind?: string;
  // haveItem only — the inventory item label to count.
  itemLabel?: string;
  // killMonster/haveItem only — how many are needed. Always 1 if absent.
  count?: number;
  // hasFlag only — which flag (see PlayerSnapshot/SocketData) must be true.
  flag?: QuestFlag;
}

export interface QuestDefinition {
  id: string;
  title: string;
  // The quest-giver's own opening line, shown before the quest is started
  // (with a "Quest: <title>" button beneath it) and again (unchanged)
  // while it's still in progress.
  description: string;
  // Shown instead of `description`, with a "Complete Quest" button, once
  // every objective is done but the quest hasn't been turned in yet (a
  // follow-up ask: "add a message... to return to her once they have
  // finished the quest").
  readyMessage: string;
  // Shown instead of either of the above once the quest has actually
  // been turned in (completedAt is set) — no button, just flavor.
  completedMessage: string;
  objectives: QuestObjective[];
  rewardExp: number;
}

// Quest id -> completed objective ids/counts, per player (see
// shared/types.ts's PlayerSnapshot.quests) — a quest id present as a key
// (even with an empty object) means it's been started.
export interface QuestProgress {
  // killMonster objectives only — objective id -> kills counted so far.
  // learnSkill/haveItem objectives are always checked live instead (see
  // isObjectiveDone) since they're facts about current state, not events.
  killCounts?: Record<string, number>;
  // Epoch ms once the quest was actually turned in (rewards granted) —
  // absent means every objective could be done and it'd still just be
  // sitting there waiting on a return trip to the quest-giver.
  completedAt?: number;
}

export const LEARN_SPELLS_QUEST_ID = 'learn-spells';
export const KILL_IMPS_QUEST_ID = 'kill-imps';
export const GATHER_MANA_CRYSTALS_QUEST_ID = 'gather-mana-crystals';
export const FIND_THE_MAP_QUEST_ID = 'find-the-map';
export const CHOOSE_HOUSE_QUEST_ID = 'choose-house';

// Which spells live behind which classroom's own podium(s) (see
// shared/spells.ts's own *_BOOK_MAP constants) — Offense has 3 podiums,
// Utility now has 4 (irrigo moved in from the old Elemental Casting
// Classroom, which stopped being a classroom entirely — a later
// follow-up ask), every other classroom has exactly 1.
// Exported (a later follow-up ask removed the podium system in favor of a
// teacher click-to-learn modal) — server/worlds/teachers.ts reuses this
// exact map to populate each classroom teacher's own teachesSkills list,
// so the Learn Spells quest's objectives and what a teacher actually
// offers can never drift apart.
export const CLASSROOM_SPELLS: Record<string, string[]> = {
  'Defense Classroom': [AEGIS_SKILL],
  'Summoning Classroom': [STONE_WALL_SKILL],
  'Utility Classroom': [WATERFILL_SKILL, LIGHT_SKILL, HASTE_SKILL, UNLOCK_SKILL],
  'Offense Classroom': [ARCANE_BOLT_SKILL, STUN_SKILL, DISARM_SKILL],
};

export const QUESTS: Record<string, QuestDefinition> = {
  [LEARN_SPELLS_QUEST_ID]: {
    id: LEARN_SPELLS_QUEST_ID,
    title: 'Learn Spells',
    description:
      "Welcome to Grimoak Academy! To start your journey I would like for you to visit all of the classrooms and begin learning magic! It's your pick for where you start, the classrooms are located behind me. Good luck!",
    readyMessage:
      "You've learned every spell taught in the classrooms behind me — wonderful work! Click below when you're ready to complete your training.",
    completedMessage: "Go on now, and put what you've learned to good use.",
    // A later follow-up ask: not just "visit" each classroom anymore —
    // one objective per spell taught there (learnSkill, checked live
    // against the player's own skills), so a classroom with 3 podiums
    // (Utility, Offense) needs all 3 learned, not just a walk-through.
    objectives: Object.entries(CLASSROOM_SPELLS).flatMap(([classroomMap, skills]) =>
      skills.map((skill) => ({
        id: skill,
        label: `Learn ${skill} (${classroomMap})`,
        kind: 'learnSkill' as const,
        skill,
      }))
    ),
    rewardExp: 200,
  },
  [KILL_IMPS_QUEST_ID]: {
    id: KILL_IMPS_QUEST_ID,
    title: 'Imp Extermination',
    description: 'I would like for you to go out and kill 5 imps. Return to me after.',
    readyMessage: "You've thinned out the imps — well done! Click below when you're ready to complete this quest.",
    completedMessage: 'Thank you for clearing out those imps.',
    objectives: [{ id: 'kill-imps', label: 'Kill imps', kind: 'killMonster', monsterKind: 'imp', count: 5 }],
    rewardExp: 100,
  },
  [GATHER_MANA_CRYSTALS_QUEST_ID]: {
    id: GATHER_MANA_CRYSTALS_QUEST_ID,
    title: 'Mana Crystal Delivery',
    description: 'I would like for you to bring me 10 lesser mana crystals. You can get them from the imps outside. Return to me after.',
    readyMessage: "You've got enough lesser mana crystals — well done! Click below when you're ready to complete this quest.",
    completedMessage: 'Thank you for the mana crystals.',
    // haveItem — checked live against current inventory count, not
    // tracked incrementally, since "the quest should check the player's
    // inventory at any given time" (a follow-up ask) — a player could
    // even start this quest already holding all 10.
    objectives: [
      { id: 'lesser-mana-crystals', label: 'Bring lesser mana crystals', kind: 'haveItem', itemLabel: 'lesser mana crystal', count: 10 },
    ],
    rewardExp: 150,
  },
  [FIND_THE_MAP_QUEST_ID]: {
    id: FIND_THE_MAP_QUEST_ID,
    title: 'The Hidden Map',
    description:
      'Go and acquire the map from the back of the Utility Classroom. You must first learn the secrets of the lock in order to gain access to it. Return to me once you have acquired it.',
    readyMessage: "You've acquired the map — wonderful! Click below when you're ready to complete this quest.",
    completedMessage: 'Keep that map safe — it will serve you well.',
    // hasFlag — the same secret-room mapUnlocked flag the map corner
    // button/'m' hotkey are already gated behind (see
    // game.gateway.ts's handleTakeChestItem), so this quest just tracks
    // whatever ALREADY happened rather than needing its own new event.
    objectives: [{ id: 'acquire-map', label: 'Acquire the map from the Utility Classroom', kind: 'hasFlag', flag: 'mapUnlocked' }],
    rewardExp: 100,
  },
  // Professor Caldwell's 2nd quest (a later follow-up ask) — offered
  // alongside Find the Map from the very start (a still-later follow-up
  // ask: "should be available at the same time... offer both options,"
  // see npcDialogueModal.ts's own multi-quest render). Same hasFlag
  // shape as that quest: just checks whatever ALREADY happened (see
  // game.gateway.ts's handleChooseHouse) rather than needing its own new
  // event — a player who already picked a house with Professor Hollowell
  // before accepting this can complete it immediately.
  [CHOOSE_HOUSE_QUEST_ID]: {
    id: CHOOSE_HOUSE_QUEST_ID,
    title: 'Choosing a House',
    description: 'Every student needs a house to call home. Go and see Professor Hollowell to pick yours. Return to me once you have.',
    readyMessage: "You've chosen a house — wonderful! Click below when you're ready to complete this quest.",
    completedMessage: 'Wear your house colors with pride.',
    objectives: [{ id: 'choose-house', label: 'Choose a house with Professor Hollowell', kind: 'hasFlag', flag: 'houseChosen' }],
    rewardExp: 100,
  },
};

export function questDefinition(questId: string): QuestDefinition | undefined {
  return QUESTS[questId];
}

// Whether a single objective is currently satisfied — the one place that
// knows how to check each of the 4 objective kinds, shared by both server
// (turn-in validation) and client (quest log progress/strikethrough).
// `flags` covers hasFlag objectives — just PlayerSnapshot.mapUnlocked
// today, passed in rather than hardcoded so a future flag doesn't need
// its own new objective kind.
export function isObjectiveDone(
  objective: QuestObjective,
  progress: QuestProgress,
  skills: Record<string, number>,
  inventory: string[],
  flags: Partial<Record<QuestFlag, boolean>> = {}
): boolean {
  if (objective.kind === 'learnSkill') return skills[objective.skill!] !== undefined;
  if (objective.kind === 'haveItem') {
    return inventory.filter((item) => item === objective.itemLabel).length >= (objective.count ?? 1);
  }
  if (objective.kind === 'hasFlag') return Boolean(flags[objective.flag!]);
  return (progress.killCounts?.[objective.id] ?? 0) >= (objective.count ?? 1);
}

// "3/5", "10/10" — the quest log's own progress readout; learnSkill/
// hasFlag objectives are just done/not-done (1/1), no meaningful partial
// count.
export function objectiveCurrentCount(objective: QuestObjective, progress: QuestProgress, inventory: string[]): number {
  if (objective.kind === 'haveItem') return inventory.filter((item) => item === objective.itemLabel).length;
  if (objective.kind === 'killMonster') return progress.killCounts?.[objective.id] ?? 0;
  return 0;
}

export function allObjectivesDone(
  quest: QuestDefinition,
  progress: QuestProgress,
  skills: Record<string, number>,
  inventory: string[],
  flags: Partial<Record<QuestFlag, boolean>> = {}
): boolean {
  return quest.objectives.every((objective) => isObjectiveDone(objective, progress, skills, inventory, flags));
}

// The floating icon over a quest-giver's own head (a later follow-up
// ask) — three states, matching a real quest board's own convention:
// not yet accepted (a golden "!", the giver has something new for you),
// accepted and every objective already done but not yet turned in (a
// golden "?", go collect your reward), or accepted and still in progress
// (a silver "?"). `null` once it's been turned in (completedAt set) —
// nothing left to show.
export type QuestIconState = 'not-started' | 'ready' | 'in-progress';

// Which of a teacher's own questIds (server/worlds/teachers.ts) is
// "current" for a given player — used only to pick ONE quest's state to
// drive the teacher's own floating status icon now (a still-later
// follow-up ask made openNpcDialogueModal itself show every quest at
// once instead of one at a time, so this no longer decides what the
// DIALOGUE shows, just the icon): the first not-yet-turned-in quest in
// the list, or the last one (so its completedMessage-driven "nothing
// left" icon state keeps showing) once every quest in the list is done.
// Order-only — doesn't need skills/inventory/flags, since completedAt is
// the only signal needed to pick which single id to check via
// questIconStateFor.
export function activeQuestIdFor(questIds: string[] | undefined, quests: Record<string, QuestProgress>): string | undefined {
  if (!questIds || questIds.length === 0) return undefined;
  return questIds.find((id) => !quests[id]?.completedAt) ?? questIds[questIds.length - 1];
}

export function questIconStateFor(
  questId: string,
  quests: Record<string, QuestProgress>,
  skills: Record<string, number>,
  inventory: string[],
  flags: Partial<Record<QuestFlag, boolean>> = {}
): QuestIconState | null {
  const quest = questDefinition(questId);
  if (!quest) return null;
  const progress = quests[questId];
  if (!progress) return 'not-started';
  if (progress.completedAt) return null;
  return allObjectivesDone(quest, progress, skills, inventory, flags) ? 'ready' : 'in-progress';
}
