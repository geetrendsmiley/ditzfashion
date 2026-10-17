export const supportedCountries = [
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'ZA', name: 'South Africa' },
];

export const currencyByCountry = {
  NG: 'NGN',
  GH: 'GHS',
  KE: 'KES',
  GB: 'GBP',
  US: 'USD',
  ZA: 'ZAR',
};

export function productPrice(product, countryCode) {
  const countryPrice = product.countryPrices?.find((price) => price.countryCode === countryCode);
  return {
    minor: countryPrice?.amountMinor ?? product.priceMinor,
    currency: countryPrice?.currency ?? 'NGN',
  };
}

export function formatPrice(minorAmount, currency = 'NGN') {
  if (!Number.isSafeInteger(minorAmount) || minorAmount < 0) {
    throw new RangeError('A price must be a non-negative integer in minor currency units.');
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'NGN' ? 0 : 2,
  }).format(minorAmount / 100);
}
