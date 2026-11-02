import { describe, expect, it } from 'vitest';
import { normalizeWebURL } from './url';

describe('QR code URL validation', () => {
  it('adds HTTPS when a domain has no protocol', () => expect(normalizeWebURL('example.com/a?b=1')).toBe('https://example.com/a?b=1'));
  it('keeps an explicit HTTP URL', () => expect(normalizeWebURL('http://example.com')).toBe('http://example.com/'));
  it('rejects script and non-web protocols', () => {
    expect(() => normalizeWebURL('javascript:alert(1)')).toThrow();
    expect(() => normalizeWebURL('ftp://example.com')).toThrow();
  });
  it('rejects credentials and whitespace', () => {
    expect(() => normalizeWebURL('https://user:secret@example.com')).toThrow();
    expect(() => normalizeWebURL('https://example.com/a b')).toThrow();
  });
});
