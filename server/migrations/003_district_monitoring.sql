-- District entry/exit monitoring: a separate checkpoint type from the
-- Madurai event gates, for tracking a vehicle leaving and returning through
-- its *home* district's border (e.g. a Thanjavur checkpoint watching
-- vehicles head out to the event and come back). Same QR/permit as the
-- event gates — this just tracks an independent status on the same
-- registration, the way scan_log/current_status already do for the event.
--
-- Only a Thanjavur checkpoint is seeded below. Adding another district is
-- just an INSERT into district_checkpoints plus a district_scanner account
-- tied to it — no code change needed.

CREATE TABLE district_checkpoints (
    id SERIAL PRIMARY KEY,
    district TEXT NOT NULL,
    name TEXT NOT NULL,
    UNIQUE (district, name)
);

ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'registrar', 'gate_scanner', 'district_scanner'));

ALTER TABLE users ADD COLUMN district_checkpoint_id INT REFERENCES district_checkpoints(id);
ALTER TABLE users ADD CONSTRAINT chk_district_scanner_checkpoint
    CHECK (role <> 'district_scanner' OR district_checkpoint_id IS NOT NULL);

ALTER TABLE registrations ADD COLUMN district_status TEXT NOT NULL DEFAULT 'not_departed'
    CHECK (district_status IN ('not_departed', 'departed', 'returned'));

-- append-only audit trail, mirroring scan_log
CREATE TABLE district_scan_log (
    id SERIAL PRIMARY KEY,
    registration_id UUID NOT NULL REFERENCES registrations(id),
    action TEXT NOT NULL CHECK (action IN ('departed', 'returned')),
    scanned_by INT NOT NULL REFERENCES users(id),
    district_checkpoint_id INT NOT NULL REFERENCES district_checkpoints(id),
    district_mismatch BOOLEAN NOT NULL DEFAULT false, -- true if the registration's home district isn't this checkpoint's district
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_district_scan_log_registration ON district_scan_log(registration_id);

INSERT INTO district_checkpoints (district, name) VALUES
    ('Thanjavur', 'Thanjavur District Checkpoint')
ON CONFLICT DO NOTHING;
