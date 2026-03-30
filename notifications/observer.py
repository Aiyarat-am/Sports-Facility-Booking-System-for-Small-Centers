# notifications/observer.py
from abc import ABC, abstractmethod

class BookingObserver(ABC):
    """Interface สำหรับทุก Notification Channel"""
    
    @abstractmethod
    def on_booking_event(self, event: str, booking: dict) -> None:
        pass

class EmailNotifier(BookingObserver):
    def on_booking_event(self, event: str, booking: dict) -> None:
        if event == "CONFIRMED":
            print(f"[Email] ส่งยืนยันการจองถึง {booking['email']}")
            # send_email(to=booking['email'], template="booking_confirmed")

class SMSNotifier(BookingObserver):
    def on_booking_event(self, event: str, booking: dict) -> None:
        if event in ("CONFIRMED", "CANCELLED"):
            print(f"[SMS] ส่ง SMS ถึง {booking['phone']}: {event}")

class LINENotifier(BookingObserver):
    def on_booking_event(self, event: str, booking: dict) -> None:
        print(f"[LINE] Push message ถึง LINE User: {booking['line_uid']}")

class BookingService:
    """Subject — แจ้ง Observer ทุกตัวเมื่อสถานะเปลี่ยน"""
    
    def __init__(self):
        self._observers: list[BookingObserver] = []
    
    def subscribe(self, observer: BookingObserver) -> None:
        self._observers.append(observer)
    
    def unsubscribe(self, observer: BookingObserver) -> None:
        self._observers.remove(observer)
    
    def _notify(self, event: str, booking: dict) -> None:
        for observer in self._observers:
            observer.on_booking_event(event, booking)
    
    def confirm_booking(self, booking: dict) -> None:
        # ... Business logic การอนุมัติจาก DB ...
        booking["status"] = "CONFIRMED"
        self._notify("CONFIRMED", booking)  # แจ้งทุก Channel พร้อมกัน

# Setup ตอน App เริ่มต้น
service = BookingService()  
service.subscribe(EmailNotifier())
service.subscribe(SMSNotifier())
service.subscribe(LINENotifier())

# เมื่อ Admin อนุมัติการจอง
service.confirm_booking({"email": "user@example.com", 
                         "phone": "0812345678", 
                         "line_uid": "Uxxx"})