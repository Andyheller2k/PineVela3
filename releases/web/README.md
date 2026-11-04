# Saved PineVela hosting updates

The update ZIPs are kept here as well as in `/tmp/`, so temporary-folder
cleanup will not erase it. ZIP binaries are ignored by Git; include this folder
in project backups. Follow `README-INSTALL.txt` inside the ZIP and the
[latest screen fit and Google notes](../../docs/android-screen-fit-google-update-2026-11-01.md).

Latest: `pinevela-landing-parallax-20261104.zip` (web frontend only).
Back up and replace `dist-supabase` as described in its `README-INSTALL.txt`.
Earlier: `pinevela-android-screen-fit-20261101.zip`,
`pinevela-catalog-image-cache-20261031.zip`,
`pinevela-seller-subscriptions-20261031.zip`,
`pinevela-mobile-ui-update-20261031.zip` and `pinevela-seller-update-20261030.zip`.

Extract into the existing `pinevela-app` root, preserve environment/private data,
and restart the existing Node app. Packaging does not deploy anything remotely.
Use `sha256sum -c SHA256SUMS.txt` in this folder to check the archive.
