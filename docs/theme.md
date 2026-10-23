# Personal appearance

The current references are `color.jpeg`, `the prototype.jpg`, `lightmode .jpg`
and `dark mode.jpg`. The core palette is ink `#000814`, deep navy `#001D3D`,
blue `#003566`, yellow `#FFC300`, and gold `#FFD60A`.

Landing and login/signup have one fixed navy/yellow appearance, with no theme
controls or sun/moon environment. Product preferences do not change these pages,
their shared notices, or body-portaled dialogs. The landing uses navy
catalog/story panels, alternating gold sections, and a gold shape behind the
existing brand illustration. Login uses a blue/yellow background, navy card and
fields, gold headings and actions. Its fitted card geometry and independent
mobile photograph are preserved. Real photographs retain their original colors.

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
Dark mode uses solid deep blue `#001D3D` for the canvas, cards, fields, navigation,
dialogs and other non-yellow surfaces, with gold headings and selective gold
feature panels. It has no stars, moon or atmosphere. Borders, spacing and shadows
separate surfaces. Success, error and warning ink/icons still identify actual states; Google retains
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
Dark sign-out confirmations and the shared mobile More dialog keep translucent
scrims with 12px blur, so the dashboard remains visible behind them. Sign-out,
cancel and menu controls have distinct gold hover, keyboard-focus and pressed
states; the More trigger stays highlighted while its dialog is open.

Gold action gradients pair with navy labels through `--pv-on-action`; inverse
feature-card actions use the navy/gold pair. Headings use blue/navy on white and
gold on navy; high contrast and forced colors use solid accessible ink.
The guidelines draw on [Material color roles](https://m3.material.io/styles/color/the-color-system),
[Nielsen's visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/),
and [minimalist design](https://www.nngroup.com/articles/aesthetic-minimalist-design/).
Contrast targets follow [WCAG text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

`ThemeProvider` owns the product preference and applies a separate effective
appearance for the current route. `data-appearance="public"` fixes public pages
at document level, including portals, while retaining the saved product mode.
`ThemeEnvironment`, `ThemeToggle` and `src/theme.css` provide the light-product
atmosphere, product switch and existing-surface adaptation.
Page surfaces switch in one paint; existing utility transitions are suppressed for two
animation frames. Decorative layers use short 180 ms transitions. The shared
settings switch uses Lucide sun/moon icons, a yellow thumb and a navy night track.
Its thumb slides over 380 ms while the icons rotate, scale and cross-fade over
200–340 ms; rapid changes reverse smoothly without timers or remounting icons.
The 84 by 44 pixel control keeps keyboard focus, a named switch state and
reduced-motion/forced-color support across desktop, tablet and mobile settings.
The app supplies the primary `--pv-canvas` background: fixed navy on login/landing,
white/blue on light product screens, and solid deep blue on dark product screens.
Route canvases and the mobile login backdrop stay transparent.
Decorative PineVela background
logos are removed; header branding and content photographs remain. The landing
welcome area uses a solid deep-blue `#001D3D` background. A shallow curved bottom
edge separates it from the catalogs without changing their layout. The welcome
heading and supporting copy use larger responsive sizes, with extra space above
the hero Login action. Navy/gold
gradients and responsive rounded section boundaries soften the company transitions.
The landing and login headers, search fields and navigation keep their fixed
navy/yellow treatment. Reduced-motion users get
the same theme and readable surfaces without travel, breathing or transition effects.

Mobile product headers sit flush with the page on white surfaces with navy text
and controls in light mode, without rounded card edges, borders, blur, or shadows.
Dark product headers and public navigation retain their navy surfaces.

The effective route appearance is applied in the document head before React renders.
Product pages restore the last device mode. Each
authenticated account caches its own mode and saves it through `GET/PUT
/api/auth/appearance`. Only `theme: light | dark` is accepted. Server session identity
selects the record; matching email addresses never combine preferences. New accounts
inherit the current device product preference. Logout retains that preference for
future product visits while landing/login stay fixed. Failed writes remain cached across reloads and retry when the connection
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
at desktop/mobile widths in both themes. Isolated source-component checks use
no accounts or API responses;
they verify styling, geometry, focus and dismissal rather than full enrollment.

Mobile portals use at most five primary navigation choices and group secondary destinations in a named More dialog. Appearance controls live in each portal's Settings, Options, or Profile area, with no floating, navigation, or map/storefront theme switches. Selected tabs use gold fills and navy labels in both themes. The measured navigation height, including safe-area padding, reserves room in the scrolling content and raises the seller’s add button above it. Desktop seller navigation includes the Subscription label and selected state.

The primary-user dashboard uses Home, Purchases, Room, Options and Ask AI in its
mobile/tablet bar; Alerts stays directly accessible through the header bell.
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

Login/signup cards fit the viewport with height-aware spacing and compact field
grids on short screens. They have no scrolling form pane. The signup phase banner
is removed. The mobile illustration is fixed independently of the cards.
Short landscape layouts place password-strength feedback beside its field label.

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

Shared public headers keep the fixed navy/yellow appearance with no theme switch.
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
share the login/signup card's translucent navy surface, 18px backdrop blur,
yellow edge and inset highlights. Existing dimensions and active yellow tabs
stay intact. In light mode, mobile top headers use translucent white with navy
text and a yellow bottom line, retaining their flat, edge-to-edge layout.
Public landing headers retain their separate appearance. Forced-colors mode
uses system surfaces without blur or decorative shadows.

The mobile Ask AI destination has no decorative yellow rectangle or filled tile.
An open chat uses yellow icon/text on a transparent background; keyboard focus,
the notification badge and other selected navigation destinations are preserved.

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
