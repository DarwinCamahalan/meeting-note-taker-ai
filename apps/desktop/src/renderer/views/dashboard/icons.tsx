import type { SVGProps } from 'react';

/** Minimal inline line-icons (stroke = currentColor). No icon-library dep. */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps): React.JSX.Element {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Icon>
);

export const SettingsIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
  </Icon>
);

export const KeyboardIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
  </Icon>
);

export const InfoIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11.5v4.5M12 8h.01" />
  </Icon>
);

export const MicIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
  </Icon>
);

export const ShieldIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 3 5 6v5c0 4.2 3 7.3 7 8 4-0.7 7-3.8 7-8V6z" />
    <path d="m9.2 11.7 1.9 1.9 3.7-3.7" />
  </Icon>
);

export const BoltIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M13 2 5 13h6l-1 9 8-11h-6z" />
  </Icon>
);
