import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import TafsirPanel from '../components/features/quran/TafsirPanel';

// The quran.com tafasir (TAFASEER entries without source: 'cloud') come back as HTML, and
// TafsirPanel renders them through its own sanitizeHtml. That function used to parse the HTML
// in a <div> of the page's own document: there an <img src=x onerror=…> it then removed had
// already started loading, failed, and ran its handler on the site's origin. It now parses in
// a separate document with no window, where no element loads and no on* attribute is ever
// compiled. Only the network boundary (getVerseTafsir) is stubbed here.
const tafsir = vi.hoisted(() => ({ html: '' }));
vi.mock('../api/quran', () => ({
  getVerseTafsir: vi.fn(() => Promise.resolve(tafsir.html)),
  getVerseTafsirCloud: vi.fn(() => Promise.resolve('')),
}));

const ALLOWED = ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'span', 'div', 'sup', 'sub', 'ul', 'ol', 'li', 'blockquote', 'h3', 'h4'];
const IBN_KATHIR = 14; // a quran.com (HTML) tafsir in TAFASEER

async function renderTafsir(html) {
  tafsir.html = html;
  const { container } = render(<TafsirPanel verseKey="2:255" tafsirId={IBN_KATHIR} ui={{}} onClose={() => {}} />);
  await waitFor(() => expect(container.querySelector('.qlc__tafsir-html')).not.toBeNull());
  return container.querySelector('.qlc__tafsir-html');
}

// What a browser does with the elements its HTML parser has just created, without any help from
// the page: an <img> starts loading and fires "error" a moment later, a <details open> fires
// "toggle", and so on. This stand-in records every element each innerHTML assignment creates,
// with the events its on* attributes name at that moment, and fires all of them once the panel
// has rendered, whether or not a real browser would. Like a browser, vitest's jsdom runs the
// on* handlers of elements in the page's document (runScripts: 'dangerously') and never those
// of elements in a document without a window.
const innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
let parsed;

beforeEach(() => {
  parsed = [];
  document.__tafsirRan = [];
  Object.defineProperty(Element.prototype, 'innerHTML', {
    ...innerHTML,
    set(value) {
      innerHTML.set.call(this, value);
      for (const el of this.querySelectorAll('*')) {
        const events = [...el.attributes].filter((a) => a.name.startsWith('on')).map((a) => a.name.slice(2));
        if (events.length) parsed.push({ el, tag: el.localName, events });
      }
    },
  });
});

afterEach(() => {
  Object.defineProperty(Element.prototype, 'innerHTML', innerHTML);
  cleanup();
  delete document.__tafsirRan;
});

function fireParsedEvents() {
  for (const { el, events } of parsed) for (const type of events) el.dispatchEvent(new Event(type));
}

const ran = (what) => `document.__tafsirRan.push('${what}')`;

describe('TafsirPanel: event handlers in a quran.com tafsir never run', () => {
  it('an element the sanitizer removes, such as <img src=x onerror>, cannot run its handler', async () => {
    const out = await renderTafsir(`<p>نص</p><img src="x" onerror="${ran('img onerror')}">`);
    expect(parsed.some((p) => p.tag === 'img' && p.events.includes('error'))).toBe(true);
    fireParsedEvents();
    expect(document.__tafsirRan).toEqual([]);
    expect(out.innerHTML).toBe('<p>نص</p>');
  });

  it('no handler runs from any of these payloads, and the text left is safe', async () => {
    const out = await renderTafsir([
      `<img src="x" onerror="${ran('img onerror')}">`,
      `<svg onload="${ran('svg onload')}"><circle></circle></svg>`,
      `<details open ontoggle="${ran('details ontoggle')}"><summary>ملخص</summary></details>`,
      `<video><source onerror="${ran('source onerror')}"></video>`,
      `<iframe onload="${ran('iframe onload')}"></iframe>`,
      `<input autofocus onfocus="${ran('input onfocus')}">`,
      `<p onclick="${ran('p onclick')}">نص</p>`,
      `<span onmouseover="${ran('span onmouseover')}">كلمة</span>`,
      // Read as raw text in a document that runs scripts, so the <img> after it became a real element there.
      `<noscript><p title="</noscript><img src=x onerror=${ran('noscriptImg')}>"></p></noscript>`,
      `<script>${ran('script')}</script>`,
      `<a href="javascript:${ran('a href')}">رابط</a>`,
    ].join(''));

    expect(parsed.length).toBeGreaterThan(0);
    fireParsedEvents();
    expect(document.__tafsirRan).toEqual([]);

    const elements = [...out.querySelectorAll('*')];
    expect(elements.length).toBeGreaterThan(0);
    for (const el of elements) {
      expect(ALLOWED).toContain(el.localName);
      expect(el.attributes).toHaveLength(0);
    }
    expect(out.innerHTML).not.toMatch(/<(?!\/?(p|br|strong|em|b|i|u|span|div|sup|sub|ul|ol|li|blockquote|h3|h4)>)/);
  });
});

describe('TafsirPanel: the same tags are kept and every attribute is removed, as before', () => {
  it.each([
    [
      'the allowed tags, with their attributes removed',
      '<div id="a"><p style="color:red">١</p><br class="b"><strong>٢</strong><em>٣</em><b>٤</b><i>٥</i><u>٦</u><sup>٧</sup><sub>٨</sub><ul><li>٩</li></ul><ol><li>١٠</li></ol><blockquote cite="#c">١١</blockquote><h3>١٢</h3><h4>١٣</h4></div>',
      '<div><p>١</p><br><strong>٢</strong><em>٣</em><b>٤</b><i>٥</i><u>٦</u><sup>٧</sup><sub>٨</sub><ul><li>٩</li></ul><ol><li>١٠</li></ol><blockquote>١١</blockquote><h3>١٢</h3><h4>١٣</h4></div>',
    ],
    [
      'other tags unwrapped, keeping their text',
      '<h2 class="title">تفسير</h2><p>نص <span class="ayah" dir="rtl">آية</span> <a href="#x">رابط</a> <font color="red">لون</font></p><table><tr><td>خلية</td></tr></table>',
      'تفسير<p>نص <span>آية</span> رابط لون</p>خلية',
    ],
    [
      'nested tags unwrapped',
      '<section><article><p>نص</p></article></section>',
      '<p>نص</p>',
    ],
    [
      'comments removed',
      '<p>أ<!-- تعليق -->ب</p>',
      '<p>أب</p>',
    ],
    [
      'escaped text kept escaped',
      '<p>1 &lt; 2 &amp; 3 &gt; 0</p>',
      '<p>1 &lt; 2 &amp; 3 &gt; 0</p>',
    ],
  ])('%s', async (_name, html, expected) => {
    const out = await renderTafsir(html);
    expect(out.innerHTML).toBe(expected);
  });
});
