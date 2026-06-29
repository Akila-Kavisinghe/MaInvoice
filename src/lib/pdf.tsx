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

/**
 * The invoice is issued BY the bandmate (From) TO the band/admin (Bill To).
 */
function InvoiceDocument({
  gig,
  input,
  issueDate,
}: {
  gig: Gig;
  input: BandmateInput;
  issueDate: string;
}) {
  return (
    <Document
      title={`Invoice ${input.invoiceNumber}`}
      author={input.bandmateName}
      subject={`Invoice for ${gig.eventName}`}
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.title}>INVOICE</Text>
          <View style={styles.metaTable}>
            <MetaRow label="Invoice #" value={input.invoiceNumber} />
            <MetaRow label="Issue date" value={formatDate(issueDate)} />
            {gig.dueDate ? <MetaRow label="Due date" value={formatDate(gig.dueDate)} /> : null}
          </View>
        </View>

        {/* Parties */}
        <View style={styles.partiesRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{input.bandmateName}</Text>
            {input.bandmateAddress
              ? input.bandmateAddress
                  .split("\n")
                  .map((l, i) => (
                    <Text key={i} style={styles.partyLine}>
                      {l}
                    </Text>
                  ))
              : null}
            <Text style={styles.partyLine}>{input.bandmateEmail}</Text>
            {input.taxNumber ? (
              <Text style={styles.partyLine}>Tax / HST #: {input.taxNumber}</Text>
            ) : null}
          </View>

          <View style={styles.party}>
            <Text style={styles.partyLabel}>Bill to</Text>
            <Text style={styles.partyName}>{gig.payeeName}</Text>
            {gig.payeeContact ? (
              <Text style={styles.partyLine}>{gig.payeeContact}</Text>
            ) : null}
            {gig.payeeAddress
              ? gig.payeeAddress
                  .split("\n")
                  .map((l, i) => (
                    <Text key={i} style={styles.partyLine}>
                      {l}
                    </Text>
                  ))
              : null}
            {gig.payeePhone ? (
              <Text style={styles.partyLine}>{gig.payeePhone}</Text>
            ) : null}
            <Text style={styles.partyLine}>{gig.payeeEmail}</Text>
          </View>
        </View>

        {/* Event details */}
        <View style={styles.eventBox}>
          <EventCell label="Event" value={gig.eventName} />
          <EventCell label="Date" value={formatDate(gig.eventDate)} />
          {gig.venue ? <EventCell label="Venue / location" value={gig.venue} /> : null}
        </View>

        {/* Line items */}
        <View style={styles.tableHead}>
          <Text style={[styles.colDesc, styles.headText]}>Description</Text>
          <Text style={[styles.colAmount, styles.headText]}>Amount</Text>
        </View>
        <View style={styles.tableRow}>
          <View style={styles.colDesc}>
            <Text>{gig.paymentDescription}</Text>
            <Text style={{ color: COLORS.muted, marginTop: 2 }}>
              {gig.eventName} — {formatDate(gig.eventDate)}
            </Text>
          </View>
          <Text style={styles.colAmount}>{formatMoney(input.amount)}</Text>
        </View>

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={{ color: COLORS.muted }}>Subtotal</Text>
              <Text>{formatMoney(input.amount)}</Text>
            </View>
            <View style={styles.grandRow}>
              <Text style={styles.grandLabel}>Total due</Text>
              <Text style={styles.grandValue}>{formatMoney(input.amount)}</Text>
            </View>
          </View>
        </View>

        {/* Payment + notes */}
        {input.paymentMethod ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Payment method</Text>
            <Text>{input.paymentMethod}</Text>
          </View>
        ) : null}

        {gig.notes ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Payment instructions</Text>
            <Text>{gig.notes}</Text>
          </View>
        ) : null}

        {input.notes ? (
          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>Notes</Text>
            <Text>{input.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          Invoice {input.invoiceNumber} · {input.bandmateName} · {gig.eventName}
          {"  ·  Generated with WONDERvoice"}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(
  gig: Gig,
  input: BandmateInput,
): Promise<Buffer> {
  const issueDate = new Date().toISOString().slice(0, 10);
  return renderToBuffer(
    <InvoiceDocument gig={gig} input={input} issueDate={issueDate} />,
  );
}
