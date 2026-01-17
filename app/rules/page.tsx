"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import toast, { Toaster } from "react-hot-toast";

type House = {
  id: number;
  name: string;
  rules: string | null;
};

// Same color logic you use on the calendar page
function houseTextStyle(houseName: string) {
  const n = (houseName || "").toLowerCase();
  if (n.includes("112") && n.includes("bear")) return { color: "#065f46" }; // darker green
  if (n.includes("156") && n.includes("bay")) return { color: "#0f766e" }; // turquoise blue
  if (n.includes("155") && n.includes("bay")) return { color: "#059669" }; // lighter green
  return { color: "#0f172a" };
}

export default function RulesPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Load houses + enforce login
  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        window.location.href = "/login";
        return;
      }

      const { data, error } = await supabase
        .from("houses")
        .select("id,name,rules")
        .order("name", { ascending: true });

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as House[];
      setHouses(list);

      if (list.length && selectedHouseId === null) {
        setSelectedHouseId(list[0].id);
      }

      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedHouse = useMemo(
    () => houses.find((h) => h.id === selectedHouseId) ?? null,
    [houses, selectedHouseId]
  );

  const selectedHouseName = selectedHouse?.name ?? "";
  const rulesText = (selectedHouse?.rules ?? "").trim();

  return (
    <main className="min-h-screen p-6 bg-white">
      <Toaster />
      <div className="max-w-5xl mx-auto">
        {/* Header + house selector */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Bay Ave &amp; Bear Ln House Rules
            </h1>
            <p className="text-sm sm:text-base mt-2 text-slate-600">
              Choose a house to view its rules and guidelines.
            </p>
          </div>

          <div className="w-full sm:w-72">
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              House
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
              value={selectedHouseId ?? ""}
              onChange={(e) => setSelectedHouseId(Number(e.target.value))}
            >
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Card with house name + rules */}
        <div className="surface p-4">
          <div className="fc-house-title text-center mt-2 mb-6">
            <span
              className="text-lg sm:text-3xl font-extrabold tracking-tight"
              style={houseTextStyle(selectedHouseName)}
            >
              {selectedHouseName || "Select a house"}
            </span>
          </div>

          {loading ? (
            <div className="text-center text-slate-500 py-10">
              Loading house rules...
            </div>
          ) : !selectedHouse ? (
            <div className="text-center text-slate-500 py-10">
              No houses found. Check your Supabase <code>houses</code> table.
            </div>
          ) : rulesText ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-slate-800 whitespace-pre-wrap leading-relaxed">
              {rulesText}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-amber-900">
              No rules have been added yet for this house.
            </div>
          )}
        </div>

        {/* Optional tiny nav back to calendar */}
        <div className="mt-6 text-sm text-slate-500">
          <a
            href="/calendar"
            className="underline underline-offset-4 hover:text-slate-700"
          >
            ← Back to calendar
          </a>
        </div>
      </div>
    </main>
  );
}
