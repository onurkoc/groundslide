# GroundSlide · LEM 2D

Two-dimensional slope stability analysis with the limit equilibrium method
(LEM), running entirely in the browser.

- Methods: Bishop (simplified), Janbu (simplified and corrected), Spencer
- Slip surfaces: circles and non-circular polylines; grid and radius search,
  optional optimisation of the critical circle into a polyline
- Layers, water line, surcharge loads, horizontal and vertical seismic
  coefficient, tension crack with water
- Supports (Spencer): soil nails, anchors, piles, shotcrete
- Modes: characteristic (global factor of safety) and SIA 267 (partial
  factors, design verification)
- Result: overview per method, slice table with stresses, supports,
  graphic export and printable result document

The engineer is responsible for checking the plausibility of the results
and for knowing the limits of the method.

## Run locally

No packages, no build step. Requires Node.js 20 or newer.

```bash
node tools/serve.js
```

Then open http://localhost:8080/app/.

## Tests

```bash
node --test
```

## Structure

- `core/` – calculation kernel (pure JavaScript, no DOM)
- `app/` – user interface
- `tests/` – unit tests and benchmarks

## Licence

MIT, see [LICENSE](LICENSE).
