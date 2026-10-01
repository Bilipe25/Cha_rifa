'use client';

import { useEffect } from 'react';

/** Gives a short, optional tactile acknowledgement to touch interactions. */
export function TouchFeedback() {
  useEffect(() => {
    if (!('vibrate' in navigator)) return;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const control = target.closest('button, a[href], [role="button"], [data-touch-feedback]');
      if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;

      navigator.vibrate(12);
    };

    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return null;
}
