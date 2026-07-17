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
];
