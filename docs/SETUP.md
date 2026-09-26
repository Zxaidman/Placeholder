# Thornwake setup

The [root README](../README.md) is the maintained setup guide, including installation, controls, tests, offline behavior and Vercel deployment.

Requires Node.js 24 and npm:

```sh
npm ci
npm run dev
```

For a production build:

```sh
npm test
npm run build
npm run preview
```

Vercel uses `npm test && npm run build` and publishes `dist/`. The connected repository is `Zxaidman/Placeholder`; importing it into Vercel is a one-time setup step. No environment secrets are needed by the game.

Run the service-worker update regression after a production build:

```sh
npx playwright install chromium
node tests/pwa-update.mjs
```
