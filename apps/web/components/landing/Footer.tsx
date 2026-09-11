import Link from "next/link";
import { Logo } from "../ui/logo";

const LINKS = [
  { href: "/dashboard", label: "Operations console" },
  { href: "/decisions", label: "Decision queue" },
  { href: "/jobs/new", label: "New work order" },
];

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <Logo />
          <p className="mt-3 max-w-[44ch] text-caption text-muted">
            The autonomous closeout agent for field-service teams. Runs on Amazon Bedrock, DynamoDB, S3 and EventBridge.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-caption font-semibold text-ink-2 hover:text-ink hover:underline">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
