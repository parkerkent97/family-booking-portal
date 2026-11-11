# Family calendar: Vercel + Neon

The site uses a shared family password, then first and last name. No email sign-in or notifications are used. All bookings and settings are stored in a new Neon database; the old Supabase data is not used or changed.

## One-time connection

In the Vercel project, open Storage → Create Database → Neon. Select the Free plan and connect it to Production. The integration supplies `DATABASE_URL`. Keep `FAMILY_PASSWORD`, `ADMIN_PASSWORD`, and `SESSION_SECRET` as Production secrets (already entered by the owner).

Deploy the prepared code from GitHub. On first use the app automatically initializes two houses (Bay Ave and Bear Ln), an empty booking table, visitors, password settings, and login rate limiting. Initialization is idempotent and never clears bookings. No SQL dashboard setup is required.

The app has no dependency on the old Supabase or Resend environment variables. They can be removed after the new deployment is verified. This does not delete the old provider accounts or their data.

## Everyday use

- Family: enter the shared password, then first and last name, and book on the calendar.
- Admin: check “Sign in as admin,” enter the separate admin password, then your name. Admin settings can change the shared family password. Admins can edit/cancel/delete any booking and view house usage.
- Sessions last seven days. A signed browser cookie remembers booking ownership for up to a year. Signing out removes access but retains browser identity. Switching devices or clearing cookies means the admin must manage earlier bookings; a matching name alone does not grant ownership.
- Changing the family password signs everyone else out. `FAMILY_PASSWORD` is only the initial password; the database-stored hash overrides it after the first change.
- Stays remain limited to seven nights; overlapping bookings remain allowed.

## Validation

Production build and 12 tests pass, including real PostgreSQL-engine testing of automatic initialization, booking constraints, durable records across repeated initialization, and login rate limits. Other tests cover password rejection, required names, admin isolation, signed session tampering, password rotation, booking ownership and date/guest validation.

Live verification still requires the Neon connection and deployment. The existing usage-report month selection and unique-day counting were preserved. Existing framework dependencies have audit findings; no framework upgrade was included in this change.
