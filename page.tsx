"use client";

import React, { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import { collection, doc, runTransaction, query, where, getDocs, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase"; 

export default function BookingPage() {
  const [sportType, setSportType] = useState("badminton");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentBookingId, setCurrentBookingId] = useState<string | null>(null);

  const today = new Date();
  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 7);

  const handleDateSelect = async (selectInfo: any) => {
    const confirmBooking = confirm(
      `คุณต้องการจอง ${sportType}\nตั้งแต่ ${selectInfo.startStr} ถึง ${selectInfo.endStr} ใช่หรือไม่?`
    );
    
    if (confirmBooking) {
      setIsSubmitting(true);
      try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 15 * 60000); // บวก 15 นาที

        const newBookingRef = doc(collection(db, "bookings"));

        // ระบบป้องกันจองซ้ำซ้อน
        await runTransaction(db, async (transaction) => {
          const q = query(
            collection(db, "bookings"),
            where("sportType", "==", sportType),
            where("status", "in", ["pending", "uploaded", "confirmed"])
          );
          const querySnapshot = await getDocs(q);

          let isConflict = false;
          querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const existingStart = data.startTime.toDate();
            const existingEnd = data.endTime.toDate();
            const incomingStart = selectInfo.start;
            const incomingEnd = selectInfo.end;

            const isExpired = data.status === "pending" && data.expiresAt.toDate() < now;

            if (!isExpired && incomingStart < existingEnd && incomingEnd > existingStart) {
              isConflict = true; 
            }
          });

          if (isConflict) {
            throw new Error("เวลานี้ถูกจองไปก่อนหน้าแล้วครับ!");
          }

          transaction.set(newBookingRef, {
            sportType: sportType,
            startTime: selectInfo.start, 
            endTime: selectInfo.end,     
            status: "pending", 
            expiresAt: expiresAt,
            createdAt: now,
            userId: "mock-user-123", 
          });
        });

        setCurrentBookingId(newBookingRef.id);
        
        // นับถอยหลัง 15 นาทีบนหน้าจอ
        setTimeout(() => {
            if(currentBookingId === newBookingRef.id) {
               alert("หมดเวลา 15 นาที การจองนี้ถูกยกเลิกอัตโนมัติครับ");
               setCurrentBookingId(null);
            }
        }, 15 * 60000);

        alert(`จองสำเร็จ! กรุณาแนบสลิปภายใน 15 นาทีครับ\nรหัส: ${newBookingRef.id}`);
        
      } catch (error: any) {
        console.error("เกิดข้อผิดพลาด: ", error);
        alert(error.message || "ไม่สามารถบันทึกการจองได้ กรุณาลองใหม่");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // ฟังก์ชันจัดการอัปโหลด ลดขนาด และแปลงภาพเป็น Base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentBookingId) return;

    setIsSubmitting(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 600; // บังคับกว้างสุด 600px เพื่อลดขนาดไฟล์
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = height * (MAX_WIDTH / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);
        
        // แปลงภาพเป็น JPEG และลดคุณภาพลงเหลือ 70% (0.7) ทำให้ไฟล์เล็กกว่า 1MB แน่นอน
        const base64String = canvas.toDataURL("image/jpeg", 0.7);
        
        const bookingRef = doc(db, "bookings", currentBookingId);
        updateDoc(bookingRef, {
          slipImageBase64: base64String,
          status: "uploaded" 
        }).then(() => {
          alert("อัปโหลดสลิปสำเร็จ! รอพนักงานตรวจสอบครับ");
          setCurrentBookingId(null); 
        }).catch((error) => {
          console.error(error);
          alert("เกิดข้อผิดพลาดในการอัปโหลด อาจจะไฟล์ใหญ่เกินไป");
        }).finally(() => {
          setIsSubmitting(false);
        });
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1000px", margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: "20px" }}>ระบบจองสนามกีฬา</h1>

      {currentBookingId ? (
        <div style={{ padding: "20px", border: "2px solid #0070f3", borderRadius: "8px", marginBottom: "20px", textAlign: "center" }}>
          <h2>แนบสลิปโอนเงิน (ฟรี 100%)</h2>
          <p>รหัสการจอง: {currentBookingId}</p>
          <p style={{ color: "red" }}>กรุณาอัปโหลดภายใน 15 นาที</p>
          
          <input 
            type="file" 
            accept="image/*" 
            style={{ margin: "20px 0" }}
            onChange={handleFileUpload}
            disabled={isSubmitting}
          />
          <br />
          {isSubmitting && <p style={{ color: "orange" }}>กำลังบีบอัดและอัปโหลดรูปภาพ...</p>}
          <button onClick={() => setCurrentBookingId(null)} disabled={isSubmitting} style={btnStyle(false)}>
            ยกเลิก (จองใหม่)
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", justifyContent: "center" }}>
            <button onClick={() => setSportType("badminton")} style={btnStyle(sportType === "badminton")}>แบดมินตัน</button>
            <button onClick={() => setSportType("futsal")} style={btnStyle(sportType === "futsal")}>ฟุตซอล</button>
            <button onClick={() => setSportType("swimming_pool")} style={btnStyle(sportType === "swimming_pool")}>สระว่ายน้ำ</button>
          </div>

          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            selectable={true}
            selectMirror={true}
            allDaySlot={false}
            slotDuration="01:00:00"
            validRange={{ start: today, end: maxDate }}
            select={handleDateSelect}
          />
        </>
      )}
    </div>
  );
}

const btnStyle = (isActive: boolean) => ({
  padding: "10px 20px",
  backgroundColor: isActive ? "#0070f3" : "#eaeaea",
  color: isActive ? "white" : "black",
  border: "none",
  borderRadius: "5px",
  cursor: "pointer",
});