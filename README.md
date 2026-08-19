# FloodFlow

A demo web app for a DBKL (Kuala Lumpur City Hall) policy pitch: overlaying
flood-risk data with traffic/parking data to reveal "compounding risk zones"
in Kuala Lumpur. Prototype, not a production platform — see
[DATA.md](./DATA.md) for the full data schema and how each layer is scored.

- **Map:** Leaflet + OpenStreetMap tiles (no API key, no cost)
- **Data:** static GeoJSON/CSV under `public/data/` — no database
- **Languages:** Bahasa Malaysia (default), English, Chinese, Tamil,
  Indonesian, Thai, Filipino

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

Push to GitHub, then import the repo at [vercel.com/new](https://vercel.com/new).
No environment variables are required.
