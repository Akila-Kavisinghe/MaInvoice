import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import Nav from "./Nav";

export const dynamic = "force-dynamic";

/**
 * Shell for the local library. Only exists in local mode — on the deployed
 * server every /library page 404s.
 */
export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  if (!config.localMode || process.env.VERCEL) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Nav />
      {children}
    </main>
  );
}
