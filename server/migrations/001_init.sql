-- Emmanuel Sekaran Remembrance Day vehicle-permit platform
-- Core schema. Run once against a fresh Postgres database.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE police_stations (
    id SERIAL PRIMARY KEY,
    district TEXT NOT NULL,
    station_name TEXT NOT NULL,
    UNIQUE (district, station_name)
);

CREATE TABLE entry_points (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    district TEXT NOT NULL DEFAULT 'Madurai',
    UNIQUE (name, district)
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'registrar', 'gate_scanner')),
    police_station_id INT REFERENCES police_stations(id),
    entry_point_id INT REFERENCES entry_points(id),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- a registrar must belong to a station; a gate_scanner must belong to an entry point
ALTER TABLE users ADD CONSTRAINT chk_registrar_station
    CHECK (role <> 'registrar' OR police_station_id IS NOT NULL);
ALTER TABLE users ADD CONSTRAINT chk_gate_entry_point
    CHECK (role <> 'gate_scanner' OR entry_point_id IS NOT NULL);

CREATE SEQUENCE permit_number_seq START 1;

CREATE TABLE registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_number TEXT NOT NULL,
    vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('two_wheeler', 'four_wheeler')),
    rc_copy_path TEXT NOT NULL,
    applicant_photo_path TEXT NOT NULL,
    applicant_name TEXT NOT NULL,
    applicant_age INT,
    applicant_mobile TEXT NOT NULL,
    district TEXT NOT NULL,
    police_station_id INT NOT NULL REFERENCES police_stations(id),
    num_persons_traveling INT NOT NULL DEFAULT 1,
    allowed_entry_point_id INT NOT NULL REFERENCES entry_points(id),
    registered_by INT NOT NULL REFERENCES users(id),
    current_status TEXT NOT NULL DEFAULT 'not_arrived'
        CHECK (current_status IN ('not_arrived', 'verified_entered', 'verified_exited')),
    qr_token TEXT UNIQUE NOT NULL,
    permit_number TEXT UNIQUE NOT NULL, -- human-readable serial printed alongside the QR
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_registrations_station ON registrations(police_station_id);
CREATE INDEX idx_registrations_entry_point ON registrations(allowed_entry_point_id);
CREATE INDEX idx_registrations_status ON registrations(current_status);
CREATE INDEX idx_registrations_vehicle_number ON registrations(vehicle_number);
CREATE INDEX idx_registrations_mobile ON registrations(applicant_mobile);

CREATE TABLE co_passengers (
    id SERIAL PRIMARY KEY,
    registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    age INT,
    gender TEXT
);

-- append-only audit trail of every gate scan
CREATE TABLE scan_log (
    id SERIAL PRIMARY KEY,
    registration_id UUID NOT NULL REFERENCES registrations(id),
    action TEXT NOT NULL CHECK (action IN ('verified_entered', 'verified_exited')),
    scanned_by INT NOT NULL REFERENCES users(id),
    entry_point_id INT NOT NULL REFERENCES entry_points(id),
    gate_mismatch BOOLEAN NOT NULL DEFAULT false, -- true if scanned at a different gate than allowed_entry_point_id
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_log_registration ON scan_log(registration_id);

-- append-only audit trail of admin edits to registrations
CREATE TABLE admin_edit_log (
    id SERIAL PRIMARY KEY,
    registration_id UUID NOT NULL REFERENCES registrations(id),
    edited_by INT NOT NULL REFERENCES users(id),
    changes JSONB NOT NULL, -- {field: {old, new}, ...}
    edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_registrations_updated_at
    BEFORE UPDATE ON registrations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
