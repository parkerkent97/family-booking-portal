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
  guest_names?: string | null;
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

const USER_COLORS = ["#48685c", "#596f83", "#846b60", "#777359", "#756583", "#436d70"];

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
  const [guestNames, setGuestNames] = useState("");
  const [editGuestNames, setEditGuestNames] = useState("");
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
    guestNames: string;
    createdBy: string;
  } | null>(null);

  // EDIT mode state for the view modal
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'delete' | null>(null);
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
        extendedProps: { bookingId: b.id, createdBy: b.created_by, guestCount: b.guest_count, guestNames: b.guest_names || '', note: b.note || '' } };
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
    setGuestNames("");
    setModalError(null);
    calendarRef.current?.getApi()?.unselect();
  };

  const openCreateModal = (startStr: string, endStr: string) => {
    setPendingStart(startStr);
    setPendingEnd(endStr);
    setGuestCountInput("2");
    setNoteInput("");
    setGuestNames("");
    setModalError(null);
    setBookingModalOpen(true);
  };

  const closeViewModal = () => {
    setViewModalOpen(false);
    setConfirmAction(null);
    setViewBooking(null);
    setViewError(null);
    setViewBusy(false);
    setIsEditingBooking(false);
  };

  useEffect(() => {
    if (!bookingModalOpen) return;
    const t = setTimeout(() => { if (pendingStart && pendingEnd) guestsInputRef.current?.focus(); }, 50);
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
        guest_count: guestCount, start_date: pendingStart, end_date: pendingEnd, note, guest_names: guestNames });

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
        start_date: editStart, end_date: editEnd, guest_count: guests, note: noteClean, guest_names: editGuestNames });

      toast.success("Booking updated.");
      setRefreshKey((k) => k + 1);
      setIsEditingBooking(false);

      setViewBooking({
        ...viewBooking,
        start: editStart,
        end: editEnd,
        guestCount: guests,
        note: noteClean ?? "",
        guestNames: editGuestNames.trim(),
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
      guestNames: String(arg.event.extendedProps.guestNames || ""),
      createdBy,
    });

    setEditStart(start.slice(0, 10));
    setEditEnd(end.slice(0, 10));
    setEditGuestCount(String(guestCount));
    setEditNote(note);
    setEditGuestNames(String(arg.event.extendedProps.guestNames || ""));

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

  const [section, setSection] = useState<'calendar' | 'stays' | 'account'>('calendar');
  useEffect(() => { const view = new URLSearchParams(window.location.search).get('view'); if(view === 'stays' || view === 'account') setSection(view); }, []);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => {
    if (section !== 'calendar') return;
    const frame = requestAnimationFrame(() => calendarRef.current?.getApi().updateSize());
    return () => cancelAnimationFrame(frame);
  }, [section]);
  const today = new Date().toLocaleDateString('en-CA');
  const overlapNotice = (start: string | null, end: string | null, except?: number) => {
    const matches = allBookings.filter(b => b.house_id === selectedHouseId && b.id !== except && start && end && b.start_date < end && b.end_date > start);
    return matches.length > 0 && <div role="status" className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900"><strong>Sharing the house</strong><p>{[...new Set(matches.map(b=>b.booked_by))].join(', ')} also booked these dates. You can still book.</p></div>;
  };
  const selectedHouseName = selectedHouse?.name ?? "";
  const houseTheme = selectedHouseName.toLowerCase().includes("bear") ? "cabin" : "coast";

  const canCancelViewedBooking =
    !!viewBooking && !!currentUserId && (viewBooking.createdBy === currentUserId || isAdmin);

  const canEditViewedBooking =
    !!viewBooking && !!currentUserId && (viewBooking.createdBy === currentUserId || isAdmin);

  return (
    <main className="booking-app" data-house-theme={houseTheme}>
      <Toaster />
      <div className="app-shell">
        <header className="app-header"><div><h1>Bay Ave &amp; Bear Ln</h1></div><button className="profile-button" aria-label="Open account" onClick={()=>setSection('account')}>{currentName ? currentName.split(' ').map(n=>n[0]).slice(0,2).join('') : '…'}</button></header>
        <nav className="view-tabs" aria-label="Main navigation">{(['calendar','stays','account'] as const).map(tab=><button key={tab} aria-current={section===tab?'page':undefined} onClick={()=>setSection(tab)}>{tab==='calendar'?'Calendar':tab==='stays'?'Stays':'Account'}</button>)}{isAdmin && <Link href="/usage">Usage</Link>}</nav>
        {section==='account' && <section className="account-panel"><h2>Your account</h2><p>{currentName}</p><div className="account-links"><Link href="/access">Personal PIN <span>Manage access across devices →</span></Link><Link href="/rules">House rules <span>Everything to know before your stay →</span></Link>{isAdmin && <><Link href="/admin">Admin settings <span>Passwords, rules &amp; bookings →</span></Link><Link href="/usage">House usage <span>See how the houses are used →</span></Link></>}</div><button className="quiet-button" onClick={signOutAndGoLogin}>Sign out</button></section>}
        <div hidden={section!=='stays'}><div className="section-heading"><h2>Upcoming stays</h2><label className="mine-filter"><input type="checkbox" checked={onlyMine} onChange={e=>setOnlyMine(e.target.checked)}/>Only mine</label></div>
        <section className="mb-6 space-y-3" aria-label="Upcoming stays at both houses"><div className="grid sm:grid-cols-2 gap-4">{houses.map(h=>{
          const stays=allBookings.filter(b=>b.house_id===h.id && b.end_date>today && (!onlyMine || b.created_by===currentUserId)).sort((a,b)=>a.start_date.localeCompare(b.start_date));
          return <article key={h.id} className="surface p-4"><h3 className="font-bold mb-2">{h.name}</h3>{stays.length?stays.map(b=><button key={b.id} className="block w-full text-left py-2 border-t text-sm hover:bg-slate-50" onClick={()=>{setSection('calendar');setSelectedHouseId(h.id);calendarRef.current?.getApi().gotoDate(b.start_date);setViewBooking({bookingId:b.id,title:b.booked_by,start:b.start_date,end:b.end_date,guestCount:b.guest_count,note:b.note||'',guestNames:b.guest_names||'',createdBy:b.created_by});setEditStart(b.start_date);setEditEnd(b.end_date);setEditGuestCount(String(b.guest_count));setEditNote(b.note||'');setEditGuestNames(b.guest_names||'');setViewError(null);setIsEditingBooking(false);setViewModalOpen(true);}}><strong>{b.booked_by}</strong><span className="block text-slate-600">{formatDate(b.start_date)} – {formatDate(b.end_date)}</span></button>):<p className="text-sm text-slate-500">No upcoming stays. Plan a visit!</p>}</article>;
        })}</div></section>
        </div>
        <section hidden={section!=='calendar'} className="calendar-panel">
          <div className="house-switch" aria-label="Choose a house">{houses.map(h=><button key={h.id} aria-pressed={selectedHouseId===h.id} onClick={()=>setSelectedHouseId(h.id)}><span className="house-mood">{!h.name.toLowerCase().includes('bear') ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 15c3-4 5 4 8 0s5 4 8 0 4 0 4 0M2 20c3-4 5 4 8 0s5 4 8 0 4 0 4 0"/><circle cx="16" cy="6" r="3"/></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 20 8-15 5 9 3-5 4 11H2Zm5-9 3 2 3-2"/></svg>}</span>{h.name}</button>)}</div>
          <div className="calendar-caption"><Link href="/rules">House rules ↗</Link></div>
          <FullCalendar
            ref={calendarRef as any}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            contentHeight={450}
            headerToolbar={{left:"title",center:"",right:"prev,next"}}
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
          <p className="calendar-hint">Select a stay for details. Overlapping visits are welcome.</p>
        </section>
        {section!=='account' && <div className="booking-bar"><div><strong>{selectedHouseName || 'Your next stay'}</strong></div><button disabled={!selectedHouseId} onClick={()=>openCreateModal('', '')}>Book a stay</button></div>}
      </div>

      {bookingModalOpen && (
        <div className="booking-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeCreateModal} />
          <div className="booking-sheet relative w-full max-w-xl max-h-[90dvh] overflow-y-auto surface p-6">
            <header className="sheet-heading"><h2>Book your stay</h2><button className="sheet-close" aria-label="Close booking form" disabled={saving} onClick={closeCreateModal}>×</button></header>

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

            <label className="block mt-5 font-semibold">Guest names (optional)<textarea maxLength={2000} rows={2} className="mt-2 w-full rounded-lg border p-3 font-normal" placeholder="e.g., Alex Smith, Jamie Smith" value={guestNames} onChange={e=>setGuestNames(e.target.value)} /><span className="block text-xs font-normal text-slate-500">Separate names with commas or new lines. Visible to everyone with access to the site.</span></label>
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
        <div className="booking-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={()=>{if(!viewBusy)closeViewModal();}} />
          <div role="dialog" aria-modal="true" aria-labelledby="stay-dialog-title" className="booking-sheet stay-dialog relative w-full max-w-xl max-h-[90dvh] overflow-y-auto surface p-6">
            <header className="sheet-heading"><div><p className="sheet-kicker">{selectedHouseName}</p><h2 id="stay-dialog-title">{confirmAction ? (confirmAction==='cancel'?'Cancel this stay?':'Delete this stay?') : isEditingBooking ? 'Edit your stay' : 'Stay details'}</h2></div><button className="sheet-close" aria-label="Close booking details" disabled={viewBusy} onClick={closeViewModal}>×</button></header>
            <p className="stay-owner">{viewBooking.title}</p>
            {confirmAction ? <div className="confirmation-copy"><p>{confirmAction==='cancel'?'This stay will be removed from the calendar.':'This permanently deletes the booking and cannot be undone.'}</p><p>{formatDate(viewBooking.start)} – {formatDate(viewBooking.end)}</p></div> : isEditingBooking ? <div className="stay-form">
              <div className="stay-dates"><label>Arrival<input type="date" value={editStart} onChange={e=>setEditStart(e.target.value)}/></label><label>Departure<input type="date" value={editEnd} onChange={e=>setEditEnd(e.target.value)}/></label></div>
              <label>Guests<input type="number" min={1} value={editGuestCount} onChange={e=>setEditGuestCount(e.target.value)}/></label>
              <label>Guest names <span className="optional-label">Optional</span><textarea maxLength={2000} rows={2} value={editGuestNames} onChange={e=>setEditGuestNames(e.target.value)}/></label>
              <label>Note <span className="optional-label">Optional</span><textarea maxLength={2000} rows={3} value={editNote} onChange={e=>setEditNote(e.target.value)}/></label>
              {overlapNotice(editStart,editEnd,viewBooking.bookingId)}
            </div> : <div className="stay-summary"><div className="stay-dates"><div><span>Arrival</span><strong>{formatDate(viewBooking.start)}</strong></div><div><span>Departure</span><strong>{formatDate(viewBooking.end)}</strong></div></div><div className="summary-row"><span>Guests</span><strong>{viewBooking.guestCount}</strong></div>{viewBooking.guestNames && <div className="summary-text"><span>Guest names</span><p>{viewBooking.guestNames}</p></div>}{viewBooking.note && <div className="summary-text"><span>Note</span><p>{viewBooking.note}</p></div>}</div>}
            {viewError && <p role="alert" className="dialog-error">{viewError}</p>}
            <div className="sheet-actions">
              {confirmAction ? <><button className="secondary-action" disabled={viewBusy} onClick={()=>{setConfirmAction(null);setViewError(null);}}>Keep stay</button><button className="danger-action" disabled={viewBusy} onClick={async()=>{setViewBusy(true);setViewError(null);try{if(confirmAction==='cancel')await cancelBooking(viewBooking.bookingId);else await adminDeleteBooking(viewBooking.bookingId);closeViewModal();}catch(e){setViewError((e as Error).message);}finally{setViewBusy(false);}}}>{viewBusy?'Please wait…':confirmAction==='cancel'?'Cancel stay':'Delete permanently'}</button></> : isEditingBooking ? <><button className="secondary-action" disabled={viewBusy} onClick={()=>{setIsEditingBooking(false);setViewError(null);}}>Discard changes</button><button className="primary-action" disabled={viewBusy} onClick={saveEditedBooking}>{viewBusy?'Saving…':'Save changes'}</button></> : <>{canEditViewedBooking ? <button className="primary-action" onClick={()=>{setEditStart(viewBooking.start);setEditEnd(viewBooking.end);setEditGuestCount(String(viewBooking.guestCount));setEditGuestNames(viewBooking.guestNames);setEditNote(viewBooking.note);setViewError(null);setIsEditingBooking(true);}}>Edit stay</button> : <button className="secondary-action" onClick={closeViewModal}>Done</button>}</>}
            </div>
            {!isEditingBooking && !confirmAction && (canCancelViewedBooking || isAdmin) && <div className="destructive-links">{canCancelViewedBooking && <button onClick={()=>setConfirmAction('cancel')}>Cancel stay</button>}{isAdmin && <button onClick={()=>setConfirmAction('delete')}>Delete permanently</button>}</div>}
          </div>
        </div>
      )}
    </main>
  );
}
