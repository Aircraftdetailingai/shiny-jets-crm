// Line price for one service on one model.
// A shop pin replaces hours × rate. The minimum floor applies only to the
// calculated price, so a deliberate pin is what the quote uses.

import { applyMinimumPrice } from './calibrate-hours';

export function resolveOfferPrice({ hours, hourlyRate, minimumPrice, pinnedPrice } = {}) {
  if (pinnedPrice != null && pinnedPrice !== '') {
    const pin = parseFloat(pinnedPrice);
    if (Number.isFinite(pin) && pin >= 0) return { price: pin, source: 'pin', minApplied: false };
  }
  const raw = (parseFloat(hours) || 0) * (parseFloat(hourlyRate) || 0);
  const floored = applyMinimumPrice(raw, minimumPrice);
  return { price: floored.price, source: floored.minApplied ? 'minimum' : 'calculated', minApplied: floored.minApplied };
}
