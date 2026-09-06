-- Thanjavur has several exit/return points. A district_scanner account is no
-- longer pinned to one checkpoint — the officer picks which checkpoint they're
-- at from a dropdown, sent with each scan. district_checkpoint_id stays as an
-- optional "default checkpoint" for convenience.
ALTER TABLE users DROP CONSTRAINT chk_district_scanner_checkpoint;

-- A few example Thanjavur exit/return points. Rename/remove these in
-- Admin → Master Data to match the real checkpoints.
INSERT INTO district_checkpoints (district, name) VALUES
    ('Thanjavur', 'Thanjavur – Trichy Road'),
    ('Thanjavur', 'Thanjavur – Kumbakonam Road'),
    ('Thanjavur', 'Thanjavur – Pattukkottai Road'),
    ('Thanjavur', 'Thanjavur – Madurai Road')
ON CONFLICT DO NOTHING;
