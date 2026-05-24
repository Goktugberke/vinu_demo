"use client";

import dynamic from "next/dynamic";

const NotificationsClient = dynamic(
  () => import("./components/NotificationsClient"),
  { ssr: false },
);

export default function Home() {
  return (
    <main className="min-h-screen">
      <NotificationsClient />
    </main>
  );
}
