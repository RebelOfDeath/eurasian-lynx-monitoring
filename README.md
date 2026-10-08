# Watching the lynx, lightly

A scrollytelling companion to the CS4800 report *Sustainable AI for Eurasian Lynx Monitoring*
(Group 19). Plain HTML, CSS and JavaScript: no build step and no dependencies.

## Run it

```bash
cd website
python3 -m http.server 8000     # then open http://localhost:8000
```

Opening `index.html` directly from disk also works, but Chrome then refuses the bundled web
fonts and falls back to Georgia and the system sans.

**Presenting:** press `→` / `PageDown` to jump to the next step and `←` / `PageUp` to go back.
The page has 23 stops, so a 5 minute talk leaves roughly 13 seconds per stop.

## Layout

```
index.html                 the story, one <section> per scene
assets/css/style.css       all styles; .theme-light / .theme-dark set the colour tokens
assets/js/sources.js       GENERATED from ../paper/main.bib; do not edit
assets/js/cite.js          citation numbers, hover cards, source chips, reference list
assets/js/graphics.js      one controller per sticky graphic (window.Graphics)
assets/js/scrolly.js       step activation, reveals, counters, nav, presenter keys
data/source-links.json     links for bib entries without a doi/url (or with a wrong one)
scripts/build_sources.py   main.bib -> assets/js/sources.js
```

## Extending it

**Sources.** After editing `paper/main.bib`, regenerate the source list:

```bash
python3 website/scripts/build_sources.py           # rebuild sources.js
python3 website/scripts/build_sources.py --check   # also probe every link
```

Cite in the HTML with `<a class="cite" data-cite="Key1,Key2"></a>`, using the BibTeX keys.
Numbers follow order of first appearance, and every cited entry lands in the reference list with
a "Back to text" link. Entries that are never cited appear under "Collected for the chapters
ahead", grouped by the `% --- Part X.Y: ... ---` dividers in the bib. To show a group's sources as
chips anywhere, use `<div class="chips" data-source-group="energy-consumption"></div>`.

**A new step** in an existing sticky block: add another `.step` with `data-stop` (and
`data-pane` in blocks that switch panes), then handle the new index in that block's controller
in `graphics.js`.

**A new sticky block** (for example Part 2 results): copy an existing `.scrolly` block, give it
`data-graphic="myname"` and register `Graphics.myname = { init(root), step(i, dir), visible(on) }`
in `graphics.js`. `step` receives the active step index; `visible` is optional.

**Part 2 and 3 cards.** Each card in `#impact` has an "In progress" badge; swap its body for
figures or link it to a new sticky block once the numbers exist. Keep the "Data behind this chart"
`<details>` pattern from the training chart, so every figure has a table view, its method, and
sources.

**Animations** respect `prefers-reduced-motion`. Other elements can use `data-reveal`
(fade up on scroll), `data-reveal-stagger` on a parent, and `data-count="1234"` (count up).

## Colours

Chart hues were checked with the dataviz palette validator for lightness, chroma, colour-vision
deficiency separation, and contrast:

| role   | light (`#f4f1ea`) | dark (`#101713`) |
|--------|-------------------|------------------|
| amber  | `#b5621a`         | `#d27a2c`        |
| spruce | `#008a76`         | `#1f998a`        |

## Hosting

Any static host works (GitHub Pages, Netlify, TU Delft pages). Upload the `website/` folder as
the site root. GitHub Pages only serves from the repository root or `/docs`, so either point a
Pages workflow at `website/` or copy the folder into `docs/`.
