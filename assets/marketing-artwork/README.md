# Marketing artwork layers

`landing-cleanplate.png` was prepared with the built-in `image_gen` tool from
`../landing-welcome.png`. It is a background repair source, not a replacement
portrait. The original supplied PNGs remain unchanged.

`src/components/ArtworkLayers.tsx` separates selected objects with native SVG
clipping paths. The woman, original colors, and original object/message pixels
come directly from the supplied images. Only the gaps behind moving objects use
the clean plate. The parcel and coin gaps sample empty yellow regions of that
plate because those objects remained in the generated output. Each selected
object has its own transform and timing. The base subject never moves.

The ordinary original image remains the accessible fallback while assets load,
on an asset failure, with reduced motion, and in forced colors. SVG layers are
decorative and ignore pointer events. Motion pauses while the scene is outside
the viewport or the document is hidden.

## Generation prompt

Use case: precise-object-edit. Edit target: the supplied PineVela yellow artwork.
Produce a clean background plate on exactly the same 1448x1086 canvas and preserve
the exact composition. Remove ONLY these floating objects from the right-hand
yellow area, filling each removed object's pixels and shadows with the immediately
surrounding smooth golden yellow background and existing subtle white light trails:
(1) the red heart notification icon near x960 y160; (2) blue rising bar chart with
green arrow near x1285 y155; (3) the gold coin at x1340 y260; (4) the white/blue
'is this item still available ?' message bubble near x1040 y320; (5) the pale green
'Issue fix' message bubble near x1020 y455; (6) the pale green 'sale complete'
message bubble near x1060 y570; (7) the blue three-dot chat icon near x1050 y690.
Do not remove the cardboard parcel, clipboard, money notes, thumbs-up, left coins,
or any part of the woman. Invariants: preserve woman, face, hair, glasses, white
shirt, hands, phone, pose, edges, lighting, original colors, proportions, exact
positions and full framing. No additional people, objects, text, crop, zoom,
restyling, or watermark. This clean plate is only used as small masked background
repair patches behind the original objects; the original person and original
object pixels will be retained in the app. Smooth seamless yellow repair in the
specified regions is the priority.
