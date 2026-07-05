import React from "react";
import Image from "next/image";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-hair bg-panel ${className}`}>
      {children}
    </div>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <Image
        src="/akila-logo.png"
        alt="AKILA & The Wonder Machine"
        width={976}
        height={553}
        priority
        className="h-12 w-auto"
      />
    </div>
  );
}

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-medium text-dim"
    >
      {children}
      {hint ? <span className="ml-1.5 font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

const fieldClasses =
  "w-full rounded-[10px] border border-hair bg-elev px-3.5 py-3 text-ink placeholder:text-muted outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:bg-panel disabled:text-muted";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return <input ref={ref} {...props} className={`${fieldClasses} ${props.className ?? ""}`} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea(props, ref) {
  return <textarea ref={ref} {...props} className={`${fieldClasses} ${props.className ?? ""}`} />;
});

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-danger">{message}</p>;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  // No width in the base: "w-full" from here would beat callers' "w-auto"
  // (CSS order, not class order, wins) — pass w-full explicitly when needed.
  const base =
    "inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-base font-semibold transition-[transform,filter,background-color,border-color,opacity] duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    primary: "bg-primary-grad text-white shadow-soft hover:brightness-[1.08]",
    secondary:
      "border border-hair bg-panel text-ink hover:border-hair-bright hover:bg-elev",
    ghost: "bg-transparent text-dim hover:bg-elev hover:text-ink",
  } as const;
  return (
    <button {...props} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: React.ReactNode;
}) {
  const tones = {
    info: "bg-accent/10 text-accent ring-accent/20",
    error: "bg-danger/10 text-danger ring-danger/20",
    success: "bg-success/10 text-success ring-success/20",
  } as const;
  return (
    <div className={`rounded-[10px] px-4 py-3 text-sm ring-1 ${tones[tone]}`}>{children}</div>
  );
}
