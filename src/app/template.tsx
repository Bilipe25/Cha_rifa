import type { ReactNode } from 'react';

// Next.js remounts a template on navigation, so the entrance runs on each page.
export default function Template({ children }: { children: ReactNode }) {
  return <div className="route-surface">{children}</div>;
}
