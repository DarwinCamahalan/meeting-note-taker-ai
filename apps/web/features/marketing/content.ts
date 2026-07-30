/**
 * Static marketing copy + nav data. Kept out of the components so the route
 * segments stay thin and the copy is easy to review against product vision
 * (docs/01-product-vision.md) — preparation & accessibility, never deception.
 */

export interface NavLink {
  href: string;
  label: string;
}

export const NAV_LINKS: readonly NavLink[] = [
  { href: '/#features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/download', label: 'Download' },
];

export interface ValueProp {
  title: string;
  body: string;
  /** Inline SVG glyph key rendered by the ValueProps grid. */
  icon: 'shield' | 'waveform' | 'spark' | 'docs';
}

export const VALUE_PROPS: readonly ValueProp[] = [
  {
    icon: 'shield',
    title: 'A private layer, only you see',
    body: 'Content protection keeps the overlay out of screen shares and recordings. Your cues stay yours.',
  },
  {
    icon: 'waveform',
    title: 'Real-time transcription',
    body: 'Low-latency speech-to-text captures both sides of the call so nothing gets missed.',
  },
  {
    icon: 'spark',
    title: 'Cues the moment you need them',
    body: 'Streaming Claude suggestions appear inline as the conversation unfolds — no tab-switching.',
  },
  {
    icon: 'docs',
    title: 'Grounded in your context',
    body: 'Bring your resume, job description, or knowledge base. AssistMe answers from what actually matters.',
  },
];

export interface UseCase {
  title: string;
  body: string;
}

export const USE_CASES: readonly UseCase[] = [
  { title: 'Interview prep & live', body: 'Rehearse, then stay sharp with cues grounded in the role.' },
  { title: 'Sales calls', body: 'Objection handling and next-best-question, in the moment.' },
  { title: 'Support', body: 'Surface the right KB answer without leaving the call.' },
  { title: 'Meeting notes', body: 'A clean transcript and summary, disclosed to the room.' },
];
