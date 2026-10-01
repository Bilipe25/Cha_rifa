export function Icon({ name, size = 22 }: { name: 'ticket' | 'arrow' | 'calendar' | 'gift' | 'copy' | 'check' | 'heart' | 'back' | 'lock' | 'share' | 'settings' | 'clock'; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
  const path = {
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
    ticket: <><path d="M3 7a2 2 0 0 0 2-2h14v4a2 2 0 0 0 0 4v4H5a2 2 0 0 0-2-2V7Z"/><path d="M13 5v2m0 3v4m0 3v2"/></>,
    arrow: <path d="m9 5 7 7-7 7"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h3m4 0h3m-10 4h3"/></>,
    gift: <><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 13h18M12 9H7a3 3 0 1 1 3-3c0 2 2 3 2 3Zm0 0h5a3 3 0 1 0-3-3c0 2-2 3-2 3Z"/></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    heart: <path d="M20.8 8.6c0 4.8-8.8 10.4-8.8 10.4S3.2 13.4 3.2 8.6a4.5 4.5 0 0 1 8.8-1.2 4.5 4.5 0 0 1 8.8 1.2Z"/>,
    back: <path d="m15 5-7 7 7 7"/>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    share: <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.3 10.7 7.4-4.4m-7.4 7 7.4 4.4"/></>,
    settings: <><path d="M10.5 2h3l.6 2.1a8 8 0 0 1 1.8.8l1.9-1.1 2.1 2.1-1.1 1.9a8 8 0 0 1 .8 1.8L22 10.5v3l-2.1.6a8 8 0 0 1-.8 1.8l1.1 1.9-2.1 2.1-1.9-1.1a8 8 0 0 1-1.8.8L13.5 22h-3l-.6-2.1a8 8 0 0 1-1.8-.8l-1.9 1.1-2.1-2.1 1.1-1.9a8 8 0 0 1-.8-1.8L2 13.5v-3l2.1-.6a8 8 0 0 1 .8-1.8L3.8 6.2l2.1-2.1 1.9 1.1a8 8 0 0 1 1.8-.8L10.5 2Z"/><circle cx="12" cy="12" r="3"/></>,
  }[name];
  return <svg {...common}>{path}</svg>;
}
