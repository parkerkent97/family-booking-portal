import { query } from '@/lib/database';
import { NextRequest, NextResponse } from "next/server";
import { session } from "@/lib/server";

export type UsageRow = {
  houseId: number;
  houseName: string;
  month: string; // e.g. "2026-02"
  daysWithBookings: number;
  totalDays: number;
  usageRate: number; // 0–1
};

function isValidMonthLabel(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function getPreviousMonthLabel() {
  const now = new Date();
  const prevMonth = now.getMonth() - 1;
  const year = prevMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
  const monthIndex = (prevMonth + 12) % 12;
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function getMonthWindow(monthLabel?: string) {
  const label =
    monthLabel && isValidMonthLabel(monthLabel)
      ? monthLabel
      : getPreviousMonthLabel();

  const [yearStr, monthStr] = label.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 1); // exclusive

  const totalDays = Math.round(
    (monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  return { monthStart, monthEnd, totalDays, label };
}

function eachDateInRange(start: Date, endExclusive: Date) {
  const dates: string[] = [];
  const d = new Date(start);

  while (d < endExclusive) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    d.setDate(d.getDate() + 1);
  }

  return dates;
}

export async function GET(req: NextRequest) {
  try {
    const user = await session();
    if (!user?.admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const requestedMonth = req.nextUrl.searchParams.get("month") ?? undefined;
    const { monthStart, monthEnd, totalDays, label } =
      getMonthWindow(requestedMonth);

    const houses = await query('SELECT id,name FROM houses ORDER BY name') as { id: number; name: string }[];
    const monthStartStr = `${label}-01`;
    const monthEndStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth()+1).padStart(2,'0')}-01`;
    const bookingRows = await query("SELECT house_id,start_date::text,end_date::text,status FROM bookings WHERE status='active' AND start_date<$1::date AND end_date>$2::date", [monthEndStr, monthStartStr]);

    // 3) Count UNIQUE booked days per house
    const usageByHouse = new Map<number, Set<string>>();

    for (const row of bookingRows ?? []) {
      const houseId = row.house_id as number;
      const bookingStart = new Date(`${row.start_date}T00:00:00`);
      const bookingEnd = new Date(`${row.end_date}T00:00:00`);

      // Clamp booking range to this month
      const effectiveStart =
        bookingStart < monthStart ? new Date(monthStart) : bookingStart;
      const effectiveEnd =
        bookingEnd > monthEnd ? new Date(monthEnd) : bookingEnd;

      if (effectiveEnd <= effectiveStart) continue;

      if (!usageByHouse.has(houseId)) {
        usageByHouse.set(houseId, new Set<string>());
      }

      const daySet = usageByHouse.get(houseId)!;
      const dates = eachDateInRange(effectiveStart, effectiveEnd);

      for (const date of dates) {
        daySet.add(date);
      }
    }

    // 4) Build rows for all houses, even if usage is 0
    const rows: UsageRow[] = houses.map((h) => {
      const daysWithBookings = usageByHouse.get(h.id)?.size ?? 0;
      const usageRate = totalDays > 0 ? daysWithBookings / totalDays : 0;

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
