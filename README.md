# Kevin's Games

Ad-free, offline-friendly games for a 5 year old, built with plain HTML + JavaScript (no build step).

## Layout

```
www/                    ← upload this folder to the web server
├── index.html          ← game picker (faded 🔒 bottom-left → Grown-ups)
├── grown-ups/          ← time limits, game locks, play stats (behind the sum lock)
├── manifest.json, sw.js, icons/   ← "Add to Home Screen" app + offline support
├── shared/             ← styles, sound effects, confetti, "Hooray!" screen, grown-up sum lock
├── games/trains/       ← Train Yard
├── games/memory/       ← Memory Match
├── games/balloons/     ← Balloon Pop
├── games/colours/      ← Connect the Colours
├── games/jigsaw/       ← Jigsaw
├── games/shapes/       ← Shape Sorter
├── games/dots/         ← Dot to Dot
├── games/maze/         ← Mazes
├── games/piano/        ← Animal Piano
├── games/paint/        ← Paint & Colour
├── games/garage/       ← Parking Garage
├── games/read/         ← Read Along (stories read aloud)
├── games/tower/        ← Number Tower
├── games/cubes/        ← Cube Pop
├── games/potions/      ← Potion Sort
├── games/candy/        ← Candy Pop
└── games/pet/          ← My Pet
```

## Test locally

```
cd www && php -S 0.0.0.0:8081
```

Then open http://localhost:8081 (or http://<this-machine's-ip>:8081 from the tablet on the same Wi-Fi).

## Install on Android

1. Copy the `www/` folder to the server (must be **https** for offline/install to work).
2. Open the address in Chrome on the phone/tablet.
3. Menu ⋮ → **Add to Home screen** / **Install app**.
4. Optional: Settings → Security → **App pinning** to lock the device to the game.

## Updating

After changing files, bump `VERSION` in `www/sw.js` (e.g. `kg-v2`) so installed copies fetch the new files.
New games need their files added to the `FILES` list in `sw.js` and a tile in `www/index.html`.

## Game ideas

See [GAME-IDEAS.md](GAME-IDEAS.md).

## Credits

Animal sounds in Animal Piano are CC0 recordings from [BigSoundBank](https://bigsoundbank.com) — details in `www/games/piano/sounds/CREDITS.md`.
Saved paintings stay on the device they were made on (browser storage); use 📤 in the gallery to keep a copy in Photos.

## Grown-ups (supervision)

Tap the faded 🔒 at the bottom-left of the home screen and solve the sum:

- **Time limits** — daily play time and a bedtime. When time's up a "Time for a break!" screen covers the games; a grown-up can tap its 🔒 for 15 more minutes.
- **Games** — switch any game off (greyed out with a 🔒).
- **Play stats** — plays, active minutes (only while being touched), last 14 days, per-level tries/wins/fails/quits, help used, and a "worth a look" list (stuck levels, sums he gets wrong, games dropped).
- **📤 Send stats** — share a small file + summary (email / WhatsApp); open it on any device with **📥 View a stats file**.

All of it is stored only on the device (`localStorage`: `kg-guard`, `kg-stats`). Games report events through `shared/guard.js` (`Guard.round()`, `Guard.count()`, `Guard.best()`; wins are recorded by `Win.show`).
