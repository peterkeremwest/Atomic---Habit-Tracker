// Links (v0.2.5): web addresses inside item text, and a list's own link.
import assert from 'node:assert/strict';
import { cleanUrl, parseQuickAdd } from '../public/js/model.js';
import { linkify } from '../public/js/ui.js';

// cleanUrl: only http(s) ever gets through
assert.equal(cleanUrl(''), ''); assert.equal(cleanUrl('   '), '');
assert.equal(cleanUrl('https://store.com/list/1'), 'https://store.com/list/1');
assert.equal(cleanUrl('store.com/list'), 'https://store.com/list');
assert.equal(cleanUrl('www.store.com'), 'https://www.store.com');
assert.equal(cleanUrl('  http://a.co/x?y=1&z=2#top '), 'http://a.co/x?y=1&z=2#top');
for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.com', 'not a link', 'hello', 'https://', 'x'.repeat(600)]) assert.equal(cleanUrl(bad), null, bad);

// linkify: links become anchors, everything else stays escaped text
let h = linkify('buy at https://store.com/a?x=1&y=2 today');
assert.match(h, /<a class="ilink" href="https:\/\/store\.com\/a\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">store\.com\/a\?x=1&amp;y=2<\/a> today/);
assert.match(linkify('see www.example.org.'), /href="https:\/\/www\.example\.org"[^>]*>www\.example\.org<\/a>\.$/); // trailing full stop stays outside
assert.match(linkify('(https://a.com/x)'), /\(<a [^>]*>a\.com\/x<\/a>\)/);
assert.match(linkify('"https://a.com" quoted'), /&quot;<a [^>]*href="https:\/\/a\.com"[^>]*>a\.com<\/a>&quot; quoted/);
assert.equal(linkify('plain <b>text</b> & more'), 'plain &lt;b&gt;text&lt;/b&gt; &amp; more');
assert.ok(!/<a /.test(linkify('javascript:alert(1) and ftp://x.com')), 'only http(s) and www. are linked');
assert.ok(!/<script/.test(linkify('https://x.com/"><script>alert(1)</script>')), 'no markup gets through');
assert.match(linkify('https://example.com/' + 'a'.repeat(80)), /…<\/a>/); // long addresses are shortened on screen

// a web address typed into the typing box keeps its #fragment (it is not read as a #category)
let p = parseQuickAdd('#shared errands: milk, see https://site.com/page#section1', [], []);
assert.equal(p[0].kind, 'shared'); assert.deepEqual(p[0].items, ['milk', 'see https://site.com/page#section1']);
p = parseQuickAdd('#list shopping: https://store.com/#/cart, soap', [], []);
assert.equal(p[0].kind, 'list'); assert.equal(p[0].items[0], 'https://store.com/#/cart'); assert.equal(p[0].newCategory, null);
p = parseQuickAdd('call mom #family', [], []); assert.equal(p[0].newCategory, 'Family'); // real tags still work
console.log('link tests passed');
