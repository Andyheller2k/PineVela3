# Supabase authentication emails

`confirm-signup.html` sends the Supabase-generated numeric code through
`{{ .Token }}`. It contains no registration or confirmation links. Keep email
confirmation enabled. Signup accepts Supabase's supported six-to-ten-digit codes,
preserves leading zeroes, and ignores whitespace introduced when copying a code.
The full code is always verified by Supabase before PineVela creates a session.

The signup screen offers **Resend code** after a five-minute countdown. The
backend also applies this wait to signup and resend requests using Supabase's
persisted confirmation-email timestamp, including across app restarts. Resending
uses the existing signup-confirmation flow and never creates a session. For the
same minimum interval on direct Auth API requests, set the hosted project's
email sending minimum interval (`smtp_max_frequency`) to `300` seconds too.
The app does not change that hosted setting.

Set the SMTP sender name to `PineVela` and sender email to
`noreply@auth.pinevela.app`. These are hosted project settings, independent of the
HTML template. A received message from the default `mail.app.supabase.io` sender
does not establish that custom SMTP is active for the request that sent it.

Before using the template, create a new public Supabase Storage bucket named
`branding` in project `bivajljcdeofyxzmplxm`. Upload the owner's supplied
`/home/wyse/Documents/PineVelatrans.png` as `pinevela-logo.png` at its root.
This bucket is for public brand assets only; keep existing application buckets
private. No public upload/write policies are required for a dashboard upload.

Open the image's public URL in a signed-out browser to check anonymous access.
The template uses that exact HTTPS URL. This file does not create the bucket,
upload the image, or change hosted Auth settings.

In Supabase Authentication's Confirm sign up template, set the subject to
`Your PineVela verification code` and paste the complete HTML file as the body.
Save, then test an actual signup to an owned inbox. Verify the image, numeric
code, successful confirmation, and rejection of an already-used code. Some mail
clients block remote images; the verification code remains readable as text.

For password recovery, open **Supabase → Authentication → Email Templates →
Reset password** in this same project. Set the subject to
`Your PineVela password recovery code`, replace the entire body with
`reset-password.html`, and save. This template uses only `{{ .Token }}` for the
recovery proof: it has no reset link or clickable action. The public logo URL
and yellow/deep-blue branding match the signup email. Updating a repository
file alone does not change the hosted email template.

Request a new recovery email from PineVela after saving. Enter its full numeric
code in **Recovery code**, then enter and confirm the new PineVela email
password. Use the latest email; previous emails retain the template used when
they were sent. Test the flow with an owned inbox and confirm an incorrect or
already-used code is rejected. The code must be verified by Supabase before a
password can change. This flow does not change a Google password or portal PIN.

References:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/storage/serving/downloads
