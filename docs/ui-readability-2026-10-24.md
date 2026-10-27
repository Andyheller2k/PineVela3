# Glass and product typography — 24 October 2026

Login and signup cards use a translucent 62–68% navy tint that protects normal
text contrast even if the browser cannot paint backdrop filters. Phone/tablet
cards (below 1024px) use 1.5px optional blur; desktop uses 6px. The fixed portrait
remains visible without fading text, buttons or the entire card. Fields and
actions retain stronger navy surfaces; shared navigation keeps its material.
Yellow edges, scrollable card geometry and instant form switching are preserved.

The background tint bounds light text contrast even over the portrait's white
shirt. Browsers without backdrop-filter support, reduced-transparency settings
and higher-contrast preferences receive a stronger card. Placeholders alone use
muted slate (#94a3b8) and regular weight; entered text and labels retain their
normal stronger ink. Existing example wording, including “e.g.”, is preserved.

Product headings use 800-weight solid text; form labels, table headings and
navigation actions use 700 weight. Product FAQ/Help headings use the app's sans-
serif typeface. Public display gradients and brand wordmarks are unchanged.

## Verification and update

The preceding navigation candidate passed 257 guest browser checks across 55 scenes. Both forms
were checked at seven viewport sizes for distinct computed placeholder styles,
reachable controls, bright-backdrop status-text contrast, stable scrolling and
fixed portrait position. Reduced-transparency fallback also passed. No signup
or CAPTCHA submission was performed by this layout audit.

Prior TypeScript, relevant lifecycle/appearance and companion checks, actual admin
theme/scroll checks, and actual user companion-close checks passed within their
reported scopes. See the [earlier follow-up report](ios-chrome-glass-followup-2026-10-24.md)
for that evidence and iOS limitations.

The [browser-rendering investigation](auth-browser-rendering-2026-10-24.md)
contains the 207-check auth audit, including filter-disabled contrast tests,
display-mode parity and font findings. The [product mobile-layout update](product-mobile-layout-2026-10-24.md)
contains the latest upload package and subsequent product/header checks.
Remote installation has not been performed by the agent.
