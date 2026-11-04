# Manager dashboard approved-status label — 4 November 2026

The manager overview no longer shows the “Official Accredited Residence • Live & Active” badge when a property is approved. Setup-required and review-pending notices remain visible when relevant. Property approval and access rules are unchanged.

This package includes the manager dashboard database-timeout fix already verified on `pinevela.app`: the live `/api/manager/my-hostel` request returned HTTP 200 in about 3.3 seconds on first load and 3.4 seconds on its scheduled refresh, and the dashboard rendered without a retry screen or skeleton. The new label change was checked locally with TypeScript, focused manager tests, production web/mobile builds, and a residual text search. After installation, the live dashboard showed the approved property without that label, while `/api/manager/my-hostel` still returned HTTP 200 in about 3.3 seconds.

Back up the existing `dist-supabase` and `dist-supabase-backend` hosting folders, extract the web ZIP into `pinevela-app`, and restart the Node app. No SQL migration is needed. The matching debug APK can be installed over PineVela Development for Android testing. Roll back by restoring those folders and restarting, then reinstalling the previous APK if needed.
