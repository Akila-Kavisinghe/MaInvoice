import ContactsManager from "./ContactsManager";

export const dynamic = "force-dynamic";

/** Contact management (local-mode gate lives in the layout). */
export default function ContactsPage() {
  return <ContactsManager />;
}
