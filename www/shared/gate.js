// Grown-ups only: solve a sum (answer between 100 and 200) to get in.
// Gate.ask(() => openSettings())
const Gate = (() => {
  let el = null, answer = 0, tries = 0, onPass = null;

  function build() {
    el = document.createElement('div');
    el.className = 'gate-sheet';
    el.hidden = true;
    el.innerHTML = `
      <div class="gate-card">
        <div class="gate-lock">🔒</div>
        <p class="gate-sum"></p>
        <input class="gate-answer" inputmode="numeric" autocomplete="off" aria-label="Answer">
        <div class="gate-row">
          <button class="btn gate-cancel" aria-label="Cancel">✖️</button>
          <button class="btn gate-ok" aria-label="OK">✔️</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const input = el.querySelector('.gate-answer');
    const check = () => {
      if (Number(input.value) === answer) {
        el.hidden = true;
        if (onPass) onPass();
        return;
      }
      input.classList.remove('wrong');
      void input.offsetWidth;
      input.classList.add('wrong');
      if (++tries >= 2) { tries = 0; newSum(); }
    };
    el.querySelector('.gate-ok').addEventListener('click', check);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') check(); });
    el.querySelector('.gate-cancel').addEventListener('click', () => { el.hidden = true; });
  }

  function newSum() {
    const a = 50 + Math.floor(Math.random() * 50), b = 50 + Math.floor(Math.random() * 50);
    answer = a + b;
    el.querySelector('.gate-sum').textContent = `${a} + ${b} = ?`;
    el.querySelector('.gate-answer').value = '';
  }

  return {
    ask(pass) {
      if (!el) build();
      onPass = pass;
      tries = 0;
      newSum();
      el.hidden = false;
      setTimeout(() => el.querySelector('.gate-answer').focus(), 50);
    },
  };
})();
