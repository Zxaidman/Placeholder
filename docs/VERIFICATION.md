# Verification — 0.1.0

Executed in the build environment on 2026-09-26:

- TypeScript strict check and production Vite/PWA build passed.
- Eight Vitest tests passed.
- Chromium: grid painting wrote the intended cell; undo, room creation, save/reload, project export/import, play/pause, control settings, mobile landscape layout and 4:3 viewport checks passed. No page JavaScript errors observed.
- Production service worker: cache completed, browser network disabled, reload succeeded, and playtest opened offline.

The offline test initially revealed duplicate precache entries with incompatible revision values for bundled assets. Removing redundant includeAssets entries fixed the tested failure.

Unverified: physical Android touch comfort, low-end hardware frame time and memory, real install prompts across browsers, Safari/iOS, final difficulty balance and both demo rooms' completion by a human. Automated movement tests are not evidence of enjoyable platforming.

The build reports a large single JavaScript chunk (~1.32 MB raw / 357 KB gzip). This is primarily the bundled game framework; it is not a runtime memory figure. Code splitting and a narrower Phaser build should be evaluated when real profiling identifies a benefit.
