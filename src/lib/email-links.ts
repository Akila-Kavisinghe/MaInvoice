import { formatDate } from "./format";

export interface EmailParts {
  to: string;
  cc?: string;
  subject: string;
  body: string;
}

/**
 * Build the email the bandmate will send. The invoice goes to the admin (To)
 * with a copy to the bandmate themselves (Cc), so both have a record of it.
 *
 * NOTE: Neither mailto: nor the Gmail web compose URL can attach a file — that
 * is a hard browser/Gmail limitation for privacy reasons. The user must attach
 * the downloaded PDF manually. The UI makes this explicit.
 */
export function buildEmailParts(args: {
  adminEmail: string;
  bandmateEmail: string;
  bandmateName: string;
  eventName: string;
  eventDate: string;
  invoiceNumber: string;
  /**
   * Include the "attach the PDF before sending" self-reminder. Set to false
   * when the file travels with the message already (Web Share sheet).
   */
  attachReminder?: boolean;
}): EmailParts {
  const {
    adminEmail,
    bandmateEmail,
    bandmateName,
    eventName,
    eventDate,
    invoiceNumber,
    attachReminder = true,
  } = args;
  const subject = `Invoice ${invoiceNumber} - ${bandmateName} - ${eventName}`;
  const body =
    `Hi,\n\n` +
    `Attached is my invoice (${invoiceNumber}) for ${eventName} on ${formatDate(eventDate)}.\n\n` +
    (attachReminder
      ? `(Reminder to myself: attach the downloaded PDF before sending!)\n\n`
      : "") +
    `Thanks,\n${bandmateName}`;
  return { to: adminEmail, cc: bandmateEmail, subject, body };
}

/**
 * Standard mailto: link — opens the device's default mail client.
 *
 * Built by hand rather than with URLSearchParams: that encodes spaces as "+"
 * (form encoding), but mail apps follow RFC 6068 and show the "+" literally.
 * encodeURIComponent gives the %20 encoding they expect.
 */
export function mailtoUrl({ to, cc, subject, body }: EmailParts): string {
  const params: string[] = [];
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  params.push(`subject=${encodeURIComponent(subject)}`);
  params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${encodeURIComponent(to)}?${params.join("&")}`;
}

/** Gmail web compose deep link — best for desktop / Gmail-in-browser users. */
export function gmailWebUrl({ to, cc, subject, body }: EmailParts): string {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to,
    su: subject,
    body,
  });
  if (cc) params.set("cc", cc);
  return `https://mail.google.com/mail/?${params.toString()}`;
}
