# Release boundaries

v1.0.0 delivers the three game modes, movement toolkit, creator sharing, larger rooms, independent video aspect ratios and offline touch-first play. It is a foundation for playtesting, not a claim of commercial-game polish.

## Finite limits

- Rooms: 80 × 44 cells, up to 2,500 objects each; projects: up to 100 rooms.
- Saved project library: 30 projects. JSON import: 5 MB; backup restore: 15 MB; shared URL: 8,000 characters. Large levels should use files.
- Custom control textures: PNG, 256 KB per upload, at most 1024 × 1024 pixels.
- Recorded clear attempts: 20 minutes. Replays depend on the exact room hash and physics version.
- Endless: room indices up to 1,000,000; difficulty ceiling after the first 100; recent-three-room backtracking; bounded generation attempts/time.

## Remaining development

- Physical low-memory Android benchmarks, accessibility and broader browser/device testing.
- Human campaign balance testing, more authored chapters and richer original art/animation/audio.
- Expand the certified generator's mechanic vocabulary beyond jump/dash/timed routes.
- Additional editor convenience features and optional hosted discovery if requested later.

Simulation certification does not establish human achievability, touch difficulty, or the beatability of arbitrary creator levels. Fullscreen/install support is browser-dependent. No native app-store package, cloud sync, multiplayer or hosted gallery is included.
