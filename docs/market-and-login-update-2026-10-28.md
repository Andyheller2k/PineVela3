# Compact market home and login transitions — 28 October 2026

Package: `/tmp/pinevela-market-and-login-update-20261028.zip`.
This is the cumulative frontend build for manual installation in the existing
PineVela app. It includes the previous theme, legal, landing and artwork updates.
It has not been uploaded to the live site.

## Market home

The signed-in primary account's Home market now uses the same compact structure
on phones, tablets and desktop:

1. Existing Market/Residences switch.
2. One Search/Filters row.
3. One category strip, scrolling horizontally when needed.
4. The existing item/service cards.

The repeated market heading, P2P badge, introductory paragraph and large action
row were removed from this home view. Merchant registration/status is available
in Options, retaining the same handler, loading/error/status behavior and gold
styling for eligible applications. Services exposes a compact Nearby action
which opens the existing lazy-loaded map.

Filters opens a native bottom sheet on phones and a centered native dialog on
larger screens. It includes all four sorting choices, existing price sliders,
presets/reset, live result count and Show results. The applied sort/range stays
active after closing. Keyboard focus stays in the dialog and returns to Filters
after Escape. The old viewport listener is no longer needed in this component.

Public landing catalogs retain their existing controls. Product photos and card
dimensions, account permissions, API routes and registration rules are unchanged.

## Login/signup motion

Switching forms gives the incoming field group a 190ms fade and 6px horizontal
slide, with opposite directions for Login and Sign Up. The selector thumb also
slides on phones. The effect is a single CSS animation; the phone glass and
portrait are not animated by the form change. Page state retains entered drafts.
Reduced-motion and forced-color preferences disable the effects. No dependency
or ongoing animation loop was added.

## Local verification

- Production frontend build, TypeScript, five theme/UI test files, eight
  PWA/static-delivery checks and `git diff --check` passed.
- Real built market checks passed 24 scenes in both themes: layout at
  320/390/430/640/1024/1440px; search and clear; price, sort and result count;
  keyboard opening/focus/Escape; responsive dialog position; Services/Nearby;
  merchant application access and pending/restricted statuses in Options.
- Auth motion checks passed 12 scenes covering both themes, phone/desktop widths, normal/reduced
  motion, bounded animations, rapid switching, draft retention, one active form
  and zero API/CAPTCHA calls caused by switching tabs.
- Public catalog and dialog regression checks passed 23 scenes in both themes.

At a 900px-high test viewport, the first item card moved upward as follows:

| Width | Before | After | Space gained |
| --- | ---: | ---: | ---: |
| 320px | 558px | 235px | 323px |
| 390px | 529px | 235px | 294px |
| 1440px | 394px | 186px | 208px |

These are isolated Chromium presentation tests with local read-only data or
guest responses. They do not establish a real authenticated backend session,
physical-phone thermal performance or exhaustive business-flow coverage. No
account, payment or database record was changed.

## Apply

Extract the ZIP locally. Merge its `dist-supabase/` into the existing
`pinevela-app/dist-supabase/` in Spaceship, replacing matching files. Keep older
hashed assets for open sessions; upload assets before `index.html` if uploading
individually. Keep backend and private environment files in place. Reload the
website or installed app after the upload. No migration, dependency installation,
environment change or Node restart is required.
