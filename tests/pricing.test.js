import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPrice, productPrice, supportedCountries } from '../src/lib/pricing.js';

test('uses the NGN base price until a country price has been configured', () => {
  assert.deepEqual(productPrice({ priceMinor: 1800000, countryPrices: [] }, 'GB'), {
    minor: 1800000,
    currency: 'NGN',
  });
});

test('uses the saved country-specific price and currency when present', () => {
  assert.deepEqual(productPrice({
    priceMinor: 1800000,
    countryPrices: [{ countryCode: 'GB', currency: 'GBP', amountMinor: 12500 }],
  }, 'GB'), {
    minor: 12500,
    currency: 'GBP',
  });
});

test('falls back to the base price for a different country', () => {
  assert.deepEqual(productPrice({
    priceMinor: 1800000,
    countryPrices: [{ countryCode: 'GB', currency: 'GBP', amountMinor: 12500 }],
  }, 'US'), {
    minor: 1800000,
    currency: 'NGN',
  });
});

test('formats Naira minor units as whole Naira', () => {
  assert.match(formatPrice(1800000, 'NGN'), /18,000/);
});

test('rejects invalid money rather than formatting an undefined value', () => {
  assert.throws(() => formatPrice(-1, 'NGN'), RangeError);
});

test('provides a country selection for each configured pricing region', () => {
  assert.deepEqual(supportedCountries.map((country) => country.code), ['NG', 'GH', 'KE', 'GB', 'US', 'ZA']);
});
