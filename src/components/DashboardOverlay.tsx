import type { ComponentPropsWithoutRef } from 'react';
import { createPortal } from 'react-dom';

type DashboardOverlayProps = ComponentPropsWithoutRef<'div'> & {
  layer?: number;
};

/** Escape dashboard stacking contexts so the backdrop also covers navigation. */
export default function DashboardOverlay({ children, layer = 100, style, ...props }: DashboardOverlayProps) {
  return createPortal(
    <div {...props} style={{ ...style, zIndex: layer }} data-dashboard-overlay="">
      {children}
    </div>,
    document.body,
  );
}
