// Static lookup for "help <argument>" — keyed by topic name, partial and
// case-insensitive matched against whatever the player typed (see
// findHelpTopic). A plain data module like items/item-definitions.ts,
// not a NestJS provider — there's no state to inject, just a table.
const HELP_TOPICS: Record<string, string> = {
  'lesser undead resistance':
    'A skill learned by consuming an undead body part (leg, arm, hand, skull, or rib) — each has a 20% chance to teach it. Once learned, it reduces damage taken from undead monsters (like skeletons) by 1 point per hit.',
};

export function findHelpTopic(query: string): { topic: string; description: string } | undefined {
  const needle = query.toLowerCase();
  const match = Object.entries(HELP_TOPICS).find(([topic]) => topic.toLowerCase().includes(needle));
  return match ? { topic: match[0], description: match[1] } : undefined;
}
