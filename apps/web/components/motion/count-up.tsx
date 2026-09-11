"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

interface CountUpProps {
  value: number;
  /** Formats the in-flight number; defaults to an integer. */
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}

/**
 * Counts to `value` once it scrolls into view. The number is written straight
 * to the DOM node, so the animation never re-renders React. The final value is
 * server-rendered, so it is correct without JavaScript and for screen readers.
 */
export function CountUp({ value, format = (n) => Math.round(n).toString(), duration = 1.4, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const formatRef = useRef(format);

  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView || reduce) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => {
        node.textContent = formatRef.current(latest);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, value, duration]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
