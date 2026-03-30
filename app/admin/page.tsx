"use client";

import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  customerName?: string;
  customerTel?: string;
  sportType?: string;
  courtNumber?: string | number;
  startTime?: { toDate: () => Date };
  status?: "pending" | "uploaded" | "confirmed" | "cancelled";
  slipImageBase64?: string;
  createdAt?: { toDate: () => Date };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SPORT_CONFIG: Record<
  string,
  { label: string; emoji: string; courts: number; color: string }
> = {
  football:   { label: "ฟุตบอล",      emoji: "⚽", courts: 2, color: "#16a34a" },
  badminton:  { label: "แบดมินตัน",  emoji: "🏸", courts: 4, color: "#2563eb" },
  basketball: { label: "บาสเก็ตบอล", emoji: "🏀", courts: 2, color: "#ea580c" },
};

const TIME_SLOTS = [
  "09:00","10:00","11:00","12:00","13:00","14:00",
  "15:00","16:00","17:00","18:00","19:00","20:00",
];

const STATUS_CONFIG = {
  pending:   { label: "รออัปโหลดสลิป", bg: "bg-gray-100",   text: "text-gray-600"   },
  uploaded:  { label: "รอตรวจสอบ",     bg: "bg-yellow-100", text: "text-yellow-700" },
  confirmed: { label: "ยืนยันแล้ว",    bg: "bg-green-100",  text: "text-green-700"  },
  cancelled: { label: "ยกเลิกแล้ว",   bg: "bg-red-100",    text: "text-red-700"    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(start: Date, days = 7): Date[] {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toDateKey(d: Date) {
  return d.toISOString().split("T")[0];
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!cfg) return null;
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const ADMIN_PIN = "1234";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedSport, setSelectedSport] = useState("football");
  const [calendarStart, setCalendarStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setIsAuthenticated(true);
    } else {
      alert("รหัส PIN ไม่ถูกต้อง!");
      setPin("");
    }
  };

  // ── Realtime listener ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setBookings(
          snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Booking))
        );
        setIsLoading(false);
      },
      (err) => {
        console.error(err);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [isAuthenticated]);

  // ── Update status ──────────────────────────────────────────────────────────

  const updateBookingStatus = async (bookingId: string, newStatus: string) => {
    const label =
      STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG]?.label ?? newStatus;
    if (!confirm(`เปลี่ยนสถานะเป็น "${label}"?`)) return;
    try {
      await updateDoc(doc(db, "bookings", bookingId), { status: newStatus });
    } catch {
      alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    }
  };

  // ── Derived: booking map for calendar ─────────────────────────────────────
  // bookingMap[dateKey][court][time] = Booking

  const bookingMap: Record<string, Record<string, Record<string, Booking>>> = {};
  bookings.forEach((b) => {
    if (b.sportType !== selectedSport) return;
    if (!b.startTime || b.status === "cancelled") return;
    const d = b.startTime.toDate();
    const dk = toDateKey(d);
    const court = String(b.courtNumber);
    const time = `${d.getHours().toString().padStart(2, "0")}:00`;
    bookingMap[dk] ??= {};
    bookingMap[dk][court] ??= {};
    bookingMap[dk][court][time] = b;
  });

  const sportCfg = SPORT_CONFIG[selectedSport];
  const dateRange = getDateRange(calendarStart, 7);

  // ── Login screen ──────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
          <div className="text-4xl mb-3">🔐</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Staff Only</h2>
          <p className="text-gray-500 text-sm mb-6">
            กรุณาใส่รหัส PIN เพื่อเข้าสู่ระบบ
          </p>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center text-3xl tracking-[0.5em] border-2 border-gray-300 p-4 rounded-xl focus:outline-none focus:border-blue-500 mb-4"
              maxLength={4}
              placeholder="••••"
              autoFocus
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all"
            >
              เข้าสู่ระบบ
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-gray-800">Staff Dashboard</span>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
              Live
            </span>
          </div>
          {/* View toggle */}
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setView("list")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                view === "list"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              📋 รายการ
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                view === "calendar"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              📅 ตารางสนาม
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">

        {/* ── Sport selector ── */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(SPORT_CONFIG).map(([key, cfg]) => {
            const total = bookings.filter(
              (b) => b.sportType === key && b.status !== "cancelled"
            ).length;
            const waitingReview = bookings.filter(
              (b) => b.sportType === key && b.status === "uploaded"
            ).length;
            const isActive = selectedSport === key;

            return (
              <button
                key={key}
                onClick={() => setSelectedSport(key)}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 font-semibold transition-all ${
                  isActive
                    ? "text-white shadow-md scale-[1.02] border-transparent"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:shadow-sm"
                }`}
                style={isActive ? { backgroundColor: cfg.color } : {}}
              >
                <span className="text-2xl leading-none">{cfg.emoji}</span>
                <div className="text-left leading-tight">
                  <div className="text-sm">{cfg.label}</div>
                  <div
                    className={`text-xs mt-0.5 ${
                      isActive ? "text-white/75" : "text-gray-400"
                    }`}
                  >
                    {total} การจอง
                    {waitingReview > 0 && (
                      <span
                        className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
                          isActive
                            ? "bg-white/25 text-white"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {waitingReview} รอตรวจ
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ════════════════════════════════════════════
            VIEW: LIST
        ════════════════════════════════════════════ */}
        {view === "list" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {isLoading ? (
              <p className="text-center py-16 text-gray-400">กำลังโหลด...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                      <th className="px-5 py-3 font-semibold">รหัสการจอง</th>
                      <th className="px-5 py-3 font-semibold">ลูกค้า</th>
                      <th className="px-5 py-3 font-semibold">สนาม / เวลา</th>
                      <th className="px-5 py-3 font-semibold">สถานะ</th>
                      <th className="px-5 py-3 font-semibold">สลิป</th>
                      <th className="px-5 py-3 font-semibold">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {bookings
                      .filter((b) => b.sportType === selectedSport)
                      .map((booking) => {
                        const st = booking.startTime?.toDate();
                        const timeStr = st
                          ? `${st.toLocaleDateString("th-TH", {
                              day: "numeric",
                              month: "short",
                            })} เวลา ${st
                              .getHours()
                              .toString()
                              .padStart(2, "0")}:00`
                          : "ไม่ระบุ";

                        return (
                          <tr
                            key={booking.id}
                            className="hover:bg-gray-50/70 transition-colors"
                          >
                            <td className="px-5 py-4 text-xs text-gray-400 font-mono">
                              {booking.id.slice(0, 8)}…
                            </td>
                            <td className="px-5 py-4">
                              <p className="font-semibold text-gray-800">
                                {booking.customerName || "ไม่ระบุ"}
                              </p>
                              <p className="text-xs text-gray-400">
                                {booking.customerTel || "—"}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <span
                                className="inline-flex items-center gap-1 text-sm font-semibold"
                                style={{ color: sportCfg.color }}
                              >
                                {sportCfg.emoji} {sportCfg.label} สนาม{" "}
                                {booking.courtNumber}
                              </span>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {timeStr}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={booking.status || ""} />
                            </td>
                            <td className="px-5 py-4">
                              {booking.slipImageBase64 ? (
                                <button
                                  onClick={() =>
                                    setSelectedSlip(booking.slipImageBase64!)
                                  }
                                  className="text-blue-500 hover:underline text-sm font-medium"
                                >
                                  ดูสลิป
                                </button>
                              ) : (
                                <span className="text-gray-300 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() =>
                                    updateBookingStatus(booking.id, "confirmed")
                                  }
                                  disabled={
                                    booking.status === "confirmed" ||
                                    booking.status === "cancelled"
                                  }
                                  className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                  อนุมัติ
                                </button>
                                <button
                                  onClick={() =>
                                    updateBookingStatus(booking.id, "cancelled")
                                  }
                                  disabled={booking.status === "cancelled"}
                                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                  ยกเลิก
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {bookings.filter((b) => b.sportType === selectedSport).length ===
                  0 && (
                  <p className="text-center py-14 text-gray-400">
                    ไม่มีการจองสำหรับ{sportCfg.label}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════
            VIEW: CALENDAR
        ════════════════════════════════════════════ */}
        {view === "calendar" && (
          <div className="space-y-4">

            {/* Date navigator */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-2">
              <button
                onClick={() => {
                  const d = new Date(calendarStart);
                  d.setDate(d.getDate() - 7);
                  setCalendarStart(d);
                }}
                className="w-9 h-9 flex-shrink-0 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-lg transition-colors"
              >
                ‹
              </button>

              <div className="flex gap-1.5 flex-1 overflow-x-auto pb-0.5">
                {dateRange.map((date) => {
                  const dk = toDateKey(date);
                  const isToday = isSameDay(date, new Date());
                  const dot = bookings.some(
                    (b) =>
                      b.sportType === selectedSport &&
                      b.status !== "cancelled" &&
                      b.startTime &&
                      isSameDay(b.startTime.toDate(), date)
                  );
                  return (
                    <div
                      key={dk}
                      className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px] ${
                        isToday ? "ring-2" : ""
                      }`}
                      style={isToday ? { ringColor: sportCfg.color } : {}}
                    >
                      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                        {date.toLocaleDateString("th-TH", { weekday: "short" })}
                      </span>
                      <span
                        className={`text-lg font-bold leading-tight ${
                          isToday ? "text-gray-800" : "text-gray-500"
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      <span
                        className="w-1.5 h-1.5 rounded-full mt-0.5"
                        style={{
                          backgroundColor: dot ? sportCfg.color : "transparent",
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => {
                  const d = new Date(calendarStart);
                  d.setDate(d.getDate() + 7);
                  setCalendarStart(d);
                }}
                className="w-9 h-9 flex-shrink-0 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold text-lg transition-colors"
              >
                ›
              </button>
            </div>

            {/* Schedule table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Header */}
              <div
                className="px-5 py-3 border-b border-gray-100 flex items-center gap-2"
              >
                <span className="text-xl">{sportCfg.emoji}</span>
                <span className="font-bold text-gray-800">{sportCfg.label}</span>
                <span className="text-sm text-gray-400">
                  — {sportCfg.courts} สนาม
                </span>
              </div>

              <div className="overflow-x-auto">
                {(() => {
                  const courts = Array.from(
                    { length: sportCfg.courts },
                    (_, i) => String(i + 1)
                  );

                  return (
                    <table className="w-full text-sm border-collapse min-w-[640px]">
                      <thead>
                        {/* Row 1: dates */}
                        <tr className="bg-gray-50">
                          <th className="w-16 px-3 py-2 text-left text-xs text-gray-400 font-medium border-r border-gray-100 sticky left-0 bg-gray-50 z-10">
                            เวลา
                          </th>
                          {dateRange.map((date) => (
                            <th
                              key={toDateKey(date)}
                              colSpan={sportCfg.courts}
                              className="px-2 py-2 text-center text-xs font-semibold text-gray-600 border-r border-gray-100 last:border-r-0"
                            >
                              <span
                                className={
                                  isSameDay(date, new Date())
                                    ? "font-bold text-gray-900"
                                    : ""
                                }
                              >
                                {date.toLocaleDateString("th-TH", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            </th>
                          ))}
                        </tr>
                        {/* Row 2: court numbers */}
                        <tr className="bg-gray-50 border-b-2 border-gray-200">
                          <th className="sticky left-0 bg-gray-50 z-10 border-r border-gray-100" />
                          {dateRange.map((date) =>
                            courts.map((court, ci) => (
                              <th
                                key={`${toDateKey(date)}-c${court}`}
                                className={`px-1 py-1.5 text-center text-[11px] font-medium text-gray-500 ${
                                  ci === courts.length - 1
                                    ? "border-r border-gray-100"
                                    : ""
                                }`}
                              >
                                สนาม {court}
                              </th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {TIME_SLOTS.map((time, ti) => (
                          <tr
                            key={time}
                            className={
                              ti % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                            }
                          >
                            {/* Time label */}
                            <td className="px-3 py-1.5 text-xs font-mono text-gray-400 border-r border-gray-100 whitespace-nowrap sticky left-0 bg-inherit z-10">
                              {time}
                            </td>

                            {/* Cells */}
                            {dateRange.map((date, di) =>
                              courts.map((court, ci) => {
                                const dk = toDateKey(date);
                                const booking = bookingMap[dk]?.[court]?.[time];
                                const isLastCourt = ci === courts.length - 1;
                                const isPast =
                                  date < new Date() &&
                                  !isSameDay(date, new Date());

                                if (booking) {
                                  const cellBg =
                                    booking.status === "confirmed"
                                      ? { bg: "#dcfce7", text: "#15803d" }
                                      : booking.status === "uploaded"
                                      ? { bg: "#fef9c3", text: "#a16207" }
                                      : { bg: "#f3f4f6", text: "#6b7280" };

                                  return (
                                    <td
                                      key={`${dk}-${court}-${time}`}
                                      className={`px-1 py-1 ${
                                        isLastCourt
                                          ? "border-r border-gray-100"
                                          : ""
                                      }`}
                                    >
                                      <div
                                        className="rounded-lg px-1.5 py-1 leading-tight cursor-pointer hover:opacity-80 transition-opacity"
                                        style={{
                                          backgroundColor: cellBg.bg,
                                          color: cellBg.text,
                                        }}
                                        title={`${booking.customerName} (${
                                          booking.customerTel
                                        }) — ${
                                          STATUS_CONFIG[
                                            booking.status as keyof typeof STATUS_CONFIG
                                          ]?.label
                                        }`}
                                        onClick={() =>
                                          booking.slipImageBase64 &&
                                          setSelectedSlip(
                                            booking.slipImageBase64
                                          )
                                        }
                                      >
                                        <div className="text-xs font-semibold truncate max-w-[80px]">
                                          {booking.customerName?.split(
                                            " "
                                          )[0] || "จอง"}
                                        </div>
                                        <div className="text-[10px] opacity-70">
                                          {
                                            STATUS_CONFIG[
                                              booking.status as keyof typeof STATUS_CONFIG
                                            ]?.label
                                          }
                                        </div>
                                      </div>
                                    </td>
                                  );
                                }

                                return (
                                  <td
                                    key={`${dk}-${court}-${time}`}
                                    className={`px-1 py-1 ${
                                      isLastCourt
                                        ? "border-r border-gray-100"
                                        : ""
                                    }`}
                                  >
                                    <div
                                      className={`h-9 rounded-lg border border-dashed flex items-center justify-center ${
                                        isPast
                                          ? "border-gray-100 bg-gray-50/50"
                                          : "border-gray-200"
                                      }`}
                                    >
                                      <span className="text-[10px] text-gray-300">
                                        {isPast ? "—" : "ว่าง"}
                                      </span>
                                    </div>
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>

              {/* Legend */}
              <div className="px-5 py-3 border-t border-gray-100 flex flex-wrap gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-green-100 inline-block" />
                  ยืนยันแล้ว
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-yellow-100 inline-block" />
                  รอตรวจสอบสลิป
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-gray-100 inline-block" />
                  รออัปโหลดสลิป
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded border border-dashed border-gray-300 inline-block" />
                  ว่าง
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Slip modal ── */}
      {selectedSlip && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedSlip(null)}
        >
          <div
            className="bg-white p-4 rounded-2xl max-w-lg w-full text-center relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedSlip(null)}
              className="absolute top-3 right-4 text-2xl font-bold text-gray-400 hover:text-gray-700"
            >
              ✕
            </button>
            <h3 className="text-lg font-bold mb-4 text-gray-800">
              หลักฐานการโอนเงิน
            </h3>
            <img
              src={selectedSlip}
              alt="slip"
              className="max-h-[70vh] mx-auto rounded-xl border border-gray-100"
            />
          </div>
        </div>
      )}
    </div>
  );
}