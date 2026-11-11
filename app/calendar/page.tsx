"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
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
  booked_by: string;
  guest_count: number;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD (exclusive)
  status: "active" | "cancelled";
  note?: string | null;
};

type Profile = {
  id: string;
  name: string | null;
  color: string | null;
  is_admin?: boolean | null;
};

type MyUpcomingBooking = {
  id: number;
  houseId: number;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  guestCount: number;
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
function houseTextStyle(houseName: string) {
  const n = (houseName || "").toLowerCase();
  if (n.includes("112") && n.includes("bear")) return { color: "#065f46" };
  if (n.includes("156") && n.includes("bay")) return { color: "#29cec0" };
  if (n.includes("155") && n.includes("bay")) return { color: "#0087d5" };
  return { color: "#0f172a" };
}

export default function CalendarPage() {
  const [houses, setHouses] = useState<House[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myUpcoming, setMyUpcoming] = useState<MyUpcomingBooking[]>([]);
  const [upcomingBusyId, setUpcomingBusyId] = useState<number | null>(null);

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

  // EDIT mode state for the view modal
  const [isEditingBooking, setIsEditingBooking] = useState(false);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editGuestCount, setEditGuestCount] = useState("");
  const [editNote, setEditNote] = useState("");

  const [currentName, setCurrentName] = useState('');
  const calendarRef = useRef<FullCalendar | null>(null);
  const guestsInputRef = useRef<HTMLInputElement | null>(null);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    api('/api/calendar').then(data => {
      setCurrentUserId(data.user.id);
      setCurrentName(data.user.name);
      setIsAdmin(data.user.admin);
      setHouses(data.houses);
      setSelectedHouseId(previous => previous ?? data.houses[0]?.id ?? null);
      setAllBookings(data.bookings);
      setProfiles(data.profiles);
      setMyUpcoming(data.bookings.filter((b: Booking) => b.created_by === data.user.id && b.end_date >= new Date().toISOString().slice(0, 10))
        .sort((a: Booking, b: Booking) => a.start_date.localeCompare(b.start_date)).slice(0, 5)
        .map((b: Booking) => ({ id: b.id, houseId: b.house_id, start: b.start_date, end: b.end_date, guestCount: b.guest_count })));
    }).catch(e => toast.error(e.message));
  }, [refreshKey]);
  useEffect(() => {
    const houseBookings = allBookings.filter(b => b.house_id === selectedHouseId);
    setEvents(houseBookings.map(b => {
      const color = profiles.find(p => p.id === b.created_by)?.color || pickColorForUser(b.created_by || String(b.id));
      const overlaps = houseBookings.some(other => other.id !== b.id &&
        other.start_date < b.end_date && other.end_date > b.start_date);
      return { id: String(b.id), title: b.booked_by,
        classNames: overlaps ? ['overlapping-booking'] : [],
        start: b.start_date, end: b.end_date, allDay: true, backgroundColor: color, borderColor: color, textColor: '#ffffff',
        extendedProps: { bookingId: b.id, createdBy: b.created_by, guestCount: b.guest_count, note: b.note || '' } };
    }));
  }, [allBookings, profiles, selectedHouseId]);
  const signOutAndGoLogin = async () => {
    try { await api('/api/session', undefined, 'DELETE'); window.location.href = '/login'; }
    catch (e) { toast.error((e as Error).message); }
  };

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
    setIsEditingBooking(false);
  };

  useEffect(() => {
    if (!bookingModalOpen) return;
    const t = setTimeout(() => guestsInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [bookingModalOpen]);

  useEffect(() => {
    if (!bookingModalOpen && !viewModalOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (viewModalOpen) closeViewModal();
      if (bookingModalOpen) closeCreateModal();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bookingModalOpen, viewModalOpen]);

  // -------------------------------
  // CREATE BOOKING
  // -------------------------------
  const confirmCreateBooking = async () => {
    if (!selectedHouseId || !pendingStart || !pendingEnd) { setModalError('Choose arrival and departure dates.'); return; }
    if (saving) return;

    setModalError(null);
    setSaving(true);

    try {
      const guestCount = Number(guestCountInput);
      if (!Number.isFinite(guestCount) || guestCount < 1) {
        setModalError("Guest count must be a number ≥ 1.");
        return;
      }

      const start = new Date(pendingStart + "T00:00:00");
      const end = new Date(pendingEnd + "T00:00:00");
      const nights = Math.round(
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (nights <= 0) {
        setModalError("Invalid date range.");
        return;
      }
      if (nights > 7) {
        setModalError("Max stay is 7 nights.");
        return;
      }

      const note = noteInput.trim() ? noteInput.trim() : null;

      await api('/api/bookings', { action: 'create', house_id: selectedHouseId,
        guest_count: guestCount, start_date: pendingStart, end_date: pendingEnd, note });

      toast.success("Booking created!");
      closeCreateModal();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------
  // CANCEL BOOKING (normal cancel)
  // -------------------------------
  const cancelBooking = async (bookingId: number) => {
    await api('/api/bookings', { action: 'cancel', bookingId });
    toast.success("Booking cancelled.");
    setRefreshKey((k) => k + 1);
  };

  // -------------------------------
  // EDIT BOOKING
  // -------------------------------
  const saveEditedBooking = async () => {
    if (!viewBooking) return;
    if (viewBusy) return;

    if (!editStart || !editEnd) {
      setViewError("Please select both check-in and check-out.");
      return;
    }

    const guests = Number(editGuestCount);
    if (!Number.isFinite(guests) || guests < 1) {
      setViewError("Guest count must be a number ≥ 1.");
      return;
    }

    const start = new Date(editStart + "T00:00:00");
    const end = new Date(editEnd + "T00:00:00");
    const nights = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (nights <= 0) {
      setViewError("Invalid date range.");
      return;
    }
    if (nights > 7) {
      setViewError("Max stay is 7 nights.");
      return;
    }

    if (!currentUserId || (viewBooking.createdBy !== currentUserId && !isAdmin)) {
      setViewError("You can only edit your own booking.");
      return;
    }

    setViewBusy(true);
    setViewError(null);

    try {
      const noteClean = editNote.trim() ? editNote.trim() : null;

      await api('/api/bookings', { action: 'edit', bookingId: viewBooking.bookingId,
        start_date: editStart, end_date: editEnd, guest_count: guests, note: noteClean });

      toast.success("Booking updated.");
      setRefreshKey((k) => k + 1);
      setIsEditingBooking(false);

      setViewBooking({
        ...viewBooking,
        start: editStart,
        end: editEnd,
        guestCount: guests,
        note: noteClean ?? "",
      });
    } catch (e) {
      setViewError((e as Error).message);
    } finally {
      setViewBusy(false);
    }
  };

  // -------------------------------
  // ADMIN: PERMANENT DELETE BOOKING
  // -------------------------------
  const adminDeleteBooking = async (bookingId: number) => {
    await api('/api/bookings', { action: 'delete', bookingId });
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
    const end = arg.event.endStr || arg.event.startStr;

    setViewError(null);
    setIsEditingBooking(false);

    setViewBooking({
      bookingId,
      title: arg.event.title,
      start,
      end,
      guestCount,
      note,
      createdBy,
    });

    setEditStart(start.slice(0, 10));
    setEditEnd(end.slice(0, 10));
    setEditGuestCount(String(guestCount));
    setEditNote(note);

    setViewModalOpen(true);
  };

  // -------------------------------
  // CALENDAR SELECT
  // -------------------------------
  const onSelect = (info: DateSelectArg) =>
    openCreateModal(info.startStr, info.endStr);

  const selectedHouse = useMemo(
    () => houses.find((h) => h.id === selectedHouseId) ?? null,
    [houses, selectedHouseId]
  );

  const today = new Date().toLocaleDateString('en-CA');
  const overlapNotice = (start: string | null, end: string | null, except?: number) => {
    const matches = allBookings.filter(b => b.house_id === selectedHouseId && b.id !== except && start && end && b.start_date < end && b.end_date > start);
    return matches.length > 0 && <div role="status" className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"><strong>Sharing the house</strong><p>{[...new Set(matches.map(b=>b.booked_by))].join(', ')} also booked these dates. You can still book.</p></div>;
  };
  const selectedHouseName = selectedHouse?.name ?? "";

  const canCancelViewedBooking =
    !!viewBooking && !!currentUserId && (viewBooking.createdBy === currentUserId || isAdmin);

  const canEditViewedBooking =
    !!viewBooking && !!currentUserId && (viewBooking.createdBy === currentUserId || isAdmin);

  return (
    <main className="min-h-screen p-6 bg-white">
      <Toaster />
      <div className="max-w-5xl mx-auto">
        <nav className="mb-5 flex flex-wrap items-center gap-4 text-sm">
          <span className="font-semibold">{currentName}</span><Link href="/access" className="text-[#064789] underline">My access</Link>
          {isAdmin && <><Link href="/admin" className="text-[#064789] underline">Admin settings</Link><Link href="/usage" className="text-[#064789] underline">House usage</Link></>}
          <button onClick={signOutAndGoLogin} className="text-[#064789] underline">Sign out</button>
        </nav>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Bay Ave & Bear Ln Calendars
            </h1>
            <p className="text-sm sm:text-base mt-2 text-slate-600">
              Choose a house and book a stay. Select a name on the calendar to see guests and notes.
            </p>
          </div>

          <div className="w-full sm:w-72 space-y-2">
            <div>
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

            <div className="flex justify-end">
              <Link
                href="/rules"
                className="text-sm font-semibold text-[#064789] hover:underline"
              >
                View house rules
              </Link>
            </div>
          </div>
        </div>

        <section className="mb-6 space-y-3" aria-label="Upcoming stays at both houses"><h2 className="text-xl font-semibold">Coming up at the houses</h2><div className="grid sm:grid-cols-2 gap-4">{houses.map(h=>{
          const stays=allBookings.filter(b=>b.house_id===h.id && b.end_date>today).sort((a,b)=>a.start_date.localeCompare(b.start_date)).slice(0,3);
          return <article key={h.id} className="surface p-4"><h3 className="font-bold mb-2">{h.name}</h3>{stays.length?stays.map(b=><button key={b.id} className="block w-full text-left py-2 border-t text-sm hover:bg-slate-50" onClick={()=>{setSelectedHouseId(h.id);calendarRef.current?.getApi().gotoDate(b.start_date);setViewBooking({bookingId:b.id,title:b.booked_by,start:b.start_date,end:b.end_date,guestCount:b.guest_count,note:b.note||'',createdBy:b.created_by});setEditStart(b.start_date);setEditEnd(b.end_date);setEditGuestCount(String(b.guest_count));setEditNote(b.note||'');setViewError(null);setIsEditingBooking(false);setViewModalOpen(true);}}><strong>{b.booked_by}</strong><span className="block text-slate-600">{formatDate(b.start_date)} – {formatDate(b.end_date)}</span></button>):<p className="text-sm text-slate-500">No upcoming stays. Plan a visit!</p>}</article>;
        })}</div></section>
        <button disabled={!selectedHouseId} onClick={()=>openCreateModal('', '')} className="w-full sm:w-auto mb-5 rounded-xl bg-[#679436] text-white px-6 py-3 font-semibold">Book a stay at {selectedHouseName}</button>

        {myUpcoming.length > 0 && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Your upcoming bookings
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Showing the next {myUpcoming.length} active booking
                  {myUpcoming.length === 1 ? "" : "s"}.
                </p>
              </div>
            </div>

            <ul className="mt-3 space-y-2">
              {myUpcoming.map((b) => {
                const houseName =
                  houses.find((h) => h.id === b.houseId)?.name ?? "House";

                return (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs sm:text-sm text-slate-700 shadow-sm"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {houseName}
                      </div>
                      <div className="text-slate-600">
                        {formatDate(b.start)} – {formatDate(b.end)}
                      </div>
                      <div className="text-slate-600">
                        {b.guestCount} guest{b.guestCount === 1 ? "" : "s"}
                      </div>
                    </div>

                    <button
                      className="ml-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                      disabled={upcomingBusyId === b.id}
                      onClick={async () => {
                        setUpcomingBusyId(b.id);
                        try {
                          await cancelBooking(b.id);
                        } catch (e) { toast.error((e as Error).message); } finally {
                          setUpcomingBusyId(null);
                        }
                      }}
                    >
                      {upcomingBusyId === b.id ? "Cancelling..." : "Cancel"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="surface p-4">
          <div className="fc-house-title text-center mt-4 mb-2">
            <span
              className="text-2xl sm:text-3xl font-extrabold tracking-tight"
              style={houseTextStyle(selectedHouseName)}
            >
              {selectedHouseName}
            </span>
          </div>

          <FullCalendar
            ref={calendarRef as any}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            contentHeight={560}
            fixedWeekCount={true}
            eventOverlap={true}
            dayMaxEvents={true}
            eventDisplay="block"
            events={events}
            selectable={true}
            selectMirror={true}
            select={onSelect}
            eventClick={onEventClick}
            moreLinkClick="popover"
            eventDidMount={(info) => {
              if (
                currentUserId &&
                info.event.extendedProps.createdBy === currentUserId
              ) {
                (info.el as HTMLElement).classList.add("my-booking-event");
              }
            }}
          />
        </div>
      </div>

      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeCreateModal} />
          <div className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto surface p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Create booking</h2>

            <p className="mt-2 text-slate-600">{selectedHouseName} · Up to 7 nights</p>
            <div className="grid sm:grid-cols-2 gap-3 my-4"><label>Arrival<input aria-label="Arrival" type="date" value={pendingStart || ''} onChange={e=>setPendingStart(e.target.value)} className="block w-full border rounded-lg p-3" /></label><label>Departure<input aria-label="Departure" type="date" min={pendingStart || undefined} value={pendingEnd || ''} onChange={e=>setPendingEnd(e.target.value)} className="block w-full border rounded-lg p-3" /></label></div>
            {overlapNotice(pendingStart,pendingEnd)}

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
              <p className="mt-2 text-xs text-slate-500">
                Max stay: 7 nights. Overlaps are allowed.
              </p>
            </div>

            <div className="mt-5">
              <label className="block text-sm font-semibold text-slate-900">
                Note (optional)
              </label>
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

      {viewModalOpen && viewBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeViewModal} />
          <div className="relative w-full max-w-xl max-h-[90dvh] overflow-y-auto surface p-6">
            <h2 className="text-2xl font-semibold text-slate-900">Booking details</h2>

            <div className="mt-4 space-y-2 text-slate-700">
              <div className="text-slate-900 font-semibold">
                {viewBooking.title}
              </div>

              {!isEditingBooking ? (
                <>
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
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900">
                        Check-in
                      </label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-900">
                        Check-out
                      </label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="pt-3">
                    <label className="block text-sm font-semibold text-slate-900">
                      Guests
                    </label>
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
                      value={editGuestCount}
                      onChange={(e) => setEditGuestCount(e.target.value)}
                      inputMode="numeric"
                    />
                  </div>

                  <div className="pt-3">
                    <label className="block text-sm font-semibold text-slate-900">
                      Note (optional)
                    </label>
                    <textarea
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#427aa1]/30"
                      rows={3}
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            {isEditingBooking && overlapNotice(editStart,editEnd,viewBooking?.bookingId)}
            {viewError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {viewError}
              </div>
            )}

            {!isEditingBooking && !canCancelViewedBooking && !isAdmin && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                The booking owner or admin can change this stay. Use your personal PIN when signing in on another device.
              </div>
            )}

            <div className="mt-7 flex items-center justify-end gap-3">
              <button
                className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => {
                  if (isEditingBooking) {
                    setIsEditingBooking(false);
                    setViewError(null);
                    if (viewBooking) {
                      setEditStart(viewBooking.start.slice(0, 10));
                      setEditEnd(viewBooking.end.slice(0, 10));
                      setEditGuestCount(String(viewBooking.guestCount));
                      setEditNote(viewBooking.note);
                    }
                  } else {
                    closeViewModal();
                  }
                }}
                disabled={viewBusy}
              >
                {isEditingBooking ? "Discard changes" : "Close"}
              </button>

              {isEditingBooking ? (
                <button
                  className="rounded-lg bg-[#679436] px-5 py-2.5 font-semibold text-white hover:brightness-95 disabled:opacity-60"
                  disabled={viewBusy}
                  onClick={saveEditedBooking}
                >
                  {viewBusy ? "Saving..." : "Save changes"}
                </button>
              ) : (
                <>
                  {canEditViewedBooking && (
                    <button
                      className="rounded-lg bg-[#427aa1] px-5 py-2.5 font-semibold text-white hover:brightness-105 disabled:opacity-60"
                      disabled={viewBusy}
                      onClick={() => {
                        setIsEditingBooking(true);
                        setViewError(null);
                        if (viewBooking) {
                          setEditStart(viewBooking.start.slice(0, 10));
                          setEditEnd(viewBooking.end.slice(0, 10));
                          setEditGuestCount(String(viewBooking.guestCount));
                          setEditNote(viewBooking.note);
                        }
                      }}
                    >
                      Edit booking
                    </button>
                  )}

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
                </>
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
