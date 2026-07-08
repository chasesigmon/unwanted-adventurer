// Static lookup for "help <argument>" — keyed by topic name, partial and
// case-insensitive matched against whatever the player typed (see
// findHelpTopic). A plain data module like items/item-definitions.ts,
// not a NestJS provider — there's no state to inject, just a table.
const HELP_TOPICS: Record<string, string> = {
  'lesser undead monster resistance':
    'A skill learned by consuming a body part (leg, arm, hand, skull, or rib) — a 20% chance to teach it, starting at 10%. Only reduces damage taken from undead monsters (like wild skeletons), never from an undead-flavored player race. Grows 2% of the time on every hit taken from an undead monster, and its damage reduction grows with it (1 point per 20%, capping at 100%).',
  'lesser normal monster resistance':
    'A skill learned by consuming a "normal"-classified monster\'s body part (e.g. "wild goblin leg", dropped by a wild goblin) — a 10% chance to teach it, starting at 10%. Reduces damage taken from normal monsters only, growing 2% of the time on every hit taken from one (1 point of reduction per 20%, capping at 100%).',
  'lesser race resistance':
    'A family of skills learned by consuming a race-specific body part (e.g. "goblin leg", dropped by a murdered player) — a 10% chance to teach it, starting at 10%. Reduces damage taken from that specific player race only, growing 2% of the time on every hit taken from it (1 point of reduction per 20%, capping at 100%).',
  dodge:
    'A passive skill every race starts with at level 1 (1%). Gives a chance to avoid an attack entirely, based on your level, dexterity, and dodge percentage compared to your opponent\'s. Grows 2% of the time whenever it triggers.',
  parry:
    'A passive skill every race starts with at level 1 (1%). Normally only works while wielding a weapon (slime is the exception — it has no hands to hold one, so it parries bare-bodied) — gives a chance to avoid an attack entirely, based on your level, strength, and parry percentage compared to your opponent\'s. Grows 2% of the time whenever it triggers.',
  'shield block':
    'A passive skill every race starts with at level 1 (1%), but only usable while wearing a shield. Gives a chance (20% base, climbing toward an 80% ceiling as the skill grows — +1 percentage point per 3% learned) to block an incoming attack outright, taking no damage. Grows 2% of the time whenever you attempt one, whether it succeeds or fails.',
  dagger:
    'A passive skill every race but slime starts with at level 1 (1%). Slightly increases your damage while wielding a dagger, scaling with the percentage learned. Grows 2% of the time on every hit you land while wielding a dagger.',
  kick: 'An active skill goblins, skeletons, zombies, and dragonborn start with at level 1 (1%). Type "kick" (or "kic") to queue a kick (2 damage) into your current fight — type it more than once to queue several. Grows 2% of the time on every use.',
  slap: 'Slime\'s equivalent of kick — an active skill starting at level 1 (1%). Type "slap" to queue a slap (2 damage) into your current fight — type it more than once to queue several. Grows 2% of the time on every use.',
  'second attack':
    'A goblin-only passive skill, granted automatically (starting at 1%) the moment a goblin reaches level 5. Each combat tick has a chance (20% base, climbing toward an 80% ceiling as the skill grows — +1 percentage point per 3% learned) to swing a second time at the same target. Grows 2% of the time every tick, whether it procs or not. Independent of "third attack" — a character with both rolls each one separately, so both can trigger in the same tick.',
  'third attack':
    'A Hobgoblin-only passive skill, granted at level 1 the moment you evolve. Same chance formula as second attack, but its own independent roll — not an upgrade or replacement for second attack — for a chance to swing a third time at the same target. Grows 2% of the time every tick, whether it procs or not.',
  'enhanced damage':
    'A Hobgoblin-only passive skill starting at level 1 (1%). Adds a flat bonus to your base hit damage, equal to 1 point per 3% learned. Grows 2% of the time on every hit or miss you make.',
  mimic:
    'A slime-only passive skill, innately known at 100% from level 1 — it can never fail. Type "mimic" alone to list every unique race or monster kind you have ever consumed a body part from; type "mimic <name>" (partial match) to take on that form, which lets you wear that form\'s equipment slots (nothing else changes — no other bonuses). Lasts until you "revert". See also "revert".',
  revert:
    'A slime-only passive skill, innately known at 100% from level 1 — it can never fail. Returns you to your plain slime form. Anything equipped in a slot only the mimicked form could use is unequipped and returned to your inventory rather than lost. See also "mimic".',
  hobgoblin:
    'A goblin that reaches 100 consumed experience (CXP) automatically evolves into a Hobgoblin — a one-way transformation. Level and experience reset to a fresh level 1 and consumed experience resets to 0, but strength, intelligence, wisdom, dexterity, constitution, and your hp/mana/movement caps are NOT reset — whatever they already were carries over, each simply raised by a permanent evolution bonus (+10 attributes, +100 hp/mana/movement caps). Every skill you already had is kept, and you additionally learn second attack, third attack, and enhanced damage — every skill a goblin would have by its own level 10, regardless of what level you actually evolved at (second attack and third attack are independent, see their own entries). A goblin cannot level past 10 without evolving.',
  gauntlets: 'An equipment slot worn over the hands, alongside the rest of a full suit (see "equipment"/"equip"). Part of what a town requires to let a monster through its gates — see "town".',
  town:
    'Floro and Kortho are rival towns, each connected to the Great Plains (west and east respectively). Every playable race is "monster"-classified (see shared/constants.ts) and needs these equipment slots filled to hide its nature before the town guards will let it cross in: mask, torso (armor), leftArm, rightArm, gauntlets, leftLeg, rightLeg, and boots — see "equipment"/"equip". A non-mimicking slime, which can\'t equip most of those slots at all, can only qualify after mimicking a form that can (see "mimic").',
};

export function findHelpTopic(query: string): { topic: string; description: string } | undefined {
  const needle = query.toLowerCase();
  const match = Object.entries(HELP_TOPICS).find(([topic]) => topic.toLowerCase().includes(needle));
  return match ? { topic: match[0], description: match[1] } : undefined;
}
