// The icon set shared by popup and options. Every icon takes an optional
// className (the popup call sites that need one), which options' call sites
// simply omit — React drops className={undefined}, so options' rendered DOM
// is unchanged even though its icons never used to take a className prop.
export interface IconProps {
  className?: string;
}

export function IconSparkle({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M11 3.2l1.9 5.3 5.3 1.9-5.3 1.9L11 17.6l-1.9-5.3L3.8 10.4l5.3-1.9L11 3.2z" />
      <path d="M18.3 2.6l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z" />
    </svg>
  );
}

export function IconSort({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="15" y1="12" y2="12" />
      <line x1="4" x2="10" y1="18" y2="18" />
    </svg>
  );
}

export function IconDomain({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect height="7.5" rx="2" width="7.5" x="3" y="3" />
      <rect height="7.5" rx="2" width="7.5" x="13.5" y="3" />
      <rect height="7.5" rx="2" width="7.5" x="3" y="13.5" />
      <rect height="7.5" rx="2" width="7.5" x="13.5" y="13.5" />
    </svg>
  );
}

export function IconGear({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7zm7.4-3.5c0-.4 0-.8-.1-1.2l1.9-1.5-1.9-3.3-2.3.9a7.6 7.6 0 00-2-1.2L14.6 3H9.4l-.4 2.7a7.6 7.6 0 00-2 1.2l-2.3-.9L2.8 9.3l1.9 1.5c-.1.4-.1.8-.1 1.2s0 .8.1 1.2L2.8 14.7l1.9 3.3 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.7h5.2l.4-2.7c.7-.3 1.4-.7 2-1.2l2.3.9 1.9-3.3-1.9-1.5c.1-.4.1-.8.1-1.2z" />
    </svg>
  );
}

export function IconChevron({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function IconUndo({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M4.5 10.8a7.7 7.7 0 1 1 2 6.4" />
      <polyline points="4 4.5 4.5 10.8 10.7 10" />
    </svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <line x1="6" x2="18" y1="6" y2="18" />
      <line x1="18" x2="6" y1="6" y2="18" />
    </svg>
  );
}

export function IconWarning({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M12 3.3 22 20H2z" />
      <line x1="12" x2="12" y1="9.5" y2="14.5" />
      <circle cx="12" cy="17.3" fill="currentColor" r=".9" stroke="none" />
    </svg>
  );
}

export function IconCheckCircle({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="7.5 12.5 10.5 15.5 16.5 9" />
    </svg>
  );
}

export function IconCheck({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <polyline points="5 12.5 9.5 17 19 7" />
    </svg>
  );
}

export function IconOpenNew({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M9 5h10v10" />
      <line x1="19" x2="9.5" y1="5" y2="14.5" />
      <path d="M15 19H5V9" />
    </svg>
  );
}

export function IconFilter({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3.5 4h17l-6.3 7.6v6l-4.4 2.2v-8.2z" />
    </svg>
  );
}

export function IconCopy({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="12" rx="2" width="11" x="3.5" y="8.5" />
      <path d="M7.5 8.5V4.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" />
    </svg>
  );
}

export function IconDuplicate({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="12" rx="1.5" width="11" x="5" y="8" />
      <path d="M9 8V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-2" />
    </svg>
  );
}

export function IconWindow({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
    >
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <line x1="3" x2="21" y1="9.4" y2="9.4" />
      <rect fill="currentColor" height="2" rx="1" stroke="none" width="6" x="5.2" y="6.4" />
    </svg>
  );
}

export function IconSpinner({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9.5" strokeDasharray="38 60" />
    </svg>
  );
}

export function IconTrash({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
    </svg>
  );
}
