-- Collapse the two "check post" systems into one: entry_points (the 10 real
-- Thanjavur border check posts). The district departure/return scanning flow
-- moves onto it. The legacy district_checkpoints list, the gate_scanner event
-- flow, scan_log and current_status are left in place but no longer used by
-- the app — nothing is dropped, so this is reversible and loses no history.

-- Officer -> check post assignments (multi), replacing user_district_checkpoints.
CREATE TABLE IF NOT EXISTS user_check_posts (
    user_id        INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_point_id INT NOT NULL REFERENCES entry_points(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, entry_point_id)
);

-- Carry existing district-officer assignments across, matching by name
-- (the real check posts share a name across both tables). Officers whose old
-- checkpoint was a legacy-only row end up unassigned for an admin to fix.
INSERT INTO user_check_posts (user_id, entry_point_id)
SELECT udc.user_id, ep.id
FROM user_district_checkpoints udc
JOIN district_checkpoints dc ON dc.id = udc.district_checkpoint_id
JOIN entry_points ep ON ep.name = dc.name
ON CONFLICT DO NOTHING;

-- The district scan log now records which check post; keep the old column
-- nullable for history.
ALTER TABLE district_scan_log ADD COLUMN IF NOT EXISTS entry_point_id INT REFERENCES entry_points(id);
ALTER TABLE district_scan_log ALTER COLUMN district_checkpoint_id DROP NOT NULL;

UPDATE district_scan_log dsl
SET entry_point_id = ep.id
FROM district_checkpoints dc
JOIN entry_points ep ON ep.name = dc.name
WHERE dsl.district_checkpoint_id = dc.id
  AND dsl.entry_point_id IS NULL;

-- New check posts default to the Thanjavur district now, not Madurai.
ALTER TABLE entry_points ALTER COLUMN district SET DEFAULT 'Thanjavur';
