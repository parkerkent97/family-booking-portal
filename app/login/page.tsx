"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import toast, { Toaster } from "react-hot-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    // If already signed in, go straight to calendar
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) window.location.href = "/calendar";
    });
  }, []);

  const sendLink = async () => {
    const clean = email.trim().toLowerCase();
    if (!clean) {
      toast.error("Please enter your email.");
      return;
    }
    if (!clean.includes("@") || !clean.includes(".")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setSending(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/calendar`
          : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email: clean,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Registration link sent! Check your email.");
      setEmail("");
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-white p-6">
      <Toaster />
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            Bay Ave & Bear Ln Calendars
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Enter your email and we’ll send you a registration link to sign in.
          </p>
        </div>

        <div className="surface p-6 max-w-lg">
          <label className="block text-sm font-semibold text-slate-900">
            Email address
          </label>

          <input
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            inputMode="email"
            autoComplete="email"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendLink();
            }}
          />

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={sendLink}
              disabled={sending}
              className="rounded-lg bg-[#679436] px-5 py-2.5 font-semibold text-white hover:brightness-95 disabled:opacity-60"
            >
              {sending ? "Sending..." : "Send registration link"}
            </button>

            <span className="text-xs text-slate-500">
              You’ll be signed in after clicking the link.
            </span>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-900 mb-1">First time?</div>
            You’ll be asked for your name after you sign in.
          </div>
        </div>
      </div>
    </main>
  );
}

