"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "../ui/button";
import { CloseoutEngine } from "./hero/engine";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Two headline directions, both tested against the engine below. "closed"
 * takes a third line (pushing the engine's bottom edge under a 900px fold)
 * and restates what the rail and outcome already say, so "prove" ships.
 */
const HEADLINES = {
  prove: [["The", "fieldwork", "is", "done."], ["Now", "prove", "it."]],
  closed: [["Work", "completed."], ["Evidence", "verified."], ["Job", "closed."]],
} as const;
const HEADLINE = HEADLINES.prove;

export function Hero() {
  // The server cannot know the preference; apply it after mount so the first
  // client render matches the server HTML.
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = mounted && Boolean(prefersReduced);
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end start"] });

  // As the page scrolls on, the copy lifts away faster than the engine, and
  // the engine sinks back a little, like a screen being pushed down the desk.
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -110]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const engineY = useTransform(scrollYProgress, [0, 1], [0, 60]);
  const engineScale = useTransform(scrollYProgress, [0, 1], [1, 0.93]);
  const engineTilt = useTransform(scrollYProgress, [0, 1], [0, 9]);

  return (
    <section ref={section} aria-labelledby="hero-title" className="relative isolate overflow-x-clip">
      <div aria-hidden className="hero-ground absolute inset-x-0 top-0 -z-10 h-[70%]" />

      <div className="mx-auto flex min-h-[100dvh] max-w-[1280px] flex-col px-4 pt-20 pb-10 sm:px-6 lg:pt-[5.5rem]">
        <motion.div
          style={reduce ? undefined : { y: copyY, opacity: copyOpacity }}
          className="grid grid-cols-1 items-end gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
        >
          <h1 id="hero-title" className="text-display text-ink">
            {HEADLINE.map((line, li) => (
              <span key={li} className={li === HEADLINE.length - 1 ? "block text-accent" : "block"}>
                {line.map((word, wi) => (
                  <Fragment key={word}>
                    <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
                      <motion.span
                        className="inline-block"
                        initial={{ y: "105%" }}
                        animate={{ y: "0%" }}
                        transition={{ duration: 0.9, delay: 0.1 + li * 0.3 + wi * 0.07, ease: EASE }}
                      >
                        {word}
                      </motion.span>
                    </span>
                    {wi < line.length - 1 && " "}
                  </Fragment>
                ))}
              </span>
            ))}
          </h1>

          <div className="lg:pb-2">
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.5, ease: EASE }}
              className="max-w-[30rem] text-lead text-ink-2"
            >
              FieldProof checks every photo, signature and receipt against the work order, and closes the job when the
              evidence holds.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.62, ease: EASE }}
              className="mt-6 flex flex-wrap items-center gap-3"
            >
              <ButtonLink href="/dashboard" size="lg" iconRight={<ArrowRight weight="bold" className="size-4" />}>
                Open console
              </ButtonLink>
              <ButtonLink href="#how" size="lg" variant="secondary" iconRight={<ArrowDown weight="bold" className="size-4" />}>
                See how it works
              </ButtonLink>
            </motion.div>
          </div>
        </motion.div>

        <div className="mt-8 [perspective:1600px]">
          <motion.div
            style={reduce ? undefined : { y: engineY, scale: engineScale, rotateX: engineTilt, transformOrigin: "50% 0%" }}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, rotateX: 12 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ duration: 1.1, delay: 0.35, ease: EASE }}
              style={{ transformOrigin: "50% 100%" }}
            >
              <CloseoutEngine />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
