import { describe, expect, it } from 'vitest';
import { safeInternalDestination } from '../utils/safeRedirect';

describe('safeInternalDestination', () => {
  it('preserves a localized protected deep link', () => {
    expect(safeInternalDestination({
      pathname: '/ai-tutor',
      search: '?lang=ar',
      hash: '#question',
    }, '/dashboard')).toBe('/ai-tutor?lang=ar#question');
  });

  it('accepts internal redirect query values', () => {
    expect(safeInternalDestination('/calendar?lang=ar', '/dashboard')).toBe('/calendar?lang=ar');
  });

  it('rejects external and protocol-relative redirects', () => {
    expect(safeInternalDestination('https://example.com', '/dashboard')).toBe('/dashboard');
    expect(safeInternalDestination('//example.com', '/dashboard')).toBe('/dashboard');
    expect(safeInternalDestination({ pathname: '//example.com' }, '/dashboard')).toBe('/dashboard');
  });

  it('rejects backslash-based redirect bypasses', () => {
    expect(safeInternalDestination('/\\evil.example', '/dashboard')).toBe('/dashboard');
    expect(safeInternalDestination('/%5Cevil.example', '/dashboard')).toBe('/dashboard');
    expect(safeInternalDestination({ pathname: '/\\evil.example' }, '/dashboard')).toBe('/dashboard');
  });
});