import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALC_METHODS } from '../utils/islamicToolsUtils';

// The prayer-times tool sends CALC_METHODS[].id to AlAdhan as `method=`.
// Ids and names below are AlAdhan's own (GET https://api.aladhan.com/v1/methods,
// checked 2026-10-13). The labels used to sit on the wrong ids: the default
// (3, Muslim World League) was shown as "Egyptian Authority", "Muslim World
// League" sent 1 (Karachi) and "Karachi" sent 5 (Egyptian).
const ALADHAN_METHODS = {
  1: 'University of Islamic Sciences, Karachi',
  2: 'Islamic Society of North America (ISNA)',
  3: 'Muslim World League',
  4: 'Umm Al-Qura University, Makkah',
  5: 'Egyptian General Authority of Survey',
  12: 'Union Organization Islamic de France',
};

const LABEL_TO_ID = {
  'Egyptian Authority': 5,
  'Umm Al-Qura, Makkah': 4,
  'Muslim World League': 3,
  ISNA: 2,
  Karachi: 1,
  'Union of Islamic Orgs. (France)': 12,
};

const AR_LABEL_TO_ID = {
  'الهيئة المصرية العامة للمساحة': 5,
  'أم القرى (مكة المكرمة)': 4,
  'رابطة العالم الإسلامي': 3,
  'جمعية إسلامية لأمريكا الشمالية (ISNA)': 2,
  'جامعة العلوم الإسلامية، كراتشي': 1,
  'اتحاد المنظمات الإسلامية في فرنسا': 12,
};

describe('prayer calculation methods match AlAdhan method ids', () => {
  it('every option sends a real AlAdhan id, once', () => {
    const ids = CALC_METHODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(ALADHAN_METHODS[id], String(id)).toBeTruthy();
  });

  it('each English and Arabic label sits on the id AlAdhan uses for that method', () => {
    expect(CALC_METHODS).toHaveLength(Object.keys(LABEL_TO_ID).length);
    for (const m of CALC_METHODS) {
      expect(LABEL_TO_ID[m.en], m.en).toBe(m.id);
      expect(AR_LABEL_TO_ID[m.name], m.name).toBe(m.id);
    }
  });

  it('the page default (3) is labelled Muslim World League', () => {
    const page = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pages/tools/PrayerTimesPage.jsx'),
      'utf8',
    );
    expect(page).toMatch(/useState\(3\);/);
    expect(CALC_METHODS.find((m) => m.id === 3).en).toBe('Muslim World League');
  });
});
