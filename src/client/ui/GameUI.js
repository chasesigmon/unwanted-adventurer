// Pure rendering + input capture. Every command goes to the server and
// the resulting position/message/minimap come back from its ack — nothing
// here decides where the player actually ends up.
export function initGameUI(network, initialPlayer, initialMinimap) {
  const positionEl = document.getElementById('position-readout');
  const actionLogEl = document.getElementById('action-log');
  const minimapEl = document.getElementById('minimap');
  const commandInput = document.getElementById('command-input');

  function renderPosition(player) {
    positionEl.textContent = `${player.map}: (${player.row}, ${player.col})`;
  }

  function renderMinimap(cells) {
    minimapEl.innerHTML = '';
    for (const cell of cells) {
      const span = document.createElement('span');
      span.className = 'minimap-cell';
      if (cell.self) span.classList.add('is-self');
      else if (cell.exit) span.classList.add('is-exit');
      span.textContent = cell.self ? '@' : cell.exit ? '*' : cell.inBounds ? '.' : '#';
      minimapEl.appendChild(span);
    }
  }

  function renderAction(message) {
    actionLogEl.textContent = message;
  }

  renderPosition(initialPlayer);
  renderMinimap(initialMinimap);
  renderAction(`${initialPlayer.username} entered ${initialPlayer.map}.`);

  commandInput.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const text = commandInput.value.trim();
    if (!text) return;
    commandInput.value = '';

    try {
      const res = await network.sendCommand(text);
      if (res.player) renderPosition(res.player);
      if (res.minimap) renderMinimap(res.minimap);
      renderAction(res.message);
    } catch (err) {
      renderAction(err.message);
    }
  });

  commandInput.focus();
}
