"use client";

import React, { useState, useEffect } from "react";
import { collection, doc, runTransaction, query, where, getDocs, updateDoc, onSnapshot, getDoc, setDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";
import { db, auth } from "../lib/firebase";
import { useRouter } from "next/navigation"; 

// ─── Constants ────────────────────────────────────────────────────────────────

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

const backgroundImages = [
  "/ball.jpg", 
  "/bas.jpeg", 
  "/bat.jpg", 
];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BookingPage() {
  const router = useRouter(); 

  const [user, setUser] = useState<User | null>(null);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true); 
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  
  const [isAdminRedirecting, setIsAdminRedirecting] = useState(false);
  const [customAlert, setCustomAlert] = useState("");

  // 🎯 State สำหรับระบบโปรไฟล์
  const [userProfile, setUserProfile] = useState<{name: string, tel: string} | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileFormData, setProfileFormData] = useState({ name: "", tel: "" });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
  const [currentBgIndex, setCurrentBgIndex] = useState(0);

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const bgInterval = setInterval(() => {
      setCurrentBgIndex((prevIndex) => (prevIndex + 1) % backgroundImages.length);
    }, 3000);
    return () => clearInterval(bgInterval);
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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && currentUser.email?.toLowerCase() === "admin555@email.com") {
        setIsAdminRedirecting(true); 
        router.replace("/admin"); 
      } else {
        setUser(currentUser);
        // 🎯 โหลดข้อมูลโปรไฟล์จาก Collection "users" ทันทีที่ล็อกอิน
        if (currentUser) {
          try {
            const userDoc = await getDoc(doc(db, "users", currentUser.uid));
            if (userDoc.exists()) {
              setUserProfile(userDoc.data() as {name: string, tel: string});
            } else {
              setUserProfile(null);
            }
          } catch (err) {
            console.error("Error loading profile", err);
          }
        } else {
          setUserProfile(null);
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (showHistory && user && !isAdminRedirecting) {
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

      return () => unsubscribe();
    }
  }, [showHistory, user, isAdminRedirecting]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsAuthLoading(true);

    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
        if (authEmail.toLowerCase() === "admin555@email.com") {
          setIsAdminRedirecting(true);
          router.replace("/admin");
        } else {
          setShowLoginPopup(false);
        }
      } else {
        // 🎯 กรณีสมัครสมาชิกใหม่ ให้เปิดหน้าต่างกรอกชื่อ-เบอร์โทรทันที
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        setShowLoginPopup(false);
        setProfileFormData({ name: "", tel: "" });
        setShowProfileModal(true);
      }
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

  // 🎯 ฟังก์ชันบันทึกโปรไฟล์ลง Collection "users"
  const handleProfileSubmit = async () => {
    if (!profileFormData.name || !profileFormData.tel) {
      setCustomAlert("กรุณากรอกชื่อและเบอร์โทรศัพท์ให้ครบถ้วนครับ");
      return;
    }
    if (!user) return;
    
    setIsSubmitting(true);
    try {
      await setDoc(doc(db, "users", user.uid), {
        name: profileFormData.name,
        tel: profileFormData.tel,
        email: user.email
      });
      setUserProfile({ name: profileFormData.name, tel: profileFormData.tel });
      setShowProfileModal(false);
      setCustomAlert("อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้วครับ");
    } catch (error) {
      console.error(error);
      setCustomAlert("เกิดข้อผิดพลาดในการบันทึกโปรไฟล์");
    } finally {
      setIsSubmitting(false);
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
    setIsDropdownOpen(false);
    setUserProfile(null);
    resetFormData(); 
  };

  const handleBookNowClick = () => {
    if (user) {
      // 🎯 เช็คว่ามีโปรไฟล์หรือยัง ถ้าไม่มีบังคับกรอกก่อน
      if (!userProfile?.name || !userProfile?.tel) {
        setProfileFormData({ name: "", tel: "" });
        setShowProfileModal(true);
        setCustomAlert("กรุณากรอกชื่อและเบอร์โทรศัพท์ก่อนทำการจองครับ");
        return;
      }
      // 🎯 ดึงชื่อ-เบอร์โทรมาใส่ฟอร์มให้อัตโนมัติ
      setFormData(prev => ({ ...prev, name: userProfile.name, tel: userProfile.tel }));
      setShowForm(true);
    } else {
      setShowLoginPopup(true);
    }
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
      setCustomAlert("กรุณากรอกข้อมูลและเลือกเวลาให้ครบถ้วนครับ");
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
       setCustomAlert("ไม่สามารถจองได้ เนื่องจากต้องจองล่วงหน้าอย่างน้อย 30 นาทีครับ");
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
      setCustomAlert(error.message || "ไม่สามารถจองได้ กรุณาลองใหม่");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        setCustomAlert("ไฟล์รูปภาพมีขนาดใหญ่เกินไป (ห้ามเกิน 5MB)");
        return;
    }
    setSelectedFile(file);
  };

  const confirmAndUploadSlip = () => {
    if (!selectedFile || !currentBookingId) {
        setCustomAlert("กรุณาเลือกไฟล์รูปภาพสลิปก่อนครับ");
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
            setCustomAlert("อัปโหลดสลิปสำเร็จ! รอพนักงานตรวจสอบ");
            setCurrentBookingId(null); 
            setCurrentShortId(null);
            setCurrentExpiresAt(null);
            setSelectedFile(null);
            setShowHistory(true); 
          })
          .catch(() => setCustomAlert("เกิดข้อผิดพลาดในการอัปโหลดไฟล์"))
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

      setCustomAlert("ยกเลิกการจองเรียบร้อยแล้ว คิวนี้เปิดว่างให้ท่านอื่นจองได้แล้วครับ");
      setCurrentBookingId(null);
      setCurrentShortId(null);
      setCurrentExpiresAt(null);
      setSelectedFile(null);
      setShowCancelConfirm(false);
    } catch (error) {
      console.error("Error cancelling booking:", error);
      setCustomAlert("เกิดข้อผิดพลาดในการยกเลิก กรุณาลองใหม่");
    } finally {
      setIsCancelling(false);
    }
  };

  // ─── Rendering ──────────────────────────────────────────────────────────────

  if (isAdminRedirecting) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-white text-xl font-bold animate-pulse">กำลังพาท่านไปยังหน้า Staff Dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      
      {/* หน้าต่าง Custom Alert */}
      {customAlert && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center animate-fade-in-up">
            <div className="text-blue-500 text-5xl mb-4">💬</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">CourtHub แจ้งเตือน</h3>
            <p className="text-gray-600 mb-6 leading-relaxed">
              {customAlert}
            </p>
            <button 
              onClick={() => setCustomAlert("")} 
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-md"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}

      {/* 🎯 หน้าต่างจัดการโปรไฟล์ (แสดงตอนสมัครใหม่ หรือกดแก้ไข) */}
      {showProfileModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full relative shadow-2xl animate-fade-in-up">
            {/* ถ้ามีโปรไฟล์แล้วถึงจะมีปุ่มปิดได้ (บังคับคนใหม่ให้กรอก) */}
            {userProfile?.name && (
              <button onClick={() => setShowProfileModal(false)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:bg-gray-100 transition-colors">✕</button>
            )}
            <h2 className="text-2xl font-bold text-gray-800 mb-2">ข้อมูลส่วนตัว</h2>
            <p className="text-sm text-gray-500 mb-6">กรุณากรอกข้อมูลให้ครบถ้วนเพื่อใช้ในการจองสนามครับ</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-600 text-sm mb-2 font-medium">ชื่อ-นามสกุล</label>
                <input type="text" value={profileFormData.name} onChange={(e) => setProfileFormData({...profileFormData, name: e.target.value})} className="w-full border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900" placeholder="ชื่อของคุณ" required />
              </div>
              <div>
                <label className="block text-gray-600 text-sm mb-2 font-medium">เบอร์โทรศัพท์</label>
                <input type="tel" value={profileFormData.tel} onChange={(e) => setProfileFormData({...profileFormData, tel: e.target.value})} className="w-full border border-gray-200 p-3 rounded-lg focus:outline-none focus:border-blue-500 text-gray-900" placeholder="08x-xxx-xxxx" required />
              </div>
              <button onClick={handleProfileSubmit} disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md mt-4 disabled:bg-blue-300">
                {isSubmitting ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* แถบเมนูด้านบน (รวมระบบ Dropdown) */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-6 bg-gradient-to-b from-black/50 to-transparent">
        <span className="text-xl font-bold text-white tracking-wider">CourtHub</span>
        {user ? (
          <div className="relative">
            {/* 🎯 ปุ่มโปรไฟล์แบบ Dropdown */}
            <div 
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-5 py-2.5 rounded-full border border-white/10 shadow-lg cursor-pointer hover:bg-black/60 transition-colors"
            >
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                {userProfile?.name ? userProfile.name.charAt(0).toUpperCase() : "U"}
              </div>
              <span className="text-white font-medium text-sm">
                สวัสดี, <span className="text-green-400">{userProfile?.name || getUserName()}</span>
              </span>
              <span className="text-white/50 text-xs ml-1">▼</span>
            </div>

            {/* 🎯 เมนู Dropdown */}
            {isDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                <div className="absolute right-0 mt-3 w-48 bg-white rounded-2xl shadow-xl overflow-hidden z-50 border border-gray-100 animate-fade-in-up">
                  <button 
                    onClick={() => { setShowHistory(true); setIsDropdownOpen(false); }}
                    className="w-full text-left px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 transition-colors"
                  >
                    <span>📋</span> ประวัติการจอง
                  </button>
                  <button 
                    onClick={() => { 
                      setProfileFormData({ name: userProfile?.name || "", tel: userProfile?.tel || "" });
                      setShowProfileModal(true); 
                      setIsDropdownOpen(false); 
                    }}
                    className="w-full text-left px-5 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-3 border-b border-gray-50 transition-colors"
                  >
                    <span>⚙️</span> แก้ไขโปรไฟล์
                  </button>
                  <button 
                    onClick={() => { handleLogout(); setIsDropdownOpen(false); }}
                    className="w-full text-left px-5 py-3.5 text-sm font-bold text-red-500 hover:bg-red-50 flex items-center gap-3 transition-colors"
                  >
                    <span>🚪</span> ออกจากระบบ
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button 
            onClick={() => setShowLoginPopup(true)}
            className="px-6 py-2.5 border-2 border-white text-white rounded-full font-bold hover:bg-white hover:text-gray-900 transition-colors shadow-lg"
          >
            เข้าสู่ระบบ
          </button>
        )}
      </div>

      {backgroundImages.map((img, index) => (
        <div 
          key={img}
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ${currentBgIndex === index ? "opacity-100" : "opacity-0"}`}
          style={{ backgroundImage: `url('${img}')` }}
        />
      ))}
      <div className="absolute inset-0 bg-black/40 z-10" />

      <div className="relative z-20 text-center text-white px-6 max-w-4xl animate-fade-in-up">
        <h1 className="text-6xl md:text-8xl font-extrabold mb-8 leading-tight tracking-tighter">
          Your Game <br className="hidden md:block"/>
          <span className="text-green-400">Starts Here!</span>
        </h1>
        <p className="text-xl md:text-2xl text-gray-200 mb-12 max-w-2xl mx-auto font-light leading-relaxed">
          จองสนามกีฬาคุณภาพสูง ทั้ง ฟุตบอล, แบดมินตัน <br/> และ บาสเก็ตบอล ได้ง่ายๆ เพียงไม่กี่คลิก
        </p>
        <button 
          onClick={handleBookNowClick}
          className="bg-green-500 hover:bg-green-600 text-white font-bold text-2xl py-5 px-12 rounded-full shadow-2xl hover:shadow-green-500/50 transition-all hover:-translate-y-1"
        >
          Book Court Now →
        </button>
      </div>

      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30 flex gap-4 p-2 bg-black/20 rounded-full backdrop-blur-sm">
        {backgroundImages.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentBgIndex(index)}
            className={`w-4 h-4 rounded-full transition-all duration-300 ${currentBgIndex === index ? "bg-green-400 scale-125 shadow-md" : "bg-white/50 hover:bg-white"}`}
            aria-label={`ดูรูปที่ ${index + 1}`}
          />
        ))}
      </div>

      {/* ────────────────── Popups และ Modals ────────────────── */}

      {/* Login Popup */}
      {showLoginPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
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

      {/* Booking Form Popup */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-xl w-full max-w-2xl relative overflow-y-auto max-h-[90vh] animate-fade-in-up">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-800">Create Your Booking</h2>
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

      {/* Upload Slip Popup */}
      {currentBookingId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full text-center overflow-y-auto max-h-[90vh] animate-fade-in-up">
            
            <h2 className="text-2xl font-bold text-gray-800 mb-2">อัปโหลดสลิปชำระเงิน</h2>
            
            <div className="text-2xl font-extrabold text-blue-600 mb-4 tracking-wider">
                #{currentShortId}
            </div>

            <div className="bg-yellow-50 border-2 border-yellow-300 text-yellow-800 px-4 py-3 rounded-xl mb-4 shadow-sm text-center flex flex-col items-center justify-center">
              <span className="text-lg font-black mb-1 text-red-600">⚠️ คำเตือน: โอนเงินแล้วโปรดแนบสลิปทันที!</span>
              <span className="text-xs font-bold leading-relaxed opacity-90">หากคิวหลุดเนื่องจากหมดเวลา<br/>ทางศูนย์ขอสงวนสิทธิ์ไม่รับผิดชอบทุกกรณี</span>
            </div>

            <div className="mb-4 flex flex-col items-center justify-center bg-blue-50 p-3 rounded-xl border border-blue-100">
              <img 
                src="/promptpay.jpg" 
                alt="QR Code รับเงิน" 
                className="w-36 h-36 object-cover rounded-xl shadow-sm border-2 border-white"
              />
              <p className="text-xs text-gray-600 mt-2 font-semibold">บัญชี: ชินวัณ ศรีประสงค์</p>
            </div>
            
            <label 
                htmlFor="fileUpload" 
                className={`flex flex-col items-center justify-center w-full py-4 border-2 border-gray-300 border-dashed rounded-2xl cursor-pointer bg-gray-50 transition-colors ${selectedFile ? 'border-green-300 bg-green-50' : 'hover:border-blue-300 hover:bg-blue-50'}`}
            >
                <div className="flex flex-col items-center justify-center">
                    <span className={`text-3xl mb-1 ${selectedFile ? 'mix-blend-multiply' : ''}`}>
                        {selectedFile ? '🖼️' : '📁'}
                    </span>
                    {selectedFile ? (
                        <div className="text-center px-4">
                            <p className="mb-1 text-sm text-green-700 font-bold truncate max-w-[200px]">{selectedFile.name}</p>
                            <span className="text-xs text-gray-400 underline mt-1 block">คลิกเพื่อเปลี่ยนรูป</span>
                        </div>
                    ) : (
                        <>
                            <p className="mb-1 text-sm text-gray-600 font-semibold">คลิกเพื่อเลือกไฟล์สลิป</p>
                            <p className="text-[10px] text-gray-400">
                                (JPG, PNG ขนาดไม่เกิน 5MB)
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
            
            <div className="mt-3 mb-4">
              {currentExpiresAt && formatCountdown(currentExpiresAt) ? (
                <p className="text-red-500 text-sm font-bold bg-red-50 py-1.5 rounded-lg border border-red-100 flex items-center justify-center gap-1.5">
                  <span className="animate-pulse">⏳</span> หมดเวลาใน {formatCountdown(currentExpiresAt)} นาที
                </p>
              ) : (
                <p className="text-red-500 text-sm font-bold bg-red-50 py-1.5 rounded-lg border border-red-100">
                  ⚠️ หมดเวลาทำรายการ คิวถูกยกเลิกแล้ว
                </p>
              )}
            </div>
            
            <div className="flex flex-col gap-2">
              {selectedFile && (
                  <button 
                    onClick={confirmAndUploadSlip} 
                    disabled={isSubmitting || (!currentExpiresAt || !formatCountdown(currentExpiresAt))} 
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl transition-all shadow-md disabled:bg-gray-300"
                  >
                    {isSubmitting ? "กำลังอัปโหลด..." : "✅ ยืนยันและส่งสลิป"}
                  </button>
              )}
              
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowCancelConfirm(true)} 
                  disabled={isSubmitting} 
                  className="flex-1 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl hover:bg-red-100 font-bold text-sm transition-colors disabled:opacity-50"
                >
                  ยกเลิกคิวนี้
                </button>
                <button 
                  onClick={() => { 
                      setCurrentBookingId(null); 
                      setCurrentShortId(null); 
                      setCurrentExpiresAt(null);
                      setSelectedFile(null);
                  }} 
                  disabled={isSubmitting} 
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-bold text-sm transition-colors disabled:opacity-50"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Popup */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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

      {/* My Sessions (History) Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-md p-4">
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

      {/* Receipt Modal */}
      {receiptData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
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