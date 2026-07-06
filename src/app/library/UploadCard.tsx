"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Banner, Button, Card, Input, Label, Textarea } from "@/components/ui";
import type { Contact } from "./lib-types";

const NEW_SENDER = "__new__";

const EMPTY_UPLOAD = {
  eventName: "",
  description: "",
  eventDate: "",
  bandmateName: "",
  contactEmail: "",
  invoiceNumber: "",
  amount: "",
  notes: "",
};

/**
 * Manually file invoice PDFs you already have. Drop one or several PDFs (or
 * browse) — files queue up and are saved one at a time: the app reads each
 * PDF to prefill its details (recognizing senders whose email matches a
 * contact), you confirm, it saves and advances to the next. Event name/date
 * carry over between files since a batch is usually one gig. Files are
 * stored under the canonical "Invoice - <who> - <event> - <date>.pdf" name.
 */
export default function UploadCard({
  contacts = [],
  eventNames = [],
  direction = "inbound",
  onUploaded,
}: {
  contacts?: Contact[];
  eventNames?: string[];
  direction?: "inbound" | "outbound";
  onUploaded: () => void;
}) {
  const [form, setForm] = useState(EMPTY_UPLOAD);
  const [queue, setQueue] = useState<File[]>([]);
  const [total, setTotal] = useState(0); // batch size, for "File 2 of 5"
  const [picked, setPicked] = useState(NEW_SENDER);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saveContact, setSaveContact] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const eventsListId = useId();

  const file = queue[0] ?? null;
  const outbound = direction === "outbound";

  function update<K extends keyof typeof EMPTY_UPLOAD>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** Selecting a contact autofills who the invoice is from / billed to. */
  function pickContact(email: string) {
    setPicked(email);
    if (email === NEW_SENDER) return;
    const c = contacts.find((x) => x.email === email);
    if (c) {
      setForm((f) => ({ ...f, bandmateName: c.name, contactEmail: c.email }));
    }
  }

  // The typed/parsed email already belongs to a contact → no need to offer
  // saving them again.
  const knownContact = contacts.some(
    (c) => c.email === form.contactEmail.trim().toLowerCase(),
  );

  // Object URLs hold the PDF bytes alive — release the old one whenever the
  // file changes and on unmount.
  function swapPreview(f: File | null) {
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return f ? URL.createObjectURL(f) : null;
    });
  }
  useEffect(
    () => () => {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    },
    [],
  );

  /** Read a PDF and prefill EMPTY fields only — never clobber typed values. */
  async function parseInto(f: File) {
    setParsing(true);
    setParseNote(null);
    try {
      const body = new FormData();
      body.set("file", f);
      const res = await fetch("/api/local/parse-invoice", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return; // parsing is best-effort; the form still works
      const s = data.suggestions ?? {};
      setForm((prev) => ({
        ...prev,
        bandmateName: prev.bandmateName || s.senderName || "",
        contactEmail: prev.contactEmail || s.contactEmail || "",
        invoiceNumber: prev.invoiceNumber || s.invoiceNumber || "",
        amount: prev.amount || (typeof s.amount === "number" ? String(s.amount) : ""),
        eventName: prev.eventName || s.eventName || "",
        eventDate: prev.eventDate || s.eventDate || "",
      }));
      if (data.matchedContact) {
        // Keep the sender dropdown in step with what the PDF matched.
        setPicked((p) => (p === NEW_SENDER ? data.matchedContact.email : p));
        setParseNote(
          `Recognized ${data.matchedContact.name} (${data.matchedContact.email}) from your contacts — details prefilled, edit anything.`,
        );
      } else if (data.textFound) {
        setParseNote("Prefilled what could be read from the PDF — check and edit before saving.");
      } else {
        setParseNote("Couldn't read text from this PDF (likely a scan) — fill in the details manually.");
      }
    } catch {
      /* best-effort */
    } finally {
      setParsing(false);
    }
  }

  function chooseFiles(list: FileList | File[]) {
    const pdfs = [...list].filter(
      (f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf",
    );
    if (pdfs.length === 0) {
      setError("Only PDF files can be filed as invoices.");
      return;
    }
    setError(null);
    setSuccess(null);
    setQueue(pdfs);
    setTotal(pdfs.length);
    swapPreview(pdfs[0]);
    parseInto(pdfs[0]);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!file) {
      setError("Choose or drop a PDF file to upload.");
      return;
    }

    const body = new FormData();
    body.set("file", file);
    for (const [k, v] of Object.entries(form)) body.set(k, v);
    body.set("saveContact", String(saveContact));
    body.set("direction", direction);

    setLoading(true);
    try {
      const res = await fetch("/api/local/invoices", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }
      onUploaded();

      const rest = queue.slice(1);
      setQueue(rest);
      setPicked(NEW_SENDER);
      setSaveContact(true);
      setParseNote(null);
      if (rest.length > 0) {
        // Same gig, next bandmate: keep the event, clear the person-specific
        // fields, and prefill from the next PDF.
        setForm((f) => ({
          ...EMPTY_UPLOAD,
          eventName: f.eventName,
          eventDate: f.eventDate,
        }));
        setSuccess(
          `Saved "${file.name}" — ${rest.length} file${rest.length === 1 ? "" : "s"} to go.`,
        );
        swapPreview(rest[0]);
        parseInto(rest[0]);
      } else {
        setForm(EMPTY_UPLOAD);
        setTotal(0);
        swapPreview(null);
        if (inputRef.current) inputRef.current.value = "";
        setSuccess(
          data.contactSaved
            ? `Invoice added — ${form.bandmateName || form.contactEmail} saved to your contacts.`
            : total > 1
              ? `All ${total} invoices added to your library.`
              : "Invoice added to your library.",
        );
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    // With a PDF selected the form and a live preview sit side by side (the
    // preview is what you read the details off while filling the fields).
    <Card className="mt-6 p-5">
      <h2 className="text-lg font-semibold text-ink">
        {outbound ? "Upload an invoice you issued" : "Upload an invoice PDF"}
      </h2>
      <p className="mt-1 text-sm text-dim">
        {outbound
          ? "A PDF you already sent to a client — filed under Outbound for your income records."
          : "Drop in any invoice PDF — the app reads it to prefill the details, then files it into your folder."}{" "}
        You can drop several at once; they save one at a time.
      </p>
      <div className={previewUrl ? "grid gap-6 lg:grid-cols-2" : ""}>
      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        {/* Drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) chooseFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed px-4 py-8 text-center transition ${
            dragOver
              ? "border-accent bg-accent/5"
              : file
                ? "border-success/50 bg-success/5"
                : "border-hair bg-elev hover:border-accent/50"
          }`}
        >
          {file ? (
            <>
              <p className="text-sm font-medium text-ink">{file.name}</p>
              <p className="mt-1 text-xs text-muted">
                {parsing
                  ? "Reading PDF…"
                  : total > 1
                    ? `File ${total - queue.length + 1} of ${total}`
                    : "Click or drop to replace"}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-ink">
                Drag &amp; drop invoice PDFs here
              </p>
              <p className="mt-1 text-xs text-muted">or click to browse — multiple files welcome</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) chooseFiles(e.target.files);
            }}
          />
        </div>

        {parseNote ? <Banner tone="info">{parseNote}</Banner> : null}

        {contacts.length > 0 ? (
          <div>
            <Label>{outbound ? "Client" : "Sender"}</Label>
            <select
              value={picked}
              onChange={(e) => pickContact(e.target.value)}
              className="w-full rounded-[10px] border border-hair bg-elev px-3.5 py-3 text-ink outline-none transition focus:border-accent"
            >
              <option value={NEW_SENDER}>Someone new…</option>
              {contacts.map((c) => (
                <option key={c.email} value={c.email}>
                  {c.name} ({c.email})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Event name</Label>
            <Input
              value={form.eventName}
              onChange={(e) => update("eventName", e.target.value)}
              list={eventsListId}
            />
            <datalist id={eventsListId}>
              {eventNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>
          <div>
            <Label>Event date</Label>
            <Input
              type="date"
              value={form.eventDate}
              onChange={(e) => update("eventDate", e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label hint="(optional)">Description</Label>
          <Input
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Secondary line under the event"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{outbound ? "Billed to" : "Who it's from"}</Label>
            <Input
              value={form.bandmateName}
              onChange={(e) => update("bandmateName", e.target.value)}
            />
          </div>
          <div>
            <Label hint="(optional)">Their email</Label>
            <Input
              type="email"
              value={form.contactEmail}
              onChange={(e) => update("contactEmail", e.target.value)}
            />
          </div>
        </div>
        {knownContact ? (
          <p className="text-sm text-muted">
            {form.bandmateName.trim() || form.contactEmail.trim()} is already in
            your contacts.
          </p>
        ) : (
          <label
            className={`flex items-center gap-2.5 text-sm ${
              form.contactEmail.trim() ? "text-slate-700" : "text-slate-400"
            }`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={saveContact && !!form.contactEmail.trim()}
              disabled={!form.contactEmail.trim()}
              onChange={(e) => setSaveContact(e.target.checked)}
            />
            Save {form.bandmateName.trim() || (outbound ? "the client" : "the sender")} to my contacts
            {form.contactEmail.trim() ? "" : " (enter their email above)"}
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Invoice #</Label>
            <Input
              value={form.invoiceNumber}
              onChange={(e) => update("invoiceNumber", e.target.value)}
            />
          </div>
          <div>
            <Label>Amount</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />
        </div>
        {error ? <Banner tone="error">{error}</Banner> : null}
        {success ? <Banner tone="success">{success}</Banner> : null}
        <Button type="submit" disabled={loading || parsing} className="w-full">
          {loading
            ? "Adding…"
            : queue.length > 1
              ? `Add invoice (${queue.length - 1} more after this)`
              : "Add invoice"}
        </Button>
      </form>

      {previewUrl ? (
        <div className="mt-4 flex flex-col lg:sticky lg:top-6 lg:self-start">
          <p className="mb-1.5 text-xs font-medium text-muted">
            Preview — read the details off it as you fill in the form
          </p>
          <iframe
            src={`${previewUrl}#view=FitH`}
            title="Invoice PDF preview"
            className="h-[26rem] w-full rounded-[10px] border border-hair bg-elev lg:h-[calc(100vh-10rem)] lg:min-h-[28rem]"
          />
        </div>
      ) : null}
      </div>
    </Card>
  );
}
