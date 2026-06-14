from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class PersonalInfo(BaseModel):
    full_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    height_cm: Optional[str] = None
    weight_kg: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None


class EmergencyContact(BaseModel):
    name: Optional[str] = None
    relation: Optional[str] = None
    phone: Optional[str] = None


class ConditionItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    diagnosed_year: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class SurgeryItem(BaseModel):
    procedure: str = Field(..., min_length=1, max_length=200)
    hospital: Optional[str] = None
    date: Optional[str] = None
    notes: Optional[str] = None


class MedicationItem(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    prescribed_by: Optional[str] = None
    start_date: Optional[str] = None
    reason: Optional[str] = None


class AllergyItem(BaseModel):
    allergen: str = Field(..., min_length=1, max_length=200)
    reaction: Optional[str] = None
    severity: Optional[str] = None


class ProfileUpdate(BaseModel):
    personal: PersonalInfo = Field(default_factory=PersonalInfo)
    emergency_contact: EmergencyContact = Field(default_factory=EmergencyContact)
    chronic_conditions: list[ConditionItem] = Field(default_factory=list)
    surgeries: list[SurgeryItem] = Field(default_factory=list)
    current_medications: list[MedicationItem] = Field(default_factory=list)
    allergies: list[AllergyItem] = Field(default_factory=list)
    doctor_notes: Optional[str] = None


class ProfileResponse(ProfileUpdate):
    updated_at: Optional[datetime] = None
