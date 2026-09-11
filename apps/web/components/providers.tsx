"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { ToastProvider } from "./ui/toast";

/**
 * reducedMotion="user" makes every motion component drop transform and
 * layout animation when the OS asks for reduced motion, keeping opacity
 * fades so state changes still read. Components with loops, parallax or
 * counters also check useReducedMotion() and go fully static.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}>
      <ToastProvider>{children}</ToastProvider>
    </MotionConfig>
  );
}
