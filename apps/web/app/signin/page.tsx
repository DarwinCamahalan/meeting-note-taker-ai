import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SsoSigninForm } from '@/features/sso-signin/sso-signin-form';
import { Wordmark } from '@/features/marketing/wordmark';

export const metadata: Metadata = {
  title: 'Sign in with SSO',
  description: 'Sign in to the AssistMe admin console with your organization SSO.',
  // Auth surface — keep it out of search indexes.
  robots: { index: false, follow: false },
};

/** Enterprise SSO sign-in entrypoint. `useSearchParams` needs a Suspense boundary. */
export default function SignInPage(): React.JSX.Element {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="mb-8">
        <Wordmark />
      </div>
      <div className="w-full max-w-md">
        <Suspense fallback={<div className="surface-card text-white/50">Loading…</div>}>
          <SsoSigninForm />
        </Suspense>
      </div>
    </div>
  );
}
