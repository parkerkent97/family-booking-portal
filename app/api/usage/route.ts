import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables for /api/usage");
}

// Server-side Supabase client (same anon key as the client, just running on server)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Exported type in case you ever import it in /usage/page.tsx
export type UsageRow = {
  houseId: number;
  houseName: string;
  month: string;          // e.g. "2026-01"
  daysWithBookings: number;
  totalDays: number;
  usageRate: number;      // 0–1
};

// Helper: get previous full month (e.g. if today is Feb 5, returns Jan 1–Feb 1)
function getPreviousMonthWindow() {
  const now = new Date();

  // previous month (0–11)
  const prevMonth = now.getMonth() - 1;
  const year = prevMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthIndex = (prevMonth + 12) % 12;

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 1); // exclusive

  const totalDays = Math.round(
    (monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  const label = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  return { monthStart, monthEnd, totalDays, label };
}

// Helper: clamp a booking range [start, end) to [winStart, winEnd) and count days of overlap
function countOverlapDays(
  bookingStartStr: string,
  bookingEndStr: string,
  winStart: Date,
  winEnd: Date
): number {
  // Treat dates as YYYY-MM-DD in local time
  const bs = new Date(`${bookingStartStr}T00:00:00`);
  const be = new Date(`${bookingEndStr}T00:00:00`);

  const start = bs < winStart ? winStart : bs;
  const end = be > winEnd ? winEnd : be;

  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 0;

  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export async function GET() {
  try {
    const { monthStart, monthEnd, totalDays, label } = getPreviousMonthWindow();

    // 1) Get all houses
    const { data: houseRows, error: houseErr } = await supabase
      .from("houses")
      .select("id,name");

    if (houseErr) {
      return NextResponse.json(
        { error: houseErr.message },
        { status: 500 }
      );
    }

    const houses = (houseRows ?? []) as { id: number; name: string }[];

    // 2) Get all active bookings that touch that month
    const monthStartStr = monthStart.toISOString().slice(0, 10); // YYYY-MM-DD
    const monthEndStr = monthEnd.toISOString().slice(0, 10);

    const { data: bookingRows, error: bookingErr } = await supabase
      .from("bookings")
      .select("house_id,start_date,end_date,status")
      .eq("status", "active")
      .lt("start_date", monthEndStr)   // start < monthEnd
      .gt("end_date", monthStartStr); // end   > monthStart

    if (bookingErr) {
      return NextResponse.json(
        { error: bookingErr.message },
        { status: 500 }
      );
    }

    // 3) Aggregate usage by house
    const usageByHouse = new Map<number, number>();

    (bookingRows ?? []).forEach((row: any) => {
      const days = countOverlapDays(
        row.start_date,
        row.end_date,
        monthStart,
        monthEnd
      );
      if (days <= 0) return;

      const current = usageByHouse.get(row.house_id) ?? 0;
      usageByHouse.set(row.house_id, current + days);
    });

    // 4) Build response rows for each house (even if 0 usage)
    const rows: UsageRow[] = houses.map((h) => {
      const daysWithBookings = usageByHouse.get(h.id) ?? 0;
      const usageRate =
        totalDays > 0 ? daysWithBookings / totalDays : 0;

      return {
        houseId: h.id,
        houseName: h.name,
        month: label,
        daysWithBookings,
        totalDays,
        usageRate,
      };
    });

    return NextResponse.json({
      month: label,
      totalDays,
      rows,
    });
  } catch (e: any) {
    console.error("Error in /api/usage:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unknown error in /api/usage" },
      { status: 500 }
    );
  }
}
