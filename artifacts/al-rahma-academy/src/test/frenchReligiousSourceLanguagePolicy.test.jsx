import { describe, it, expect } from 'vitest';
import { useFullPageEnvironment, mountFullPage, bodyStrings } from './utils/fullPageRender';
import Adhkar from '../pages/Adhkar';
import { ADHKAR_TR } from '../i18n/adhkarText';
import { ADHKAR } from '../data/adhkarData';
import { INVOICE_TEXT } from '../i18n/content';

// French Religious-Content Safety Correction: no French translation of a
// dhikr's meaning or fadl (virtue), and no French rendering of the
// invoice's closing blessing, is created in-project without a licensed
// source. Both now show their literal English source instead. IsnadChain
// (Home hadith) and the Islamic Studies/Ijazah hadiths and books are
// covered by frenchBatch1aPages.test.jsx and frenchBatch1bPages.test.jsx
// respectively, updated in the same change.

useFullPageEnvironment();

describe('Adhkar: fr.meaning/fr.fadl are the literal English source, not a French translation', () => {
  it('ADHKAR_TR: every one of the 49 entries has fr.meaning/fr.fadl identical to en.meaning/en.fadl', () => {
    const ids = Object.keys(ADHKAR_TR);
    expect(ids.length).toBe(49);
    for (const id of ids) {
      const entry = ADHKAR_TR[id];
      expect(entry.fr.meaning, `${id}.meaning`).toBe(entry.en.meaning);
      expect(entry.fr.fadl, `${id}.fadl`).toBe(entry.en.fadl);
    }
  });

  it('/fr/tools/adhkar renders the English meaning/fadl text, not the old French translation', async () => {
    await mountFullPage('/fr/tools/adhkar', Adhkar);
    const body = document.body.textContent;
    // sb1's English meaning (the morning dhikr shown by default) must be
    // present; its old French translation must not be.
    expect(body).toContain(ADHKAR_TR.sb1.en.meaning);
    expect(body).not.toContain(
      "Nous voici au matin et la royauté appartient à Allah. La louange est à Allah.",
    );
    expect(body).toContain(ADHKAR_TR.sb1.en.fadl);
    expect(body).not.toContain("Invocation du matin pour se protéger du mal de la journée.");
  });

  it('the Arabic dhikr text itself (to be recited) is unaffected -- still Arabic, still unique per item', async () => {
    await mountFullPage('/fr/tools/adhkar', Adhkar);
    const arabicEl = document.querySelector('.adhkar__ar');
    expect(arabicEl).toBeTruthy();
    expect(arabicEl.textContent).toBe(ADHKAR.sabah.items[0].ar);
  });

  it('non-religious Adhkar page UI (search placeholder) stays French', async () => {
    await mountFullPage('/fr/tools/adhkar', Adhkar);
    const input = document.querySelector('input[type="search"], input[placeholder]');
    expect(input).toBeTruthy();
    expect(input.placeholder).toBe('🔍 Rechercher adhkar…');
  });
});

describe('Invoice: the closing blessing is the literal English source, not a French translation', () => {
  it('INVOICE_TEXT.fr.thankYou equals INVOICE_TEXT.en.thankYou', () => {
    expect(INVOICE_TEXT.fr.thankYou).toBe(INVOICE_TEXT.en.thankYou);
    expect(INVOICE_TEXT.fr.thankYou).not.toContain("Qu'Allah bénisse votre parcours");
  });

  it('every other French invoice label is unaffected (still French)', () => {
    expect(INVOICE_TEXT.fr.invoice).toBe('Facture');
    expect(INVOICE_TEXT.fr.date).toBe('Date');
    expect(INVOICE_TEXT.fr.totalPaid).toBe('Total payé');
    expect(INVOICE_TEXT.fr.print).toBe('🖨 Imprimer / Enregistrer en PDF');
  });
});
