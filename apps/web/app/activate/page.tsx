import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ActivateScreen } from '@/features/activate/activate-screen';
import { Wordmark } from '@/features/marketing/wordmark';

export const metadata: Metadata = {
  title: 'Activate a device',
  description: 'Approve an AssistMe desktop sign-in.',
  // Auth surface — keep it out of search indexes.
  robots: { index: false, follow: false },
};

/**
 * Device-code activation page for the desktop PKCE flow. `useSearchParams`
 * (inside ActivateScreen) requires a Suspense boundary in the App Router.
 */
export default function ActivatePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="mb-8">
        <Wordmark />
      </div>
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="surface-card text-white/50">Loading…</div>}>
          <ActivateScreen />
        </Suspense>
      </div>
    </div>
  );
}
