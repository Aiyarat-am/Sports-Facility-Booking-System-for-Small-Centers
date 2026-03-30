"use client";

import React, { useState, useEffect } from "react";
import { collection, doc, runTransaction, query, where, getDocs, updateDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";
import { db, auth } from "../lib/firebase";

const SPORT_TYPES = {
  football: { name: "สนามฟุตบอล", count: 2 },
  badminton: { name: "สนามแบดมินตัน", count: 4 },
  basketball: { name: "สนามบาสเก็ตบอล", count: 2 },
};

// เพิ่มตัวย่อสำหรับสร้างรหัสการจอง
const SPORT_PREFIX = {
  football: "FB",
  badminton: "BD",
  basketball: "BK",
};

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

export default function BookingPage() {
  const [user, setUser] = useState<User | null>(null);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true); 
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", tel: "", sport: "football", courtNumber: "1", date: "", time: "" });
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // เก็บทั้ง ID ของ Firestore และรหัสสั้นที่เราสร้างขึ้น
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
  const [currentShortId, setCurrentShortId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsAuthLoading(true);

    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      }
      setShowLoginPopup(false);
      setAuthEmail("");
      setAuthPassword("");
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') setAuthError("อีเมลนี้ถูกใช้งานแล้ว");
      else if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') setAuthError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      else if (error.code === 'auth/weak-password') setAuthError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      else setAuthError("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setShowForm(false);
  };

  const handleBookNowClick = () => {
    if (user) setShowForm(true);
    else setShowLoginPopup(true);
  };

  const getUserName = () => user?.email?.split('@')[0] || "User";

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
    if (!user) {
      setShowLoginPopup(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60000);
      const startDateTime = new Date(`${formData.date}T${formData.time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60000);
      
      // 1. ระบบสุ่มรหัสและเช็คว่าห้ามซ้ำ
      const prefix = SPORT_PREFIX[formData.sport as keyof typeof SPORT_PREFIX];
      let newShortId = "";
      let isUnique = false;

      while (!isUnique) {
        const randomDigits = Math.floor(1000 + Math.random() * 9000).toString(); // สุ่มเลข 1000-9999
        newShortId = `${prefix}-${randomDigits}`;

        const checkQuery = query(collection(db, "bookings"), where("shortId", "==", newShortId));
        const checkSnapshot = await getDocs(checkQuery);
        if (checkSnapshot.empty) {
          isUnique = true; // ถ้าไม่มีข้อมูลแปลว่าไม่ซ้ำ ให้ออกจากลูป
        }
      }

      const newBookingRef = doc(collection(db, "bookings"));

      // 2. บันทึกข้อมูลพร้อมรหัสสั้น
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
          if (!isExpired && existingStart.getTime() === startDateTime.getTime()) isConflict = true; 
        });

        if (isConflict) throw new Error("เวลานี้ถูกจองไปแล้ว!");

        transaction.set(newBookingRef, {
          shortId: newShortId, // <--- เพิ่มข้อมูลนี้ลงฐานข้อมูล
          customerName: formData.name,
          customerTel: formData.tel,
          sportType: formData.sport,
          courtNumber: formData.courtNumber,
          startTime: startDateTime, 
          endTime: endDateTime,     
          status: "pending", 
          expiresAt: expiresAt,
          createdAt: now,
          userId: user.uid, 
        });
      });

      setCurrentBookingId(newBookingRef.id);
      setCurrentShortId(newShortId); // เก็บ state ไว้โชว์หน้า UI
      
      setTimeout(() => {
          setCurrentBookingId((prev) => prev === newBookingRef.id ? null : prev);
          setCurrentShortId(null);
      }, 15 * 60000);

      alert(`จองสำเร็จ! กรุณาแนบสลิปภายใน 15 นาที\nรหัส: ${newShortId}`);
      
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
            setCurrentShortId(null);
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
          <p className="text-gray-600 mb-2">รหัสการจอง: <span className="font-bold text-2xl text-blue-600">{currentShortId}</span></p>
          <p className="text-red-500 text-sm mb-6">กรุณาอัปโหลดภายใน 15 นาที</p>
          <input type="file" accept="image/*" onChange={handleFileUpload} disabled={isSubmitting} className="mb-4 w-full" />
          <button onClick={() => { setCurrentBookingId(null); setCurrentShortId(null); }} disabled={isSubmitting} className="mt-4 px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 w-full font-semibold">
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
      
      <div className="absolute top-6 right-6 lg:right-12 z-20">
        {user ? (
          <div className="flex items-center gap-4 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
            <span className="text-white font-medium">สวัสดี, <span className="text-green-400">{getUserName()}</span></span>
            <button 
              onClick={handleLogout}
              className="text-sm text-red-400 hover:text-red-300 font-semibold"
            >
              ออกจากระบบ
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setShowLoginPopup(true)}
            className="px-6 py-2 border-2 border-white text-white rounded-full font-bold hover:bg-white hover:text-gray-900 transition-colors"
          >
            Login
          </button>
        )}
      </div>

      <div 
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1518605368461-1ee12db01037?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')" }}
      ></div>

      <div className="relative z-10 container mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between">
        
        <div className="text-white max-w-2xl mb-10 md:mb-0 mt-16 md:mt-0">
          <h1 className="text-5xl md:text-7xl font-extrabold mb-6 leading-tight">
            Choose Your Turf <br className="hidden md:block"/>
            <span className="text-green-400">Play Your Game.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-8">
            จองสนามกีฬาคุณภาพสูงทั้ง ฟุตบอล, แบดมินตัน และ บาสเก็ตบอล ได้ง่ายๆ เพียงไม่กี่คลิก
          </p>
        </div>

        <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 shadow-2xl flex flex-col items-center max-w-sm w-full">
          <h3 className="text-2xl font-bold text-white mb-4 text-center">ค้นหาและจองสนามได้ทันที</h3>
          <p className="text-gray-300 mb-8 text-center text-sm">เลือกประเภทกีฬาและวันเวลาที่คุณต้องการ</p>
          
          <button 
            onClick={handleBookNowClick}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold text-xl py-4 px-8 rounded-full shadow-lg hover:shadow-green-500/50 transition-all flex justify-between items-center group"
          >
            <span>Book Court Now</span>
            <span className="bg-white text-green-500 rounded-full w-8 h-8 flex items-center justify-center group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>
      </div>

      {showLoginPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full relative shadow-2xl">
            <button 
              onClick={() => { setShowLoginPopup(false); setAuthError(""); }}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              ✕
            </button>

            <h2 className="text-3xl font-bold text-gray-800 mb-6">{isLoginMode ? "Login" : "Sign Up"}</h2>
            
            {authError && <div className="mb-4 p-3 bg-red-50 text-red-500 text-sm rounded-lg border border-red-100">{authError}</div>}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-600 text-sm mb-2 font-medium">Email address</label>
                <input 
                  type="email" 
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500" 
                  placeholder="user@example.com" 
                  required 
                />
              </div>
              <div>
                <label className="block text-gray-600 text-sm mb-2 font-medium">Password</label>
                <input 
                  type="password" 
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500" 
                  placeholder="••••••••" 
                  required 
                />
              </div>

              <button 
                type="submit" 
                disabled={isAuthLoading}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all disabled:bg-blue-300 mt-2"
              >
                {isAuthLoading ? "Processing..." : (isLoginMode ? "Login" : "Sign Up")}
              </button>
            </form>

            <div className="mt-6 text-center text-sm text-gray-500">
              {isLoginMode ? "Don't have an account? " : "Already have an account? "}
              <button 
                onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(""); }}
                className="text-blue-500 font-semibold hover:underline"
              >
                {isLoginMode ? "Sign Up" : "Login"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}