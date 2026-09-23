"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type {
  GoogleAddressAutocompleteResponse,
  GoogleAddressResolveResponse,
  GoogleAddressSuggestion,
  GoogleResolvedAddress,
} from "@/lib/google-address-types";

type GoogleAddressAutocompleteProps = {
  id: string;
  value: string;
  countryCode: string;
  onValueChange: (value: string) => void;
  onSelect?: (address: GoogleResolvedAddress) => void;
  placeholder?: string;
  className?: string;
  label?: string;
  labelClassName?: string;
  testId?: string;
};

type Availability = "checking" | "available" | "unavailable";
type SearchStatus = "idle" | "loading" | "ready" | "resolving" | "error";

function newSessionToken() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}-address`;
}

async function readJson<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({})) as T;
}

export default function GoogleAddressAutocomplete({
  id,
  value,
  countryCode,
  onValueChange,
  onSelect,
  placeholder = "Start typing an address or postal code",
  className = "rounded border p-2 text-sm",
  label,
  labelClassName = "text-xs font-medium text-neutral-700",
  testId,
}: GoogleAddressAutocompleteProps) {
  const [availability, setAvailability] = useState<Availability>("checking");
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [suggestions, setSuggestions] = useState<GoogleAddressSuggestion[]>([]);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const sessionTokenRef = useRef(newSessionToken());
  const selectedValueRef = useRef("");
  const blurTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/address-autocomplete", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => readJson<{ configured?: boolean }>(response))
      .then((payload) => setAvailability(payload.configured ? "available" : "unavailable"))
      .catch(() => {
        if (!controller.signal.aborted) setAvailability("unavailable");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    sessionTokenRef.current = newSessionToken();
    selectedValueRef.current = "";
    setSuggestions([]);
    setOpen(false);
  }, [countryCode]);

  useEffect(() => {
    const query = value.trim();
    if (
      availability !== "available" ||
      query.length < 3 ||
      query === selectedValueRef.current
    ) {
      setSuggestions([]);
      setActiveIndex(-1);
      if (query.length < 3 || availability !== "available") setStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      setMessage("");
      try {
        const response = await fetch("/api/address-autocomplete", {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "suggest",
            query,
            countryCode,
            sessionToken: sessionTokenRef.current,
          }),
        });
        const payload = await readJson<GoogleAddressAutocompleteResponse>(response);
        if (!response.ok) throw new Error(payload.error || "Address suggestions are unavailable.");
        setSuggestions(payload.suggestions ?? []);
        setActiveIndex(-1);
        setOpen(true);
        setStatus("ready");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setStatus("error");
        setMessage(cause instanceof Error ? cause.message : "Address suggestions are unavailable.");
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [availability, countryCode, value]);

  const chooseSuggestion = async (suggestion: GoogleAddressSuggestion) => {
    setStatus("resolving");
    setMessage("");
    setOpen(false);
    selectedValueRef.current = suggestion.text;
    onValueChange(suggestion.text);
    try {
      const response = await fetch("/api/address-autocomplete", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          placeId: suggestion.placeId,
          sessionToken: sessionTokenRef.current,
        }),
      });
      const payload = await readJson<GoogleAddressResolveResponse>(response);
      if (!response.ok || !payload.address) {
        throw new Error(payload.error || "That address could not be confirmed.");
      }
      selectedValueRef.current = payload.address.addressNormalized;
      onValueChange(payload.address.addressNormalized);
      onSelect?.(payload.address);
      setStatus("ready");
      setMessage("Address confirmed by Google Maps.");
      setSuggestions([]);
      sessionTokenRef.current = newSessionToken();
    } catch (cause) {
      setStatus("error");
      setMessage(cause instanceof Error ? cause.message : "That address could not be confirmed.");
      selectedValueRef.current = suggestion.text;
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
      if (event.key === "ArrowDown" && suggestions.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(suggestions.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      void chooseSuggestion(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const input = (
    <div className="relative mt-1">
      <input
        aria-autocomplete="list"
        aria-controls={`${id}-suggestions`}
        aria-expanded={open && suggestions.length > 0}
        aria-activedescendant={activeIndex >= 0 ? `${id}-suggestion-${activeIndex}` : undefined}
        autoComplete="street-address"
        className={`w-full ${className}`}
        data-testid={testId}
        id={id}
        onBlur={() => {
          blurTimerRef.current = window.setTimeout(() => setOpen(false), 120);
        }}
        onChange={(event) => {
          selectedValueRef.current = "";
          onValueChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (blurTimerRef.current !== null) {
            window.clearTimeout(blurTimerRef.current);
            blurTimerRef.current = null;
          }
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        type="search"
        value={value}
      />
      {open && (suggestions.length > 0 || status === "loading") ? (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl"
          id={`${id}-suggestions`}
          role="listbox"
        >
          {status === "loading" ? (
            <div className="px-3 py-2 text-xs text-neutral-500">Finding addresses…</div>
          ) : null}
          {suggestions.map((suggestion, index) => (
            <button
              aria-selected={index === activeIndex}
              className={`block w-full border-b border-neutral-100 px-3 py-2 text-left last:border-b-0 ${
                index === activeIndex ? "bg-blue-50" : "bg-white hover:bg-neutral-50"
              }`}
              id={`${id}-suggestion-${index}`}
              key={suggestion.placeId}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => void chooseSuggestion(suggestion)}
              role="option"
              type="button"
            >
              <span className="block text-sm font-medium text-neutral-900">
                {suggestion.mainText}
              </span>
              {suggestion.secondaryText ? (
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {suggestion.secondaryText}
                </span>
              ) : null}
            </button>
          ))}
          <div
            className="bg-neutral-50 px-3 py-1.5 text-right text-xs font-normal text-[#5e5e5e]"
            translate="no"
          >
            Google Maps
          </div>
        </div>
      ) : null}
      <div className="mt-1 min-h-4 text-[11px] text-neutral-500" aria-live="polite">
        {availability === "checking" ? "Connecting address search…" : null}
        {availability === "unavailable"
          ? "Address suggestions are unavailable; manual entry still works."
          : null}
        {status === "resolving" ? "Confirming address…" : null}
        {message ? message : null}
      </div>
    </div>
  );

  if (!label) return input;
  return (
    <div>
      <label className={labelClassName} htmlFor={id}>{label}</label>
      {input}
    </div>
  );
}
