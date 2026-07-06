import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import Nav from "./Nav";
import AuthGate from "./AuthGate";

export const dynamic = "force-dynamic";

/**
 * Shell for the local library. Only exists in local mode — on the deployed
 * server every /library page 404s. AuthGate blocks everything until the
 * stored sync token validates against the platform's allowlist.
 */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  if (!config.localMode || process.env.VERCEL) notFound();
  return (
    <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <Nav />
      <AuthGate>{children}</AuthGate>
    </main>
  );
}
