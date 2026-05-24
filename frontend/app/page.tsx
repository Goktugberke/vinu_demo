"use client";

import dynamic from "next/dynamic";

const NotificationsClient = dynamic(
  () => import("./components/NotificationsClient"),
  { ssr: false },
);

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black">
      <NotificationsClient />
    </main>
  );
}
