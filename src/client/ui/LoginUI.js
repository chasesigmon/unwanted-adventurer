export function initLoginUI(network, onJoined) {
  const form = document.getElementById('login-form');
  const input = document.getElementById('username-input');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    try {
      const res = await network.join(input.value.trim());
      onJoined(res.self, res.world);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });
}
