# Latest PineVela update — 6 November 2026

- [Hosting ZIP](web/pinevela-nearby-shops-20261106.zip)
- [Android development APK](android/pinevela-nearby-shops-20261106.apk)
- [Update guide](../docs/nearby-shops-update-2026-11-06.md)
- [Verification summary and hashes](../docs/verification/nearby-shops-2026-11-06/summary.json)

Nearby searches public shops and services, including address-only shops, with
clear exact/approximate pins. A location icon stays visible across desktop/mobile
marketplace categories. Manager room-key buttons wrap without overlap; the
resident/seller selected tab highlight is circular and centered.

The website is deployed, with seven file hashes, Node restart, health, public
index/main-script hashes, live shop search/area APIs and an actual Chrome map
readback verified. A host rollback backup was saved before extraction. The
development APK is installed in place with its app data retained. A normal
emulator reopen retained its exact hash; the live Android map/search check passed
without overflow or runtime exceptions. Separate native evidence is under `android/`.
17 unit checks, 17 real isolated PostgreSQL/HTTP checks and 32 browser scenarios
passed. The browser role checks use local manager/resident fixtures.

This retains unified room login, notification settings, image compression/cache
and preceding navigation changes. The previously verified Auth source files are
unchanged. Both preceding Supabase migrations are already applied.
No new dependency, SQL, environment or private sender-file change is required.
Earlier releases are retained. All packages are in the project folder.
