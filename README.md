# Shehab — Design Portfolio

Single-page portfolio site. Static, no build step: `index.html` plus assets is the whole deployment.

## Run locally

Any static file server from the repo root, e.g.:

```
python3 -m http.server 8000
```

then open http://localhost:8000. (Opening `index.html` via `file://` won't work — the resume pane and video textures need HTTP.)

## Structure

- `index.html` — the entire site: layout, styles, WebGL background engine, case-study content, and interactions.
- `assets/signal-wash-bg.js` — Signal Wash generative-art engine (third-party kit, do not modify; attached via `SignalWash.attach`).
- `assets/video/abstract1–6.mp4` — source loops for the video-shader background.
- `assets/projects/` — project banners plus per-case-study images (`intuit/`, `pru/`, `way/`).
- `uploads/Resume.pdf` — served in the resume pane and via its Download button.

## How it works

Each page load runs a 4-way lottery for the background: the video-texture shader (default look: "Tokenized · Leaf lines" over `abstract3.mp4`) or Signal Wash in Liquidline, Impasto, or Ink Wash. A minimal loader covers the page until the winning engine has painted real frames (4s safety timeout).

Press **t** to open the Tweaks panel (background FX controls, desktop only). Slider/toggle changes and saved presets persist in `localStorage`.
