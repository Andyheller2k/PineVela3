# Mobile bottom-navigation proposal

This is the approved design preview. See the
[implementation and install instructions](../../docs/mobile-navigation-update-2026-11-04.md).
These preview pictures remain separate from actual application verification.

Open `pinevela-mobile-navigation-preview.png` for the six-panel picture, or
`index.html` in a desktop browser to tap the destinations and replay the motion.
The individual `standard-*`, `seller-*` and `resident-*` PNGs show larger details.

Proposed appearance:

- Light: white bar, `#003566` selected circle/icon and label.
- Dark: `#003566` bar, `#ffd60a` selection, navy ink inside the selected circle.
- The bar fills the bottom screen area, including the gesture-safe area.
- Standard selection: the curved cutout and circle slide for 500 ms with a smooth
  ease at each end; the previous icon lowers as the target rises. No extra bursts.
- Seller/resident: the center plus remains fixed. The selected side highlight
  glides while the previous icon lowers and the target rises slightly.
- Reduced motion selects the destination immediately.

The seller layout uses Home, Stock, Publish (+), Sales and More. Services remains
in More; Publish offers an item or service. The resident layout retains My Room,
Complaints, Bulletins and Settings around the center quick-actions button.
The standard shape is intended for other mobile product portals using their
existing destinations. Desktop navigation is outside this proposal.

The supplied `mobilenav.html` is a saved Pinterest page whose main reference is
the supplied static JPG; it has no reusable navigation animation code. The GIF
provides the fixed-center-plus shape. The user's later instruction defines the
simple slide/lower/rise motion used in this preview.

`node render-preview.cjs` renders these local-only pictures and checks 24
role/theme/viewport cases, screen-edge alignment, readable contrast, pointer
interaction, the fixed plus, and reduced motion. See `preview-checks.json`.
