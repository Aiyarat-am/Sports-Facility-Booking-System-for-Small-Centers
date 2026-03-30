"use client";

import React, { useState, useEffect } from "react";
import { collection, query, orderBy, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase"; 

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const ADMIN_PIN = "1234"; 

  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setIsAuthenticated(true);
      fetchBookings();
    } else {
      alert("รหัส PIN ไม่ถูกต้อง!");
      setPin("");
    }
  };

  const fetchBookings = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "bookings"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setBookings(data);
    } catch (error) {
      console.error("Error fetching bookings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateBookingStatus = async (bookingId: string, newStatus: string) => {
    const confirmAction = confirm(`คุณแน่ใจหรือไม่ที่จะเปลี่ยนสถานะเป็น: ${newStatus}?`);
    if (!confirmAction) return;

    try {
      const bookingRef = doc(db, "bookings", bookingId);
      await updateDoc(bookingRef, { status: newStatus });
      alert("อัปเดตสถานะสำเร็จ");
      fetchBookings(); 
    } catch (error) {
      console.error("Error updating status:", error);
      alert("เกิดข้อผิดพลาดในการอัปเดตสถานะ");
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Staff Only</h2>
          <p className="text-gray-500 mb-6">กรุณาใส่รหัส PIN เพื่อเข้าสู่ระบบ</p>
          <form onSubmit={handleLogin}>
            <input 
              type="password" 
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center text-3xl tracking-[0.5em] border-2 border-gray-300 p-4 rounded-xl focus:outline-none focus:border-blue-500 mb-6"
              maxLength={4}
              placeholder="••••"
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">ระบบจัดการการจอง (Staff Dashboard)</h1>
          <button onClick={fetchBookings} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold">
            ↻ โหลดข้อมูลล่าสุด
          </button>
        </div>

        {isLoading ? (
          <p className="text-center py-10 text-gray-500">กำลังโหลดข้อมูล...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 text-gray-700">
                  <th className="p-4 rounded-tl-lg">รหัสการจอง</th>
                  <th className="p-4">ลูกค้า</th>
                  <th className="p-4">สนาม / เวลา</th>
                  <th className="p-4">สถานะ</th>
                  <th className="p-4">สลิป</th>
                  <th className="p-4 rounded-tr-lg">การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => {
                  const startTime = booking.startTime?.toDate();
                  const timeString = startTime ? `${startTime.toLocaleDateString('th-TH')} เวลา ${startTime.getHours().toString().padStart(2, '0')}:00` : "ไม่ระบุ";
                  
                  return (
                    <tr key={booking.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4 text-sm text-gray-500">{booking.id}</td>
                      <td className="p-4">
                        <p className="font-bold text-gray-800">{booking.customerName || "ไม่ระบุชื่อ"}</p>
                        <p className="text-sm text-gray-500">{booking.customerTel || "-"}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-semibold text-blue-600">{booking.sportType} (สนาม {booking.courtNumber})</p>
                        <p className="text-sm text-gray-600">{timeString}</p>
                      </td>
                      <td className="p-4">
                        {booking.status === "uploaded" && <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-bold">รอตรวจสอบสลิป</span>}
                        {booking.status === "confirmed" && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold">ยืนยันแล้ว</span>}
                        {booking.status === "pending" && <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-bold">รออัปโหลดสลิป</span>}
                        {booking.status === "cancelled" && <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold">ยกเลิกแล้ว</span>}
                      </td>
                      <td className="p-4">
                        {booking.slipImageBase64 ? (
                          <button 
                            onClick={() => setSelectedSlip(booking.slipImageBase64)}
                            className="text-blue-500 hover:underline font-semibold"
                          >
                            ดูสลิป
                          </button>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => updateBookingStatus(booking.id, "confirmed")}
                            disabled={booking.status === "confirmed" || booking.status === "cancelled"}
                            className="px-3 py-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded shadow-sm text-sm"
                          >
                            อนุมัติ
                          </button>
                          <button 
                            onClick={() => updateBookingStatus(booking.id, "cancelled")}
                            disabled={booking.status === "cancelled"}
                            className="px-3 py-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white rounded shadow-sm text-sm"
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
            {bookings.length === 0 && (
              <p className="text-center py-10 text-gray-500 font-semibold">ยังไม่มีข้อมูลการจองในระบบ</p>
            )}
          </div>
        )}
      </div>

      {selectedSlip && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-4 rounded-xl max-w-lg w-full text-center relative">
            <button 
              onClick={() => setSelectedSlip(null)}
              className="absolute top-2 right-4 text-3xl font-bold text-gray-500 hover:text-gray-800"
            >
              ✕
            </button>
            <h3 className="text-xl font-bold mb-4">หลักฐานการโอนเงิน</h3>
            <img src={selectedSlip} alt="slip" className="max-h-[70vh] mx-auto rounded-lg border border-gray-200 shadow-sm" />
          </div>
        </div>
      )}
    </div>
  );
}