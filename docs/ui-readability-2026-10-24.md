# Glass and product typography — 24 October 2026

Phone/tablet login and signup cards (below 1024px) use a 5–9% navy tint with
1.5px backdrop blur, saturation and backdrop-only brightness of .445. This exposes
more of the original fixed portrait without fading text, buttons or the entire card.
Fields and actions retain stronger navy surfaces. Desktop cards use a
34–40% navy tint, 6px blur and backdrop-only brightness of .63; shared navigation
keeps its existing material.
Yellow edges, scrollable card geometry and instant form switching are preserved.

The backdrop dimming bounds light text contrast even over the portrait's white
shirt. Browsers without backdrop-filter support, reduced-transparency settings
and higher-contrast preferences receive a stronger card. Placeholders alone use
muted slate (#94a3b8) and regular weight; entered text and labels retain their
normal stronger ink. Existing example wording, including “e.g.”, is preserved.

Product headings use 800-weight solid text; form labels, table headings and
navigation actions use 700 weight. Product FAQ/Help headings use the app's sans-
serif typeface. Public display gradients and brand wordmarks are unchanged.

## Verification and update

The current candidate passed 257 guest browser checks across 55 scenes. Both forms
were checked at seven viewport sizes for distinct computed placeholder styles,
reachable controls, bright-backdrop status-text contrast, stable scrolling and
fixed portrait position. Reduced-transparency fallback also passed. No signup
or CAPTCHA submission was performed by this layout audit.

Prior TypeScript, relevant lifecycle/appearance and companion checks, actual admin
theme/scroll checks, and actual user companion-close checks passed within their
reported scopes. See the [earlier follow-up report](ios-chrome-glass-followup-2026-10-24.md)
for that evidence and iOS limitations.

Use the [consolidated merchant and navigation report](merchant-navigation-ui-2026-10-24.md)
for the latest upload package and its verification scope.
Remote installation has not been performed by the agent.
