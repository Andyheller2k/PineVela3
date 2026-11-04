# Native bundle fonts

These unmodified Latin-subset variable WOFF2 files are bundled locally for the Android UI so rendering does not depend on Google Fonts network requests. The source stylesheet is retained for provenance only; do not import it into the app.

Downloaded on 2026-10-29 from the official Google Fonts stylesheet and fonts.gstatic.com. Exact URLs, sizes and SHA-256 checksums are recorded in `sources.json`. Original SIL Open Font License 1.1 notices are included separately for each family, from the pinned google/fonts repository commit recorded there. Keep the license notices with redistributed copies.

| Family | Weights provided | File |
| --- | --- | --- |
| Outfit | 300–900 | `outfit-latin-variable.woff2` |
| Plus Jakarta Sans | 300–800 | `plus-jakarta-sans-latin-variable.woff2` |
| JetBrains Mono | 400–500 | `jetbrains-mono-latin-variable.woff2` |

All files are upright/normal style. Plus Jakarta Sans does not provide weight 900 in Google Fonts; 800 is its maximum actual supported weight. The Latin subsets include basic Latin, common punctuation and the ranges documented in the source stylesheet. Other scripts use the UI's fallback fonts. Existing Caviar Dreams and Childer login/wordmark fonts remain under `assets/fonts/` and are already served locally.
