import Link from 'next/link';

/**
 * Shown when a Team-gated surface (SSO, SAML/SCIM) isn't available on the org's
 * current plan. Points to pricing rather than hard-blocking navigation.
 */
export function UpgradeNote({ feature }: { feature: string }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-cue-400/25 bg-cue-500/10 px-4 py-5 text-sm">
      <p className="font-medium text-white">{feature} is a Team feature.</p>
      <p className="mt-1 text-white/60">
        Upgrade your organization to the Team plan to enable it.
      </p>
      <Link href="/pricing" className="btn-primary mt-4 !px-4 !py-2">
        View plans
      </Link>
    </div>
  );
}
