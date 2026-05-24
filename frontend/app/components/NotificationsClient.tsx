"use client";

import { useEffect, useState, useSyncExternalStore, useCallback } from "react";
import { getToken, onMessage, MessagePayload } from "firebase/messaging";
import { getMessagingIfSupported } from "../lib/firebase";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  data: Record<string, string>;
  receivedAt: number;
};

const STORAGE_KEY = "vinu_notifications";
const SUBSCRIBED_TOKEN_KEY = "vinu_subscribed_token";
const MAX_STORED = 50;

async function subscribeTokenToBackend(token: string): Promise<void> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new Error("NEXT_PUBLIC_BACKEND_URL is not defined");

  const res = await fetch(`${backendUrl}/notifications/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) {
    throw new Error(`Subscribe failed: ${res.status} ${res.statusText}`);
  }
}

function subscribePermission(callback: () => void): () => void {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return () => {};
  }
  let status: PermissionStatus | null = null;
  navigator.permissions
    .query({ name: "notifications" as PermissionName })
    .then((s) => {
      status = s;
      status.addEventListener("change", callback);
    })
    .catch((err) => {
      console.error("[Permissions] query failed", err);
    });
  return () => {
    status?.removeEventListener("change", callback);
  };
}

function getPermissionSnapshot(): NotificationPermission {
  return typeof Notification !== "undefined"
    ? Notification.permission
    : "default";
}

function getServerSnapshot(): NotificationPermission {
  return "default";
}

function readStoredNotifications(): NotificationItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NotificationItem[]) : [];
  } catch (err) {
    console.error("[Storage] read failed", err);
    return [];
  }
}

function writeStoredNotifications(items: NotificationItem[]): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_STORED)),
    );
  } catch (err) {
    console.error("[Storage] write failed", err);
  }
}

export default function NotificationsClient() {
  const permission = useSyncExternalStore(
    subscribePermission,
    getPermissionSnapshot,
    getServerSnapshot,
  );

  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>(
    readStoredNotifications,
  );

  const updateNotifications = useCallback(
    (updater: (prev: NotificationItem[]) => NotificationItem[]) => {
      setNotifications((prev) => {
        const next = updater(prev);
        writeStoredNotifications(next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (permission !== "granted") return;

    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const messaging = await getMessagingIfSupported();
        if (!messaging || cancelled) return;

        await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;

        const t = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });
        if (cancelled) return;

        if (!t) {
          setError("Failed to retrieve token.");
          return;
        }
        setToken(t);
        console.log("[FCM Token]", t);

        const alreadySubscribed = localStorage.getItem(SUBSCRIBED_TOKEN_KEY);
        if (alreadySubscribed !== t) {
          try {
            await subscribeTokenToBackend(t);
            localStorage.setItem(SUBSCRIBED_TOKEN_KEY, t);
            console.log("[Subscribe] success");
          } catch (subErr) {
            console.error("[Subscribe] failed", subErr);
            setError(
              subErr instanceof Error
                ? `Subscribe failed: ${subErr.message}`
                : "Subscribe failed",
            );
          }
        }

        unsubscribe = onMessage(messaging, (payload: MessagePayload) => {
          console.log("[Foreground]", payload);
          const data = (payload.data ?? {}) as Record<string, string>;
          const txHash = data.txHash;

          updateNotifications((prev) => {
            if (txHash && prev.some((n) => n.data.txHash === txHash)) {
              return prev;
            }
            return [
              {
                id: crypto.randomUUID(),
                title: payload.notification?.title ?? "Notification",
                body: payload.notification?.body ?? "",
                data,
                receivedAt: Date.now(),
              },
              ...prev,
            ].slice(0, MAX_STORED);
          });
        });
      } catch (err) {
        console.error("[Setup] failed", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [permission, updateNotifications]);

  const enableNotifications = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError(
          "Notification permission denied. You can enable it from browser settings.",
        );
      }
    } catch (err) {
      console.error("[RequestPermission] failed", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearAll = useCallback(() => {
    updateNotifications(() => []);
  }, [updateNotifications]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">USDT Large Transfer Watcher</h1>

      <div className="mb-4 text-sm">
        Permission: <span className="font-mono">{permission}</span>
      </div>

      {permission !== "granted" && (
        <button
          onClick={enableNotifications}
          disabled={isLoading || permission === "denied"}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isLoading ? "Enabling…" : "Enable Notifications"}
        </button>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {token && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-600">
            FCM token (debug)
          </summary>
          <code className="block mt-2 p-2 bg-gray-100 text-xs break-all">
            {token}
          </code>
        </details>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">
            Incoming transfers ({notifications.length})
          </h2>
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="text-sm text-red-600 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
        {notifications.length === 0 ? (
          <p className="text-gray-500">
            No notifications yet. Large transfers will appear here when the
            backend detects them.
          </p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n) => (
              <li key={n.id} className="p-3 border rounded">
                <div className="font-semibold">{n.title}</div>
                <div className="text-sm text-gray-700">{n.body}</div>
                <div className="mt-2 text-xs font-mono text-gray-500 space-y-1">
                  <div>from: {n.data.fromAddress}</div>
                  <div>to: {n.data.toAddress}</div>
                  <div>amount: {n.data.amount} USDT</div>
                  <div>
                    tx:{" "}
                    <a
                      href={`https://etherscan.io/tx/${n.data.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {n.data.txHash}
                    </a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
