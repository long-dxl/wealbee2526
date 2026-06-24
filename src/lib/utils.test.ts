import { describe, it, expect } from 'vitest';
import {
  formatVND,
  formatNumber,
  formatPercent,
  formatDate,
  calculateCAGR,
  getSafetyColorByScore,
  getSafetyLabelByScore,
  getSafetyColor,
  getSafetyLabel,
} from './utils';

describe('formatPercent', () => {
  it('positive value gets + prefix', () => {
    expect(formatPercent(5.5)).toBe('+5.5%');
  });
  it('negative value keeps - sign', () => {
    expect(formatPercent(-3.2)).toBe('-3.2%');
  });
  it('zero gets + prefix', () => {
    expect(formatPercent(0)).toBe('+0.0%');
  });
  it('respects custom decimal places', () => {
    expect(formatPercent(1.2345, 2)).toBe('+1.23%');
  });
});

describe('calculateCAGR', () => {
  it('returns 0 for single value', () => {
    expect(calculateCAGR([100])).toBe(0);
  });
  it('returns 0 for empty array', () => {
    expect(calculateCAGR([])).toBe(0);
  });
  it('returns 0 when start value is 0', () => {
    expect(calculateCAGR([0, 100])).toBe(0);
  });
  it('calculates correctly for 100% growth over 1 year', () => {
    expect(calculateCAGR([100, 200])).toBeCloseTo(100, 5);
  });
  it('calculates correctly over multiple years', () => {
    // 100 → 121 over 2 years = 10% CAGR
    expect(calculateCAGR([100, 110, 121])).toBeCloseTo(10, 5);
  });
});

describe('getSafetyColorByScore', () => {
  it('null → gray', () => {
    expect(getSafetyColorByScore(null)).toBe('text-gray-500 bg-gray-100');
  });
  it('score 80+ → emerald', () => {
    expect(getSafetyColorByScore(80)).toContain('emerald');
    expect(getSafetyColorByScore(100)).toContain('emerald');
  });
  it('score 60–79 → green', () => {
    expect(getSafetyColorByScore(60)).toContain('green');
    expect(getSafetyColorByScore(79)).toContain('green');
  });
  it('score 40–59 → amber', () => {
    expect(getSafetyColorByScore(40)).toContain('amber');
  });
  it('score 20–39 → orange', () => {
    expect(getSafetyColorByScore(20)).toContain('orange');
  });
  it('score <20 → red', () => {
    expect(getSafetyColorByScore(0)).toContain('red');
    expect(getSafetyColorByScore(19)).toContain('red');
  });
});

describe('getSafetyLabelByScore', () => {
  it('null → Chưa đánh giá', () => {
    expect(getSafetyLabelByScore(null)).toBe('Chưa đánh giá');
  });
  it('score 80 → An toàn', () => {
    expect(getSafetyLabelByScore(80)).toContain('An toàn');
  });
  it('score 0 → Nguy hiểm', () => {
    expect(getSafetyLabelByScore(0)).toContain('Nguy hiểm');
  });
  it('includes score in label', () => {
    expect(getSafetyLabelByScore(75)).toContain('75');
  });
});

describe('getSafetyColor (legacy string)', () => {
  it('Safe → emerald', () => {
    expect(getSafetyColor('Safe')).toContain('emerald');
  });
  it('Risky → red', () => {
    expect(getSafetyColor('Risky')).toContain('red');
  });
  it('Unrated → gray', () => {
    expect(getSafetyColor('Unrated')).toContain('gray');
  });
  it('unknown → gray fallback', () => {
    expect(getSafetyColor('unknown')).toContain('gray');
  });
});

describe('getSafetyLabel (legacy string)', () => {
  it('Safe → An toàn', () => {
    expect(getSafetyLabel('Safe')).toBe('An toàn');
  });
  it('Unrated → Chưa đánh giá', () => {
    expect(getSafetyLabel('Unrated')).toBe('Chưa đánh giá');
  });
  it('Risky → Rủi ro', () => {
    expect(getSafetyLabel('Risky')).toBe('Rủi ro');
  });
  it('unknown → pass through', () => {
    expect(getSafetyLabel('CustomLabel')).toBe('CustomLabel');
  });
});

describe('formatVND', () => {
  it('formats positive number', () => {
    const result = formatVND(1000000);
    expect(result).toContain('1');
    expect(result).toContain('000');
  });
  it('formats zero', () => {
    expect(formatVND(0)).toBeTruthy();
  });
});

describe('formatNumber', () => {
  it('formats with 0 decimals by default', () => {
    const result = formatNumber(1234);
    expect(result).toContain('1');
  });
  it('formats with custom decimals', () => {
    const result = formatNumber(3.14159, 2);
    expect(result).toContain('14');
  });
});

describe('formatDate', () => {
  it('returns a non-empty string for valid date', () => {
    const result = formatDate('2025-01-15');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
