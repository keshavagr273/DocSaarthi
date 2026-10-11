import { ValidationStage } from './validation.stage';
import type { DatabaseService } from '@docsaarthi/database';

/**
 * parseDate / parseCurrency / GSTIN validation are pure. The DB is only
 * touched by execute(), so a bare cast suffices here.
 */
describe('ValidationStage parsing', () => {
  const stage = new ValidationStage({} as DatabaseService);

  const internals = stage as unknown as {
    parseDate(raw: string): Date | null;
    parseCurrency(raw: string): number | null;
    isValidGstin(raw: string): boolean;
    looksLikeGstin(raw: string): boolean;
  };

  /** How execute() serialises a parsed date before storing it. */
  const isoDay = (d: Date | null) => (d ? d.toISOString().split('T')[0] : null);

  describe('parseDate', () => {
    // Regression: dates were built with `new Date(y, m, d)` (local time) and
    // then serialised with toISOString(), so in IST (UTC+5:30) every date was
    // stored one day early.
    it('stores the same calendar day the document shows, regardless of server timezone', () => {
      expect(isoDay(internals.parseDate('20-08-2026'))).toBe('2026-08-20');
      expect(isoDay(internals.parseDate('01-01-2026'))).toBe('2026-01-01');
      expect(isoDay(internals.parseDate('31-12-2025'))).toBe('2025-12-31');
    });

    it('parses DD-MM-YYYY with any of - / .', () => {
      expect(isoDay(internals.parseDate('15/08/2026'))).toBe('2026-08-15');
      expect(isoDay(internals.parseDate('15.08.2026'))).toBe('2026-08-15');
      expect(isoDay(internals.parseDate('5-8-2026'))).toBe('2026-08-05');
    });

    it('parses YYYY-MM-DD', () => {
      expect(isoDay(internals.parseDate('2026-08-20'))).toBe('2026-08-20');
    });

    it('parses English natural dates in both orders', () => {
      expect(isoDay(internals.parseDate('20 August 2026'))).toBe('2026-08-20');
      expect(isoDay(internals.parseDate('20 Aug 2026'))).toBe('2026-08-20');
      expect(isoDay(internals.parseDate('Aug 20, 2026'))).toBe('2026-08-20');
      expect(isoDay(internals.parseDate('September 3 2026'))).toBe('2026-09-03');
    });

    it('parses Hindi Devanagari dates', () => {
      expect(isoDay(internals.parseDate('20 अगस्त 2026'))).toBe('2026-08-20');
      expect(isoDay(internals.parseDate('15 जनवरी 2026'))).toBe('2026-01-15');
      expect(isoDay(internals.parseDate('1 फ़रवरी 2026'))).toBe('2026-02-01');
    });

    // Regression: Date rolls impossible dates over silently, so "31-02-2026"
    // was stored as 3 March and reported as a successful parse.
    it('rejects impossible dates instead of rolling them over', () => {
      expect(internals.parseDate('31-02-2026')).toBeNull();
      expect(internals.parseDate('32-01-2026')).toBeNull();
      expect(internals.parseDate('15-13-2026')).toBeNull();
      expect(internals.parseDate('00-01-2026')).toBeNull();
    });

    it('accepts a real leap day and rejects a fake one', () => {
      expect(isoDay(internals.parseDate('29-02-2024'))).toBe('2024-02-29');
      expect(internals.parseDate('29-02-2025')).toBeNull();
    });

    // Regression: real documents write "6th May 2026"; the ordinal suffix made
    // the parse fail and dropped the field's confidence to 0.40.
    it('parses dates with ordinal suffixes', () => {
      expect(isoDay(internals.parseDate('6th May 2026'))).toBe('2026-05-06');
      expect(isoDay(internals.parseDate('1st April 2026'))).toBe('2026-04-01');
      expect(isoDay(internals.parseDate('22nd of August 2026'))).toBe('2026-08-22');
      expect(isoDay(internals.parseDate('3rd Jan 2026'))).toBe('2026-01-03');
    });

    it('returns null for unparseable input', () => {
      expect(internals.parseDate('')).toBeNull();
      expect(internals.parseDate('not a date')).toBeNull();
      expect(internals.parseDate('20-08')).toBeNull();
    });
  });

  describe('parseCurrency', () => {
    it('strips currency markers and separators', () => {
      expect(internals.parseCurrency('₹1,200.50')).toBe(1200.5);
      expect(internals.parseCurrency('Rs. 45,000')).toBe(45000);
      expect(internals.parseCurrency('INR 1000')).toBe(1000);
      expect(internals.parseCurrency('2500')).toBe(2500);
    });

    it('handles Indian lakh/crore digit grouping', () => {
      expect(internals.parseCurrency('1,00,000')).toBe(100000);
      expect(internals.parseCurrency('₹12,34,567.89')).toBe(1234567.89);
    });

    it('handles the trailing /- convention', () => {
      expect(internals.parseCurrency('5000/-')).toBe(5000);
    });

    it('handles negatives, including parenthesised', () => {
      expect(internals.parseCurrency('-500')).toBe(-500);
      expect(internals.parseCurrency('(1,200)')).toBe(-1200);
    });

    // Regression: parseFloat('12 bags of cement') returns 12, so a non-monetary
    // value was stored as a confident amount and fed into the invoice-math
    // cross-check.
    // Regression: foreign-currency amounts such as "$100.00 USD" appear in
    // real offer letters and previously failed to parse.
    it('handles non-INR currency markers', () => {
      expect(internals.parseCurrency('$100.00 USD')).toBe(100);
      expect(internals.parseCurrency('€250')).toBe(250);
      expect(internals.parseCurrency('AED 1,500')).toBe(1500);
    });

    it('rejects values that are not purely numeric', () => {
      expect(internals.parseCurrency('12 bags of cement')).toBeNull();
      expect(internals.parseCurrency('N/A')).toBeNull();
      expect(internals.parseCurrency('')).toBeNull();
      expect(internals.parseCurrency('1.2.3')).toBeNull();
    });
  });

  describe('GSTIN validation', () => {
    it('accepts a well-formed GSTIN', () => {
      expect(internals.isValidGstin('27AAPFU0939F1ZV')).toBe(true);
      expect(internals.looksLikeGstin('27AAPFU0939F1ZV')).toBe(true);
    });

    it('rejects a malformed GSTIN', () => {
      expect(internals.isValidGstin('27AAPFU0939F1Z')).toBe(false);
      expect(internals.isValidGstin('AAPFU0939F1ZV')).toBe(false);
      expect(internals.isValidGstin('')).toBe(false);
    });
  });
});
