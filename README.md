# Kevin's Games

Ad-free, offline-friendly games for a 5 year old, built with plain HTML + JavaScript (no build step).

## Layout

```
www/                    ← upload this folder to the web server
├── index.html          ← game picker
├── manifest.json, sw.js, icons/   ← "Add to Home Screen" app + offline support
├── shared/             ← styles, sound effects, confetti
└── games/trains/       ← Train Yard
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
