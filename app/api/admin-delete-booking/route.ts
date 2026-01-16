import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseServerClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function POST(req: Request) {
  try {
    const { accessToken, bookingId } = (await req.json()) ?? {};
    if (!accessToken || !bookingId) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const supabase = supabaseServerClient(accessToken);

    // Who is calling?
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Are they admin?
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
    if (!prof?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Hard delete
    const { error: delErr } = await supabase.from("bookings").delete().eq("id", bookingId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
