-- Registration now also captures a photo of the vehicle itself (optional,
-- like the applicant photo and RC copy).
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS vehicle_photo_path TEXT;
