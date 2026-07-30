# Signal Wash — generative background kit

Three presets: Liquidline, Impasto, Ink Wash. Chrome-less, interactive (hover paints, click ripples), pauses offscreen, respects reduced motion. Source is procedural by default; pass a video URL to paint from footage.

## Use
Script form (recommended — clicks pass through to your content):
```html
<script src="signal-wash-bg.js"></script>
<section data-signal-wash="Impasto" data-sw-interact="hover">…your content…</section>
```
or JS: `SignalWash.attach(el, {preset:'Ink Wash', interact:'hover', overrides:{air:0.55, speed:0.6}, video:'clip.mp4'})`

Iframe form: `<iframe src="background.html?preset=Liquidline"></iframe>` (also ?video= &speed= &seed= &interact=)

Options: interact full|hover|none · overrides accept any preset key (air, trail, smear, liquid, streaks, poster, grain, palette…).
Handle API: setPreset(name), set(key,val), ripple(x,y), reseed(), destroy().

Host content sits above the canvas: give it position:relative;z-index:1.
