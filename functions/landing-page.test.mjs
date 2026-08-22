/**
 * Tests for the browser-facing landing page.
 *
 * Run with: node --test functions/landing-page.test.mjs
 *
 * The page itself is one screen of text, and whether it looks right is
 * answered by opening it. What is worth pinning down is that `note` cannot
 * escape into markup -- it is built from the path a request asked for, so it
 * is attacker-controlled -- and that the page keeps pointing at the portal,
 * which is the only reason it exists.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

// The module under test is CommonJS, because the functions runtime is.
const require = createRequire(import.meta.url);
const { DEVELOPER_PORTAL_URL, escapeHtml, landingPage } =
  require('./landing-page.js');

describe('escapeHtml', () => {
  it('neutralises every character that could break out', () => {
    assert.equal(
      escapeHtml(`<script>alert("x")&'`),
      '&lt;script&gt;alert(&quot;x&quot;)&amp;&#39;',
    );
  });

  it('escapes the ampersand before anything else', () => {
    // Replacing < first and & second would turn "&lt;" back into "&amp;lt;",
    // which renders as literal text instead of a tag. Getting this backwards
    // is the classic double-escaping bug.
    assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  });

  it('handles values that are not strings', () => {
    assert.equal(escapeHtml(0), '0');
    assert.equal(escapeHtml(null), 'null');
    assert.equal(escapeHtml(undefined), 'undefined');
  });
});

describe('landingPage', () => {
  it('is a complete document', () => {
    const html = landingPage('Wrong door.', null);
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /<html lang="en">/);
    assert.ok(html.trimEnd().endsWith('</html>'));
  });

  it('has exactly one h1, and it is the heading', () => {
    const html = landingPage('This is an API endpoint, not a website.', null);
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.match(html, /<h1>This is an API endpoint, not a website\.<\/h1>/);
  });

  it('always points at the developer portal', () => {
    // The entire purpose of the page. If this link goes, someone who lands
    // here has been told they are in the wrong place and nothing else.
    const html = landingPage('Wrong door.', null);
    assert.ok(html.includes(`href="${DEVELOPER_PORTAL_URL}"`));
    assert.ok(DEVELOPER_PORTAL_URL.startsWith('https://'));
  });

  it('keeps itself out of search results', () => {
    assert.match(landingPage('Wrong door.', null), /name="robots" content="noindex"/);
  });

  it('escapes a heading', () => {
    const html = landingPage('<script>alert(1)</script>', null);
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('escapes a note, which is built from the request path', () => {
    // What a request to /"><script>... would produce.
    const hostile = 'GET /"><script>alert(document.domain)</script>';
    const html = landingPage('That is not an endpoint on this API.', hostile);

    assert.ok(!html.includes('<script>alert(document.domain)</script>'),
      'the note was interpolated without escaping');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&quot;&gt;'), 'the quote and bracket must both go');
  });

  it('leaves the note out entirely when there is none', () => {
    const html = landingPage('Wrong door.', null);
    assert.ok(!html.includes('<code>'));
    assert.ok(!html.includes('class="note"'));
  });

  it('shows the note when there is one', () => {
    const html = landingPage('Wrong door.', 'GET /oscars/year=2024');
    assert.match(html, /<code>GET \/oscars\/year=2024<\/code>/);
  });
});

describe('the shared design', () => {
  it('uses the palette developer.uractor.com uses', () => {
    // This page dresses as the portal, not as uractor.com, because the portal
    // is where it sends people. These tokens are copied from the portal's
    // stylesheet and are the contract between the two hosts.
    const html = landingPage('Wrong door.', null);
    for (const token of ['#131315', '#f0705a', '#ece9e3']) {
      assert.ok(html.includes(token), `missing ${token}`);
    }
  });

  it('carries the portal mark rather than linking one', () => {
    // A function response with no-store has nothing to cache, and a favicon
    // request to this host would be answered by the 404 handler, which
    // renders this page again.
    const html = landingPage('Wrong door.', null);
    assert.ok(html.includes('data:image/svg+xml,'));
    assert.ok(!/src="https?:/.test(html),
      'nothing here may be fetched from another origin');
  });

  it('shows no logo image and no wordmark', () => {
    // The portal has a masthead, a wordmark and a nav because it is a site
    // you navigate. This is one sentence telling you that you are not on it,
    // and an app icon above that sentence was reading as branding for a page
    // whose whole job is to send you somewhere else.
    const html = landingPage('Wrong door.', null);
    assert.equal(html.match(/<img\b/g), null, 'no image belongs on this page');
    assert.equal(html.match(/<header\b/g), null, 'no masthead belongs on this page');
  });

  it('loads no fonts', () => {
    // The portal uses system stacks. Matching it means this page fetches
    // nothing at all, which for an endpoint's error page is the point.
    const html = landingPage('Wrong door.', null);
    assert.ok(!html.includes('fonts.googleapis.com'));
    assert.ok(!html.includes('fonts.gstatic.com'));
  });

  it('needs no JavaScript', () => {
    const html = landingPage('Wrong door.', 'GET /nope');
    assert.equal(html.match(/<script\b/g), null);
  });
});
