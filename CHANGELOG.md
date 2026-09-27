# Changelog

## 1.2.1 · Controls & Contact Fixes
- Made Attack an explicit tutorial action before Pogo, with clear keyboard, touch and gamepad labels.
- Added explicit keyboard/gamepad/touch instructions for Clawline and Swing.
- Added an on-screen touch-control toggle; mobile/touch-first devices enable it by default, while desktop and connected-gamepad devices keep it off by default.
- Aligned the procedural traveller's rounded feet to the 28px physics collider so the legs no longer sink into walkable platforms.

## 1.2.0 · Wayfinder Regions
- Added a playable movement tutorial with device-aware prompts above the traveller for keyboard, touch/Android, and standard gamepads.
- Added direct standard-gamepad movement/jump/dash/attack/hook input.
- Reworked the traveller into a smoother expressive procedural character with segmented limbs, oversized mask, readable lean, squash/stretch, stride and dash trails.
- Added five visual regions: Silent palace, Hanging garden, Ember halls, Mycelium wilds, and Drowned ruins.
- Added separate Walkable platform and Under-platform creator cells and collision support.
- Migrates project schema 1.0.0 / 1.1.0 exports to 1.2.0.

## 1.1.1

- Added stationary Down-to-look ledge inspection and symmetric camera framing under reversed gravity.
- Added an airborne surface marker, timed-platform cycle bars and clearer pogo targets.
- Added touch pressed states, locked-ability/dash-refill indicators and safer pointer release after interruptions.
- Kept simulation and replay physics unchanged.

## 1.1.0

- Reworked presentation as a moonlit, overgrown palace: distant ruins, moss-edged masonry, soft lighting, motes, and an original botanical traveller.
- Replaced the tight camera with wider framing, eased horizontal look-ahead, a vertical jump dead zone, and falling anticipation.
- Redesigned the mode menu, workshop surfaces, dialogs and touch controls. The app opens to mode selection.
- Kept movement physics/replay version unchanged; added focused camera regression tests.

## 1.0.0

- Expanded rooms from 40 × 22 to 80 × 44; added editor zoom/pan and half-cell properties.
- Separated game-video aspect ratio from the full-width touch overlay.
- Added 12-chapter campaign, movement unlocks, saved progress and practice selection.
- Added seeded procedural endless mode, fixed-step route verification, survival/practice and recent-room backtracking.
- Added charged long dash, pull anchors, rope swings, moving/timed platforms, gravity fields, launch pads, switches and channel doors.
- Expanded creator selection/group copy, property editing, room links/reordering, project library, full backups and clear replay verification.
- Retained offline installation, custom touch textures, open project import/export and URL sharing; migrated earlier project/control saves.
- Added browser regressions covering creator, campaign, endless, mobile aspect ratios, offline loading and draft-preserving updates.

## 0.1.1

- Preserved unfinished editor drafts through PWA updates.

## 0.1.0

- Initial creator-first browser prototype and Vercel configuration.
