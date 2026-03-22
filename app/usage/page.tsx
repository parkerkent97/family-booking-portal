"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import toast, { Toaster } from "react-hot-toast";

type UsageRow = {
  houseId: number;
  houseName: string;
  month: string; // e.g. "2026-01"
  daysWithBookings: number;
  totalDays: number;
  usageRate: number; // 0–1
};

type UsageResponse = {
  month: string;
  totalDays: number;
  rows: UsageRow[];
};

function formatMonthLabel(month: string) {
  const [year, monthNum] = month.split("-");
  const d = new Date(`${year}-${monthNum}-01T00:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export default function UsagePage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) {
          window.location.href = "/login";
          return;
        }

        const userId = authData.user.id;

        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("is_admin")
          .eq("id", userId)
          .maybeSingle();

        if (profErr) {
          setError(profErr.message);
          setIsAdmin(false);
          return;
        }

        if (!profile?.is_admin) {
          setIsAdmin(false);
          return;
        }

        setIsAdmin(true);

        // API route now uses GET
        const res = await fetch("/api/usage", {
          method: "GET",
        });

        const json = await res.json();

        if (!res.ok) {
          setError(json?.error ?? "Failed to load usage data");
          return;
        }

        setData(json as UsageResponse);
      } catch (err: any) {
        setError(err?.message ?? "Unexpected error");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  if (loading) {
    return (
      <main className="min-h-screen p-6 bg-white">
        <Toaster />
        <div className="max-w-4xl mx-auto">
          <p className="text-slate-700">Loading usage data…</p>
        </div>
      </main>
    );
  }

  if (isAdmin === false) {
    return (
      <main className="min-h-screen p-6 bg-white">
        <Toaster />
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-900">
            Usage (admin only)
          </h1>
          <p className="mt-2 text-slate-700">
            You must be an admin to view house usage.
          </p>
          <div className="mt-4">
            <Link
              href="/calendar"
              className="text-sm font-semibold text-[#064789] hover:underline"
            >
              Back to calendar
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white">
      <Toaster />
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              House usage
            </h1>
            {data && (
              <p className="mt-2 text-sm text-slate-600">
                Month: {formatMonthLabel(data.month)} (last completed month).
                Usage = booked nights / total nights.
              </p>
            )}
          </div>
          <Link
            href="/calendar"
            className="text-sm font-semibold text-[#064789] hover:underline"
          >
            Back to calendar
          </Link>
        </div>

        {data && data.rows.length > 0 ? (
          <div className="surface p-4">
            <table className="w-full text-sm text-left text-slate-700">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 font-semibold text-slate-900">House</th>
                  <th className="py-2 font-semibold text-slate-900">
                    Booked nights
                  </th>
                  <th className="py-2 font-semibold text-slate-900">
                    Total nights
                  </th>
                  <th className="py-2 font-semibold text-slate-900">Usage</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.houseId} className="border-b border-slate-100">
                    <td className="py-2">{row.houseName}</td>
                    <td className="py-2">{row.daysWithBookings}</td>
                    <td className="py-2">{row.totalDays}</td>
                    <td className="py-2">
                      {(row.usageRate * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-700">
            No usage data found for the last completed month.
          </p>
        )}
      </div>
    </main>
  );
}
