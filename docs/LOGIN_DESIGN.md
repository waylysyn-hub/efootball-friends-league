# Premium League login — 16 September 2026

The League entrance now uses a cinematic night stadium, charcoal surfaces, champagne-gold accents and a custom shield. A spacious two-column composition pairs the league identity with a focused player-access card; phones and tablets use a single column. The existing local Cairo font carries the Arabic wordmark and signature.

## Implementation

- `league/css/login.css` owns the entrance layout, control states, responsive rules and reduced-motion behavior. Superseded login rules were removed from the shell stylesheets.
- Existing player selection, roster refresh, password visibility, error reporting, loading states and submission remain connected to the same authentication flow.
- Form labels, decorative icon semantics and the keyboard skip link are preserved or improved. The skip link targets the visible form before login and the main content afterward.
- No Supabase schema, account, role, authentication API or deployment changes are included in this follow-up.

## Review evidence

- The existing security and Node/PGlite suite passed **25/25** after the markup, styles and skip-link changes. The final adjustment only compacts the desktop layout at shorter viewport heights; CI reruns the full existing suites on this commit.
- The login fixture passed all **seven widths: 1920, 1366, 1024, 768, 430, 390 and 360** with no reported application JavaScript errors or horizontal overflow. Measurements wait for font loading. See [login-responsive.json](login-responsive.json).
- Desktop, laptop, tablet and phone layouts were visually inspected. At 1366 × 768 the header, full card and footer fit the viewport; the mobile submit button is visible at both 390 × 844 and 360 × 844.
- Review captures: [desktop, 1366 × 768](screenshots/login-desktop.jpg) and [phone, 390 × 844](screenshots/login-mobile.jpg). These use synthetic test fixtures and contain no production conversations or credentials.
- Real-account authentication and migration rollout retain the existing release gates in [VALIDATION.md](VALIDATION.md).

## Background asset provenance

- Final asset: `league/assets/login-stadium.webp` (1536 × 1024; 1,328,158 bytes).
- Generation mode: the built-in image generation tool; a newly generated image, with no input/reference images and no existing artwork edited.
- The generated PNG was re-encoded as lossless WebP. No pixel resizing, retouching or compositing was applied to the file. Responsive cropping and overlays are implemented in CSS.
- Original generated output: `/workspace/scratch/3c8440c9be87/generated_images/exec-945a0f8e-61d7-464e-aec1-457a609ec370.png`.

Full generation prompt:

> Use case: photorealistic-natural. Asset type: a cinematic background photograph for the premium login page of a private eFootball friends league called Majles Al-Kibbar. Generate ONLY the photographic scene, no interface, no text. Landscape composition 1536 x 1024. A magnificent EMPTY football stadium at night, viewed from low pitch level with an authentic black and warm-ivory football in the lower left/center foreground, around x=40%, y=78%, not cropped. Realistic fine leather texture and subtle dew. Moody charcoal-black atmosphere, slightly desaturated dark olive turf, restrained champagne-gold floodlights along the distant grandstand, fine atmospheric haze and subtle beams, deep cinematic shadows, warm rim lighting on the ball. Top half must be mostly dark negative space suitable for overlaying large white typography. Rightmost quarter fades naturally toward near black to accommodate a separate web form. The ball and field details are mainly in the lower half. Understated luxury sports editorial photography, sophisticated, photoreal, beautifully composed, no people, no trophy, no logos, no advertising, no words, no watermarks, no neon, no UI. High detail and premium campaign quality.
