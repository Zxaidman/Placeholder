# Thornwake · v1.1.0

[Play Thornwake](https://thornwake.vercel.app/) — an installable, mobile-first precision platformer and room creator. Original game inspired by demanding platforming; it does not use Hollow Knight or Silksong assets, characters, or levels.

## Play

- **Creator:** 80 × 44-cell rooms (twice the old width and height), half-cell placement, pan/zoom, selection, group copy/paste, undo/redo, room ordering and linked exits. Edit dimensions, movement paths, timing, channels, hook behavior, themes, death rules and allowed abilities. Campaign rooms can be copied and edited.
- **Campaign:** 12 authored challenge rooms with progressive movement unlocks, saved progress, and an all-chapters practice option. Environmental chapter text introduces each mechanic.
- **Endless:** seeded generated geometry, practice or three-health survival. Difficulty rises through room 100 and then plateaus. No automatic scrolling or movement. Revisit the most recent three rooms through their left portals.
- **Movement:** variable jump, wall slide/jump, double jump, dash, manually triggered pogo, charged long dash, clawline pulls and held rope swings. Crystals restore air movement; moving/timed platforms, launch pads, gravity fields, switches, doors, checkpoints and moving pogo enemies support creator challenges.
- **Touch:** fixed joystick by default or directional buttons; drag, resize, adjust opacity and assign custom PNG textures. Export/import control presets. Keyboard is also supported.
- **Display:** Full, 16:9 or 4:3 changes only the video viewport. Touch controls use the full play-surface width. Adjustable gameplay camera zoom and fullscreen button.
- **Sharing:** open JSON projects and compressed level URLs; no accounts needed. Successful creator clears record an input replay tied to the room hash and physics version. Imported evidence can be replay-checked inside the game. Unverified projects can still be shared.
- **Offline:** installable PWA, cached game/worker/art, local IndexedDB projects and progress, full backup/restore, and explicit updates that preserve editor drafts. Export backups regularly: browser storage may be cleared or evicted.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | A/D or Left/Right | Joystick or arrows |
| Jump / double jump | Space, W or Up | Jump |
| Dash | Shift or K | Dash |
| Pogo | Hold Down/S, press J/X | Hold joystick down + Attack |
| Long dash | Grounded: hold Down + Dash, release Dash when charged | Same |
| Clawline | Tap E near cyan anchor | Hook |
| Rope swing | Hold E near cream anchor; release | Hold/release Hook |
| Pause | Escape | Pause |

Use landscape on phones. Install from the in-game Install button when available, or the browser's **Install app / Add to Home screen** menu. Installation and fullscreen behavior depend on the browser. After the first successful online load, the game is available offline.

## Develop

Node.js 24 and npm:

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

Production browser checks (install Chromium once with `npx playwright install chromium`):

```sh
node tests/browser.mjs
node tests/offline.mjs
node tests/pwa-update.mjs
```

The first two expect the preview server on port 4173. The update test starts its own server. `CHROMIUM_PATH` can select an existing browser executable.

## Deployment

Vercel is connected to `Zxaidman/Placeholder`, production branch `main`. Pushes trigger `npm ci`, `npm test && npm run build`, then publish `dist`. GitHub Actions separately runs checks. No environment secrets or database service are required.

## Project format

App version **1.1.0**, project schema **1.1.0**, physics replay version **1.0.0**. These versions serve different purposes. Earlier 1.0.0 project exports are migrated on import. See [level.schema.json](level.schema.json) and [example](examples/silent-palace.json). Positions and sizes are cells; one cell is 32 simulation units. Exit destinations accept room IDs, `next`, `previous`, or `finish`. Switches control doors with matching channels. Export validation checks links, bounds and spawns; it does not prove arbitrary user rooms beatable.

## Honest limits

Generated rooms are accepted only after a fixed-step simulation completes a zero-death route. That proves one route in this physics model, not human difficulty or universal performance. Geometry uses a supported jump/dash/timed-platform subset with optional pogo/hook supports; it does not generate every mechanic combination. Generation has a bounded attempt/time budget and reports failure rather than hanging. The practical room-index limit is 1,000,000, not mathematical infinity.

The campaign has 12 rooms, not 100 handcrafted rooms or a large narrative world. Human difficulty labels and balance need playtesting. Two-GB 2020 Android hardware is a target, not a measured guarantee; physical-device performance testing remains outstanding. Art combines an original vector traveller and palace scenery with a bundled free atlas; character animation is simple. There is no hosted level gallery or multiplayer. Clear replays are evidence, not anti-cheat, and stop recording after 20 minutes per attempt. See [verification](docs/VERIFICATION.md) and [limits](LIMITS_AND_ROADMAP.md).

## Assets and license

Original palace scenery and botanical traveller are drawn in code. Bundled artwork: [Kenney 1-Bit Platformer Pack](https://kenney.nl/assets/1-bit-platformer-pack), **CC0**. The original license is included in `public/assets/Kenney-LICENSE.txt`; the atlas is served locally. Sound effects are synthesized in the browser. No Nintendo or Team Cherry assets are included. Code licensing has not been selected by the repository owner; asset licensing does not automatically license the code.
