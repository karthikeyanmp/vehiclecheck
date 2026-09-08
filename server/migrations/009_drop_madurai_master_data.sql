-- Remove every Madurai check post (and the old Madurai/Sivaganga/Ramanathapuram
-- sample police stations), clearing the pre-go-live TEST data that pins them.
--
-- Before migration 008 the Madurai check posts were the ONLY entry-point
-- option, so every registration still pointing at one is test data from before
-- the real Thanjavur list existed — those are deleted here. User accounts are
-- kept but reassigned to a valid Thanjavur station / check post.

-- 1. Reassign any user account off a Madurai check post or an old sample station.
UPDATE users SET entry_point_id = (
    SELECT id FROM entry_points WHERE district = 'Thanjavur' ORDER BY name LIMIT 1)
WHERE entry_point_id IN (SELECT id FROM entry_points WHERE district = 'Madurai');

UPDATE users SET police_station_id = (
    SELECT id FROM police_stations WHERE district = 'Thanjavur' ORDER BY station_name LIMIT 1)
WHERE police_station_id IN (
    SELECT id FROM police_stations WHERE district IN ('Madurai', 'Sivaganga', 'Ramanathapuram'));

-- 2. Delete pre-go-live test registrations tied to a Madurai check post,
--    plus every row that hangs off them.
CREATE TEMP TABLE _doomed_regs ON COMMIT DROP AS
  SELECT id FROM registrations
  WHERE allowed_entry_point_id IN (SELECT id FROM entry_points WHERE district = 'Madurai');

DELETE FROM scan_log          WHERE registration_id IN (SELECT id FROM _doomed_regs);
DELETE FROM district_scan_log WHERE registration_id IN (SELECT id FROM _doomed_regs);
DELETE FROM admin_edit_log    WHERE registration_id IN (SELECT id FROM _doomed_regs);
DELETE FROM co_passengers     WHERE registration_id IN (SELECT id FROM _doomed_regs);
DELETE FROM registrations     WHERE id IN (SELECT id FROM _doomed_regs);

-- 3. Any stray scan_log row that still names a Madurai gate directly.
DELETE FROM scan_log WHERE entry_point_id IN (SELECT id FROM entry_points WHERE district = 'Madurai');

-- 4. Drop the master rows. entry_points is now unreferenced; police_stations is
--    guarded so a still-referenced station is left for manual cleanup.
DELETE FROM entry_points WHERE district = 'Madurai';

DELETE FROM police_stations
WHERE district IN ('Madurai', 'Sivaganga', 'Ramanathapuram')
  AND id NOT IN (SELECT police_station_id FROM registrations)
  AND id NOT IN (SELECT police_station_id FROM users WHERE police_station_id IS NOT NULL);
