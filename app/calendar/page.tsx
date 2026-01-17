"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import FullCalendar from "@fullcalendar/react";
import type { DateSelectArg, EventClickArg, EventInput } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import toast, { Toaster } from "react-hot-toast";

type House = { id: number; name: string };

type Booking = {
  id: number;
  house_id: number;
  created_by: string;
  guest_count: number;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD (exclusive)
  status: "active" | "cancelled";
  note?: string | null;
};

type Profile = {
  id: string;
  name: string | null;
  email: string;
  color: string | null;
  is_admin?: boolean | null;
};

const USER_COLORS = [
  "#064789", "#427aa1", "#1e40af", "#0f766e", "#047857",
  "#679436", "#4d7c0f", "#a5be00", "#15803d", "#166534",
  "#7c3aed", "#6d28d9", "#9333ea", "#a855f7", "#be185d",
  "#db2777", "#9f1239", "#b91c1c", "#dc2626", "#ea580c",
  "#c2410c", "#d97706", "#f59e0b", "#334155", "#475569",
  "#1f2937", "#0f172a", "#3f3f46", "#525252", "#6b7280",
];

function pickColorForUser(userId: string) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

// HOUSE NAME COLOR (defined ONCE)
function houseTextStyle(houseName: string): CSSProperties {
  const n = (houseName || "").toLowerCase();
  if (n.includes("112") && n.includes("bear")) return { color: "#065f46" }; // darker green
  if (n.includes("156") && n.includes("bay")) return { color: "#0f766e" }; // turquoise blue
  if (n.includes("155") && n.includes("bay")) return { color: "#059669" }; // lighter green
  return { color: "#0f172a" };
}

export default function CalendarPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Create Booking modal state
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [pendingEnd, setPendingEnd] = useState<string | null>(null);
  const [guestCountInput, setGuestCountInput] = useState("2");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // View Booking modal state
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewBusy, setViewBusy] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewBooking, setViewBooking] = useState<{
    bookingId: number;
    title: string;
    start: string;
    end: string;
    guestCount: number;
    note: string;
    createdBy: string;
  } | null>(null);

  // First Login / Name Required modal state
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameUser, setNameUser] = useState<{ id: string; email: string | null } | null>(null);

  const calendarRef = useRef<FullCalendar | null>(null);
  const guestsInputRef = useRef<HTMLInputElement | null>(null);

  // -------------------------------
  // PROFILE ENFORCEMENT (NAME REQUIRED)
  // -------------------------------
  const ensureProfileWithName = async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return false;

    setCurrentUserId(user.id);

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id,name,email,color,is_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      return false;
    }

    setIsAdmin(!!profile?.is_admin);

    // If they have a name, ensure color, continue
    if (profile?.name) {
      if (!profile.color) {
        await supabase
          .from("profiles")
          .update({ color: pickColorForUser(user.id) })
          .eq("id", user.id);
      }
      return true;
    }

    // No name yet -> open required modal and stop flow
    setNameUser({ id: user.id, email: user.email ?? null });
    setNameInput("");
    setNameError(null);
    setNameModalOpen(true);
    return false;
  };

  const signOutAndGoLogin = async () => {
    toast.error("Name is required to use the calendar.");
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const saveRequiredName = async () => {
    if (!nameUser) return;

    const cleaned = nameInput.trim();
    if (!cleaned) {
      setNameError("Please enter your name to continue.");
      return;
    }

    setNameSaving(true);
    setNameError(null);

    try {
      const { error: upsertErr } = await supabase.from("profiles").upsert({
        id: nameUser.id,
        email: nameUser.email,
        name: cleaned,
        color: pickColorForUser(nameUser.id),
      });

      if (upsertErr) {
        setNameError(upsertErr.message);
        return;
      }

      setNameModalOpen(false);
      setNameUser(null);
      setNameInput("");
      toast.success("Welcome!");

      // Re-run load flow now that they have a profile name
      setRefreshKey((k) => k + 1);
    } finally {
      setNameSaving(false);
    }
  };

  // -------------------------------
  // LOAD HOUSES
  // -------------------------------
  useEffect(() => {
    const load = async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        window.location.href = "/login";
        return;
      }

      const ok = await ensureProfileWithName();
      if (!ok) return;

      const { data, error } = await supabase
        .from("houses")
        .select("id,name")
        .order("name", { ascending: true });

      if (error) {
        toast.error(error.message);
        return;
      }

      const list = (data ?? []) as House[];
      setHouses(list);

      if (list.length && selectedHouseId === null) setSelectedHouseId(list[0].id);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // -------------------------------
  // LOAD BOOKINGS
  // -------------------------------
  useEffect(() => {
    const loadBookings = async () => {
      if (!selectedHouseId) return;

      const { data: bookingRows, error: bookingErr } = await supabase
        .from("bookings")
        .select("id,house_id,created_by,guest_count,start_date,end_date,status,note")
        .eq("house_id", selectedHouseId)
        .eq("status", "active");

      if (bookingErr) {
        toast.error(bookingErr.message);
        return;
      }

      const bookings = (bookingRows ?? []) as Booking[];

      const userIds = Array.from(new Set(bookings.map((b) => b.created_by)));
      const profilesById = new Map<string, Profile>();

      if (userIds.length) {
        const { data: profileRows, error: profErr } = await supabase
          .from("profiles")
          .select("id,name,email,color")
          .in("id", userIds);

        if (profErr) {
          toast.error(profErr.message);
          return;
        }

        (profileRows ?? []).forEach((p: any) => profilesById.set(p.id, p as Profile));
      }

      const calendarEvents: EventInput[] = bookings.map((b) => {
        const prof = profilesById.get(b.created_by);
        const who = prof?.name || prof?.email || "Unknown";
        const title = `${who} — ${b.guest_count} guest${b.guest_count === 1 ? "" : "s"}`;

        const note = (b.note ?? "").trim();
        const tooltip = note ? `${title}\n${note}` : title;

        const color = prof?.color || pickColorForUser(b.created_by);

        return {
          id: String(b.id),
          title,
          start: b.start_date,
          end: b.end_date,
          allDay: true,
          backgroundColor: color,
          borderColor: color,
          textColor: "#ffffff",
          extendedProps: {
            bookingId: b.id,
            createdBy: b.created_by,
            guestCount: b.guest_count,
            note,
          },
          tooltip,
        };
      });

      setEvents(calendarEvents);
    };

    loadBookings();
  }, [selectedHouseId, refreshKey]);

  // -------------------------------
  // MODAL HELPERS
  // -------------------------------
  const closeCreateModal = () => {
    setBookingModalOpen(false);
    setPendingStart(null);
    setPendingEnd(null);
    setGuestCountInput("2");
    setNoteInput("");
    setModalError(null);
    calendarRef.current?.getApi()?.unselect();
  };

  const openCreateModal = (startStr: string, endStr: string) => {
    setPendingStart(startStr);
    setPendingEnd(endStr);
    setGuestCountInput("2");
    setNoteInput("");
    setModalError(null);
    setBookingModalOpen(true);
  };

  const closeViewModal = () => {
    setViewModalOpen(false);
    setViewBooking(null);
    setViewError(null);
    setViewBusy(false);
  };

  // Focus guests input when create modal opens
  useEffect(() => {
    if (!bookingModalOpen) return;
    const t = setTimeout(() => guestsInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [bookingModalOpen]);

  // ESC closes create/view modals (NOT the required-name modal)
  useEffect(() => {
    if (!bookingModalOpen && !viewModalOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (viewModalOpen) closeViewModal();
      if (bookingModalOpen) closeCreateModal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingModalOpen, viewModalOpen]);

  // -------------------------------
  // CREATE BOOKING
  // -------------------------------
  const confirmCreateBooking = async () => {
    if (!selectedHouseId || !pendingStart || !pendingEnd) return;
    if (saving) return;

    setModalError(null);
    setSaving(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      if (!user) {
        window.location.href = "/login";
        return;
      }

      const session = (await supabase.auth.getSession()).data.session;
      const accessToken = session?.access_token;

      const guestCount = Number(guestCountInput);
      if (!Number.isFinite(guestCount) || guestCount < 1) {
        setModalError("Guest count must be a number ≥ 1.");
        return;
      }

      const start = new Date(pendingStart + "T00:00:00");
      const end = new Date(pendingEnd + "T00:00:00");
      const nights = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

      if (nights <= 0) {
        setModalError("Invalid date range.");
        return;
      }
      if (nights > 7) {
        setModalError("Max stay is 7 nights.");
        return;
      }

      const note = noteInput.trim() ? noteInput.trim() : null;

      const { error } = await supabase.from("bookings").insert({
        house_id: selectedHouseId,
        created_by: user.id,
        guest_count: guestCount,
        start_date: pendingStart,
        end_date: pendingEnd,
        status: "active",
        note,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Booking created!");
      closeCreateModal();
      setRefreshKey((k) => k + 1);

      // Email notification (non-blocking)
      try {
        const houseName = houses.find((h) => h.id === selectedHouseId)?.name ?? "Unknown house";
        const bookedBy = user.email ?? "Unknown";

        if (accessToken) {
          await fetch("/api/notify-booked", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              accessToken,
              houseName,
              startDate: pendingStart,
              endDate: pendingEnd,
              guestCount,
              bookedBy,
              note,
            }),
          });
        }
      } catch (e) {
        console.warn("Email notify failed", e);
      }
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------
  // CANCEL BOOKING (normal cancel)
  // -------------------------------
  const cancelBooking = async (bookingId: number) => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      window.location.href = "/login";
      return;
    }

    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = session?.access_token;

    const { data: row, error: fetchErr } = await supabase
      .from("bookings")
      .select("id,created_by,status,guest_count,start_date,end_date,house_id,note")
      .eq("id", bookingId)
      .maybeSingle();

    if (fetchErr) {
      toast.error(fetchErr.message);
      return;
    }
    if (!row) {
      toast.error("Booking not found.");
      return;
    }
    if (row.created_by !== user.id) {
      toast.error("You can only cancel your own booking.");
      return;
    }
    if (row.status !== "active") {
      toast.error("This booking is already cancelled.");
      return;
    }

    const { error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", bookingId);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Booking cancelled.");
    setRefreshKey((k) => k + 1);

    // Email notification (non-blocking)
    try {
      const houseName = houses.find((h) => h.id === row.house_id)?.name ?? "Unknown house";
      const cancelledBy = user.email ?? "Unknown";
      const note = row.note ?? null;

      await fetch("/api/notify-cancelled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          houseName,
          startDate: row.start_date,
          endDate: row.end_date,
          guestCount: row.guest_count,
          cancelledBy,
          note,
        }),
      });
    } catch (e) {
      console.warn("Cancel email notify failed", e);
    }
  };

  // -------------------------------
  // ADMIN: PERMANENT DELETE BOOKING
  // -------------------------------
  const adminDeleteBooking = async (bookingId: number) => {
    const session = (await supabase.auth.getSession()).data.session;
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("Missing access token");

    const res = await fetch("/api/admin-delete-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, bookingId }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(body?.error ?? "Admin delete failed");
    }

    toast.success("Booking permanently deleted.");
    setRefreshKey((k) => k + 1);
  };

  // -------------------------------
  // EVENT CLICK -> OPEN VIEW MODAL
  // -------------------------------
  const onEventClick = (arg: EventClickArg) => {
    const bookingId = Number(arg.event.extendedProps.bookingId);
    const guestCount = Number(arg.event.extendedProps.guestCount);
    const note = ((arg.event.extendedProps.note as string) || "").trim();
    const createdBy = String(arg.event.extendedProps.createdBy || "");
    const start = arg.event.startStr;
    const end = arg.event.endStr;

    setViewError(null);
    setViewBooking({
      bookingId,
      title: arg.event.title,
      start,
      end,
      guestCount,
      note,
      createdBy,
    });
    setViewModalOpen(true);
  };

  // -------------------------------
  // CALENDAR SELECT
  // -------------------------------
  const onSelect = (info: DateSelectArg) => openCreateModal(info.startStr, info.endStr);

  const selectedHouse = useMemo(
    () => houses.find((h) => h.id === selectedHouseId) ?? null,
    [houses, selectedHouseId]
  );

  const selectedHouseName = selectedHouse?.name ?? "";

  const canCancelViewedBooking =
    !!viewBooking && !!currentUserId && viewBooking.createdBy === currentUserId;

  return (
    <main className="min-h-screen p-6 bg-white">
      <Toaster />
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Bay Ave & Bear Ln Calendars
            </h1>
            <p className="text-sm sm:text-base mt-2 text-slate-600">
              Choose a house to view bookings. Click and drag to book your stay. Click a booking to view details.
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

        <div className="surface p-4">
          <div className="fc-house-title text-center -mt-4 mb-2">
            <span
              className="text-lg sm:text-3xl font-extrabold tracking-tight"
              style={houseTextStyle(selectedHouseName)}
            >
              {selectedHouseName}
            </span>
          </div>

          <FullCalendar
            ref={calendarRef as any}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            height="auto"
            eventOverlap={true}
            dayMaxEvents={false}
            eventDisplay="block"
            events={events}
            selectable={true}
            selectMirror={true}
            select={onSelect}
            eventClick={onEventClick}
          />
        </div>
      </div>

      {/* FIRST LOGIN: NAME REQUIRED MODAL */}
      {nameModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={signOutAndGoLogin} />
          <div className="relative w-full max-w-xl surface p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Welcome</h2>
            <p className="mt-2 text-slate-600">Please enter your name to continue.</p>

            <div className="mt-6">
              <label className="block text-sm font-semibold text-slate-900">Name</label>
              <input
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRequiredName();
                }}
              />
            </div>

            {nameError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {nameError}
              </div>
            )}

            <div className="mt-7 flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={nameSaving}
                onClick={signOutAndGoLogin}
              >
                Cancel
              </button>

              <button
                className="rounded-lg bg-[#679436] px-5 py-2.5 font-semibold text-white hover:brightness-95 disabled:opacity-60"
                disabled={nameSaving}
                onClick={saveRequiredName}
              >
                {nameSaving ? "Saving..." : "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE BOOKING MODAL */}
      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeCreateModal} />
          <div className="relative w-full max-w-xl surface p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Create booking</h2>

            <div className="mt-4 space-y-2 text-slate-700">
              <div>
                <span className="font-semibold text-slate-900">Check-in:</span>{" "}
                {pendingStart ? formatDate(pendingStart) : ""}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Check-out:</span>{" "}
                {pendingEnd ? formatDate(pendingEnd) : ""}
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-semibold text-slate-900">Guests</label>
              <input
                ref={guestsInputRef}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
                value={guestCountInput}
                onChange={(e) => setGuestCountInput(e.target.value)}
                inputMode="numeric"
                placeholder="2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCreateBooking();
                }}
              />
              <p className="mt-2 text-xs text-slate-500">Max stay: 7 nights. Overlaps are allowed.</p>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-slate-900">Note (optional)</label>
              <textarea
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
                rows={3}
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Anything notable (e.g., birthday weekend, girls trip, etc.)"
              />
            </div>

            {modalError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {modalError}
              </div>
            )}

            <div className="mt-7 flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={closeCreateModal}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                className="rounded-lg bg-[#679436] px-5 py-2.5 font-semibold text-white hover:brightness-95 disabled:opacity-60"
                onClick={confirmCreateBooking}
                disabled={saving}
              >
                {saving ? "Creating..." : "Create booking"}
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Tip: press <span className="font-semibold">Esc</span> to close.
            </div>
          </div>
        </div>
      )}

      {/* VIEW / CANCEL / ADMIN DELETE MODAL */}
      {viewModalOpen && viewBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeViewModal} />
          <div className="relative w-full max-w-xl surface p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Booking details</h2>

            <div className="mt-4 space-y-2 text-slate-700">
              <div className="text-slate-900 font-semibold">{viewBooking.title}</div>

              <div>
                <span className="font-semibold text-slate-900">Check-in:</span>{" "}
                {formatDate(viewBooking.start)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Check-out:</span>{" "}
                {formatDate(viewBooking.end)}
              </div>
              <div>
                <span className="font-semibold text-slate-900">Guests:</span>{" "}
                {viewBooking.guestCount}
              </div>

              {viewBooking.note ? (
                <div className="pt-2">
                  <div className="font-semibold text-slate-900">Note</div>
                  <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-slate-700 whitespace-pre-wrap">
                    {viewBooking.note}
                  </div>
                </div>
              ) : null}
            </div>

            {viewError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {viewError}
              </div>
            )}

            {!canCancelViewedBooking && !isAdmin && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Only the person who created this booking can cancel it.
              </div>
            )}

            <div className="mt-7 flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={closeViewModal}
                disabled={viewBusy}
              >
                Close
              </button>

              {canCancelViewedBooking && (
                <button
                  className="rounded-lg bg-red-600 px-5 py-2.5 font-semibold text-white hover:brightness-95 disabled:opacity-60"
                  disabled={viewBusy}
                  onClick={async () => {
                    setViewBusy(true);
                    setViewError(null);
                    try {
                      await cancelBooking(viewBooking.bookingId);
                      closeViewModal();
                    } catch (e: any) {
                      setViewError(e?.message ?? "Cancel failed.");
                    } finally {
                      setViewBusy(false);
                    }
                  }}
                >
                  {viewBusy ? "Cancelling..." : "Cancel booking"}
                </button>
              )}

              {isAdmin && (
                <button
                  className="rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white hover:brightness-110 disabled:opacity-60"
                  disabled={viewBusy}
                  onClick={async () => {
                    setViewBusy(true);
                    setViewError(null);
                    try {
                      await adminDeleteBooking(viewBooking.bookingId);
                      closeViewModal();
                    } catch (e: any) {
                      setViewError(e?.message ?? "Admin delete failed.");
                    } finally {
                      setViewBusy(false);
                    }
                  }}
                >
                  {viewBusy ? "Deleting..." : "Admin delete"}
                </button>
              )}
            </div>

            <div className="mt-3 text-xs text-slate-400">
              Tip: press <span className="font-semibold">Esc</span> to close.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}







