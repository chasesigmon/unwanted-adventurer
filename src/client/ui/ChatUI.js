function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function initChatUI(network) {
  const chatInput = document.getElementById('chat-input');
  const chatLog = document.getElementById('chat-log');

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
      network.sendChat(chatInput.value.trim());
      chatInput.value = '';
      chatInput.blur();
    }
  });

  network.addEventListener('chat', (e) => {
    const { username, text } = e.detail;
    const line = document.createElement('div');
    line.className = 'chat-line';
    line.innerHTML = `<strong>${escapeHtml(username || 'anon')}:</strong> ${escapeHtml(text)}`;
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
    while (chatLog.children.length > 50) chatLog.removeChild(chatLog.firstChild);
  });
}
