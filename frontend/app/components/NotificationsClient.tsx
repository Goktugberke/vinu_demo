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
    return () => { };
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

function getPermissionServerSnapshot(): NotificationPermission {
  return "default";
}

function formatAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatAmount(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function timeAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationsClient() {
  const permission = useSyncExternalStore(
    subscribePermission,
    getPermissionSnapshot,
    getPermissionServerSnapshot,
  );

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as NotificationItem[]) : [];
    } catch (err) {
      console.error("[Storage] read failed", err);
      return [];
    }
  });
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(notifications.slice(0, MAX_STORED)),
      );
    } catch (err) {
      console.error("[Storage] write failed", err);
    }
  }, [notifications]);

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

          setNotifications((prev) => {
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
  }, [permission]);

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
    setNotifications([]);
  }, []);

  const isConnected = permission === "granted" && token !== null;

  return (
    <div className="relative min-h-screen">
      {/* Ambient glow orbs */}
      <div className="glow-orb glow-orb--hero" />
      <div className="glow-orb glow-orb--side" />
      <div className="glow-orb glow-orb--right" />

      <div className="relative z-10 px-6 pt-16 pb-12 max-w-[720px] mx-auto">

        {/* ── Hero Header ── */}
        <header className="mb-14 animate-fade-in">
          <h1 className="gradient-text text-4xl font-bold tracking-tight mb-3">
            USDT Whale Watcher
          </h1>
          <p className="text-muted text-base leading-relaxed max-w-md">
            Real-time monitoring of large USDT transfers on Ethereum mainnet.
            Transfers of 100K+ USDT appear here instantly.
          </p>
        </header>

        {/* ── Status Bar ── */}
        <div className="status-card px-5 py-4 mb-10 animate-fade-in flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <span className="w-2.5 h-2.5 rounded-full bg-success animate-pulse-glow flex-shrink-0" />
            ) : permission === "denied" ? (
              <span className="w-2.5 h-2.5 rounded-full bg-danger flex-shrink-0" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-muted/50 flex-shrink-0" />
            )}
            <span className="text-sm text-foreground/70">
              {isConnected
                ? "Connected — listening for whale transfers"
                : permission === "denied"
                  ? "Notifications blocked by browser"
                  : "Notifications not enabled"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isConnected && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent/60">
                  <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
                </svg>
                Mainnet
              </div>
            )}

            {permission !== "granted" && (
              <button
                onClick={enableNotifications}
                disabled={isLoading || permission === "denied"}
                className="btn-accent"
              >
                <span>{isLoading ? "Connecting…" : "Enable Notifications"}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="mb-8 px-5 py-4 rounded-2xl border border-danger/20 bg-danger/5 text-sm text-danger animate-slide-up">
            {error}
          </div>
        )}

        {/* ── Transfers Feed ── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                Transfers
              </h2>
              {notifications.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2.5 rounded-full text-xs font-bold"
                  style={{
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.1))',
                    color: '#c084fc',
                    border: '1px solid rgba(139,92,246,0.2)'
                  }}
                >
                  {notifications.length}
                </span>
              )}
            </div>
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-muted hover:text-danger transition-colors duration-200"
              >
                Clear all
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="text-center py-20 animate-fade-in">
              <div className="animate-gentle-bounce inline-block mb-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, var(--color-surface), var(--color-surface-raised))',
                    border: '1px solid var(--color-border)'
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent/50">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
              </div>
              <p className="text-foreground/50 text-sm font-medium mb-1">
                Waiting for whale activity
              </p>
              <p className="text-muted/50 text-xs">
                Transfers of 100,000+ USDT will appear here in real time
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {notifications.map((n, i) => (
                <div
                  key={n.id}
                  className="card-glow p-5 animate-slide-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  {/* Amount Row */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(168,85,247,0.05))',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent-bright">
                          <path d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-lg font-bold text-foreground tracking-tight">
                          {formatAmount(n.data.amount)}
                        </span>
                        <span className="text-accent-bright font-semibold ml-1.5 text-sm">
                          USDT
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-muted/70 font-medium">
                      {timeAgo(n.receivedAt)}
                    </span>
                  </div>

                  {/* Addresses */}
                  <div className="space-y-2.5 mb-4">
                    <div className="flex items-center gap-3 group/addr">
                      <span className="text-[11px] uppercase tracking-wider text-muted/60 w-11 flex-shrink-0 font-medium">
                        From
                      </span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex-shrink-0"
                          style={{
                            background: `linear-gradient(135deg, #${(n.data.fromAddress || '').slice(2, 8)}, #${(n.data.fromAddress || '').slice(8, 14)})`,
                            opacity: 0.7,
                          }}
                        />
                        <code className="text-sm font-mono text-foreground/80 group-hover/addr:text-foreground transition-colors">
                          {formatAddress(n.data.fromAddress)}
                        </code>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 group/addr">
                      <span className="text-[11px] uppercase tracking-wider text-muted/60 w-11 flex-shrink-0 font-medium">
                        To
                      </span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex-shrink-0"
                          style={{
                            background: `linear-gradient(135deg, #${(n.data.toAddress || '').slice(2, 8)}, #${(n.data.toAddress || '').slice(8, 14)})`,
                            opacity: 0.7,
                          }}
                        />
                        <code className="text-sm font-mono text-foreground/80 group-hover/addr:text-foreground transition-colors">
                          {formatAddress(n.data.toAddress)}
                        </code>
                      </div>
                    </div>
                  </div>

                  {/* TX Hash */}
                  <div className="pt-3.5" style={{ borderTop: '1px solid rgba(28, 23, 48, 0.8)' }}>
                    <a
                      href={`https://etherscan.io/tx/${n.data.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-accent/60 hover:text-accent-bright transition-colors duration-200 group/link"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-50 group-hover/link:opacity-100 transition-opacity">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                        <polyline points="15,9 15,15 9,15" />
                      </svg>
                      <span className="font-mono">
                        {n.data.txHash
                          ? `${n.data.txHash.slice(0, 14)}…${n.data.txHash.slice(-8)}`
                          : "—"}
                      </span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover/link:opacity-100 transition-opacity -translate-x-1 group-hover/link:translate-x-0 transition-transform">
                        <path d="M7 17L17 7M17 7H10M17 7V14" />
                      </svg>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
