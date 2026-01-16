import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

function supabaseServerClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      accessToken,
      houseName,
      startDate,
      endDate,
      guestCount,
      bookedBy,
      note,
    } = body ?? {};

    if (!accessToken) {
      return NextResponse.json({ error: "Missing accessToken" }, { status: 400 });
    }
    if (!houseName || !startDate || !endDate || !guestCount || !bookedBy) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = supabaseServerClient(accessToken);

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("email");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const emails = (profiles ?? [])
      .map((p: any) => p.email)
      .filter(Boolean) as string[];

    if (!emails.length) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    const subject = `New booking: ${houseName} (${formatDate(startDate)} → ${formatDate(endDate)})`;

    const safeNote = (note ?? "").toString().trim();
    const noteBlock = safeNote
      ? `
        <tr>
          <td style="padding: 12px 0; color: #0f172a; font-weight: 700;">Note</td>
        </tr>
        <tr>
          <td style="padding: 0 0 12px; color: #334155; white-space: pre-wrap;">
            ${escapeHtml(safeNote)}
          </td>
        </tr>
      `
      : "";

    const html = `
      <div style="background:#f8fafc;padding:24px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.4;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <div style="padding:18px 20px;background:#064789;color:#ffffff;">
            <div style="font-size:18px;font-weight:800;">Bay Ave & Bear Ln</div>
            <div style="opacity:.9;margin-top:4px;">Booking created</div>
          </div>

          <div style="padding:18px 20px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
              <tr>
                <td style="padding: 6px 0; color:#0f172a; font-weight:700;">House</td>
                <td style="padding: 6px 0; color:#334155; text-align:right;">${escapeHtml(String(houseName))}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color:#0f172a; font-weight:700;">Check-in</td>
                <td style="padding: 6px 0; color:#334155; text-align:right;">${formatDate(String(startDate))}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color:#0f172a; font-weight:700;">Check-out</td>
                <td style="padding: 6px 0; color:#334155; text-align:right;">${formatDate(String(endDate))}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color:#0f172a; font-weight:700;">Guests</td>
                <td style="padding: 6px 0; color:#334155; text-align:right;">${escapeHtml(String(guestCount))}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color:#0f172a; font-weight:700;">Booked by</td>
                <td style="padding: 6px 0; color:#334155; text-align:right;">${escapeHtml(String(bookedBy))}</td>
              </tr>
              ${noteBlock}
            </table>

            <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;">
              This is an automated notification.
            </div>
          </div>
        </div>
      </div>
    `;

    const result = await resend.emails.send({
      from: "Bay Ave & Bear Ln <notifications@bayavebearln.com>",
      to: emails,
      replyTo: "notifications@bayavebearln.com",
      subject,
      html,
    });

    return NextResponse.json({ ok: true, sent: emails.length, result });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

