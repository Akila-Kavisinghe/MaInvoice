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
}): EmailParts {
  const { adminEmail, bandmateEmail, bandmateName, eventName, eventDate } = args;
  const subject = `Invoice - ${bandmateName} - ${eventName}`;
  const body =
    `Hi,\n\n` +
    `Attached is my invoice for ${eventName} on ${formatDate(eventDate)}.\n\n` +
    `(Reminder to myself: attach the downloaded PDF before sending!)\n\n` +
    `Thanks,\n${bandmateName}`;
  return { to: adminEmail, cc: bandmateEmail, subject, body };
}

/** Standard mailto: link — opens the device's default mail client. */
export function mailtoUrl({ to, cc, subject, body }: EmailParts): string {
  const params = new URLSearchParams();
  if (cc) params.set("cc", cc);
  params.set("subject", subject);
  params.set("body", body);
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
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
