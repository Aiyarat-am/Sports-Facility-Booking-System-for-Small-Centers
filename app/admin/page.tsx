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
import { signOut, onAuthStateChanged } from "firebase/auth";
import { deleteDoc } from "firebase/firestore"; 
import { db, auth } from "../../lib/firebase";
import { useRouter } from "next/navigation"; 

// ─── Types ────────────────────────────────────────────────────────────────────

interface Booking {
  id: string;
  shortId?: string; 
  customerName?: string;
  customerTel?: string;
  sportType?: string;
  courtNumber?: string | number;
  startTime?: { toDate: () => Date };
  status?: "pending" | "uploaded" | "confirmed" | "completed" | "cancelled"; 
  slipImageBase64?: string;
  expiresAt?: { toDate: () => Date }; 
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
  pending:   { label: "Pending",   short: "Pending",   color: "#a16207", bg: "#fef9c3", dot: "#eab308" },
  uploaded:  { label: "Uploaded",  short: "Uploaded",  color: "#1d4ed8", bg: "#dbeafe", dot: "#3b82f6" },
  confirmed: { label: "Confirmed", short: "Confirmed", color: "#15803d", bg: "#dcfce7", dot: "#22c55e" },
  completed: { label: "Completed", short: "Completed", color: "#4b5563", bg: "#f3f4f6", dot: "#6b7280" },
  cancelled: { label: "Cancelled", short: "Cancelled", color: "#b91c1c", bg: "#fee2e2", dot: "#ef4444" },
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
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!cfg) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: `${cfg.dot}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: cfg.dot }} />
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
  onComplete,
  onCancel,
}: {
  booking: Booking;
  sportCfg: typeof SPORT_CONFIG[string];
  onClose: () => void;
  onConfirm: () => void;
  onComplete: () => void;
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
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{sportCfg?.emoji}</span>
            <span className="font-bold text-gray-800">
              {sportCfg?.label} สนาม {booking.courtNumber}
            </span>
          </div>
          <div className="flex items-center gap-3">
             {booking.shortId && (
               <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg font-mono font-bold text-lg border border-blue-100">
                 #{booking.shortId}
               </span>
             )}
             <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
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
                className="w-full rounded-xl border border-gray-100 object-contain bg-gray-50"
              />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex gap-3">
          {booking.status === "uploaded" && (
            <button onClick={onConfirm} className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-colors shadow-sm">
              ✓ อนุมัติสลิป
            </button>
          )}
          {booking.status === "confirmed" && (
            <button onClick={onComplete} className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors shadow-md">
              🎯 เช็คอินเข้าสนาม
            </button>
          )}
          {(booking.status === "pending" || booking.status === "uploaded" || booking.status === "confirmed") && (
            <button onClick={onCancel} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors shadow-sm">
              ✕ ยกเลิกคิว
            </button>
          )}
          {(booking.status === "completed" || booking.status === "cancelled") && (
             <button onClick={onClose} className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-xl transition-colors">
               ปิดหน้าต่าง
             </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();

  const [alertConfig, setAlertConfig] = useState<{
    show: boolean;
    message: string;
    type: 'alert' | 'confirm';
    onConfirm?: () => void;
  }>({ show: false, message: '', type: 'alert' });

  const [isAuthChecking, setIsAuthChecking] = useState(true); 
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const ADMIN_PIN = "1234";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedSport, setSelectedSport] = useState<string>("all");
  
  const [listTab, setListTab] = useState<"action" | "confirmed" | "history">("action");
  
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
  const [currentTime, setCurrentTime] = useState(new Date());

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser && currentUser.email?.toLowerCase() === "admin555@email.com") {
        setIsAuthChecking(false);
      } else {
        router.replace("/");
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 🎯 เติมฟังก์ชันที่หายไปกลับเข้ามาครับ
  const formatCountdown = (expiresAt: Date | undefined) => {
    if (!expiresAt) return null;
    const diff = expiresAt.getTime() - currentTime.getTime();
    if (diff <= 0) return null;
    const m = Math.floor(diff / 60000).toString().padStart(2, '0');
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setIsAuthenticated(true);
    } else {
      setAlertConfig({ show: true, type: 'alert', message: "รหัส PIN ไม่ถูกต้อง!" });
      setPin("");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth); 
      setIsAuthenticated(false);
      router.replace("/"); 
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const now = new Date();
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; 

        const loadedBookings = snapshot.docs.map((d) => {
          const b = { id: d.id, ...d.data() } as Booking;
          
          if (b.status === "pending" && b.expiresAt && b.expiresAt.toDate() < now) {
            b.status = "cancelled"; 
            updateDoc(doc(db, "bookings", b.id), { status: "cancelled" }).catch(console.error); 
          }

          if ((b.status === "completed" || b.status === "cancelled") && b.createdAt) {
             const createdTime = b.createdAt.toDate().getTime();
             if (now.getTime() - createdTime > THIRTY_DAYS_MS) {
                deleteDoc(doc(db, "bookings", b.id)).catch(console.error);
                return null; 
             }
          }

          return b;
        }).filter(b => b !== null) as Booking[]; 

        setBookings(loadedBookings);
        setIsLoading(false);
      },
      (err) => { console.error(err); setIsLoading(false); }
    );
    return () => unsubscribe();
  }, [isAuthenticated]);

  const updateBookingStatus = (bookingId: string, newStatus: string) => {
    const label = STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG]?.label ?? newStatus;
    
    setAlertConfig({
      show: true,
      type: 'confirm',
      message: `ยืนยันการเปลี่ยนสถานะเป็น "${label}" ใช่หรือไม่?`,
      onConfirm: async () => {
        try {
          await updateDoc(doc(db, "bookings", bookingId), { status: newStatus });
          setSelectedBooking(null);
          setAlertConfig({ show: false, message: '', type: 'alert' });
        } catch {
          setAlertConfig({ show: true, type: 'alert', message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ" });
        }
      }
    });
  };

  const sportCfg = SPORT_CONFIG[selectedSport]; 
  const courts = sportCfg ? Array.from({ length: sportCfg.courts }, (_, i) => String(i + 1)) : [];
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dk = toDateKey(selectedDate);

  const filteredBookings = bookings.filter((b) => {
    if (searchQuery.trim() !== "") {
      return b.shortId?.toLowerCase().includes(searchQuery.toLowerCase().trim());
    }
    
    if (selectedSport !== "all" && b.sportType !== selectedSport) return false;

    if (listTab === "action" && !["pending", "uploaded"].includes(b.status || "")) return false;
    if (listTab === "confirmed" && b.status !== "confirmed") return false;
    if (listTab === "history" && !["completed", "cancelled"].includes(b.status || "")) return false;

    return true;
  });

  filteredBookings.sort((a, b) => {
    if (listTab === "action" || listTab === "confirmed") {
      const timeA = a.startTime?.toDate().getTime() || Infinity;
      const timeB = b.startTime?.toDate().getTime() || Infinity;
      return timeA - timeB; 
    } else {
      const timeA = a.createdAt?.toDate().getTime() || 0;
      const timeB = b.createdAt?.toDate().getTime() || 0;
      return timeB - timeA; 
    }
  });

  const bookingMap: Record<string, Record<string, Booking>> = {};
  bookings.forEach((b) => {
    if (selectedSport === "all" || b.sportType !== selectedSport) return;
    if (!b.startTime || b.status === "cancelled") return;
    const d = b.startTime.toDate();
    if (!isSameDay(d, selectedDate)) return;
    const court = String(b.courtNumber);
    const time = `${d.getHours().toString().padStart(2, "0")}:00`;
    bookingMap[court] ??= {};
    bookingMap[court][time] = b;
  });

  const bookingsByDay: Record<string, number> = {};
  bookings.forEach((b) => {
    if (selectedSport === "all" || b.sportType !== selectedSport || !b.startTime) return;
    if (b.status === "cancelled") return;
    
    const key = toDateKey(b.startTime.toDate());
    bookingsByDay[key] = (bookingsByDay[key] ?? 0) + 1;
  });

  const customAlertModal = alertConfig.show && (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center animate-fade-in-up">
        <div className="text-blue-500 text-5xl mb-4">
          {alertConfig.type === 'confirm' ? '❓' : '💬'}
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">Staff Dashboard แจ้งเตือน</h3>
        <p className="text-gray-600 mb-6 leading-relaxed">
          {alertConfig.message}
        </p>
        <div className="flex gap-3">
          {alertConfig.type === 'confirm' && (
            <button 
              onClick={() => setAlertConfig({ show: false, message: '', type: 'alert' })} 
              className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold transition-all shadow-sm"
            >
              ยกเลิก
            </button>
          )}
          <button 
            onClick={() => {
              if (alertConfig.type === 'confirm' && alertConfig.onConfirm) {
                alertConfig.onConfirm();
              } else {
                setAlertConfig({ show: false, message: '', type: 'alert' });
              }
            }} 
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md"
          >
            ตกลง
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Rendering ──────────────────────────────────────────────────────────────

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-white text-xl font-bold animate-pulse">Checking Permissions...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4 relative">
        {customAlertModal}
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center z-10">
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
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all mb-4">
              เข้าสู่ระบบ
            </button>
          </form>
          
          <button 
            onClick={handleLogout}
            className="text-red-500 hover:text-red-700 text-sm font-bold underline transition-colors"
          >
            ออกจากระบบ (Logout)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {customAlertModal}

      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
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
            
            <div className="w-px h-6 bg-gray-300 mx-1"></div> 
            <button
              onClick={handleLogout}
              className="px-4 py-1.5 rounded-lg text-sm font-bold text-red-500 hover:bg-red-50 hover:text-red-600 transition-all"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        
        <div className="flex flex-col xl:flex-row justify-between gap-4">
          
          <div className="flex flex-wrap gap-3">
            {Object.entries(SPORT_CONFIG).map(([key, cfg]) => {
              const total = bookings.filter((b) => b.sportType === key && b.status !== "cancelled").length;
              const waiting = bookings.filter((b) => b.sportType === key && b.status === "uploaded").length;
              const isActive = selectedSport === key && searchQuery === ""; 
              
              return (
                <button
                  key={key}
                  onClick={() => {
                    if (selectedSport === key) {
                      setSelectedSport("all");
                    } else {
                      setSelectedSport(key);
                    }
                    setSearchQuery("");
                  }}
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

          <div className="flex flex-col gap-3 w-full xl:w-auto">
            
            <div className="relative w-full xl:w-[400px]">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <span className="text-gray-400 text-lg">🔍</span>
              </div>
              <input
                type="text"
                placeholder="ค้นหารหัสอ้างอิง..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.trim() !== "" && view !== "list") {
                    setView("list"); 
                  }
                }}
                className="w-full pl-12 pr-4 py-3 h-full border-2 border-gray-200 rounded-2xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all font-semibold text-gray-700 placeholder-gray-400"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {view === "list" && !searchQuery && (
              <div className="flex bg-gray-200/70 p-1.5 rounded-xl overflow-x-auto">
                <button 
                  onClick={() => setListTab("action")} 
                  className={`flex-1 min-w-[120px] py-1.5 px-3 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${listTab === "action" ? "bg-white text-orange-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  🟡 รอตรวจสอบ
                </button>
                <button 
                  onClick={() => setListTab("confirmed")} 
                  className={`flex-1 min-w-[120px] py-1.5 px-3 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${listTab === "confirmed" ? "bg-white text-green-600 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  🟢 คิวใช้งาน
                </button>
                <button 
                  onClick={() => setListTab("history")} 
                  className={`flex-1 min-w-[120px] py-1.5 px-3 text-sm font-bold rounded-lg transition-all whitespace-nowrap ${listTab === "history" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  📁 ประวัติย้อนหลัง
                </button>
              </div>
            )}

          </div>

        </div>

        {/* ═══════════════════════════ LIST VIEW ═══════════════════════════ */}
        {view === "list" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            
            {listTab === "history" && !searchQuery && (
              <div className="bg-gray-100 px-5 py-2.5 border-b border-gray-200 text-sm text-gray-600 font-semibold flex items-center gap-2">
                <span>📁</span> กำลังแสดงผลข้อมูล <strong>"ประวัติย้อนหลัง"</strong> (รายการที่เสร็จสิ้นและยกเลิกแล้ว)
              </div>
            )}

            {isLoading ? (
              <p className="text-center py-16 text-gray-400">กำลังโหลดข้อมูล...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                      <th className="px-5 py-4 font-semibold w-[20%]">ลูกค้า</th>
                      <th className="px-5 py-4 font-semibold w-[15%]">ทำรายการเมื่อ</th>
                      <th className="px-5 py-4 font-semibold w-[20%]">สนาม / เวลา</th>
                      <th className="px-5 py-4 font-semibold w-[15%]">สถานะ</th>
                      <th className="px-5 py-4 font-semibold w-[10%]">สลิป</th>
                      <th className="px-5 py-4 font-semibold text-center w-[10%]">รหัสอ้างอิง</th>
                      <th className="px-5 py-4 font-semibold text-right w-[10%]">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredBookings.map((booking) => {
                        const st = booking.startTime?.toDate();
                        const timeStr = st
                          ? `${st.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} เวลา ${st.getHours().toString().padStart(2, "0")}:00`
                          : "ไม่ระบุ";
                          
                        const ct = booking.createdAt?.toDate();
                        const createdAtStr = ct ? (
                          <>
                            <span className="block text-gray-800 font-semibold text-sm">{ct.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}</span>
                            <span className="text-xs text-gray-500">{ct.getHours().toString().padStart(2, "0")}:{ct.getMinutes().toString().padStart(2, "0")} น.</span>
                          </>
                        ) : "—";
                        
                        const curSportCfg = SPORT_CONFIG[booking.sportType as keyof typeof SPORT_CONFIG] || SPORT_CONFIG.football;

                        return (
                          <tr key={booking.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-5 py-4">
                              <p className="font-semibold text-gray-800 text-base">{booking.customerName || "ไม่ระบุ"}</p>
                              <p className="text-sm text-gray-400 font-mono mt-0.5">{booking.customerTel || "—"}</p>
                            </td>
                            <td className="px-5 py-4">
                              {createdAtStr}
                            </td>
                            <td className="px-5 py-4">
                              <span className="inline-flex items-center gap-1.5 text-sm font-bold bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100" style={{ color: curSportCfg.color }}>
                                {curSportCfg.emoji} {curSportCfg.label} สนาม {booking.courtNumber}
                              </span>
                              <p className="text-xs text-gray-500 mt-1.5 ml-1">{timeStr}</p>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-col items-start gap-1">
                                <StatusBadge status={booking.status || ""} />
                                {booking.status === "pending" && (() => {
                                  const timer = formatCountdown(booking.expiresAt?.toDate());
                                  return timer ? <span className="text-gray-500 text-xs font-bold pl-1">⏳ {timer}</span> : null;
                                })()}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              {booking.slipImageBase64 ? (
                                <button onClick={() => setSelectedBooking(booking)} className="text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-md text-sm font-semibold transition-colors">
                                  ดูสลิป
                                </button>
                              ) : (
                                <span className="text-gray-300 text-sm">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className={`font-black text-xl tracking-wide px-3 py-1 rounded-lg border shadow-sm inline-block ${searchQuery && booking.shortId?.toLowerCase().includes(searchQuery.toLowerCase()) ? "bg-yellow-200 text-yellow-800 border-yellow-300" : "text-blue-600 bg-blue-50/50 border-blue-100"}`}>
                                {booking.shortId ? `#${booking.shortId}` : "—"}
                              </span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                {booking.status === "uploaded" && (
                                  <>
                                    <button onClick={() => updateBookingStatus(booking.id, "confirmed")} className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors">อนุมัติ</button>
                                    <button onClick={() => updateBookingStatus(booking.id, "cancelled")} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors">ยกเลิก</button>
                                  </>
                                )}
                                {booking.status === "confirmed" && (
                                  <button onClick={() => updateBookingStatus(booking.id, "completed")} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-md transition-colors flex items-center gap-1">
                                    เช็คอิน 🎫
                                  </button>
                                )}
                                {booking.status === "pending" && (
                                   <button onClick={() => updateBookingStatus(booking.id, "cancelled")} className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors">ยกเลิก</button>
                                )}
                                {(booking.status === "completed" || booking.status === "cancelled") && (
                                   <span className="text-gray-300 text-sm font-semibold px-2">—</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {filteredBookings.length === 0 && (
                  <p className="text-center py-14 text-gray-400">
                    {searchQuery 
                      ? `ไม่พบข้อมูลรหัสอ้างอิง "${searchQuery}"` 
                      : (selectedSport === "all" 
                          ? `ยังไม่มีข้อมูลในโหมด ${listTab === "action" ? "รอตรวจสอบ" : listTab === "confirmed" ? "คิวใช้งาน" : "ประวัติย้อนหลัง"}` 
                          : `ไม่มีการจองสำหรับ${sportCfg?.label}`)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════ CALENDAR VIEW ═════════════════════════ */}
        {view === "calendar" && selectedSport === "all" && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center flex flex-col items-center justify-center animate-fade-in-up">
            <span className="text-6xl mb-4 opacity-80">📅</span>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">โปรดเลือกประเภทกีฬา</h3>
            <p className="text-gray-500 max-w-md">
              ระบบตารางสนามจำเป็นต้องแยกดูตามประเภทกีฬา กรุณาคลิกเลือก <strong className="text-green-600">ฟุตบอล</strong>, <strong className="text-blue-600">แบดมินตัน</strong> หรือ <strong className="text-orange-600">บาสเก็ตบอล</strong> ที่เมนูด้านบนก่อนครับ
            </p>
          </div>
        )}

        {view === "calendar" && selectedSport !== "all" && sportCfg && (
          <div className="space-y-4">
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

            <div className={`grid gap-4 ${sportCfg.courts <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
              {courts.map((court) => {
                const courtBookings = bookingMap[court] ?? {};
                const bookedCount = Object.keys(courtBookings).length;
                const waitingCount = Object.values(courtBookings).filter((b) => b.status === "uploaded").length;

                return (
                  <div key={court} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                                className="flex-1 rounded-lg px-3 py-1.5 flex items-center justify-between gap-2 border border-transparent shadow-sm"
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

            <div className="flex flex-wrap gap-4 text-xs text-gray-500 px-1 mt-4">
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

      {/* สลับใช้ sportCfg จากตัว selectedBooking เสมอ เพื่อแก้บั๊กโหมด all */}
      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          sportCfg={SPORT_CONFIG[selectedBooking.sportType || "football"] || SPORT_CONFIG.football}
          onClose={() => setSelectedBooking(null)}
          onConfirm={() => updateBookingStatus(selectedBooking.id, "confirmed")}
          onComplete={() => updateBookingStatus(selectedBooking.id, "completed")}
          onCancel={() => updateBookingStatus(selectedBooking.id, "cancelled")}
        />
      )}
    </div>
  );
}