export function bookingValues(body: Record<string, unknown>) {
  const start = body.start_date, end = body.end_date, guests = body.guest_count;
  const validDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
  if (!validDate(start) || !validDate(end)) throw new Error('Choose valid check-in and check-out dates.');
  const nights = (Date.parse(end) - Date.parse(start)) / 86400000;
  if (nights < 1 || nights > 7) throw new Error('Stays must be between 1 and 7 nights.');
  if (typeof guests !== 'number' || !Number.isSafeInteger(guests) || guests < 1) throw new Error('Guest count must be a positive whole number.');
  if (body.note != null && (typeof body.note !== 'string' || body.note.length > 2000)) throw new Error('Notes must be 2,000 characters or fewer.');
  return { start_date: start, end_date: end, guest_count: guests, note: typeof body.note === 'string' ? body.note.trim() || null : null };
}
