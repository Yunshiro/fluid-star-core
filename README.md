# 流体星核 · Fluid Star Core

A scroll-driven WebGL piece. A liquid-metal star core, built from a physical surface and a GPU particle field, is disturbed by the pointer and reassembles three times: liquid metal, nebula, then the signature **Yunn**.

## Run

```bash
npm install
npm run dev
```

Dev server: [http://127.0.0.1:4731](http://127.0.0.1:4731)

```bash
npm run build
npm run preview
```

`npm run build` typechecks and writes a static `dist/` (Vite `base` is `/`). Preview serves that build on port 4732.

## Deploy

The project is a static site. Vercel can use the default Vite build (`npm run build`, output `dist`). `vercel.json` sets long-cache headers for `/assets` and `/fonts`, plus a few security headers. No environment variables and no secrets.

## Concept

The core is a `MeshPhysicalMaterial` sphere (iridescence, clearcoat, image-based reflections from a procedural studio) wrapped in a curl-noise particle flow. Positions and velocities live in float render targets and are integrated with `GPUComputationRenderer`. Scroll mixes three targets:

1. **液态金属** — 液金随念而流. Particles hug the metal and brighten at the limb.
2. **星云** — 星云记得你的轨迹. The same particles fill a colored volume.
3. **署名** — 尘埃终将写成你的名字. A subset locks onto a sampled serif **Yunn**.

The opening loader is in the first HTML paint, then the core renders behind it and the veil opens.

## Controls

- Scroll, or the ticks on the right. Arrow keys and Page Up / Page Down move between passages.
- Mouse or touch stirs the field like a magnetic disturbance. The metal also catches a pointer light.
- **声音** starts a quiet synthesized drone. It is off until you turn it on, and it only starts from that gesture.
- `prefers-reduced-motion` disables smooth scroll, the intro push, and most ambient flow. Pointer and scroll morphs still work.

## Quality and debug

Desktop machines get the full tier: 512×512 simulation (262,144 particles), bloom, film grain, vignette, radial chromatic aberration, and a light center-weighted depth of field. Tablets and weaker GPUs step down to 256². Phones, WeChat on a small screen, and Save-Data use 128², no bloom pass, and a cheap glow in the final composite. If a high-tier machine misses frame time, pixel ratio and curl cost drop once.

If float color buffers are missing, the same scene runs an analytic vertex flow instead of the GPGPU integrate. If WebGL2 is missing, a designed fallback screen replaces the canvas. A lost context does the same. The page should not go blank.

Query flags:

| Flag | Effect |
| --- | --- |
| `?debug` | FPS, frame time, tier, particle count, DPR, morph, bloom, sim mode |
| `?quality=low\|medium\|high` | Force a tier |
| `?motion=reduce` | Force the reduced-motion path |
| `?fallback` | Show the no-WebGL screen |
| `?shot=intro\|metal\|nebula\|logo` | Hold a section for capture |

## Assets and licenses

No external models, HDRIs, or audio files. Reflections come from a procedural environment rendered through `PMREMGenerator`. The glow sprite is a canvas gradient. The drone is a Web Audio graph. Simplex noise in the shaders is the public-domain Stefan Gustavson / Ashima Arts implementation.

| Asset | Source | License |
| --- | --- | --- |
| Cormorant Garamond 500, roman and italic (latin subset) | [Cormorant Project](https://github.com/CatharsisFonts/Cormorant), vendored from Fontsource | SIL Open Font License 1.1 — `public/fonts/OFL-CormorantGaramond.txt` |
| Noto Serif SC 500, interface glyph subset | [Noto CJK](https://github.com/notofonts/noto-cjk) via the Google Fonts API | SIL Open Font License 1.1 — `public/fonts/OFL-NotoSerifSC.txt`. Reserved name: Noto Serif SC |
| three.js r187 | [mrdoob/three.js](https://github.com/mrdoob/three.js) | MIT |
| GSAP 3 and ScrollTrigger | [gsap.com](https://gsap.com/standard-license/) | Standard “no charge” license, including commercial use |
| Lenis | [darkroomengineering/lenis](https://github.com/darkroomengineering/lenis) | MIT |
| Vite | [vitejs](https://vitejs.dev) | MIT |

## Notes

Depth of field is a short radial blur in the composite pass, not a full bokeh kernel, so the core stays sharp and the frame stays cheap. The phone tier skips that blur and the multi-pass bloom. Distant dust can read as tiny squares when a point is only a couple of pixels wide; letterforms and the metal limb use larger round sprites.
