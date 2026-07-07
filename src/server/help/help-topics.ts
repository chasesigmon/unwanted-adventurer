// Static lookup for "help <argument>" — keyed by topic name, partial and
// case-insensitive matched against whatever the player typed (see
// findHelpTopic). A plain data module like items/item-definitions.ts,
// not a NestJS provider — there's no state to inject, just a table.
const HELP_TOPICS: Record<string, string> = {
  'lesser undead monster resistance':
    'A skill learned by consuming a body part (leg, arm, hand, skull, or rib) — a 20% chance to teach it, starting at 10%. Only reduces damage taken from undead monsters (like wild skeletons), never from an undead-flavored player race. Grows 2% of the time on every hit taken from an undead monster, and its damage reduction grows with it (1 point per 20%, capping at 100%).',
  'lesser race resistance':
    'A family of skills learned by consuming a race-specific body part (e.g. "goblin leg", dropped by a murdered player) — a 10% chance to teach it, starting at 10%. Reduces damage taken from that specific player race only, growing 2% of the time on every hit taken from it (1 point of reduction per 20%, capping at 100%).',
  dodge: 'A passive skill goblins start with at level 1 (1%). Gives a chance to avoid an attack entirely, based on your level, dexterity, and dodge percentage compared to your opponent\'s. Grows 2% of the time whenever it triggers.',
  parry:
    'A passive skill goblins start with at level 1 (1%). Only works while wielding a weapon — gives a chance to avoid an attack entirely, based on your level, strength, and parry percentage compared to your opponent\'s. Grows 2% of the time whenever it triggers.',
  dagger:
    'A passive skill goblins start with at level 1 (1%). Slightly increases your damage while wielding a dagger, scaling with the percentage learned. Grows 2% of the time on every hit you land.',
  kick: 'An active skill goblins start with at level 1 (1%). Type "kick" to queue a kick (2 damage) into your current fight — type it more than once to queue several. Grows 2% of the time on every use.',
};

export function findHelpTopic(query: string): { topic: string; description: string } | undefined {
  const needle = query.toLowerCase();
  const match = Object.entries(HELP_TOPICS).find(([topic]) => topic.toLowerCase().includes(needle));
  return match ? { topic: match[0], description: match[1] } : undefined;
}
