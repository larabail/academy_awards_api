/**
 * The one page this host serves to a human.
 *
 * api.uractor.com is an API and nothing else, but people do paste it into a
 * browser. The routes in index.js negotiate on Accept: JSON for clients, this
 * for browsers. It exists to say "wrong door" and point at the portal, in the
 * same design as uractor.com and downloads.uractor.com, so that being in the
 * wrong place still looks like being somewhere.
 *
 * Kept out of index.js because that file cannot be loaded without credentials
 * -- it initialises firebase-admin at import time -- and this is pure string
 * building. Here it is testable, which matters: `note` carries the path the
 * request asked for, so it is attacker-controlled text going into HTML.
 *
 * Self-contained on purpose. It is a function response with `Cache-Control:
 * no-store`, so there is no stylesheet to cache and nothing to link to; the
 * mark is an inline SVG rather than a file for the same reason, and because a
 * favicon request to a 404 handler answering another 404 is a silly loop.
 */

'use strict';

const DEVELOPER_PORTAL_URL = 'https://developer.uractor.com/';

/** The shared palette. Also in uractor.com and downloads.uractor.com. */
const BLACK = '#08090A';
const BONE = '#F2EFE6';
const GOLD = '#E4B462';
const DIM = '#8C8880';
const EDGE = '#5C5E62';
const FAINT = '#2E3033';

/**
 * The app icon: a film strip around a star. Drawn rather than linked, so this
 * page depends on nothing it does not carry.
 */
const MARK =
  "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2032%2032%27%3E" +
  "%3Crect%20width=%2732%27%20height=%2732%27%20rx=%277%27%20fill=%27%2308090A%27/%3E" +
  "%3Cg%20fill=%27%23F2EFE6%27%3E" +
  "%3Crect%20x=%273%27%20y=%275%27%20width=%273%27%20height=%273%27%20rx=%27.7%27/%3E" +
  "%3Crect%20x=%273%27%20y=%2711%27%20width=%273%27%20height=%273%27%20rx=%27.7%27/%3E" +
  "%3Crect%20x=%273%27%20y=%2717%27%20width=%273%27%20height=%273%27%20rx=%27.7%27/%3E" +
  "%3Crect%20x=%273%27%20y=%2723%27%20width=%273%27%20height=%273%27%20rx=%27.7%27/%3E" +
  "%3Crect%20x=%2726%27%20y=%275%27%20width=%273%27%20height=%273%27%20rx=%27.7%27/%3E" +
  "%3Crect%20x=%2726%27%20y=%2711%27%20width=%273%27%20height=%273%27%20rx=%27.7%27/%3E" +
  "%3Crect%20x=%2726%27%20y=%2717%27%20width=%273%27%20height=%273%27%20rx=%27.7%27/%3E" +
  "%3Crect%20x=%2726%27%20y=%2723%27%20width=%273%27%20height=%273%27%20rx=%27.7%27/%3E" +
  "%3C/g%3E" +
  "%3Cpath%20d=%27M16%207.4l2.7%205.5%206.1.9-4.4%204.3%201%206.1-5.4-2.9-5.4%202.9%201-6.1-4.4-4.3%206.1-.9z%27%20fill=%27%23E4B462%27/%3E" +
  "%3C/svg%3E";

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
<meta name="theme-color" content="${BLACK}">
<link rel="icon" href="${MARK}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400&display=swap">
<style>
:root{--black:${BLACK};--bone:${BONE};--gold:${GOLD};--dim:${DIM};--edge:${EDGE};--faint:${FAINT};
--mono:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
--sans:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
--disp:'Big Shoulders Display','Arial Narrow',Impact,sans-serif;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}*{margin:0;padding:0}
body{min-height:100vh;display:grid;place-items:center;padding:2rem;
background:var(--black);color:var(--bone);font-family:var(--sans);font-weight:300;line-height:1.65;
-webkit-font-smoothing:antialiased}
main{max-width:32rem;text-align:center;position:relative}
/* The sprocket margins from uractor.com, at the scale of one small page. */
main::before,main::after{content:"";position:absolute;top:0;bottom:0;width:8px;
background-image:repeating-linear-gradient(to bottom,var(--bone) 0 9px,transparent 9px 27px);
opacity:.13}
main::before{left:-30px}main::after{right:-30px}
@media(max-width:640px){main::before,main::after{display:none}}
img.mark{width:72px;height:72px;margin:0 auto 26px;display:block;border-radius:16px}
p.slate{font-family:var(--mono);font-size:10.5px;letter-spacing:.24em;text-transform:uppercase;
color:var(--dim);padding-bottom:12px;margin-bottom:24px;border-bottom:1px solid var(--faint)}
p.slate b{color:var(--gold);font-weight:500}
h1{font-family:var(--disp);font-weight:800;text-transform:uppercase;font-size:clamp(30px,7vw,52px);
line-height:.9;letter-spacing:-.01em}
p.lede{margin-top:20px;color:#CFCAC0;font-size:16.5px}
a{color:var(--gold);text-decoration:none;border-bottom:1px solid var(--faint)}
a:hover{border-color:var(--gold)}
a:focus-visible{outline:2px solid var(--gold);outline-offset:4px;border-radius:2px}
p.note{margin-top:26px;padding-top:18px;border-top:1px solid var(--faint)}
code{font-family:var(--mono);font-size:12.5px;letter-spacing:.02em;color:var(--dim);
overflow-wrap:anywhere}
@media(prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;transition-duration:.001ms!important}}
</style>
</head>
<body>
<main>
<img class="mark" src="${MARK}" alt="" width="72" height="72">
<p class="slate">UrActor <b>&middot;</b> Academy Awards API</p>
<h1>${escapeHtml(heading)}</h1>
<p class="lede">Documentation and API keys live at
<a href="${DEVELOPER_PORTAL_URL}">developer.uractor.com</a></p>${detail}
</main>
</body>
</html>`;
}

module.exports = { DEVELOPER_PORTAL_URL, escapeHtml, landingPage };
