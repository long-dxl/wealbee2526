import { describe, it, expect, vi } from 'vitest';

// DOMPurify cần DOM — mock để test logic thuần
vi.mock('dompurify', () => ({
  default: {
    sanitize: (input: string, _opts?: unknown) => input,
  },
}));

import {
  sanitizeText,
  validateStockSymbol,
  validateAmount,
  validateEmail,
  validateChatMessage,
  validateUrl,
  validateName,
  validatePromptParam,
} from './validation';

describe('sanitizeText', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeText(123)).toBe('');
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
  });
  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });
  it('truncates to maxLen', () => {
    expect(sanitizeText('abcde', 3)).toBe('abc');
  });
  it('respects default maxLen of 500', () => {
    const long = 'a'.repeat(600);
    expect(sanitizeText(long).length).toBe(500);
  });
});

describe('validateStockSymbol', () => {
  it('accepts valid 2–10 uppercase letter symbols', () => {
    expect(validateStockSymbol('VCB')).toBe('VCB');
    expect(validateStockSymbol('FPT')).toBe('FPT');
    expect(validateStockSymbol('VNINDEX')).toBe('VNINDEX');
  });
  it('uppercases lowercase input', () => {
    expect(validateStockSymbol('vcb')).toBe('VCB');
  });
  it('throws on single character', () => {
    expect(() => validateStockSymbol('V')).toThrow('Invalid stock symbol');
  });
  it('throws on symbol with numbers', () => {
    expect(() => validateStockSymbol('VCB1')).toThrow('Invalid stock symbol');
  });
  it('throws on empty string', () => {
    expect(() => validateStockSymbol('')).toThrow('Invalid stock symbol');
  });
  it('truncates input to 10 chars (does not throw for 11-char all-alpha)', () => {
    // sanitizeText truncates before regex check — 11 alpha chars → 10 → valid
    expect(validateStockSymbol('ABCDEFGHIJK')).toBe('ABCDEFGHIJ');
  });
});

describe('validateAmount', () => {
  it('accepts valid positive amounts', () => {
    expect(validateAmount(100000)).toBe(100000);
    expect(validateAmount(0)).toBe(0);
    expect(validateAmount('50000')).toBe(50000);
  });
  it('throws on negative amount', () => {
    expect(() => validateAmount(-1)).toThrow('Invalid amount');
  });
  it('throws on NaN', () => {
    expect(() => validateAmount('abc')).toThrow('Invalid amount');
  });
  it('throws on amount exceeding limit', () => {
    expect(() => validateAmount(1_000_000_000_000)).toThrow('Invalid amount');
  });
  it('throws on Infinity', () => {
    expect(() => validateAmount(Infinity)).toThrow('Invalid amount');
  });
});

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBe('user@example.com');
    expect(validateEmail('test+tag@domain.co')).toBe('test+tag@domain.co');
  });
  it('throws on missing @', () => {
    expect(() => validateEmail('notanemail')).toThrow('Invalid email');
  });
  it('throws on missing domain', () => {
    expect(() => validateEmail('user@')).toThrow('Invalid email');
  });
  it('throws on empty string', () => {
    expect(() => validateEmail('')).toThrow('Invalid email');
  });
});

describe('validateChatMessage', () => {
  it('accepts normal message', () => {
    expect(validateChatMessage('Hello world')).toBe('Hello world');
  });
  it('throws on empty string', () => {
    expect(() => validateChatMessage('')).toThrow('Empty message');
  });
  it('throws on whitespace-only', () => {
    expect(() => validateChatMessage('   ')).toThrow('Empty message');
  });
  it('truncates at 2000 chars', () => {
    const long = 'a'.repeat(2500);
    expect(validateChatMessage(long).length).toBe(2000);
  });
});

describe('validateUrl', () => {
  it('accepts valid HTTPS URLs', () => {
    expect(validateUrl('https://example.com')).toBe('https://example.com/');
  });
  it('throws on HTTP (non-HTTPS)', () => {
    expect(() => validateUrl('http://example.com')).toThrow('Invalid or non-HTTPS URL');
  });
  it('throws on invalid URL', () => {
    expect(() => validateUrl('not-a-url')).toThrow('Invalid or non-HTTPS URL');
  });
  it('throws on empty string', () => {
    expect(() => validateUrl('')).toThrow('Invalid or non-HTTPS URL');
  });
});

describe('validateName', () => {
  it('accepts valid name', () => {
    expect(validateName('Wealbee')).toBe('Wealbee');
  });
  it('throws on empty string', () => {
    expect(() => validateName('')).toThrow('Name cannot be empty');
  });
  it('throws on whitespace-only', () => {
    expect(() => validateName('   ')).toThrow('Name cannot be empty');
  });
});

describe('validatePromptParam', () => {
  it('returns null for null input', () => {
    expect(validatePromptParam(null)).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(validatePromptParam('')).toBeNull();
  });
  it('accepts valid prompt text', () => {
    expect(validatePromptParam('Phan tich co phieu VCB')).toBe('Phan tich co phieu VCB');
  });
  it('returns null for prompt with forbidden chars', () => {
    expect(validatePromptParam('<script>alert(1)</script>')).toBeNull();
  });
});
