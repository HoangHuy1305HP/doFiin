# doFiin frontend / Figma reference

Design: https://www.figma.com/design/IxKrGVeRozzDYMJTYCe9SU/doFiin-Screen-Designs

The reference uses the English native SVG sources and Studio v2 supplied by the previous design workflow. The live Portfolio frame and the 45 frame names were checked read-only in Chrome Tuan Thanh on 26 October 2026. The Figma connector is signed into a different account and cannot read this file; no Figma content was changed.

## Tokens and typography

`web/src/tokens.css` defines palette, font families, semantic text sizes, spacing, radii, sidebar width and page gutters. `web/src/design.css` applies these to the existing application components. Fonts are packaged locally via Fontsource (Geist and Space Grotesk, regular and bold, Latin and Vietnamese). `figma-reference.json` records frame dimensions and typography sampled directly from the original SVG text layers; Studio entries use v2 sources.

Reference sizes include Portfolio heading 47.52px desktop / 27.455px tablet / 32px mobile, other analytics headings 42px desktop / 32px mobile, card titles 18px, body 16px, captions 11px, primary portfolio KPI 52px desktop / 43px mobile. Figma SVG text uses zero tracking. The auth illustration and Google symbol are local SVG assets from the original design source; illustration fonts are embedded so an SVG image cannot fall back to a system font.

## Verification

Run the Vite server (`npm run dev` in `web`), then `npm run verify:figma`. It renders the 30 standard screen/device combinations plus 15 Studio combinations. Studio uses 1600×1100 desktop, 1194×834 tablet and 390×844 mobile viewports. It checks font loading, heading family/weight, Portfolio title sizes, horizontal overflow, asset loading, Appearance/Function, menu editing and saved presentation preferences after reload. Screenshots and the JSON report are generated in ignored `web/.verify/figma/`.

This is a rendering/interaction audit with deterministic API fixtures, not a pixel-diff certification against all live Figma frames or a production backend test.

## Functional differences from the mockups

- Financial results remain calculated by the existing API. Its signal windows (20/50), risk-free rate, backtest configuration, costs and factor coverage differ from the illustrative Figma content. No financial model was silently changed to make sample numbers match.
- The Factors API supplies asset beta and 12–1 momentum; it does not supply the SPY/QQQ/IWM/VIX proxy regression shown in the design. Existing additional analysis controls and widgets remain available.
- Navigation order, chart accent, legend visibility and corner radius save per account in this browser. Widget layout saves through the existing layout API. Presentation preferences do not yet synchronize to other devices.
- Google OAuth, password recovery and editable account profile have no existing API. Their availability is stated in the interface. Email login/registration, demo entry and sign-out use the existing API.
- Account currency reflects the actual USD analysis data rather than implying a VND conversion that the API does not perform. The product-update toggle is explicitly a preference on this device; it does not claim to change an email subscription.
