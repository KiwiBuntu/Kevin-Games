// The "Hooray!" screen shown when a game is finished. Needs sound.js and celebrate.js.
const Win = (() => {
  let el = null;
  let onAgain = null;

  function build(home) {
    el = document.createElement('div');
    el.className = 'win-overlay';
    el.innerHTML = `
      <div class="win-card">
        <h1>Hooray!</h1>
        <div class="win-pic"></div>
        <div class="win-row">
          <button class="btn win-again" aria-label="Play again">▶️</button>
          <a class="btn" href="${home}" aria-label="Home">🏠</a>
        </div>
      </div>`;
    el.querySelector('.win-again').addEventListener('click', () => {
      Sound.unlock();
      Sound.pop();
      Win.hide();
      if (onAgain) onAgain();
    });
    document.body.appendChild(el);
  }

  return {
    show({ picture = '🎉', again, home = '../../index.html' }) {
      if (!el) build(home);
      onAgain = again;
      if (typeof Guard !== 'undefined') Guard.won();
      el.querySelector('.win-pic').textContent = picture;
      Sound.cheer();
      Celebrate.burst();
      setTimeout(() => Sound.say(Sound.praise()), 800);
      el.classList.add('show');
    },
    hide() { if (el) el.classList.remove('show'); },
  };
})();
