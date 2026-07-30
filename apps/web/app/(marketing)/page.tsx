import { CtaBand } from '@/features/marketing/cta-band';
import { Hero } from '@/features/marketing/hero';
import { UseCases } from '@/features/marketing/use-cases';
import { ValueProps } from '@/features/marketing/value-props';

/**
 * Landing page — orchestration only. Every section is a focused, RSC-safe
 * component in `features/marketing/*` (docs/13-engineering-standards.md).
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <ValueProps />
      <UseCases />
      <CtaBand />
    </>
  );
}
