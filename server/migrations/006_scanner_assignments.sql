-- A district_scanner is assigned one or more checkpoints (the scanner UI only
-- lets them pick from those). Officers may also be tagged with the police
-- station they belong to, for display.

CREATE TABLE user_district_checkpoints (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    district_checkpoint_id INT NOT NULL REFERENCES district_checkpoints(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, district_checkpoint_id)
);

-- Carry over any single assignment set the old way.
INSERT INTO user_district_checkpoints (user_id, district_checkpoint_id)
SELECT id, district_checkpoint_id
FROM users
WHERE role = 'district_scanner' AND district_checkpoint_id IS NOT NULL
ON CONFLICT DO NOTHING;
