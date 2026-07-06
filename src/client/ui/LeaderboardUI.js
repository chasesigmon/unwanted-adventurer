export function initLeaderboardUI(network) {
  const list = document.getElementById('leaderboard-list');

  network.addEventListener('leaderboard', (e) => {
    list.innerHTML = '';
    for (const entry of e.detail) {
      const li = document.createElement('li');
      li.textContent = `${entry.username} — ${entry.score}`;
      list.appendChild(li);
    }
  });
}
