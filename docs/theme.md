# Personal appearance

The blue palette supplied in `blueshades.jpeg` is shared through `--pv-blue-*`
tokens: navy `#03045E`, primary blue `#0077B6`, cyan `#00B4D8`, soft blue
`#90E0EF`, and ice `#CAF0F8`. Blue, sky, cyan, and indigo utility colors, public
headers, login glass, company sections, navigation, focus rings, and seller
surfaces use these tokens or related tints. Light mode keeps white/frosted
surfaces dominant; night mode uses deep navy with pale blue text and edges.

Use the supplied 60–30–10 rule as a visual hierarchy, not an exact pixel quota:
roughly 60% neutral white/ice (navy in night mode), 30% soft blue supporting
surfaces, and 10% strong accents for actions/selection. Content photographs
and charts affect the visible proportions. Keep error/success/warning colors,
the multicolor logo, and subscription gold distinct from decorative blue.
Primary blue with white text has 4.87:1 contrast; cyan with white is only
2.46:1, so cyan is reserved for decoration and highlights. Small blue labels
on ice use the darker `#00679E` tint (5.05:1 contrast).

`ThemeProvider` owns the shared light/night mode; `ThemeEnvironment`, `ThemeToggle`
and `src/theme.css` provide the atmosphere, switch and existing-surface adaptation.
Page surfaces switch in one paint; existing utility transitions are suppressed for two
animation frames. Only the switch and decorative layers use short 180 ms transitions.
The app supplies the login's primary `--pv-canvas` background: `#e0f1fa` in light
mode and `#060e29` in dark mode. Route canvases and the mobile login backdrop stay
transparent so the sun, moon and atmosphere remain visible behind content. The
landing hero embeds its own sky above its gradient, with one environment per page.
Decorative PineVela background
logos are removed; header branding and content photographs remain. The landing
welcome area retains its original blue gradient and mountain texture from
`assets/pinepeak.jpg`, with a navy gradient in dark mode. Opaque public headers,
including their search fields and secondary buttons,
follow light/night mode. Reduced-motion users get
the same theme and readable surfaces without travel, breathing or transition effects.

The last device mode is applied in the document head before React renders. Each
authenticated account caches its own mode and saves it through `GET/PUT
/api/auth/appearance`. Only `theme: light | dark` is accepted. Server session identity
selects the record; matching email addresses never combine preferences. New accounts
inherit the current device appearance. Logout retains the last appearance on public
pages. Failed writes remain cached across reloads and retry when the connection
returns or the account is reopened. Writes are serialized so rapid toggles preserve
the final choice.

During the JSON migration period, `appearanceTheme` lives on its owning user,
officer or merchant credential record, so restart preserves it and account deletion
removes it. When migrating to PostgreSQL, preserve the preference on the corresponding
account/profile with owner-only RLS. Personal appearance requires no administrator
settings key and does not change global platform settings.

Verification: `npm run test:theme` checks
authentication, rejected spoofed fields, same-email isolation, pending-manager,
merchant/officer access and persistence after restarting an isolated server.
After `npm run build`, `npm run test:theme:browser` runs Chromium checks on
landing/login/company screens and every account portal at desktop/tablet/mobile
sizes, including reduced motion, saved preferences and nested maintenance dialogs.

Mobile portals use at most five primary navigation choices and group secondary destinations in a named More dialog. The appearance switch sits above the navigation, opposite the maintenance/seller shortcut, with reserved scrolling space. Selected dark-mode tabs use a blue background and blue icon glow. The measured navigation height, including safe-area padding, reserves room in the scrolling content and raises the seller’s add button above it. Desktop seller navigation includes the Subscription label and selected state.

About Us, Our Vision, Partner with Us, and Contact continue below the landing
catalog and benefits. Public company links navigate to `/?section=<section-id>`;
landing links scroll to the same sections with clearance for the fixed header.
Landing content uses one-time fade/up reveals as it enters the viewport, including
catalog cards loaded from the API. Scrolling stays native; keyboard focus reveals
its target, and reduced-motion preferences disable reveals and smooth scrolling.
Social icons stay visible; only configured, verified destinations are linked.
Administrators edit these public contacts in Admin Settings using their own
private settings key. Profile URLs require HTTPS on the matching platform.

Landing PineMarket and PineResidence list all matching API-backed cards in
single horizontal rows. Physical market items use the same compact cards across
landing, catalog, storefront, resident and seller views: 176 by 272 pixels with
144-pixel-high image areas. Item widths shrink on narrow screens; service and
residence card dimensions retain their existing responsive rules. Native touch
and trackpad scrolling, named previous/next controls and keyboard arrows/Home/End
work without visible scrollbars. Soft edge masks indicate more cards, clear at
the ends, and adapt to both themes. Standalone Explore catalogs retain their grids.
Desktop headings/actions occupy matching rows; Explore buttons and the top and
bottom edges of both card rows align.

Landing and login/signup routes use a gentle opacity fade with no vertical
movement. Scrolling resets when the incoming page mounts, after the outgoing
page finishes fading. Signup opens the registration form immediately, and
existing authentication continuation links remain intact. Reduced motion skips
these public route fades.
