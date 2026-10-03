# S19 remediation — 2026-10-02

The current upload/serving path no longer accepts or publishes arbitrary submitted bytes.
The original audit evidence remains historical. Changes are limited to photograph upload,
serving, registration error handling, configuration and security tests/documentation.

## Implementation

- Required JPEG/PNG/WebP MIME declaration, strict base64 and matching raster signatures.
  Full Sharp decoding rejects malformed images, excessive dimensions and animated WebP;
  fresh lossless PNG output preserves resolution and strips metadata/trailing content.
  SVG, HTML and other document formats are excluded before decoder invocation.
- Generated UUID `.png` names and exclusive writes replace client-selected paths/extensions.
  Input, output, pixel, dimension and processing-time limits bound image processing.
- Raw static `/uploads` serving is removed. Every successful photo response is freshly
  decoded PNG with `nosniff`, sandbox CSP, frame protection and no-store. Legacy safe photo
  URLs remain usable; historical originals are preserved privately. Other files, directories,
  invalid rasters and links outside the storage root return 404 rather than the SPA shell.
- Vite's raw-file server denies the upload directory in development, preserving its default
  secret-file exclusions.
- A distinct media origin is configurable. App-host requests redirect to it, and that
  hostname is restricted to upload paths. Production HTTPS/proxy configuration is still a
  deployment step; no separate production hostname was configured or deployed in this task.
  The local default remains usable offline and exposes sanitized PNG output only.
- Property registration surfaces upload failures instead of falling back to the submitted
  preview. Existing role and manager-approval checks remain enforced.

Decoder configuration uses [Sharp's untrusted-input guidance](https://sharp.pixelplumbing.com/api-constructor/)
with strict failure handling and pixel limits. Sharp 0.35.5 is pinned in dependency files.

## Verification

Three unit cases passed, covering valid JPEG/PNG/WebP, preserved dimensions, metadata and
appended-content removal; spoofed/missing MIME, HTML/SVG, invalid base64, corrupt rasters,
oversized input/dimensions and animation; and media-origin configuration validation.

The isolated API integration passed authorized admin/manager uploads; anonymous, primary,
merchant and pending-manager denial; no files from rejected uploads; safe generated paths;
legacy photo sanitization; blocked HTML/SVG/disguised files and outside symlinks; response
headers; persistence across restart; actual separate loopback-origin serving/redirects;
and refusal to serve API routes on the media host. A subsequent development-server run
confirmed that Vite raw-file URLs return 403 for both stored photographs and HTML files,
while protected photograph URLs remain usable. All images/accounts were disposable test
fixtures. Operational uploads, database records and credentials were not modified.

The full security regression suite passed: 64 tests, zero failures. The expanded S19
integration test also passed independently after adding the development raw-file checks.
TypeScript checking, the production frontend/server build and private-data tracking check
passed. The build retains its existing large-chunk advisory.
