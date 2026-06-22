"use client";

import { useState } from "react";

export default function AdminTestPanel() {
  const [clickKey, setClickKey] = useState("");
  const [eventType, setEventType] = useState<
    "add_to_cart" | "checkout" | "purchase"
  >("purchase");
  const [value, setValue] = useState<string>("");
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  type EventType = "add_to_cart" | "checkout" | "purchase";

  const isEventType = (value: string): value is EventType => {
    return value === "add_to_cart" || value === "checkout" || value === "purchase";
  };

  const send = async () => {
    setMessage(null);
    if (!clickKey.trim()) {
      setMessage({ tone: "error", text: "Paste a clickKey first" });
      return;
    }

    const payload: { clickKey: string; eventType: EventType; value?: number; currency?: string } = {
      clickKey: clickKey.trim(),
      eventType,
    };
    if (value.trim()) payload.value = Number(value);
    payload.currency = "SGD";

    const res = await fetch("/api/track/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ tone: "error", text: data?.error ?? "Failed" });
      return;
    }
    setMessage({ tone: "success", text: "Event tracked" });
  };

  return (
    <div className="mt-8 rounded-xl bg-white p-4 shadow">
      <h2 className="text-lg font-semibold">Testing Panel</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Use this to simulate add_to_cart / checkout / purchase events for funnel
        testing.
      </p>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <input
          className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
          placeholder="clickKey (from ProductClick table)"
          value={clickKey}
          onChange={(e) => setClickKey(e.target.value)}
        />

        <select
          className="rounded-lg border px-3 py-2 text-sm"
          value={eventType}
          onChange={(e) => {
            if (isEventType(e.target.value)) {
              setEventType(e.target.value);
            }
          }}
        >
          <option value="add_to_cart">add_to_cart</option>
          <option value="checkout">checkout</option>
          <option value="purchase">purchase</option>
        </select>

        <input
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder="value (optional)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>

      <button
        className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white"
        onClick={send}
      >
        Send event
      </button>
      {message && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
            message.tone === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
