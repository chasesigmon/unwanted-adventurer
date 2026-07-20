// The Help modal (the 'h' hotkey, a later follow-up ask) — a static list
// of every chat-typeable "/" command and what it does, straight from
// shared/commands.ts (the exact same list the server's own /commands,
// /help text is built from) so the two can never drift apart.
import { CHAT_COMMANDS } from '../../shared/commands.js';
import { helpBody, helpModal, registerModalOpenHandler } from './modalCore.js';

// Plain left-aligned rows (not the label/value .modal-stats grid every
// other stats-style modal uses) — a command's own description usually
// runs a full sentence long, which reads poorly right-aligned in a
// narrow value column.
function renderHelp(): void {
  helpBody.innerHTML = '';
  for (const { usage, description } of CHAT_COMMANDS) {
    const row = document.createElement('p');
    row.className = 'help-command-row';
    const usageEl = document.createElement('strong');
    usageEl.textContent = usage;
    row.appendChild(usageEl);
    row.appendChild(document.createTextNode(` - ${description}`));
    helpBody.appendChild(row);
  }
}

registerModalOpenHandler(helpModal, renderHelp);
