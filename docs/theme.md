# Personal appearance

The current references are `color.jpeg`, `the prototype.jpg`, `lightmode .jpg`
and `dark mode.jpg`. The core palette is ink `#000814`, deep navy `#001D3D`,
blue `#003566`, yellow `#FFC300`, and gold `#FFD60A`.

Appearance settings offer **Light**, **Dark**, and **System settings**. Existing
saved Light/Dark choices remain explicit. With no saved choice, System is the
default. System follows `prefers-color-scheme` live; manual choices ignore OS
changes. The preference stays `system` when the effective color changes.

Product pages and login/signup share the same device/account choice at every
screen size. Logout retains the last selected preference for the guest login
screen, and reload applies it before React paints. OS changes do not save a new
account preference. Marketing keeps its fixed navy/yellow appearance.

Login keeps its original responsive layout, portrait, component order and form
spacing across themes. Light mode uses white surfaces and translucent light
glass, with blue labels, blue buttons and white button text. Dark mode retains
navy/yellow. Desktop glass uses 6px blur; narrow-screen glass uses 1.5px blur,
with the same 62–68% tint opacity in either theme. Supporting/error text stays
readable against the composited backdrop. Photographs and brand artwork keep
their original colors.

The lower diagonal changes from yellow to blue in light mode. Both appearances
share its geometry: desktop uses 115 degrees with a 58% boundary; narrower
screens use 155 degrees with 40%/76% boundaries. Unsupported blur, reduced
transparency and higher contrast retain opaque readable fallbacks; forced
colors use system surfaces. Browser/status chrome follows the effective auth
appearance. Login light-theme roles ship in the shared stylesheet so the canvas
paints correctly before its lazy-loaded form mounts.

Public Explore Marketplace (`/pinemarket`), its storefronts, and Explore Residence
(`/pineresidence`) use fixed dark mode with no theme controls, including their
dialogs. Direct loads and route navigation preserve this appearance without
overwriting the saved product preference.

Why Us (`/why-us`) has the same fixed public navy/gold appearance. Its fourteen
student-focused comparisons pair a labeled blue traditional-approach card with
a yellow PineVela benefit card, side by side on wider screens and stacked on
phones. Landing header/footer links and a bottom-page introduction open it.
The route's pre-paint appearance agrees with ThemeProvider; product preferences
stay intact. The copy lives in `src/components/whyUsContent.ts`.

Product pages use white cards, navy feature panels and gold actions in light mode.
Dark mode uses deep blue `#001D3D` for the canvas, cards and fields, with gold
headings and selective gold feature panels. Secondary controls use a lighter navy
fill and visible outline so they remain recognizable against their cards. Dialogs
and navigation use translucent navy glass. It has no stars, moon or atmosphere.
Borders, spacing and shadows separate surfaces. Success, error and warning ink/icons still identify actual states; Google retains
its own identity colors. Ordinary copy stays solid and readable.

`src/theme.css` owns color roles; `src/index.css` bridges existing utility names.
`src/brandSurfaces.css` covers fields, actions, headings and portaled onboarding.
`src/experience.css` defines marketing surfaces, feature cards and navigation.
`data-portal-navigation` marks existing mobile headers, desktop sidebars/top bars,
the seller/officer headers, and shared mobile navigation. Navigation stays navy
in both appearances, with a yellow selected destination and navy selected labels.
Destinations, visibility preferences, badges and access restrictions are preserved.
Cards and controls use a consistent rounded hierarchy; borders and restrained
shadows establish elevation without neon glows.
All dark product dialogs keep translucent scrims with 12px blur and separate glass
cards with 18px blur, so the dashboard remains visible behind them. The shared
rules cover `DashboardOverlay`, its `data-popup-card` panels and the standalone
maintenance-return notice; the companion retains its existing custom glass.
Fields retain solid fills for readable input. Browsers without backdrop blur use
a readable opaque panel fallback. Public pages retain their separate appearance.
Sign-out, cancel and menu controls have distinct gold hover, keyboard-focus and
pressed states; the More trigger stays highlighted while its dialog is open.
Explicit `.pv-primary-action` and `.pv-secondary-action` roles keep button fills
through legacy utility adaptation, with a gold selected segment. Favorite hearts
use `data-semantic-icon="favorite"` to retain red ink in both product themes.

Gold action gradients pair with navy labels through `--pv-on-action`; inverse
feature-card actions use the navy/gold pair. Headings use blue/navy on white and
gold on navy; high contrast and forced colors use solid accessible ink.
The guidelines draw on [Material color roles](https://m3.material.io/styles/color/the-color-system),
[Nielsen's visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/),
and [minimalist design](https://www.nngroup.com/articles/aesthetic-minimalist-design/).
Contrast targets follow [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

`ThemeProvider` owns the saved preference and resolves its effective Light/Dark
color through `src/lib/themePreference.ts`. Fixed marketing appearance remains
separate. `data-auth-page` marks login/signup at all widths; `data-mobile-auth`
only marks responsive phone styling and never selects an appearance.
`ThemeEnvironment` provides the light-product atmosphere. Settings use three
native radio choices with named labels, native keyboard navigation, a visible
focus indicator and effective-mode status for System. Reduced motion and forced
colors remain supported.
Page surfaces switch in one paint; utility transitions are suppressed for two
animation frames. The primary canvas follows product/auth preference while
marketing retains its fixed treatment.
Ordinary route canvases and the mobile login backdrop stay transparent.
Decorative PineVela background
logos are removed; header branding and content photographs remain. The landing
welcome area uses a solid deep-blue `#001D3D` background. A shallow curved bottom
edge separates it from the catalogs without changing their layout. The welcome
heading and supporting copy use larger responsive sizes, with extra space above
the hero Login action. Navy/gold
gradients and responsive rounded section boundaries soften the company transitions.
The landing header keeps its fixed navy/yellow treatment. Login headers follow
the selected light white/blue or dark navy/yellow appearance. Reduced-motion users get
the same theme and readable surfaces without travel, breathing or transition effects.

Mobile product headers sit flush with the page on white surfaces with navy text
and controls in light mode, without rounded card edges, borders, blur, or shadows.
Dark product headers and public navigation retain their navy surfaces.

The effective route appearance is applied in the document head before React
renders. Each authenticated portal caches its own preference and saves it through
`GET/PUT /api/auth/appearance`; only `theme: light | dark | system` is accepted.
The native session selects the record; matching email addresses never combine
preferences. New portals inherit the current device choice once. Logout keeps
that choice for login/signup. Failed saves remain cached and retry on reconnect
or account reopening. Writes are serialized and identity/revision guarded so
late responses cannot clear another portal's pending selection. Storage events
synchronize the current device/portal choice between tabs.

Preferences persist in `private.account_appearance` under the existing scoped
backend role and RLS. Browser roles retain no direct grants; ownership fields
are never accepted as authorization. The System migration extends only the
existing theme CHECK, preserving old preferences, policies and grants. No
administrator settings key or global platform setting is involved.

Theme verification combines the frontend production build, the existing UI-rule
and market-branding checks, and actual-browser light/dark responsive checks.
For this experiment, compare before/after component geometry, sample action-gradient
contrast throughout each gradient, and measure hero text against its composited
background. Check field labels, placeholders, outlines, keyboard focus, reduced
motion, higher contrast and forced colors. These checks do not certify every UX
principle or replace authenticated portal review with genuine sessions.
The shared progress component was checked for all nine onboarding definitions,
at desktop/mobile widths in both themes. Isolated source-component checks use
no accounts or API responses;
they verify styling, geometry, focus and dismissal rather than full enrollment.

Mobile portals use at most five primary navigation choices and group secondary destinations in a named More dialog. Appearance controls live in each portal's Settings, Options, or Profile area, with no floating, navigation, or map/storefront theme switches. Selected tabs use gold fills and navy labels in both themes. The measured navigation height, including safe-area padding, reserves room in the scrolling content and raises the seller’s add button above it. Desktop seller navigation includes the Subscription label and selected state.

The primary-user dashboard uses Home, Purchases, Room, Options and Ask AI in its
mobile/tablet bar. Ask AI was restored for Spaceship testing on 2026-10-26;
Alerts stays directly accessible through the header bell.
`UserDashboardNavigation` preserves the desktop sidebar/compact-top preference.
`src/userDashboard.css` scopes its glass navigation, moving gold indicators,
typography and brief interaction feedback. Catalog filters and per-view scroll
positions survive tab switches within the account; account changes clear scroll
memory. Mobile price filters use a compact native dialog with Escape, focus
restoration and a close button. Reduced motion removes travel and animation.
Marketplace item/service dimensions and public-page styles are unchanged.

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

Login/signup cards retain their fitted geometry, responsive spacing and artwork.
The mobile illustration stays fixed independently of the rounded form card;
the bounded card can scroll when needed to reach its fields and actions.
The signup phase banner remains removed. Short landscape layouts keep
password-strength feedback beside its field label.

`WindDust` has two effects, both flowing right to left with a gentle central curl.
Login/signup uses the original gradient strokes and 32 small sparks on phones
(48 elsewhere), behind both the illustration and the opaque form card.
The landing welcome section keeps fairy-dust clouds: 520 scattered particles
on phones and 920 elsewhere, with soft blue/gold halos and occasional four-point
sparkles, without stroked lines. Each placement uses two cached textures.
CSS transforms and opacity move these
layers together across an 80-second cycle, with no JavaScript animation loop.
Both effects are drawn only on resize/theme changes; each backing buffer is
limited to 900,000 pixels. Motion performs no React updates or layout reads. Animation
pauses outside the viewport or when the tab is hidden, and is omitted for reduced
motion and forced colors. Observers, animations and buffers are released on unmount.

Shared landing/catalog headers keep the fixed navy/yellow appearance with no theme switch.
Desktop places the logo, search and account actions on its first row. Login is
outlined and Sign Up is the primary yellow action. The second row groups Why Us,
About Us, Our Vision, Partner with Us and Contact, followed by separate FAQ/Help
utilities. On phones/tablets, logo, installation and Menu controls precede search;
the disclosure contains the same links and account actions. Hidden links leave
the focus order; Escape closes the menu and restores its toggle focus. Section
and search actions close it and measure the collapsed height before scrolling.
All public header variants reserve content space using their measured height.
Explore Residence uses a text loading state like Explore Market;
login/signup also use a text loading state with their gentle opacity fade.
Authenticated page skeletons remain unchanged.

During sign-out, the shared session overlay displays only a rotating spinner on
a dimmed backdrop. Its accessible status label remains available to assistive
technology; reduced motion stops rotation. The confirmation card disappears while
the request is pending and returns on failure. Session revocation and navigation
still follow the existing server-confirmed logout flow.

Product top navigation, sidebars, mobile bottom navigation and its More menu
share the desktop/tablet login card's translucent navy surface, 18px backdrop blur,
yellow edge and inset highlights. Existing dimensions and active yellow tabs
stay intact. In light mode, mobile top headers use translucent white with navy
text and a yellow bottom line, retaining their flat, edge-to-edge layout.
Public landing headers retain their separate appearance. Forced-colors mode
uses system surfaces without blur or decorative shadows.

The restored companion has an Ask AI mobile destination and a desktop launcher.
Its mobile control has no decorative yellow rectangle or filled tile; opening
it emphasizes the icon and text while preserving the other navigation states.

The shared Appearance settings label follows the active light/dark theme, along
with its status text. Light product pages keep their subtle blue atmosphere
without a decorative sun. FAQ and Help mark the active link with `aria-current`
and a yellow fill with navy text; forced colors use the system selection colors.

The primary Home catalog uses one compact Market/Residences switcher with
44px touch targets and a yellow selected segment in both themes. The redundant
cross-catalog search is removed; marketplace search and filters remain available.

Mobile marketplace controls keep price filtering, sorting and item count on one
row beneath search. Price panels use side-by-side sliders and one scrolling row
of presets; an active range can remain applied while the panel is closed. Sort
controls use SVG icons rather than emoji. Category selection changes immediately
without a native tap flash or trailing animated highlight; keyboard focus is
drawn inside each pill so its horizontal scroll container cannot clip the ring.
