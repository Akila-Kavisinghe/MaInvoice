import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Gig, BandmateInput } from "./types";
import { formatDate, formatMoney } from "./format";

const COLORS = {
  ink: "#111827",
  muted: "#6b7280",
  line: "#e5e7eb",
  brand: "#4f8cff",
  soft: "#f3f4f6",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    color: COLORS.ink,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  title: { fontSize: 26, fontFamily: "Helvetica-Bold", color: COLORS.brand },
  metaTable: { marginTop: 6 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 2 },
  metaLabel: { color: COLORS.muted, marginRight: 8 },
  metaValue: { fontFamily: "Helvetica-Bold", minWidth: 90, textAlign: "right" },

  partiesRow: { flexDirection: "row", justifyContent: "space-between", gap: 24 },
  party: { width: "47%" },
  partyLabel: {
    fontSize: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: COLORS.muted,
    marginBottom: 4,
  },
  partyName: { fontFamily: "Helvetica-Bold", fontSize: 11, marginBottom: 2 },
  partyLine: { color: COLORS.ink, marginBottom: 1 },

  section: { marginTop: 24 },
  eventBox: {
    backgroundColor: COLORS.soft,
    borderRadius: 6,
    padding: 12,
    marginTop: 24,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  eventCell: { width: "50%", marginBottom: 6 },
  eventLabel: { fontSize: 8, textTransform: "uppercase", color: COLORS.muted },
  eventValue: { fontFamily: "Helvetica-Bold" },

  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.ink,
    paddingBottom: 6,
    marginTop: 28,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
    paddingVertical: 10,
  },
  colDesc: { width: "75%" },
  colAmount: { width: "25%", textAlign: "right" },
  headText: { fontSize: 8, letterSpacing: 1, textTransform: "uppercase", color: COLORS.muted },

  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 16 },
  totalsBox: { width: "45%" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: COLORS.ink,
  },
  grandLabel: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  grandValue: { fontFamily: "Helvetica-Bold", fontSize: 12, color: COLORS.brand },

  noteBlock: { marginTop: 22 },
  noteLabel: { fontSize: 8, textTransform: "uppercase", color: COLORS.muted, marginBottom: 3 },

  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    textAlign: "center",
    color: COLORS.muted,
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 8,
  },
});

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function EventCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.eventCell}>
      <Text style={styles.eventLabel}>{label}</Text>
      <Text style={styles.eventValue}>{value}</Text>
    </View>
  );
}

interface Party {
  name: string;
  /** Address lines, email, phone, tax number — rendered in order. */
  lines: string[];
}

interface InvoiceProps {
  invoiceNumber: string;
  issueDate: string; // yyyy-mm-dd
  dueDate?: string;
  from: Party;
  billTo: Party;
  /** Optional event box (gigs have one; general outbound invoices may not). */
  event?: { name: string; date: string; venue?: string };
  description: string;
  /** Muted second line under the description in the line-item table. */
  descriptionDetail?: string;
  amount: number;
  paymentMethod?: string;
  paymentInstructions?: string;
  notes?: string;
}

/** Direction-neutral invoice document: From bills BillTo. */
function InvoiceDocument(props: InvoiceProps) {
  const {
    invoiceNumber,
    issueDate,
    dueDate,
    from,
    billTo,
    event,
    description,
    descriptionDetail,
    amount,
    paymentMethod,
    paymentInstructions,
    notes,
  } = props;
  return (
    <Document
      title={`Invoice ${invoiceNumber}`}
      author={from.name}
      subject={event ? `Invoice for ${event.name}` : `Invoice ${invoiceNumber}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>INVOICE</Text>
          <View style={styles.metaTable}>
            <MetaRow label="Invoice #" value={invoiceNumber} />
            <MetaRow label="Issue date" value={formatDate(issueDate)} />
            {dueDate ? <MetaRow label="Due date" value={formatDate(dueDate)} /> : null}
          </View>
        </View>

        {/* Parties */}
        <View style={styles.partiesRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{from.name}</Text>
            {from.lines.map((l, i) => (
              <Text key={i} style={styles.partyLine}>
                {l}
              </Text>
            ))}
          </View>

          <View style={styles.party}>
            <Text style={styles.partyLabel}>Bill to</Text>
            <Text style={styles.partyName}>{billTo.name}</Text>
            {billTo.lines.map((l, i) => (
              <Text key={i} style={styles.partyLine}>
                {l}
              </Text>
            ))}
          </View>
        </View>

        {/* Event details */}
        {event ? (
          <View style={styles.eventBox}>
            <EventCell label="Event" value={event.name} />
            <EventCell label="Date" value={formatDate(event.date)} />
            {event.venue ? <EventCell label="Venue / location" value={event.venue} /> : null}
          </View>
        ) : null}

        {/* Line items */}
        <View style={styles.tableHead}>
          <Text style={[styles.colDesc, styles.headText]}>Description</Text>
          <Text style={[styles.colAmount, styles.headText]}>Amount</Text>
        </View>
        <View style={styles.tableRow}>
          <View style={styles.colDesc}>
            <Text>{description}</Text>
            {descriptionDetail ? (
              <Text style={{ color: COLORS.muted, marginTop: 2 }}>
                {descriptionDetail}
              </Text>
            ) : null}
          </View>
          <Text style={styles.colAmount}>{formatMoney(amount)}</Text>
        </View>

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={{ color: COLORS.muted }}>Subtotal</Text>
              <Text>{formatMoney(amount)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total due</Text>
              <Text style={styles.grandValue}>{formatMoney(amount)}</Text>
            </View>
          </View>
        </View>

        {/* Payment + notes */}
        {paymentMethod ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Payment method</Text>
            <Text>{paymentMethod}</Text>
          </View>
        ) : null}

        {paymentInstructions ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Payment instructions</Text>
            <Text>{paymentInstructions}</Text>
          </View>
        ) : null}

        {notes ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Notes</Text>
            <Text>{notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          Invoice {invoiceNumber} · {from.name}
          {event ? ` · ${event.name}` : ""}
          {"  ·  Generated with WONDERvoice"}
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Inbound: the invoice is issued BY the bandmate (From) TO the band (Bill To).
 * Signature and output unchanged — this maps onto the neutral document.
 */
export async function renderInvoicePdf(
  gig: Gig,
  input: BandmateInput,
): Promise<Buffer> {
  const issueDate = new Date().toISOString().slice(0, 10);
  const fromLines = [
    ...(input.bandmateAddress ? input.bandmateAddress.split("\n") : []),
    input.bandmateEmail,
    ...(input.taxNumber ? [`Tax / HST #: ${input.taxNumber}`] : []),
  ];
  const billToLines = [
    ...(gig.payeeContact ? [gig.payeeContact] : []),
    ...(gig.payeeAddress ? gig.payeeAddress.split("\n") : []),
    ...(gig.payeePhone ? [gig.payeePhone] : []),
    gig.payeeEmail,
  ];
  return renderToBuffer(
    <InvoiceDocument
      invoiceNumber={input.invoiceNumber}
      issueDate={issueDate}
      dueDate={gig.dueDate}
      from={{ name: input.bandmateName, lines: fromLines }}
      billTo={{ name: gig.payeeName, lines: billToLines }}
      event={{ name: gig.eventName, date: gig.eventDate, venue: gig.venue }}
      description={gig.paymentDescription}
      descriptionDetail={`${gig.eventName} — ${formatDate(gig.eventDate)}`}
      amount={input.amount}
      paymentMethod={input.paymentMethod}
      paymentInstructions={gig.notes}
      notes={input.notes}
    />,
  );
}

export interface OutboundPdfArgs {
  invoiceNumber: string;
  business: {
    name: string;
    email: string;
    address?: string;
    phone?: string;
    taxNumber?: string;
  };
  clientName: string;
  clientEmail?: string;
  clientAddress?: string;
  eventName?: string;
  eventDate?: string;
  venue?: string;
  description: string;
  amount: number;
  dueDate?: string;
  paymentInstructions?: string;
  notes?: string;
}

/** Outbound: the user's business (From) bills a client (Bill To). */
export async function renderOutboundInvoicePdf(
  args: OutboundPdfArgs,
): Promise<Buffer> {
  const issueDate = new Date().toISOString().slice(0, 10);
  const fromLines = [
    ...(args.business.address ? args.business.address.split("\n") : []),
    ...(args.business.phone ? [args.business.phone] : []),
    args.business.email,
    ...(args.business.taxNumber ? [`Tax / HST #: ${args.business.taxNumber}`] : []),
  ];
  const billToLines = [
    ...(args.clientAddress ? args.clientAddress.split("\n") : []),
    ...(args.clientEmail ? [args.clientEmail] : []),
  ];
  return renderToBuffer(
    <InvoiceDocument
      invoiceNumber={args.invoiceNumber}
      issueDate={issueDate}
      dueDate={args.dueDate}
      from={{ name: args.business.name, lines: fromLines }}
      billTo={{ name: args.clientName, lines: billToLines }}
      event={
        args.eventName && args.eventDate
          ? { name: args.eventName, date: args.eventDate, venue: args.venue }
          : undefined
      }
      description={args.description}
      descriptionDetail={
        args.eventName && args.eventDate
          ? `${args.eventName} — ${formatDate(args.eventDate)}`
          : undefined
      }
      amount={args.amount}
      paymentInstructions={args.paymentInstructions}
      notes={args.notes}
    />,
  );
}
