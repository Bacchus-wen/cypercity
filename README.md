# NEON KAIDO (cypercity)

Three.js WebGPU night-city game. Based on [xikhar/cybercity](https://github.com/xikhar/cybercity) with local changes
(load-time shader precompile, river reflection occlusion gating, stable clustered lighting, `?look=anime` prototype).

- Dev: `npm install && npx vite` (served at `/`)
- Build for GitHub Pages: `VITE_BASE=/cypercity/ npx vite build` (the `pages.yml` workflow does this on push to `main`)
- Needs a WebGPU-capable browser (recent Chrome / Edge / Safari).
