import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Logo } from "@/components/ui";
import { config } from "@/lib/config";

export default function HomePage() {
  // In local library mode the home page IS the library.
  if (config.localMode && !process.env.VERCEL) redirect("/library");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Logo className="mb-6" />
      <Card className="p-7">
        <h1 className="text-2xl font-semibold text-ink">Band invoices, the easy way</h1>
        <p className="mt-2 text-dim">
          Invoicing someone? Open the personal link you were sent — it already has the gig
          details filled in. You just add your own info and get a PDF.
        </p>
        <div className="mt-6 rounded-xl border border-hair bg-elev p-4 text-sm text-dim">
          <p className="font-medium text-ink">No link yet?</p>
          <p className="mt-1">Ask the person billing you to send one.</p>
        </div>
        <Link
          href="/admin"
          className="mt-6 inline-block text-sm font-medium text-accent hover:text-accent-strong"
        >
          Admin → create an invoice link
        </Link>
      </Card>
    </main>
  );
}
