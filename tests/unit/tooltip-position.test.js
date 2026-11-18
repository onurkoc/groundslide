// Place of the tooltip of the sketch (SPEC_ETAPPE2 6, version 1.13): completely inside the window, no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { placeTooltip, tooltipMaxWidth, TIP_GAP, TIP_MARGIN } from '../../app/lib/tooltip-position.js';

const inside = (place, tip, viewport, margin = TIP_MARGIN) => {
  assert.ok(place.left >= margin, `left ${place.left}`);
  assert.ok(place.top >= margin, `top ${place.top}`);
  assert.ok(place.left + tip.width <= viewport.width - margin, `right edge ${place.left + tip.width}`);
  assert.ok(place.top + tip.height <= viewport.height - margin, `bottom edge ${place.top + tip.height}`);
};
const anchorAt = (left, top, size = 24) => ({ left, top, right: left + size, bottom: top + size });

test('room enough: below the button, left edge at the left edge of the button', () => {
  const viewport = { width: 1912, height: 900 };
  const tip = { width: 400, height: 60 };
  const place = placeTooltip({ anchor: anchorAt(300, 120), tip, viewport });
  assert.deepEqual(place, { left: 300, top: 120 + 24 + TIP_GAP, placement: 'below' });
  inside(place, tip, viewport);
});

test('button at the right edge: moved to the left, right edge of the tooltip at the margin', () => {
  const viewport = { width: 460, height: 800 };
  const tip = { width: 400, height: 80 };
  const place = placeTooltip({ anchor: anchorAt(420, 140), tip, viewport });
  assert.equal(place.left, 460 - TIP_MARGIN - 400);
  assert.equal(place.placement, 'below');
  inside(place, tip, viewport);
});

test('window narrower than the tooltip would be: with tooltipMaxWidth it fits, left at the margin', () => {
  const viewport = { width: 300, height: 600 };
  const width = tooltipMaxWidth(viewport.width);
  assert.equal(width, 300 - 2 * TIP_MARGIN);
  const tip = { width, height: 120 };
  const place = placeTooltip({ anchor: anchorAt(250, 50), tip, viewport });
  assert.equal(place.left, TIP_MARGIN);
  inside(place, tip, viewport);
  assert.equal(tooltipMaxWidth(1912), 416, 'the preferred width in a wide window');
  assert.equal(tooltipMaxWidth(10), 0);
});

test('no room below (button at the bottom edge, e.g. full screen with the bar at the foot): above the button', () => {
  const viewport = { width: 800, height: 400 };
  const tip = { width: 380, height: 80 };
  const place = placeTooltip({ anchor: anchorAt(100, 360), tip, viewport });
  assert.equal(place.placement, 'above');
  assert.equal(place.top, 360 - TIP_GAP - 80);
  inside(place, tip, viewport);
});

test('little room on both sides: the side with more room, the tooltip is moved to stay inside as far as the height allows', () => {
  const viewport = { width: 600, height: 150 };
  const tip = { width: 380, height: 100 };
  const place = placeTooltip({ anchor: anchorAt(50, 90), tip, viewport });
  inside(place, tip, viewport);
  const higher = placeTooltip({ anchor: anchorAt(50, 90), tip: { width: 380, height: 400 }, viewport });
  assert.equal(higher.top, TIP_MARGIN, 'higher than the window: the top stays visible');
});

test('inside the window for a grid of button places, window widths and heights', () => {
  for (const width of [320, 460, 900, 1366, 1912]) {
    for (const height of [300, 700, 1000]) {
      const viewport = { width, height };
      const tipWidth = tooltipMaxWidth(width);
      const tip = { width: Math.min(tipWidth, 380), height: width < 500 ? 110 : 60 };
      for (const ax of [0, 10, width / 2, width - 40, width - 24]) {
        for (const ay of [0, 40, height / 2, height - 60, height - 24]) {
          inside(placeTooltip({ anchor: anchorAt(ax, ay), tip, viewport }), tip, viewport);
        }
      }
    }
  }
});
