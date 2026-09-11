import type { ReactNode } from "react";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { ConsoleNav } from "./ConsoleNav";
import { ButtonLink } from "./ui/button";
import { Logo } from "./ui/logo";

/** Frame for the operations console: dashboard, jobs, decisions. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-canvas">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Logo href="/" className="shrink-0" />
          <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />
          <ConsoleNav />
          <div className="ml-auto">
            <ButtonLink href="/jobs/new" size="sm" icon={<Plus weight="bold" className="size-4" />} aria-label="New work order">
              <span className="hidden sm:inline">New work order</span>
            </ButtonLink>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="no-print border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2 px-4 py-5 text-micro text-muted sm:px-6">
          <p>FieldProof operations console</p>
          <p>The model proposes. Policy authorizes. A tool executes.</p>
        </div>
      </footer>
    </div>
  );
}
