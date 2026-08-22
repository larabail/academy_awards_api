/**
 * The one page this host serves to a human.
 *
 * api.uractor.com is an API and nothing else, but people do paste it into a
 * browser. The routes in index.js negotiate on Accept: JSON for clients, this
 * for browsers. It exists to say "wrong door" and point at the portal.
 *
 * It is dressed as developer.uractor.com rather than as uractor.com, because
 * the portal is where it is sending people. Someone who follows the link
 * should arrive somewhere that looks like where they just were, and the two
 * hosts are halves of the same product in a way the marketing site is not.
 * The tokens below are copied from the portal's stylesheet and are the
 * contract between them; the type is the portal's system stacks, so this page
 * loads no fonts and depends on nothing it does not carry.
 *
 * There is deliberately no masthead, no wordmark and no logo image. The
 * portal has all three because it is a site you navigate; this is one
 * sentence telling you that you are not on it.
 *
 * Kept out of index.js because that file cannot be loaded without credentials
 * -- it initialises firebase-admin at import time -- and this is pure string
 * building. Here it is testable, which matters: `note` carries the path the
 * request asked for, so it is attacker-controlled text going into HTML.
 */

'use strict';

const DEVELOPER_PORTAL_URL = 'https://developer.uractor.com/';

/**
 * The portal's mark: a serif U on the portal's ground colour.
 *
 * Byte for byte the icon developer.uractor.com serves, so a tab opened here
 * and a tab opened there carry the same thing. Inline because the response is
 * no-store and because a favicon request to this host would be answered by
 * the 404 handler, which renders this page again.
 */
const MARK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E" +
  "%3Crect width='32' height='32' fill='%23131315'/%3E" +
  "%3Ctext x='16' y='24' font-family='Georgia,serif' font-size='22' text-anchor='middle'" +
  " fill='%23f0705a'%3EU%3C/text%3E%3C/svg%3E";

/**
 * [value] as text that cannot close a tag or open an attribute.
 *
 * Applied to everything interpolated below. The heading is ours, but `note`
 * is built from the request, and a path is whatever somebody typed.
 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

/**
 * The page, as a complete HTML document.
 *
 * [heading] is the sentence at the top; [note] is an optional line of
 * monospace under it, usually the request that got here.
 */
function landingPage(heading, note) {
  const detail = note
    ? `\n<p class="note"><code>${escapeHtml(note)}</code></p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>UrActor Academy Awards API</title>
<meta name="robots" content="noindex">
<meta name="theme-color" content="#131315">
<link rel="icon" href="${MARK}">
<style>
:root{
--ground:#131315;--ground-sunken:#0d0d0f;
--paper:#ece9e3;--paper-dim:#a5a19a;--paper-faint:#6f6c67;
--rule:#2b2b30;--rule-strong:#43434a;
--spot:#f0705a;
--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
--serif:ui-serif,"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
--step--1:.833rem;--step-0:1.0625rem;--step-1:1.33rem;--step-3:2.37rem;
--gutter:clamp(1.25rem,4vw,3rem);
color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;align-content:center;
padding:clamp(3rem,9vw,7rem) var(--gutter);
background:var(--ground);color:var(--paper);
font-family:var(--serif);font-size:var(--step-0);line-height:1.7;
-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
main{max-width:68ch;width:100%}
p{margin:0}
.label{display:block;margin:0 0 .6rem;font-family:var(--sans);font-size:.68rem;font-weight:600;
letter-spacing:.16em;text-transform:uppercase;color:var(--paper-faint)}
h1{margin:0 0 .75rem;font-size:var(--step-3);letter-spacing:-.015em;line-height:1.2}
.standfirst{max-width:52ch;margin:0 0 2rem;font-size:var(--step-1);line-height:1.5;
color:var(--paper-dim)}
.btn{display:inline-block;padding:.6rem 1.1rem;border:1px solid var(--paper);border-radius:2px;
background:var(--paper);color:var(--ground);
font-family:var(--sans);font-size:.85rem;font-weight:600;line-height:1.4;text-decoration:none}
.btn:hover{background:#fff;border-color:#fff;color:var(--ground)}
a:focus-visible,.btn:focus-visible{outline:2px solid var(--spot);outline-offset:3px}
.note{margin-top:2rem;padding-top:1.25rem;border-top:1px solid var(--rule)}
code{font-family:var(--mono);font-size:.88em;color:var(--paper-faint);overflow-wrap:anywhere}
</style>
</head>
<body>
<main>
<p class="label">Academy Awards API</p>
<h1>${escapeHtml(heading)}</h1>
<p class="standfirst">Documentation, endpoints and API keys are on the developer portal.</p>
<p><a class="btn" href="${DEVELOPER_PORTAL_URL}">Go to developer.uractor.com</a></p>${detail}
</main>
</body>
</html>`;
}

module.exports = { DEVELOPER_PORTAL_URL, escapeHtml, landingPage };
