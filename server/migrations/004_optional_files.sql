-- Applicant photo and RC copy are no longer mandatory at registration time.
ALTER TABLE registrations ALTER COLUMN rc_copy_path DROP NOT NULL;
ALTER TABLE registrations ALTER COLUMN applicant_photo_path DROP NOT NULL;
