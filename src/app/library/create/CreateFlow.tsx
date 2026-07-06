"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Card } from "@/components/ui";
import type { BusinessInfo, Contact } from "../lib-types";
import OutboundForm from "../OutboundForm";
import LinkForm from "../LinkForm";
import UploadCard from "../UploadCard";

type Step =
  | "direction" // inbound or outbound?
  | "inbound-how" // link or upload?
  | "outbound-how" // generate or upload?
  | "outbound"
  | "outbound-upload"
  | "link"
  | "upload";

const EMPTY_BUSINESS: BusinessInfo = {
  name: "",
  email: "",
  address: "",
  phone: "",
  taxNumber: "",
};

/**
 * Guided flow: first pick the direction of money, then the tool that fits.
 *   Outbound → generate a PDF invoice to a client.
 *   Inbound  → create a link for the sender, or upload a PDF you have.
 */
export default function CreateFlow({ hasFolder }: { hasFolder: boolean }) {
  const [step, setStep] = useState<Step>("direction");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [eventNames, setEventNames] = useState<string[]>([]);
  const [business, setBusiness] = useState<BusinessInfo>(EMPTY_BUSINESS);
  const [remoteConfigured, setRemoteConfigured] = useState(false);

  useEffect(() => {
    fetch("/api/local/contacts")
      .then((r) => (r.ok ? r.json() : { contacts: [] }))
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => {});
    // Existing event names feed the autofill suggestions — a batch of
    // invoices for one gig reuses the same event.
    fetch("/api/local/invoices")
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d) => {
        const names = new Set<string>();
        for (const inv of d.invoices ?? []) {
          if (inv.eventName) names.add(inv.eventName);
        }
        setEventNames([...names].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {});
    fetch("/api/local/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.business) setBusiness(d.business);
        setRemoteConfigured(!!d.remoteConfigured);
      })
      .catch(() => {});
  }, []);

  if (!hasFolder) {
    return (
      <>
        <h1 className="text-2xl font-semibold text-ink">Create an invoice</h1>
        <div className="mt-4">
          <Banner tone="info">
            Choose your invoice folder first —{" "}
            <Link href="/library" className="font-medium underline">
              set it up on the Invoices page
            </Link>
            .
          </Banner>
        </div>
      </>
    );
  }

  const back = (to: Step, label: string) => (
    <button
      type="button"
      onClick={() => setStep(to)}
      className="mt-4 rounded-lg px-2.5 py-1.5 text-sm font-medium text-dim hover:bg-elev hover:text-ink"
    >
      ← {label}
    </button>
  );

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Create an invoice</h1>

      {step === "direction" ? (
        <>
          <p className="mt-1 text-sm text-dim">Which way is the money going?</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              emoji="📥"
              title="Inbound"
              subtitle="Someone is invoicing me — they submit via link, or I file a PDF I received."
              onClick={() => setStep("inbound-how")}
            />
            <ChoiceCard
              emoji="📤"
              title="Outbound"
              subtitle="I'm requesting money — generate an invoice to a client, or file one I already sent."
              onClick={() => setStep("outbound-how")}
            />
          </div>
        </>
      ) : null}

      {step === "inbound-how" ? (
        <>
          <p className="mt-1 text-sm text-dim">How does the invoice get to you?</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              emoji="🔗"
              title="Create an invoice link"
              subtitle="Send someone a prefilled link; their invoice syncs into the library automatically."
              onClick={() => setStep("link")}
            />
            <ChoiceCard
              emoji="📄"
              title="Upload a PDF"
              subtitle="I already have the invoice file — just organize and track it."
              onClick={() => setStep("upload")}
            />
          </div>
          {back("direction", "Back")}
        </>
      ) : null}

      {step === "outbound-how" ? (
        <>
          <p className="mt-1 text-sm text-dim">Do you need a new PDF, or do you have one?</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ChoiceCard
              emoji="🧾"
              title="Generate an invoice"
              subtitle="Create the PDF here — from your business to a client or venue."
              onClick={() => setStep("outbound")}
            />
            <ChoiceCard
              emoji="📄"
              title="Upload a PDF"
              subtitle="I already sent an invoice made elsewhere — just file and track it."
              onClick={() => setStep("outbound-upload")}
            />
          </div>
          {back("direction", "Back")}
        </>
      ) : null}

      {step === "outbound-upload" ? (
        <>
          {back("outbound-how", "Back")}
          <UploadCard
            contacts={contacts}
            eventNames={eventNames}
            direction="outbound"
            onUploaded={() => {}}
          />
        </>
      ) : null}

      {step === "outbound" ? (
        <>
          {back("outbound-how", "Back")}
          {!business.name || !business.email ? (
            <div className="mt-3">
              <Banner tone="info">
                Set your business details first (they&apos;re the &quot;From&quot; on the
                invoice) —{" "}
                <Link href="/library/settings" className="font-medium underline">
                  open Settings
                </Link>
                .
              </Banner>
            </div>
          ) : null}
          <OutboundForm contacts={contacts} eventNames={eventNames} onCreated={() => {}} />
        </>
      ) : null}

      {step === "link" ? (
        <>
          {back("inbound-how", "Back")}
          <LinkForm business={business} remoteConfigured={remoteConfigured} />
        </>
      ) : null}

      {step === "upload" ? (
        <>
          {back("inbound-how", "Back")}
          <UploadCard contacts={contacts} eventNames={eventNames} onUploaded={() => {}} />
        </>
      ) : null}
    </>
  );
}

function ChoiceCard({
  emoji,
  title,
  subtitle,
  onClick,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className="h-full p-5 transition hover:border-accent">
        <div className="text-2xl">{emoji}</div>
        <h2 className="mt-2 text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-sm text-dim">{subtitle}</p>
      </Card>
    </button>
  );
}
