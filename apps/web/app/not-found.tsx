import { ArrowLeft, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <Logo className="mb-10" />
        <div className="mx-auto grid size-14 place-items-center rounded-panel border border-line bg-surface text-muted shadow-raised">
          <MagnifyingGlass aria-hidden className="size-6" />
        </div>
        <h1 className="mt-6 text-heading text-ink">Nothing here</h1>
        <p className="mt-2 text-body text-muted">
          That job, decision or page does not exist. It may have been removed when local data was reset.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/dashboard" icon={<ArrowLeft weight="bold" className="size-4" />}>
            Back to operations
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
