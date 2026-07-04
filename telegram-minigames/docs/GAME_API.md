# Game API contract

Every game is a single self-registering classic script at
`webapp/games/<id>/game.js`. No ES modules, no imports, no external
libraries, no external assets (draw everything on canvas / use emoji / DOM).
Target: weak phones (low-end Android), file budget ≤ ~25 KB per game.

## Skeleton

```js
(function () {
'use strict';
MG.register('game-id', function (container, api) {
  // build UI inside `container` (a positioned, empty <div> filling the screen)
  // start your loops / listeners

  return {
    destroy: function () { /* REQUIRED: stop rAF/timers, remove window listeners */ },
    pause:   function () { /* optional: freeze game loop */ },
    resume:  function () { /* optional */ }
  };
});
})();
```

The `id` MUST exactly match the game id in `webapp/games/catalog.json`.

## `api` surface

| Member | Description |
|---|---|
| `api.t(key)` | Translated UI string. Available keys: `score, best, game_over, you_win, you_lose, draw, new_record, restart, tap_to_start, level, lines, moves, time, pause, money, day, buy, sell, your_turn, thinking, wait, tap_now, too_early, ms` |
| `api.lang` | `'ru'` or `'en'` |
| `api.lowEnd` | boolean — reduce particles/effects when true |
| `api.colors` | `{bg, panel, panel2, text, muted, accent, good, bad}` — always use these, never hardcode colors |
| `api.createCanvas()` | returns `{canvas, g, W, H, dpr, onResize, destroy}` — canvas fills container; `g` is a 2d context pre-scaled so you draw in CSS pixels (`W`×`H`). Set `out.onResize = fn(W,H)` if you need relayout. Call its `destroy()` inside your `destroy()`. |
| `api.swipe(el, fn)` | swipe/tap detection; `fn(dir, point)` with dir ∈ `left,right,up,down,tap`. Returns unsubscribe fn. |
| `api.score(n)` | report live score (shown in header) |
| `api.gameOver(score, opts)` | end round. `opts`: `{win: true|false}` for versus/win-lose games, `{draw:true}` for draws. Shell shows overlay with restart. Do NOT build your own game-over screen. |
| `api.save(obj)` / `api.load()` | persistent per-game JSON state (localStorage). Use for sims (tycoon/farm/trader) and long games (chess/sudoku). |
| `api.best()` | current best score |
| `api.haptic(kind)` | `'light'|'medium'|'success'|'error'` — sparingly, on key events |

## Rules

1. **Touch-first.** Everything playable with one thumb: taps, swipes, drag.
   Also map keyboard (arrows/WASD/space) for desktop testing.
2. **Canvas or DOM** — your choice. Board/card games are often easier in DOM;
   action games in canvas. Style DOM with `api.colors` inline or the shared
   classes `.mg-center`, `.mg-btn`, `.mg-hint`.
3. **Start screen**: show a `tap_to_start` prompt before motion begins for
   action games; turn-based games may start immediately.
4. **Score must be an integer ≥ 0.** For win/lose games use e.g.
   100 for a win, 50 draw, 10 loss (so leaderboards mean something).
   For time-based games where lower is better, convert (e.g. `Math.max(1, 100000 - ms)`)
   or use count of wins.
5. **Performance**: single rAF loop; no allocations in the hot loop where easy;
   respect `api.lowEnd` (fewer particles, dpr already capped by SDK).
6. **Cleanup**: `destroy()` must cancel rAF, clear intervals/timeouts and
   remove any `window`/`document` listeners you added. Container is cleared by the shell.
7. **No text hardcoding** for the listed keys — use `api.t()`. Short game-specific
   labels may be bilingual via `api.lang === 'ru' ? '...' : '...'`.
8. **No network, no external assets, no fonts.** Emoji are fine.
9. Keep it fun: increasing difficulty, haptic on milestones, subtle animations.

## Reference

See `webapp/games/snake/game.js` — the canonical example of loop structure,
input, resize, pause/destroy handling.
