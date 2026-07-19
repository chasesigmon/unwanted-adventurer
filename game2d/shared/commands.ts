// Every chat-typeable "/" command and what it does — a single source of
// truth shared by the server's own /commands, /help text
// (game.gateway.ts's COMMANDS_HELP_TEXT) and the client's Help modal (the
// 'h' hotkey, a later follow-up ask), so the two can never drift apart.
export interface ChatCommandInfo {
  usage: string;
  description: string;
}

export const CHAT_COMMANDS: ChatCommandInfo[] = [
  { usage: '/commands, /help', description: 'show this list' },
  { usage: '/sleep', description: 'lie down and close your eyes, recovering hp/mana faster until you wake up (moving or attacking wakes you)' },
  { usage: '/rest, /sit', description: 'sit down to rest, recovering a bit faster than standing around' },
  { usage: '/wake, /stand', description: 'get up from sleeping or resting' },
  { usage: '/dance', description: 'bust a move (moving cancels it)' },
  { usage: '/time', description: 'show the current game hour and whether it is day or night' },
  { usage: '/light', description: "toggle your equipped wand's light on or off (requires the light skill)" },
  // A minimal player party (a later follow-up ask) — exists purely so
  // PvP combat can check "is this player in my group" (see shared/pvp.ts);
  // no shared exp/loot or any other party mechanic beyond that exemption.
  { usage: '/invite <username>', description: 'invite another player to your party' },
  { usage: '/accept', description: 'accept a pending party invite' },
  { usage: '/decline', description: 'decline a pending party invite' },
  { usage: '/leave', description: 'leave your current party' },
  { usage: '/party', description: 'list your current party members' },
  // A later follow-up ask — each just opens the Map modal to a specific
  // tab. Unlike every command above, these are caught client-side (see
  // src/ui/log.ts's own MAP_MODAL_CHAT_COMMANDS) and never actually reach
  // the server at all; still listed here since this file is the one
  // shared source of truth for both the server's /help text and the
  // client's own Help modal.
  { usage: '/who', description: 'open the Map modal with the Who tab focused' },
  { usage: '/where', description: 'open the Map modal with the Where tab focused' },
  { usage: '/map', description: 'open the Map modal with the World Map tab focused' },
];
