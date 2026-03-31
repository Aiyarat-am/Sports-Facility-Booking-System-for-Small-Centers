"use client";

import React, { useState, useEffect } from "react";
import { collection, doc, runTransaction, query, where, getDocs, updateDoc, onSnapshot } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";
import { db, auth } from "../lib/firebase";

const SPORT_TYPES = {
  football: { name: "สนามฟุตบอล", count: 2 },
  badminton: { name: "สนามแบดมินตัน", count: 4 },
  basketball: { name: "สนามบาสเก็ตบอล", count: 2 },
};

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
  const [formData, setFormData] = useState({ name: "", tel: "", sport: "", courtNumber: "1", date: "", time: "" });
  
  const [activeBookings, setActiveBookings] = useState<any[]>([]); 
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);
  const [currentShortId, setCurrentShortId] = useState<string | null>(null);
  const [currentExpiresAt, setCurrentExpiresAt] = useState<Date | null>(null); 
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [userBookings, setUserBookings] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (expiresAt: Date | undefined) => {
    if (!expiresAt) return null;
    const diff = expiresAt.getTime() - currentTime.getTime();
    if (diff <= 0) return null;
    const m = Math.floor(diff / 60000).toString().padStart(2, '0');
    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 🎯 อัปเดตหน้าประวัติการจอง (My Sessions) ให้เป็น Real-time ด้วย onSnapshot
  useEffect(() => {
    if (showHistory && user) {
      setIsLoadingHistory(true);
      
      const q = query(collection(db, "bookings"), where("userId", "==", user.uid));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const now = new Date();
        
        const data = snapshot.docs.map(docSnap => {
          const b = { id: docSnap.id, ...docSnap.data() } as any;
          if (b.status === "pending" && b.expiresAt && b.expiresAt.toDate() < now) {
            b.status = "cancelled"; 
            updateDoc(docSnap.ref, { status: "cancelled" }).catch(console.error); 
          }
          return b;
        });
        
        // เรียงลำดับจากรายการใหม่สุดไปเก่าสุด
        data.sort((a: any, b: any) => {
          const timeA = a.createdAt?.toDate().getTime() || 0;
          const timeB = b.createdAt?.toDate().getTime() || 0;
          return timeB - timeA;
        });

        setUserBookings(data);
        setIsLoadingHistory(false);
      }, (error) => {
        console.error("Error fetching history:", error);
        setIsLoadingHistory(false);
      });

      // คืนค่าฟังก์ชันยกเลิกการติดตามเมื่อปิดหน้าต่างหรือเปลี่ยนยูสเซอร์
      return () => unsubscribe();
    }
  }, [showHistory, user]);

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

  const getUserName = () => user?.email?.split('@')[0] || "User";

  const dateOptions = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  const resetFormData = () => {
    setFormData({
      name: "",
      tel: "",
      sport: "",
      courtNumber: "1",
      date: dateOptions[0], 
      time: ""
    });
  };

  const handleLogout = () => {
    signOut(auth);
    setShowForm(false);
    setShowHistory(false);
    resetFormData(); 
  };

  const handleBookNowClick = () => {
    if (user) setShowForm(true);
    else setShowLoginPopup(true);
  };

  useEffect(() => {
    setFormData((prev) => ({ ...prev, date: dateOptions[0] }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!formData.date || !formData.sport || !formData.courtNumber) {
        setActiveBookings([]); 
        return;
    }

    const q = query(
      collection(db, "bookings"),
      where("sportType", "==", formData.sport),
      where("courtNumber", "==", formData.courtNumber),
      where("status", "in", ["pending", "uploaded", "confirmed", "completed"]) 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => docSnap.data());
      setActiveBookings(data);
    });

    return () => unsubscribe();
  }, [formData.date, formData.sport, formData.courtNumber]);

  const startOfDay = new Date(`${formData.date}T00:00:00`);
  const endOfDay = new Date(`${formData.date}T23:59:59`);

  const bookedSlots = activeBookings.reduce((acc, data) => {
    const startTime = data.startTime?.toDate();
    if (!startTime) return acc;
    const isExpired = data.status === "pending" && data.expiresAt && data.expiresAt.toDate() < currentTime;

    if (!isExpired && startTime >= startOfDay && startTime <= endOfDay) {
      acc.push(startTime.getHours().toString().padStart(2, "0") + ":00");
    }
    return acc;
  }, [] as string[]);

  const handleBookingSubmit = async () => {
    if (!formData.name || !formData.tel || !formData.time || !formData.sport) {
      alert("กรุณากรอกข้อมูลและเลือกเวลาให้ครบถ้วนครับ");
      return;
    }
    if (!user) {
      setShowLoginPopup(true);
      return;
    }

    const startDateTime = new Date(`${formData.date}T${formData.time}:00`);
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() + 30);
    if (startDateTime <= cutoffTime) {
       alert("ไม่สามารถจองได้ เนื่องจากต้องจองล่วงหน้าอย่างน้อย 30 นาทีครับ");
       return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60000);
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60000);
      
      const prefix = SPORT_PREFIX[formData.sport as keyof typeof SPORT_PREFIX];
      let newShortId = "";
      let isUnique = false;

      while (!isUnique) {
        const randomDigits = Math.floor(1000 + Math.random() * 9000).toString(); 
        newShortId = `${prefix}-${randomDigits}`;
        const checkQuery = query(collection(db, "bookings"), where("shortId", "==", newShortId));
        const checkSnapshot = await getDocs(checkQuery);
        if (checkSnapshot.empty) {
          isUnique = true; 
        }
      }

      const newBookingRef = doc(collection(db, "bookings"));

      await runTransaction(db, async (transaction) => {
        const q = query(
          collection(db, "bookings"),
          where("sportType", "==", formData.sport),
          where("courtNumber", "==", formData.courtNumber),
          where("status", "in", ["pending", "uploaded", "confirmed", "completed"]) 
        );
        const querySnapshot = await getDocs(q);

        let isConflict = false;
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const existingStart = data.startTime.toDate();
          const isExpired = data.status === "pending" && data.expiresAt && data.expiresAt.toDate() < now;
          if (!isExpired && existingStart.getTime() === startDateTime.getTime()) isConflict = true; 
        });

        if (isConflict) throw new Error("เวลานี้ถูกจองไปแล้ว!");

        transaction.set(newBookingRef, {
          shortId: newShortId,
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
      setCurrentShortId(newShortId); 
      setCurrentExpiresAt(expiresAt); 
      
      setShowForm(false);
      resetFormData();
      
      setTimeout(() => {
          setCurrentBookingId((prev) => prev === newBookingRef.id ? null : prev);
          setCurrentShortId((prev) => prev === newShortId ? null : prev);
          setCurrentExpiresAt(null);
      }, 15 * 60000);
      
    } catch (error: any) {
      alert(error.message || "ไม่สามารถจองได้ กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        alert("ไฟล์รูปภาพมีขนาดใหญ่เกินไป (ห้ามเกิน 5MB)");
        return;
    }
    setSelectedFile(file);
  };

  const confirmAndUploadSlip = () => {
    if (!selectedFile || !currentBookingId) {
        alert("กรุณาเลือกไฟล์รูปภาพสลิปก่อนครับ");
        return;
    };

    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height *= (MAX_WIDTH / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        const base64String = canvas.toDataURL("image/jpeg", 0.7);
        
        const bookingRef = doc(db, "bookings", currentBookingId);
        updateDoc(bookingRef, { 
            slipImageBase64: base64String, 
            status: "uploaded" 
        })
          .then(() => {
            alert("อัปโหลดสลิปสำเร็จ! รอพนักงานตรวจสอบ");
            setCurrentBookingId(null); 
            setCurrentShortId(null);
            setCurrentExpiresAt(null);
            setSelectedFile(null);
            setShowHistory(true); 
          })
          .catch(() => alert("เกิดข้อผิดพลาดในการอัปโหลดไฟล์"))
          .finally(() => setIsSubmitting(false));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(selectedFile); 
  };

  const confirmCancelBooking = async () => {
    if (!currentBookingId) return;
    setIsCancelling(true);
    try {
      const bookingRef = doc(db, "bookings", currentBookingId);
      await updateDoc(bookingRef, { status: "cancelled" });

      setUserBookings(prev => prev.map(b => b.id === currentBookingId ? { ...b, status: "cancelled" } : b));

      alert("ยกเลิกการจองเรียบร้อยแล้ว คิวนี้เปิดว่างให้ท่านอื่นจองได้แล้วครับ");
      setCurrentBookingId(null);
      setCurrentShortId(null);
      setCurrentExpiresAt(null);
      setSelectedFile(null);
      setShowCancelConfirm(false);
    } catch (error) {
      console.error("Error cancelling booking:", error);
      alert("เกิดข้อผิดพลาดในการยกเลิก กรุณาลองใหม่");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gray-900 flex items-center">
      
      <div className="absolute top-6 right-6 lg:right-12 z-20">
        {user ? (
          <div className="flex items-center gap-4 bg-black/40 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10 shadow-lg">
            <button 
              onClick={() => setShowHistory(true)}
              className="text-white font-semibold hover:text-green-400 transition-colors text-sm flex items-center gap-2"
            >
              📋 ประวัติการจอง
            </button>
            <div className="w-px h-4 bg-white/30"></div>
            <span className="text-white font-medium text-sm">สวัสดี, <span className="text-green-400">{getUserName()}</span></span>
            <button 
              onClick={handleLogout}
              className="text-sm text-red-400 hover:text-red-300 font-bold ml-2"
            >
              ออก
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
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full relative shadow-2xl animate-fade-in-up">
            <button onClick={() => { setShowLoginPopup(false); setAuthError(""); }} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">✕</button>
            <h2 className="text-3xl font-bold text-gray-800 mb-6">{isLoginMode ? "Login" : "Sign Up"}</h2>
            {authError && <div className="mb-4 p-3 bg-red-50 text-red-500 text-sm rounded-lg border border-red-100">{authError}</div>}
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <div>
                <label className="block text-gray-600 text-sm mb-2 font-medium">Email address</label>
                <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="w-full border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900" placeholder="user@example.com" required />
              </div>
              <div>
                <label className="block text-gray-600 text-sm mb-2 font-medium">Password</label>
                <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900" placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={isAuthLoading} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all disabled:bg-blue-300 mt-2">
                {isAuthLoading ? "Processing..." : (isLoginMode ? "Login" : "Sign Up")}
              </button>
            </form>
            <div className="mt-6 text-center text-sm text-gray-500">
              {isLoginMode ? "Don't have an account? " : "Already have an account? "}
              <button onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(""); }} className="text-blue-500 font-semibold hover:underline">
                {isLoginMode ? "Sign Up" : "Login"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl relative overflow-y-auto max-h-[90vh] animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold text-gray-800">Create Your Booking</h2>
              <button onClick={() => { setShowForm(false); resetFormData(); }} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">✕</button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Name:</label>
                  <input type="text" className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900" placeholder="ชื่อของคุณ" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Tel:</label>
                  <input type="tel" className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900" placeholder="เบอร์โทรศัพท์" value={formData.tel} onChange={(e) => setFormData({...formData, tel: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Court Type:</label>
                  <select 
                    className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900" 
                    value={formData.sport} 
                    onChange={(e) => setFormData({...formData, sport: e.target.value, courtNumber: "1", time: ""})}
                  >
                    <option value="" disabled>-- เลือกสนาม --</option>
                    {Object.entries(SPORT_TYPES).map(([key, val]) => (
                      <option key={key} value={key}>{val.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">หมายเลขสนาม:</label>
                  <select 
                    className="w-full border-2 border-gray-300 p-3 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900 disabled:bg-gray-100 disabled:text-gray-400" 
                    value={formData.courtNumber} 
                    onChange={(e) => setFormData({...formData, courtNumber: e.target.value, time: ""})}
                    disabled={!formData.sport} 
                  >
                    {formData.sport && Array.from({ length: SPORT_TYPES[formData.sport as keyof typeof SPORT_TYPES].count }).map((_, i) => (
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
                    if (!formData.sport) {
                        return (
                          <button key={time} disabled className="p-3 rounded-lg font-bold text-center transition-all bg-gray-100 text-gray-400 cursor-not-allowed border-2 border-transparent">
                            {time}
                          </button>
                        );
                    }

                    const isBooked = bookedSlots.includes(time);
                    const isSelected = formData.time === time;
                    
                    const slotDateTime = new Date(`${formData.date}T${time}:00`);
                    const cutoffTime = new Date();
                    cutoffTime.setMinutes(cutoffTime.getMinutes() + 30);
                    const isPastOrTooClose = slotDateTime <= cutoffTime;

                    let buttonClass = "p-3 rounded-lg font-bold text-center transition-all ";
                    
                    if (isBooked) {
                      buttonClass += "bg-gray-300 text-gray-500 cursor-not-allowed line-through";
                    } else if (isPastOrTooClose) {
                      buttonClass += "bg-gray-100 text-gray-400 cursor-not-allowed border-2 border-transparent";
                    } else if (isSelected) {
                      buttonClass += "bg-green-500 text-white shadow-lg";
                    } else {
                      buttonClass += "bg-white border-2 border-gray-300 text-gray-700 hover:border-green-500 hover:text-green-500";
                    }

                    const isDisabled = isBooked || isPastOrTooClose;

                    return (
                      <button 
                        key={time} 
                        disabled={isDisabled} 
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
                  disabled={isSubmitting || !formData.time || !formData.sport || bookedSlots.includes(formData.time)} 
                  className={`w-full py-4 rounded-xl text-xl font-bold transition-all ${(!formData.time || !formData.sport || isSubmitting || bookedSlots.includes(formData.time)) ? "bg-gray-400 text-white cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white shadow-xl hover:shadow-2xl"}`}
                >
                  {isSubmitting ? "กำลังดำเนินการ..." : "ยืนยันการจองสนาม (Book Now)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentBookingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center overflow-y-auto max-h-[90vh] animate-fade-in-up">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">อัปโหลดสลิปชำระเงิน</h2>
            <p className="text-gray-600 mb-1">
                โปรดโอนเงินและแนบหลักฐานสำหรับรหัสการจอง
            </p>
            <div className="text-4xl font-extrabold text-blue-600 mb-6 tracking-wider">
                #{currentShortId}
            </div>
            
            <label 
                htmlFor="fileUpload" 
                className={`flex flex-col items-center justify-center w-full h-44 border-2 border-gray-300 border-dashed rounded-2xl cursor-pointer bg-gray-50 transition-colors ${selectedFile ? 'border-green-300 bg-green-50' : 'hover:border-blue-300 hover:bg-blue-50'}`}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <span className={`text-4xl mb-3 ${selectedFile ? 'mix-blend-multiply' : ''}`}>
                        {selectedFile ? '🖼️' : '📁'}
                    </span>
                    {selectedFile ? (
                        <div className="text-center px-4">
                            <p className="mb-1 text-sm text-green-700 font-bold truncate max-w-xs">{selectedFile.name}</p>
                            <p className="text-xs text-green-600 opacity-80">
                                ขนาด: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                            <span className="text-xs text-gray-400 underline mt-2 block">คลิกเพื่อเปลี่ยนรูป</span>
                        </div>
                    ) : (
                        <>
                            <p className="mb-2 text-sm text-gray-500 font-semibold">คลิกเพื่อเลือกไฟล์รูปภาพสลิป</p>
                            <p className="text-xs text-gray-400">
                                (รองรับไฟล์รูปภาพ JPG, PNG ขนาดห้ามเกิน 5MB)
                            </p>
                        </>
                    )}
                </div>
                <input 
                    id="fileUpload" 
                    type="file" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                    disabled={isSubmitting} 
                    className="hidden" 
                />
            </label>
            
            <div className="mt-4 mb-6">
              {currentExpiresAt && formatCountdown(currentExpiresAt) ? (
                <p className="text-red-500 text-sm font-bold bg-red-50 py-2 rounded-lg border border-red-100 flex items-center justify-center gap-1.5">
                  <span className="animate-pulse">⏳</span> กรุณาทำรายการภายใน {formatCountdown(currentExpiresAt)} นาที
                </p>
              ) : (
                <p className="text-red-500 text-sm font-bold bg-red-50 py-2 rounded-lg border border-red-100">
                  ⚠️ หมดเวลาทำรายการ คิวถูกยกเลิกแล้ว
                </p>
              )}
            </div>
            
            <div className="flex flex-col gap-3">
              {selectedFile && (
                  <button 
                    onClick={confirmAndUploadSlip} 
                    disabled={isSubmitting || (!currentExpiresAt || !formatCountdown(currentExpiresAt))} 
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-xl transition-all shadow-md disabled:bg-gray-300"
                  >
                    {isSubmitting ? "กำลังอัปโหลด..." : "✅ ยืนยันและส่งสลิป"}
                  </button>
              )}
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowCancelConfirm(true)} 
                  disabled={isSubmitting} 
                  className="flex-1 px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 font-bold text-sm transition-colors disabled:opacity-50"
                >
                  ยกเลิกการจอง
                </button>
                <button 
                  onClick={() => { 
                      setCurrentBookingId(null); 
                      setCurrentShortId(null); 
                      setCurrentExpiresAt(null);
                      setSelectedFile(null);
                  }} 
                  disabled={isSubmitting} 
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-bold text-sm transition-colors disabled:opacity-50"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl max-w-sm w-full text-center animate-fade-in-up">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">ยืนยันการยกเลิกการจอง?</h3>
            <p className="text-sm text-gray-600 mb-6">
                หากยกเลิกแล้ว คิวนี้จะหลุดทันทีและผู้อื่นสามารถจองเวลานี้ได้ คุณต้องการยกเลิกใช่หรือไม่?
            </p>
            <div className="flex gap-3">
                <button 
                  onClick={() => setShowCancelConfirm(false)} 
                  disabled={isCancelling}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-bold text-sm transition-colors"
                >
                  กลับไปหน้าเดิม
                </button>
                <button 
                  onClick={confirmCancelBooking} 
                  disabled={isCancelling}
                  className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-sm transition-colors shadow-md disabled:bg-red-300"
                >
                  {isCancelling ? "กำลังยกเลิก..." : "ยืนยันการยกเลิก"}
                </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-5xl relative overflow-y-auto max-h-[90vh] animate-fade-in-up">
            <button onClick={() => setShowHistory(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">✕</button>
            <h2 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">ประวัติการจอง (My Sessions)</h2>
            
            {isLoadingHistory ? (
              <p className="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</p>
            ) : userBookings.length === 0 ? (
              <p className="text-center text-gray-500 py-10">คุณยังไม่มีประวัติการจองครับ</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wide border-b border-gray-200">
                      <th className="px-4 py-3 font-semibold rounded-tl-lg">รหัสอ้างอิง</th>
                      <th className="px-4 py-3 font-semibold">ประเภทกีฬา</th>
                      <th className="px-4 py-3 font-semibold">วันเวลาที่ใช้งาน</th>
                      <th className="px-4 py-3 font-semibold">ทำรายการเมื่อ</th>
                      <th className="px-4 py-3 font-semibold">สถานะ</th>
                      <th className="px-4 py-3 font-semibold rounded-tr-lg">ใบเสร็จ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {userBookings.map((b) => {
                      const st = b.startTime?.toDate();
                      const sessionDate = st ? st.toLocaleDateString("th-TH", { year: 'numeric', month: 'short', day: 'numeric' }) : "-";
                      const sessionTime = st ? `${st.getHours().toString().padStart(2, "0")}:00 - ${(st.getHours() + 1).toString().padStart(2, "0")}:00` : "-";
                      
                      const ct = b.createdAt?.toDate();
                      const createdStr = ct ? `${ct.toLocaleDateString("th-TH", { year: 'numeric', month: 'short', day: 'numeric' })} ${ct.getHours().toString().padStart(2, "0")}:${ct.getMinutes().toString().padStart(2, "0")} น.` : "-";

                      const sportName = SPORT_TYPES[b.sportType as keyof typeof SPORT_TYPES]?.name || b.sportType;

                      return (
                        <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 font-bold text-gray-800">{b.shortId || "-"}</td>
                          <td className="px-4 py-4 text-gray-700 font-medium">{sportName} <span className="text-sm text-gray-400 block">สนามที่ {b.courtNumber}</span></td>
                          
                          <td className="px-4 py-4 text-gray-700">
                            <div className="font-semibold">{sessionDate}</div>
                            <div className="text-sm text-gray-500">{sessionTime}</div>
                          </td>
                          
                          <td className="px-4 py-4 text-gray-600 text-sm font-medium">
                            {createdStr}
                          </td>
                          
                          <td className="px-4 py-4">
                            {b.status === "pending" && (
                               <div className="flex flex-col items-start gap-1">
                                  <span className="text-yellow-700 bg-yellow-100 px-3 py-1 rounded-full text-sm font-bold border border-yellow-200">Pending</span>
                                  {(() => {
                                     const timer = formatCountdown(b.expiresAt?.toDate());
                                     return timer ? <span className="text-red-500 text-xs font-bold pl-1">⏳ {timer}</span> : null;
                                  })()}
                               </div>
                            )}
                            {b.status === "uploaded" && <span className="text-blue-700 bg-blue-100 px-3 py-1 rounded-full text-sm font-bold border border-blue-200">Uploaded</span>}
                            {b.status === "confirmed" && <span className="text-green-700 bg-green-100 px-3 py-1 rounded-full text-sm font-bold border border-green-200">Confirmed</span>}
                            {b.status === "completed" && <span className="text-gray-600 bg-gray-100 px-3 py-1 rounded-full text-sm font-bold border border-gray-200">Completed</span>}
                            {b.status === "cancelled" && <span className="text-red-700 bg-red-100 px-3 py-1 rounded-full text-sm font-bold border border-red-200">Cancelled</span>}
                          </td>
                          <td className="px-4 py-4">
                            {(b.status === "confirmed" || b.status === "completed") && (
                              <button 
                                onClick={() => setReceiptData(b)}
                                className="text-white bg-gray-800 hover:bg-black px-4 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-md"
                              >
                                ดูใบเสร็จ
                              </button>
                            )}
                            {b.status === "pending" && (
                              <button 
                                onClick={() => {
                                  setCurrentBookingId(b.id);
                                  setCurrentShortId(b.shortId);
                                  setCurrentExpiresAt(b.expiresAt?.toDate() || null);
                                  setShowHistory(false); 
                                }}
                                className="text-white bg-blue-500 hover:bg-blue-600 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-md"
                              >
                                อัปโหลดสลิป
                              </button>
                            )}
                            {(b.status === "uploaded" || b.status === "cancelled") && (
                              <span className="text-gray-300 text-sm">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {receiptData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="bg-[#f2ece4] p-4 rounded-3xl max-w-sm w-full relative shadow-2xl animate-fade-in-up">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <h3 className="text-xl font-extrabold text-gray-800">Receipt</h3>
                <button onClick={() => setReceiptData(null)} className="text-gray-400 hover:text-gray-800 text-xl font-bold">✕</button>
              </div>

              <div className="border-b-2 border-dashed border-gray-200 pb-4 mb-4">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Client Name</p>
                    <p className="font-bold text-gray-800 uppercase">{receiptData.customerName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-1">Session No.</p>
                    <p className="font-bold text-blue-600">#{receiptData.shortId}</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Session Name</span>
                    <span className="font-bold text-gray-800">{SPORT_TYPES[receiptData.sportType as keyof typeof SPORT_TYPES]?.name} (สนาม {receiptData.courtNumber})</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date</span>
                    <span className="font-bold text-gray-800">{receiptData.startTime.toDate().toLocaleDateString("th-TH", { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Time</span>
                    <span className="font-bold text-gray-800">{receiptData.startTime.toDate().getHours().toString().padStart(2, '0')}:00 - {(receiptData.startTime.toDate().getHours() + 1).toString().padStart(2, '0')}:00</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center mt-6">
                <div className="text-gray-500 text-xs w-1/2">
                  แสดงหน้านี้หรือสแกน QR Code ที่หน้าเคาน์เตอร์เพื่อเข้าใช้งานสนาม
                </div>
                <div className="w-24 h-24 bg-gray-100 rounded-lg p-1 border border-gray-200">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${receiptData.shortId}`} alt="QR Code" className="w-full h-full mix-blend-multiply" />
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}