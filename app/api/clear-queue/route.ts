import { NextResponse } from 'next/server';
import { collection, query, where, getDocs, updateDoc, doc } from "firebase/firestore";
import { signInWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "../../../lib/firebase";

// บังคับให้ Next.js รันโค้ดใหม่ทุกครั้งที่ถูกเรียก (ห้ามจำ Cache)
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. ให้ API แอบล็อกอินด้วยสิทธิ์ Admin เพื่อให้มีสิทธิ์แก้ไขฐานข้อมูล
    await signInWithEmailAndPassword(auth, "admin555@email.com", "ad555min");

    const now = new Date();

    // 2. ค้นหาคิวทั้งหมดที่สถานะเป็น pending และเวลา expiresAt น้อยกว่าเวลาปัจจุบัน
    const q = query(
      collection(db, "bookings"),
      where("status", "==", "pending"),
      where("expiresAt", "<", now)
    );

    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return NextResponse.json({ success: true, message: "ไม่มีคิวหมดเวลาในขณะนี้" });
    }

    // 3. จับคิวที่หมดเวลาทั้งหมดมาเปลี่ยนสถานะเป็น cancelled
    const promises = snapshot.docs.map((document) =>
      updateDoc(doc(db, "bookings", document.id), { status: "cancelled" })
    );

    await Promise.all(promises);

    return NextResponse.json({ 
      success: true, 
      message: `กวาดล้างและยกเลิกคิวที่หมดเวลาจำนวน ${promises.length} คิว เรียบร้อยแล้ว!` 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}