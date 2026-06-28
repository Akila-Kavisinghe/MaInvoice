import { redirect } from "next/navigation";
import { hasValidSession } from "@/lib/auth";
import { getGig } from "@/lib/store";
import { Card } from "@/components/ui";
import PasswordGate from "./PasswordGate";
import InvoiceForm from "./InvoiceForm";

export const dynamic = "force-dynamic";

export default async function InvoiceLinkPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { k?: string };
}) {
  const gig = await getGig(params.token);

  // Per-link auto-unlock: if the share link carries a key and there's no band
  // session yet, hand off to the unlock route to verify it and set the cookie,
  // then return to the clean URL. Cookies can't be set from a server component.
  if (gig && searchParams.k && !hasValidSession("band")) {
    redirect(
      `/api/auth/unlock?token=${encodeURIComponent(params.token)}&k=${encodeURIComponent(searchParams.k)}`,
    );
  }

  if (!gig) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
        <Card className="p-7 text-center">
          <h1 className="text-xl font-bold">Link not found</h1>
          <p className="mt-2 text-slate-600">
            This invoice link is invalid or has been removed. Please ask the band
            lead for a new one.
          </p>
        </Card>
      </main>
    );
  }

  // SECURITY: do not render the prefilled form (or any gig details) until the
  // shared password has been verified server-side.
  if (!hasValidSession("band")) {
    return <PasswordGate />;
  }

  // Authenticated — safe to send the prefilled form.
  return (
    <InvoiceForm
      token={gig.token}
      adminEmail={gig.payeeEmail}
      gig={{
        payeeName: gig.payeeName,
        eventName: gig.eventName,
        eventDate: gig.eventDate,
        venue: gig.venue,
        paymentDescription: gig.paymentDescription,
        amountLocked: gig.amountLocked,
        defaultAmount: gig.defaultAmount,
        dueDate: gig.dueDate,
        notes: gig.notes,
      }}
    />
  );
}
