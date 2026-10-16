# Personal appearance

The experimental palette follows `Web design concerpt theme.jpeg`: indigo
`#3548D4`, violet `#7138CD`, magenta `#A426B7`, and brighter `#CB3EE8` for
decoration. White and pale lavender surfaces balance the stronger gradients.
The existing `--pv-blue-*` names remain compatibility aliases, so public pages,
login/signup, all account portals, navigation and overlays share the new palette.
`src/brandSurfaces.css` supplies common action, field and section treatments.
These treatments include native dialogs rendered into `document.body`, so modal
onboarding, settings and confirmations receive the same fields and action gradients
as route content. Shared onboarding step indicators and progress fills also use
the action gradient; completed steps retain their success color.
This experiment changes CSS only: component structure, dimensions, spacing,
typefaces, photos, content, interactions and backend behavior are preserved.

Use the supplied 60–30–10 rule as a visual hierarchy, not an exact pixel quota:
roughly 60% neutral white/lavender (plum in night mode), 30% quiet supporting
surfaces, and 10% strong accents for actions/selection. Content photographs
and charts affect the visible proportions. Keep error/success/warning colors,
the multicolor logo, and subscription gold distinct from decorative violet.
Primary actions use a static indigo/violet/magenta gradient with white text;
its stops exceed 4.5:1 contrast. Bright magenta is decorative, not a small-text
background. Ordinary labels, field text, placeholders and focus indicators use
separate contrast-safe tokens. Selection, error messages and existing icons keep
information available without color alone. Preserve keyboard focus, existing
touch areas, reduced motion, and forced-colors behavior. Contrast targets follow
[WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

`ThemeProvider` owns the shared light/night mode; `ThemeEnvironment`, `ThemeToggle`
and `src/theme.css` provide the atmosphere, switch and existing-surface adaptation.
Page surfaces switch in one paint; existing utility transitions are suppressed for two
animation frames. Only the switch and decorative layers use short 180 ms transitions.
The app supplies the login's primary `--pv-canvas` background: `#F7F5FC` in light
mode and `#120D20` in dark mode. Route canvases and the mobile login backdrop stay
transparent so the sun, moon and atmosphere remain visible behind content. The
landing hero embeds its own sky above its gradient, with one environment per page.
Decorative PineVela background
logos are removed; header branding and content photographs remain. The landing
welcome area uses an indigo/violet/magenta gradient and mountain texture from
`assets/pinepeak.jpg`, with a deeper plum gradient in dark mode. A shallow curved bottom
edge separates it from the catalogs without changing their layout. The welcome
heading and supporting copy use larger responsive sizes, with extra space above
the hero Login action. Quiet lavender
gradients soften the company-section transitions. Opaque public headers,
including their search fields and transparent navigation buttons,
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

Theme verification combines the frontend production build, the existing UI-rule
and market-branding checks, and actual-browser light/dark responsive checks.
For this experiment, compare before/after component geometry, sample action-gradient
contrast throughout each gradient, and measure hero text against its composited
background. Check field labels, placeholders, outlines, keyboard focus, reduced
motion, higher contrast and forced colors. These checks do not certify every UX
principle or replace authenticated portal review with genuine sessions.
The shared progress component was checked for all nine onboarding definitions,
along with the initial resident-activation dialog at desktop/mobile widths in both
themes. Those isolated source-component checks use no accounts or API responses;
they verify styling, geometry, focus and dismissal rather than full enrollment.

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

At desktop widths (1024px and above), the login/signup form starts 24px lower
inside its scrolling pane. On mobile, the existing picture shares the form stack;
the card covers its lower half, with the upper half clear of the header. The
desktop inset does not apply on mobile, and longer forms remain scrollable.

`WindDust` has two effects, both flowing right to left with a gentle central curl.
Login/signup uses the original gradient strokes and 32 small sparks on phones
(48 elsewhere), behind both the illustration and the opaque form card.
The landing welcome section keeps fairy-dust clouds: 520 scattered particles
on phones and 920 elsewhere, with soft purple halos and occasional four-point
sparkles, without stroked lines. Each placement uses two cached textures.
CSS transforms and opacity move these
layers together across an 80-second cycle, with no JavaScript animation loop.
Both effects are drawn only on resize/theme changes; each backing buffer is
limited to 900,000 pixels. Motion performs no React updates or layout reads. Animation
pauses outside the viewport or when the tab is hidden, and is omitted for reduced
motion and forced colors. Observers, animations and buffers are released on unmount.

Shared public headers use transparent search, account and company-section buttons
with hover underlines, plus a compact 48 by 26 pixel theme switch. About Us,
Our Vision, Partner with Us and Contact remain separate section buttons with no
dropdown. The landing header uses tighter vertical padding; on small screens the
logo, theme switch and account actions share a row, followed by search and section
links. On desktop the search field expands toward the logo. The measured header
height still reserves content space without clipping controls.
Explore Residence uses a text loading state like Explore Market;
login/signup also use a text loading state with their gentle opacity fade.
Authenticated page skeletons remain unchanged.

During sign-out, the shared session overlay displays only a rotating spinner on
a dimmed backdrop. Its accessible status label remains available to assistive
technology; reduced motion stops rotation. The confirmation card disappears while
the request is pending and returns on failure. Session revocation and navigation
still follow the existing server-confirmed logout flow.
