// Builds garages in the background so the screen never freezes.
importScripts('lot.js');
onmessage = e => postMessage({ id: e.data.id, puzzle: Lot.generate(e.data.cfg) });
