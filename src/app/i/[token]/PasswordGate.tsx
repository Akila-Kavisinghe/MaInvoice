"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner, Button, Card, FieldError, Input, Label, Logo } from "@/components/ui";

export default function PasswordGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Re-render the server page, which now passes the gate.
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Logo className="mb-6 justify-center" />
      <Card className="p-7">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-hair bg-elev text-2xl">
            🔒
          </div>
          <h1 className="text-xl font-semibold text-ink">Enter the shared password</h1>
          <p className="mt-1 text-sm text-dim">
            This unlocks your invoice form. Ask the person who sent you this link if you don&apos;t have it.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
            <FieldError message={error ?? undefined} />
          </div>
          {error ? <Banner tone="error">{error}</Banner> : null}
          <Button type="submit" disabled={loading || !password} className="w-full">
            {loading ? "Checking…" : "Unlock"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
