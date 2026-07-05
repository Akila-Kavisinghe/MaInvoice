"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import type { BusinessInfo, RemoteInfo } from "../lib-types";
import FolderPicker from "../FolderPicker";
import ServerCard from "../ServerCard";
import BusinessCard from "../BusinessCard";

const EMPTY_BUSINESS: BusinessInfo = {
  name: "",
  email: "",
  address: "",
  phone: "",
  taxNumber: "",
};

/** All app configuration in one place: folder, server connection, business. */
export default function SettingsView({ initialDir }: { initialDir: string | null }) {
  const [invoiceDir, setInvoiceDir] = useState<string | null>(initialDir);
  const [changingFolder, setChangingFolder] = useState(initialDir === null);
  const [remote, setRemote] = useState<RemoteInfo | null>(null);
  const [business, setBusiness] = useState<BusinessInfo>(EMPTY_BUSINESS);

  useEffect(() => {
    fetch("/api/local/settings")
      .then((r) => r.json())
      .then((d) => {
        setRemote({ url: d.remoteUrl, configured: d.remoteConfigured });
        if (d.business) setBusiness(d.business);
      })
      .catch(() => setRemote({ url: null, configured: false }));
  }, []);

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Settings</h1>

      {/* Invoice folder */}
      <Card className="mt-5 p-5">
        <h2 className="text-lg font-semibold text-ink">Invoice folder</h2>
        <p className="mt-1 text-sm text-dim">
          Where your invoices live as files. Put it inside Google Drive or
          iCloud for your own cloud backup.
        </p>
        {invoiceDir ? (
          <p className="mt-3 break-all rounded-lg bg-elev px-3 py-2 font-mono text-xs text-ink">
            {invoiceDir}
          </p>
        ) : (
          <p className="mt-3 text-sm text-danger">No folder chosen yet.</p>
        )}
        {!changingFolder ? (
          <button
            type="button"
            onClick={() => setChangingFolder(true)}
            className="mt-3 rounded-lg px-2.5 py-1.5 text-sm font-medium text-accent hover:bg-elev"
          >
            Change folder
          </button>
        ) : null}
      </Card>
      {changingFolder ? (
        <FolderPicker
          initialPath={invoiceDir}
          onChosen={(dir) => {
            setInvoiceDir(dir);
            setChangingFolder(false);
          }}
          onCancel={invoiceDir ? () => setChangingFolder(false) : undefined}
        />
      ) : null}

      {/* Server connection */}
      {remote ? (
        <ServerCard
          initialUrl={remote.url}
          configured={remote.configured}
          onSaved={setRemote}
        />
      ) : null}

      {/* Business details */}
      <BusinessCard
        key={business.email + business.name /* remount once settings load */}
        initial={business}
        onSaved={setBusiness}
      />
    </>
  );
}
