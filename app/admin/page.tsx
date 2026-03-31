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
  { label: string; emoji: string; courts: number; color: string; lightColor: string }
> = {
  football:   { label: "ฟุตบอล",      emoji: "⚽", courts: 2, color: "#16a34a", lightColor: "#f0fdf4" },
  badminton:  { label: "แบดมินตัน",  emoji: "🏸", courts: 4, color: "#2563eb", lightColor: "#eff6ff" },
  basketball: { label: "บาสเก็ตบอล", emoji: "🏀", courts: 2, color: "#ea580c", lightColor: "#fff7ed" },
};

const TIME_SLOTS = [
  "09:00","10:00","11:00","12:00","13:00","14:00",
  "15:00","16:00","17:00","18:00","19:00","20:00",
];

const STATUS_CONFIG = {
  pending:   { label: "รออัปโหลดสลิป", short: "รอสลิป",   color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" },
  uploaded:  { label: "รอตรวจสอบสลิป", short: "รอตรวจ",   color: "#92400e", bg: "#fef3c7", dot: "#f59e0b" },
  confirmed: { label: "ยืนยันแล้ว",    short: "ยืนยัน",   color: "#14532d", bg: "#dcfce7", dot: "#22c55e" },
  cancelled: { label: "ยกเลิกแล้ว",   short: "ยกเลิก",   color: "#7f1d1d", bg: "#fee2e2", dot: "#ef4444" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: cfg.dot }} />
      {cfg.label}
    </span>
  );
}

// ─── BookingDetailModal ───────────────────────────────────────────────────────

function BookingDetailModal({
  booking,
  sportCfg,
  onClose,
  onConfirm,
  onCancel,
}: {
  booking: Booking;
  sportCfg: typeof SPORT_CONFIG[string];
  onClose: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const st = booking.startTime?.toDate();
  const timeStr = st
    ? `${st.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} เวลา ${st.getHours().toString().padStart(2, "0")}:00 น.`
    : "—";

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{sportCfg.emoji}</span>
            <span className="font-bold text-gray-800">
              {sportCfg.label} สนาม {booking.courtNumber}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
            <span className="text-2xl">👤</span>
            <div>
              <p className="font-bold text-gray-800 text-lg leading-tight">{booking.customerName || "ไม่ระบุชื่อ"}</p>
              <p className="text-gray-500 text-sm">{booking.customerTel || "—"}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <span className="text-2xl">🕐</span>
            <p className="text-gray-700 text-sm font-medium">{timeStr}</p>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <span className="text-2xl">📋</span>
            <StatusBadge status={booking.status || ""} />
          </div>

          {booking.slipImageBase64 && (
            <div>
              <p className="text-xs text-gray-400 font-semibold mb-2">หลักฐานการโอนเงิน</p>
              <img
                src={booking.slipImageBase64}
                alt="slip"
                className="w-full rounded-xl border border-gray-100 max-h-64 object-contain bg-gray-50"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onConfirm}
            disabled={booking.status === "confirmed" || booking.status === "cancelled"}
            className="flex-1 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors"
          >
            ✓ อนุมัติ
          </button>
          <button
            onClick={onCancel}
            disabled={booking.status === "cancelled"}
            className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold rounded-xl transition-colors"
          >
            ✕ ยกเลิก
          </button>
        </div>
      </div>
    </div>
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
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

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
        setBookings(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Booking)));
        setIsLoading(false);
      },
      (err) => { console.error(err); setIsLoading(false); }
    );
    return () => unsubscribe();
  }, [isAuthenticated]);

  // ── Update status ──────────────────────────────────────────────────────────

  const updateBookingStatus = async (bookingId: string, newStatus: string) => {
    const label = STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG]?.label ?? newStatus;
    if (!confirm(`เปลี่ยนสถานะเป็น "${label}"?`)) return;
    try {
      await updateDoc(doc(db, "bookings", bookingId), { status: newStatus });
      setSelectedBooking(null);
    } catch {
      alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const sportCfg = SPORT_CONFIG[selectedSport];
  const courts = Array.from({ length: sportCfg.courts }, (_, i) => String(i + 1));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dk = toDateKey(selectedDate);

  // bookingMap[court][time] = Booking  (filtered to selectedDate + selectedSport)
  const bookingMap: Record<string, Record<string, Booking>> = {};
  bookings.forEach((b) => {
    if (b.sportType !== selectedSport) return;
    if (!b.startTime || b.status === "cancelled") return;
    const d = b.startTime.toDate();
    if (!isSameDay(d, selectedDate)) return;
    const court = String(b.courtNumber);
    const time = `${d.getHours().toString().padStart(2, "0")}:00`;
    bookingMap[court] ??= {};
    bookingMap[court][time] = b;
  });

  // Count bookings per day for dots
  const bookingsByDay: Record<string, number> = {};
  bookings.forEach((b) => {
    if (b.sportType !== selectedSport || !b.startTime || b.status === "cancelled") return;
    const key = toDateKey(b.startTime.toDate());
    bookingsByDay[key] = (bookingsByDay[key] ?? 0) + 1;
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
          <div className="text-4xl mb-3">🔐</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Staff Only</h2>
          <p className="text-gray-500 text-sm mb-6">กรุณาใส่รหัส PIN เพื่อเข้าสู่ระบบ</p>
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
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all">
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

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-gray-800">Staff Dashboard</span>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
              Live
            </span>
          </div>
          <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => setView("list")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${view === "list" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              📋 รายการ
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${view === "calendar" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            >
              📅 ตารางสนาม
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* Sport selector */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(SPORT_CONFIG).map(([key, cfg]) => {
            const total = bookings.filter((b) => b.sportType === key && b.status !== "cancelled").length;
            const waiting = bookings.filter((b) => b.sportType === key && b.status === "uploaded").length;
            const isActive = selectedSport === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedSport(key)}
                className={`flex items-center gap-3 px-5 py-3 rounded-2xl border-2 font-semibold transition-all ${
                  isActive ? "text-white shadow-md scale-[1.02] border-transparent" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
                style={isActive ? { backgroundColor: cfg.color } : {}}
              >
                <span className="text-2xl leading-none">{cfg.emoji}</span>
                <div className="text-left leading-tight">
                  <div className="text-sm">{cfg.label}</div>
                  <div className={`text-xs mt-0.5 ${isActive ? "text-white/75" : "text-gray-400"}`}>
                    {total} การจอง
                    {waiting > 0 && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${isActive ? "bg-white/25 text-white" : "bg-yellow-100 text-yellow-700"}`}>
                        {waiting} รอตรวจ
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ═══════════════════════════ LIST VIEW ═══════════════════════════ */}
        {view === "list" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {isLoading ? (
              <p className="text-center py-16 text-gray-400">กำลังโหลด...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
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
                          ? `${st.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} เวลา ${st.getHours().toString().padStart(2, "0")}:00`
                          : "ไม่ระบุ";
                        return (
                          <tr key={booking.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-5 py-4">
                              <p className="font-semibold text-gray-800">{booking.customerName || "ไม่ระบุ"}</p>
                              <p className="text-xs text-gray-400">{booking.customerTel || "—"}</p>
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: sportCfg.color }}>
                                {sportCfg.emoji} {sportCfg.label} สนาม {booking.courtNumber}
                              </span>
                              <p className="text-xs text-gray-400 mt-0.5">{timeStr}</p>
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={booking.status || ""} />
                            </td>
                            <td className="px-5 py-4">
                              {booking.slipImageBase64 ? (
                                <button onClick={() => setSelectedBooking(booking)} className="text-blue-500 hover:underline text-sm font-medium">
                                  ดูสลิป
                                </button>
                              ) : (
                                <span className="text-gray-300 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => updateBookingStatus(booking.id, "confirmed")}
                                  disabled={booking.status === "confirmed" || booking.status === "cancelled"}
                                  className="px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-lg text-xs font-semibold transition-colors"
                                >
                                  อนุมัติ
                                </button>
                                <button
                                  onClick={() => updateBookingStatus(booking.id, "cancelled")}
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
                {bookings.filter((b) => b.sportType === selectedSport).length === 0 && (
                  <p className="text-center py-14 text-gray-400">ไม่มีการจองสำหรับ{sportCfg.label}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════ CALENDAR VIEW ═════════════════════════ */}
        {view === "calendar" && (
          <div className="space-y-4">

            {/* ── Week date picker ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setWeekStart((d) => addDays(d, -7))}
                  className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors flex-shrink-0"
                >
                  ‹
                </button>
                <div className="flex gap-1.5 flex-1 justify-between">
                  {weekDays.map((date) => {
                    const isSelected = isSameDay(date, selectedDate);
                    const isToday = isSameDay(date, new Date());
                    const count = bookingsByDay[toDateKey(date)] ?? 0;
                    return (
                      <button
                        key={toDateKey(date)}
                        onClick={() => setSelectedDate(date)}
                        className="flex-1 flex flex-col items-center py-2 px-1 rounded-xl transition-all"
                        style={
                          isSelected
                            ? { backgroundColor: sportCfg.color, color: "#fff" }
                            : isToday
                            ? { backgroundColor: sportCfg.lightColor, color: sportCfg.color }
                            : {}
                        }
                      >
                        <span className={`text-[10px] font-medium uppercase tracking-wide ${isSelected ? "text-white/80" : "text-gray-400"}`}>
                          {date.toLocaleDateString("th-TH", { weekday: "short" })}
                        </span>
                        <span className={`text-base font-bold leading-tight ${isSelected ? "text-white" : isToday ? "" : "text-gray-700"}`}>
                          {date.getDate()}
                        </span>
                        {count > 0 ? (
                          <span
                            className="text-[10px] font-bold mt-0.5 px-1.5 rounded-full"
                            style={
                              isSelected
                                ? { backgroundColor: "rgba(255,255,255,0.25)", color: "#fff" }
                                : { backgroundColor: sportCfg.lightColor, color: sportCfg.color }
                            }
                          >
                            {count}
                          </span>
                        ) : (
                          <span className="h-4 mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setWeekStart((d) => addDays(d, 7))}
                  className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 font-bold transition-colors flex-shrink-0"
                >
                  ›
                </button>
              </div>

              {/* Selected date label */}
              <div className="text-center">
                <span className="text-sm font-semibold text-gray-700">
                  {selectedDate.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
                {isSameDay(selectedDate, new Date()) && (
                  <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full" style={{ backgroundColor: sportCfg.lightColor, color: sportCfg.color }}>
                    วันนี้
                  </span>
                )}
              </div>
            </div>

            {/* ── Court cards side by side ── */}
            <div className={`grid gap-4 ${sportCfg.courts <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
              {courts.map((court) => {
                const courtBookings = bookingMap[court] ?? {};
                const bookedCount = Object.keys(courtBookings).length;
                const waitingCount = Object.values(courtBookings).filter((b) => b.status === "uploaded").length;

                return (
                  <div key={court} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Court header */}
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between" style={{ backgroundColor: sportCfg.lightColor }}>
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{sportCfg.emoji}</span>
                        <span className="font-bold text-gray-800">สนาม {court}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        {waitingCount > 0 && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-bold">
                            {waitingCount} รอตรวจ
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-white/80 text-gray-500 rounded-full font-medium">
                          {bookedCount}/{TIME_SLOTS.length}
                        </span>
                      </div>
                    </div>

                    {/* Time slots */}
                    <div className="divide-y divide-gray-50">
                      {TIME_SLOTS.map((time) => {
                        const booking = courtBookings[time];
                        const isPast =
                          selectedDate < new Date() &&
                          !isSameDay(selectedDate, new Date());

                        if (booking) {
                          const scfg = STATUS_CONFIG[booking.status as keyof typeof STATUS_CONFIG];
                          return (
                            <button
                              key={time}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                              onClick={() => setSelectedBooking(booking)}
                            >
                              <span className="text-xs font-mono text-gray-400 w-10 flex-shrink-0">{time}</span>
                              <div
                                className="flex-1 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2"
                                style={{ backgroundColor: scfg?.bg }}
                              >
                                <span className="text-sm font-semibold truncate" style={{ color: scfg?.color }}>
                                  {booking.customerName || "จอง"}
                                </span>
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: scfg?.dot + "33", color: scfg?.color }}
                                >
                                  {scfg?.short}
                                </span>
                              </div>
                            </button>
                          );
                        }

                        return (
                          <div key={time} className={`flex items-center gap-3 px-4 py-2.5 ${isPast ? "opacity-30" : ""}`}>
                            <span className="text-xs font-mono text-gray-300 w-10 flex-shrink-0">{time}</span>
                            <div className="flex-1 border border-dashed border-gray-200 rounded-lg px-3 py-1.5 flex items-center">
                              <span className="text-xs text-gray-300">{isPast ? "—" : "ว่าง"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 px-1">
              {Object.entries(STATUS_CONFIG).filter(([k]) => k !== "cancelled").map(([, cfg]) => (
                <span key={cfg.label} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: cfg.dot }} />
                  {cfg.label}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded border border-dashed border-gray-400 inline-block" />
                ว่าง
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Booking detail modal */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          sportCfg={SPORT_CONFIG[selectedBooking.sportType || "football"]}
          onClose={() => setSelectedBooking(null)}
          onConfirm={() => updateBookingStatus(selectedBooking.id, "confirmed")}
          onCancel={() => updateBookingStatus(selectedBooking.id, "cancelled")}
        />
      )}
    </div>
  );
}