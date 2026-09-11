import { ConsoleShell } from "@/components/ConsoleShell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
