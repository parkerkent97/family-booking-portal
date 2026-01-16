// app/page.tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  // When someone hits bayavebearln.com, send them to /login
  redirect("/login");
}

