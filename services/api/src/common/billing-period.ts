/**
 * Billing-period math shared by the entitlements + usage domains. Quotas reset
 * MONTHLY, anchored to the Stripe subscription's `current_period_end` when one
 * exists (50-subscriptions-entitlements.md §7.2 — an annual plan still resets
 * 1,200/1,500 minutes each month). Absent a subscription (Free), we fall back
 * to the calendar month in UTC. Both consumers MUST derive bounds here so the
 * usage ledger and the quota remainder agree.
 */

/** Inclusive-start / exclusive-end ISO bounds of the active billing period. */
export interface BillingPeriod {
  start: Date;
  end: Date;
}

/** Subtract exactly one calendar month, clamping to end-of-month if needed. */
function minusOneMonth(date: Date): Date {
  const d = new Date(date.getTime());
  const targetMonth = d.getUTCMonth() - 1;
  const anchorDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(targetMonth);
  const daysInTarget = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(anchorDay, daysInTarget));
  return d;
}

/**
 * Resolve the current monthly billing period. When `currentPeriodEnd` is
 * provided (from the subscription), the window is the month ending at that
 * anchor; otherwise it is the current UTC calendar month.
 */
export function currentBillingPeriod(
  now: Date = new Date(),
  currentPeriodEnd?: Date | null,
): BillingPeriod {
  if (currentPeriodEnd) {
    // Roll the monthly anchor forward until it is in the future relative to now.
    let end = new Date(currentPeriodEnd.getTime());
    let guard = 0;
    while (end.getTime() <= now.getTime() && guard < 24) {
      const next = new Date(end.getTime());
      next.setUTCMonth(next.getUTCMonth() + 1);
      end = next;
      guard += 1;
    }
    return { start: minusOneMonth(end), end };
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
