import AdminShell from "./AdminShell";

/** Every /admin page shares the auth probe, sign-in screen, and nav. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
