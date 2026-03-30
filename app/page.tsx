"use client";

import React, { useState, useEffect } from "react";
import { collection, doc, runTransaction, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

const SPORT_TYPES = {
  football: { name: "สนามฟุตบอล", count: 2 },
  badminton: { name: "สนามแบดมินตัน", count: 4 },
  basketball: { name: "สนามบาสเก็ตบอล", count: 2 },
};

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

export default function BookingPage() {
  const [showForm, setShowForm] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    tel: "",
    sport: "football",
    courtNumber: "1",
    date: "",
    time: "",
  });

  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);

  const dateOptions = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  useEffect(() => {
    setFormData((prev) => ({ ...prev, date: dateOptions[0] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!formData.date || !formData.sport || !formData.courtNumber) return;

    const fetchBookings = async () => {
      const startOfDay = new Date(`${formData.date}T00:00:00`);
      const endOfDay = new Date(`${formData.date}T23:59:59`);

      const q = query(
        collection(db, "bookings"),
        where("sportType", "==", formData.sport),
        where("courtNumber", "==", formData.courtNumber),
        where("status", "in", ["pending", "uploaded", "confirmed"])
      );

      const snapshot = await getDocs(q);
      const booked: string[] = [];
      const now = new Date();

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const startTime = data.startTime.toDate();
        const isExpired = data.status === "pending" && data.expiresAt.toDate() < now;

        if (!isExpired && startTime >= startOfDay && startTime <= endOfDay) {
          const hour = startTime.getHours().toString().padStart(2, "0") + ":00";
          booked.push(hour);
        }
      });
      setBookedSlots(booked);
    };

    fetchBookings();
  }, [formData.date, formData.sport, formData.courtNumber]);

  const handleBookingSubmit = async () => {
    if (!formData.name || !formData.tel || !formData.time) {
      alert("กรุณากรอกข้อมูลและเลือกเวลาให้ครบถ้วนครับ");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60000);
      
      const startDateTime = new Date(`${formData.date}T${formData.time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60000);

      const newBookingRef = doc(collection(db, "bookings"));

      await runTransaction(db, async (transaction) => {
        const q = query(
          collection(db, "bookings"),
          where("sportType", "==", formData.sport),
          where("courtNumber", "==", formData.courtNumber),
          where("status", "in", ["pending", "uploaded", "confirmed"])
        );
        const querySnapshot = await getDocs(q);

        let isConflict = false;
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const existingStart = data.startTime.toDate();
          const isExpired = data.status === "pending" && data.expiresAt.toDate() < now;

          if (!isExpired && existingStart.getTime() === startDateTime.getTime()) {
            isConflict = true; 
          }
        });

        if (isConflict) throw new Error("เวลานี้ถูกจองไปแล้วในเสี้ยววินาทีที่ผ่านมา!");

        transaction.set(newBookingRef, {
          customerName: formData.name,
          customerTel: formData.tel,
          sportType: formData.sport,
          courtNumber: formData.courtNumber,
          startTime: startDateTime, 
          endTime: endDateTime,     
          status: "pending", 
          expiresAt: expiresAt,
          createdAt: now,
        });
      });

      setCurrentBookingId(newBookingRef.id);
      
      setTimeout(() => {
          setCurrentBookingId((prev) => prev === newBookingRef.id ? null : prev);
      }, 15 * 60000);

      alert(`จองสำเร็จ! กรุณาแนบสลิปภายใน 15 นาที\nรหัส: ${newBookingRef.id}`);
      
    } catch (error: any) {
      alert(error.message || "ไม่สามารถจองได้ กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentBookingId) return;

    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600;
        let width = img.width, height = img.height;
        if (width > MAX_WIDTH) { height *= (MAX_WIDTH / width); width = MAX_WIDTH; }
        canvas.width = width; canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        const base64String = canvas.toDataURL("image/jpeg", 0.7);
        const bookingRef = doc(db, "bookings", currentBookingId);
        updateDoc(bookingRef, { slipImageBase64: base64String, status: "uploaded" })
          .then(() => {
            alert("อัปโหลดสลิปสำเร็จ! รอพนักงานตรวจสอบ");
            setCurrentBookingId(null); 
            setShowForm(false); 
            setFormData({ ...formData, time: "" });
          })
          .catch(() => alert("เกิดข้อผิดพลาดในการอัปโหลด"))
          .finally(() => setIsSubmitting(false));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (currentBookingId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">อัปโหลดสลิปชำระเงิน</h2>
          <p className="text-gray-600 mb-2">รหัสการจอง: <span className="font-semibold text-blue-600">{currentBookingId}</span></p>
          <p className="text-red-500 text-sm mb-6">กรุณาอัปโหลดภายใน 15 นาที</p>
          <input type="file" accept="image/*" onChange={handleFileUpload} disabled={isSubmitting} className="mb-4 w-full" />
          <button onClick={() => setCurrentBookingId(null)} disabled={isSubmitting} className="mt-4 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 w-full font-semibold">
            ยกเลิกและกลับสู่หน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800">Create Your Booking</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 font-bold text-xl">✕</button>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 font-semibold mb-2">Name:</label>
                <input type="text" className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="ชื่อของคุณ" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-2">Tel:</label>
                <input type="tel" className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="เบอร์โทรศัพท์" value={formData.tel} onChange={(e) => setFormData({...formData, tel: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-700 font-semibold mb-2">Court Type:</label>
                <select className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-blue-500" value={formData.sport} onChange={(e) => setFormData({...formData, sport: e.target.value, courtNumber: "1", time: ""})}>
                  {Object.entries(SPORT_TYPES).map(([key, val]) => (
                    <option key={key} value={key}>{val.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 font-semibold mb-2">หมายเลขสนาม:</label>
                <select className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-blue-500" value={formData.courtNumber} onChange={(e) => setFormData({...formData, courtNumber: e.target.value, time: ""})}>
                  {Array.from({ length: SPORT_TYPES[formData.sport as keyof typeof SPORT_TYPES].count }).map((_, i) => (
                    <option key={i} value={i + 1}>สนามที่ {i + 1}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-2">Date (ล่วงหน้า 7 วัน):</label>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {dateOptions.map((date) => (
                  <button key={date} onClick={() => setFormData({...formData, date: date, time: ""})} className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold transition-all ${formData.date === date ? "bg-blue-600 text-white shadow-md" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {new Date(date).toLocaleDateString("th-TH", { day: 'numeric', month: 'short' })}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-2">Time:</label>
              <div className="grid grid-cols-4 gap-3">
                {TIME_SLOTS.map((time) => {
                  const isBooked = bookedSlots.includes(time);
                  const isSelected = formData.time === time;
                  
                  let buttonClass = "p-3 rounded-lg font-bold text-center transition-all ";
                  if (isBooked) {
                    buttonClass += "bg-gray-300 text-gray-500 cursor-not-allowed line-through";
                  } else if (isSelected) {
                    buttonClass += "bg-green-500 text-white shadow-lg";
                  } else {
                    buttonClass += "bg-white border-2 border-gray-300 text-gray-700 hover:border-green-500 hover:text-green-500";
                  }

                  return (
                    <button 
                      key={time} 
                      disabled={isBooked}
                      onClick={() => setFormData({...formData, time: time})}
                      className={buttonClass}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-6">
              <button 
                onClick={handleBookingSubmit} 
                disabled={isSubmitting || !formData.time}
                className={`w-full py-4 rounded-xl text-xl font-bold transition-all ${
                  !formData.time || isSubmitting ? "bg-gray-400 text-white cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white shadow-xl hover:shadow-2xl"
                }`}
              >
                {isSubmitting ? "กำลังดำเนินการ..." : "ยืนยันการจองสนาม (Book Now)"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gray-900 flex items-center">
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1518605368461-1ee12db01037?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')" }}
      ></div>

      <div className="relative z-10 container mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between">
        
        <div className="text-white max-w-2xl mb-10 md:mb-0">
          <h1 className="text-5xl md:text-7xl font-extrabold mb-6 leading-tight">
            Choose Your Turf <br className="hidden md:block"/>
            <span className="text-green-400">Play Your Game.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-8">
            จองสนามกีฬาคุณภาพสูงทั้ง ฟุตบอล, แบดมินตัน และ บาสเก็ตบอล ได้ง่ายๆ เพียงไม่กี่คลิก
          </p>
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              <img className="w-12 h-12 rounded-full border-2 border-gray-900" src="https://i.pravatar.cc/100?img=1" alt="user" />
              <img className="w-12 h-12 rounded-full border-2 border-gray-900" src="https://i.pravatar.cc/100?img=2" alt="user" />
              <img className="w-12 h-12 rounded-full border-2 border-gray-900" src="https://i.pravatar.cc/100?img=3" alt="user" />
            </div>
            <p className="text-sm font-semibold text-gray-300">เข้าร่วมกับสมาชิกกว่า 12k+ ท่าน</p>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center max-w-sm w-full">
          <h3 className="text-2xl font-bold text-white mb-4 text-center">ค้นหาและจองสนามได้ทันที</h3>
          <p className="text-gray-300 mb-8 text-center text-sm">เลือกประเภทกีฬาและวันเวลาที่คุณต้องการ</p>
          
          <button 
            onClick={() => setShowForm(true)}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold text-xl py-4 px-8 rounded-full shadow-lg hover:shadow-green-500/50 transition-all flex justify-between items-center group"
          >
            <span>Book Court Now</span>
            <span className="bg-white text-green-500 rounded-full w-8 h-8 flex items-center justify-center group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}