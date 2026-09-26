# Thornwake 0.1.0 — boundaries and next steps

## Implemented now

Creator with grid paint/erase, spawn/exit placement, undo/redo, connected sequential rooms, room names, health/instant-death rules and four movement toggles. Two demo rooms. Walk, variable jump, double jump, wall slide/jump, dash, downward attack/pogo, static hazards, air refills and checkpoints. Touch joystick/buttons with repositioning/size/opacity and custom control PNGs. Open JSON import/export, compressed links, local save, layout presets, fullscreen request, aspect ratio selection and production offline cache.

## Not implemented in this first release

The complete campaign, procedural endless mode and its practice/survival variants; long dash; clawline; rope swing; gravity zones; moving/disappearing platforms; moving enemies; a visual trigger system; selection/copy/paste tools; room deletion/reordering; arbitrary branching room exits; automatic campaign progress backup; reproducible recorded clear proofs; sound/music; character animation and a full illustrated environment set. Do not describe any of these as working.

The editor's exits currently follow room-list order. Users can reorder the open JSON outside the app. This is a foundation for the requested richer creator, not the final editor.

## Feasible but requires deliberate engineering

- Fully procedural endless rooms: generate geometry with a seeded RNG and verify candidate routes against the same movement simulation. Reject or simplify candidates after a bounded work budget. Do not block the phone until a candidate happens to succeed. Restore prior rooms deterministically from seed + generator version, and persist changed state separately.
- Timing hazards and grapple/rope interactions: a static reachability graph is insufficient. Verify timing and resource state as well as position. Continuous rope motion makes exhaustive proof impractical; limit generated scenarios to a tested subset initially.
- Human difficulty: route existence does not predict touch-screen difficulty. Measure timing windows and introduce difficulty ceilings, then playtest with people. Difficulty must not rise forever.
- Low-end Android: target 60 FPS and reduce visual cost first. Benchmark on real hardware before calling 2 GB phones supported. RAM capacity alone cannot establish performance.

## Cannot honestly guarantee

1. Universal installation, fullscreen, orientation locking or identical behavior across every browser/device.
2. An infinite world retained entirely in RAM, or unlimited user objects/textures on budget phones.
3. Every unrestricted procedurally generated room being solvable without a complete model and successful validation.
4. Every mathematically solvable room being humanly achievable or enjoyable.
5. Unforgeable clear certification in a client-only application. Future replay checks provide evidence, not server-grade anti-cheat.
6. Permanent browser storage. Users can clear it and browsers can evict it.
7. A messaging app accepting arbitrarily large share URLs. File export is the fallback.

## Proposed sequence

- 0.1.x: phone feedback, movement tuning, reliability fixes. No content volume race before feel is approved.
- 0.2.0: editor selection/copy, object properties, visual triggers, flexible room connections, improved save/backup UX.
- 0.3.0: long dash and clawline; then rope/gravity prototypes with explicit acceptance checks. Add moving platforms and animation.
- 0.4.0: small handcrafted progression built entirely inside the creator.
- 0.5.0: bounded procedural generator using a restricted, validated movement vocabulary, seeded replay and practice/survival.
- Later: wider procedural vocabulary and expanded campaign after real-device evidence.

These are scope milestones, not time estimates or a promise of 100 polished rooms in the next update.
