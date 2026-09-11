"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Scroll-triggered entrance. One easing, one distance, used everywhere, so
 * sections arrive with the same voice. MotionConfig reducedMotion="user"
 * drops the translate for people who ask for less motion; the fade remains.
 */

export const EASE = [0.16, 1, 0.3, 1] as const;

type Tag = "div" | "section" | "li" | "ul" | "ol" | "p" | "h2" | "h3" | "span" | "article" | "header";

interface RevealProps {
  children: ReactNode;
  as?: Tag;
  delay?: number;
  y?: number;
  className?: string;
  amount?: number;
}

export function Reveal({ children, as = "div", delay = 0, y = 20, className, amount = 0.25 }: RevealProps) {
  const Component = motion[as];
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </Component>
  );
}

const group: Variants = {
  hidden: {},
  shown: (stagger: number = 0.07) => ({ transition: { staggerChildren: stagger } }),
};

const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

export function RevealGroup({
  children,
  as = "div",
  stagger = 0.07,
  className,
  amount = 0.2,
}: {
  children: ReactNode;
  as?: Tag;
  stagger?: number;
  className?: string;
  amount?: number;
}) {
  const Component = motion[as];
  return (
    <Component
      className={className}
      variants={group}
      custom={stagger}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount }}
    >
      {children}
    </Component>
  );
}

export function RevealItem({ children, as = "div", className }: { children: ReactNode; as?: Tag; className?: string }) {
  const Component = motion[as];
  return (
    <Component className={className} variants={item}>
      {children}
    </Component>
  );
}
