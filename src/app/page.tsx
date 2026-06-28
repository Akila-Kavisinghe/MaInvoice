import Link from "next/link";
import { Card } from "@/components/ui";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Card className="p-7">
        <h1 className="text-2xl font-bold text-slate-900">Band Invoice</h1>
        <p className="mt-2 text-slate-600">
          Bandmates: open the personal link you were sent — it already has the gig
          details filled in. You just add your own info and get a PDF.
        </p>
        <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
          <p className="font-medium text-slate-800">No link yet?</p>
          <p className="mt-1">Ask the band lead to send you one.</p>
        </div>
        <Link
          href="/admin"
          className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Admin → create an invoice link
        </Link>
      </Card>
    </main>
  );
}
