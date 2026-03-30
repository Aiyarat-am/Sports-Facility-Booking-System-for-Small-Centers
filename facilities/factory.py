# facilities/factory.py
from abc import ABC, abstractmethod

class SportFacility(ABC):
    """Abstract Base Class สำหรับทุกประเภทสนาม"""
    
    @abstractmethod
    def calculate_price(self, hours: int, is_peak: bool) -> float:
        pass
    
    @abstractmethod
    def get_max_players(self) -> int:
        pass
    
    @abstractmethod
    def get_equipment_list(self) -> list[str]:
        pass

class BadmintonCourt(SportFacility):
    BASE_PRICE = 120  # บาท/ชั่วโมง
    
    def calculate_price(self, hours: int, is_peak: bool) -> float:
        rate = self.BASE_PRICE * (1.5 if is_peak else 1.0)
        return hours * rate
    
    def get_max_players(self) -> int:
        return 4
    
    def get_equipment_list(self) -> list[str]:
        return ["ตาข่าย", "ไฟสนาม", "ที่นั่งรอ"]

class FutsalCourt(SportFacility):
    BASE_PRICE = 500  # บาท/ชั่วโมง
    
    def calculate_price(self, hours: int, is_peak: bool) -> float:
        rate = self.BASE_PRICE * (1.3 if is_peak else 1.0)
        return hours * rate
    
    def get_max_players(self) -> int:
        return 10

    def get_equipment_list(self) -> list[str]:
        return ["ประตู", "ไฟสปอตไลท์", "กระดานคะแนน"]

class FacilityFactory:
    """Factory — สร้าง Object ตามประเภทที่ระบุ"""
    _registry = {
        "badminton": BadmintonCourt,
        "futsal":    FutsalCourt,
        # เพิ่มประเภทใหม่ได้โดยไม่แก้ Code เดิม
    }
    
    @classmethod
    def create(cls, sport_type: str) -> SportFacility:
        facility_class = cls._registry.get(sport_type)
        if not facility_class:
            raise ValueError(f"Unknown sport type: {sport_type}")
        return facility_class()

# การใช้งาน
court = FacilityFactory.create("badminton")
price = court.calculate_price(hours=2, is_peak=True)  # 360 บาท