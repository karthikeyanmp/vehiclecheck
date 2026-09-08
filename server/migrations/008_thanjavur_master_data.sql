-- Real Thanjavur-district master data, replacing the Madurai sample rows from
-- 002_seed. Safe to run on an existing deployment: new rows are added
-- idempotently, and the old sample rows are removed only where nothing
-- (a registration, a user account, a scan) still points at them.

-- Police stations — the "registering station" dropdown.
INSERT INTO police_stations (district, station_name) VALUES
    ('Thanjavur', 'Thiruvaiyaru'),
    ('Thanjavur', 'Sengipatti'),
    ('Thanjavur', 'Swamimalai'),
    ('Thanjavur', 'Thiruppanandal'),
    ('Thanjavur', 'Vallam'),
    ('Thanjavur', 'Thiruvonam'),
    ('Thanjavur', 'Tiruchitrambalam'),
    ('Thanjavur', 'SB Chatram'),
    ('Thanjavur', 'Ammapettai'),
    ('Thanjavur', 'Thiruvidaimaruthur'),
    ('Thanjavur', 'Thanjavur Town'),
    ('Thanjavur', 'Orathanadu'),
    ('Thanjavur', 'Pattukkottai'),
    ('Thanjavur', 'Kumbakonam'),
    ('Thanjavur', 'Papanasam')
ON CONFLICT (district, station_name) DO NOTHING;

-- Border check posts — the "allowed entry / exit point" dropdown. Each name
-- carries its managing police station in brackets.
INSERT INTO entry_points (name, district) VALUES
    ('Vilangudi (Thiruvaiyaru)', 'Thanjavur'),
    ('Pudukudi (Sengipatti)', 'Thanjavur'),
    ('Neelathanallur (Swamimalai)', 'Thanjavur'),
    ('Anaikarai (Thiruppanandal)', 'Thanjavur'),
    ('Arputhapuram (Vallam)', 'Thanjavur'),
    ('Moovar Road (Thiruvonam)', 'Thanjavur'),
    ('Avanam (Tiruchitrambalam)', 'Thanjavur'),
    ('Vilankulam (SB Chatram)', 'Thanjavur'),
    ('Pallavarayanpettai (Ammapettai)', 'Thanjavur'),
    ('Narasingampettai (Tiruvidaimarudur)', 'Thanjavur')
ON CONFLICT (name, district) DO NOTHING;

-- Remove the Madurai sample check posts where unreferenced.
DELETE FROM entry_points AS ep
WHERE ep.district = 'Madurai'
  AND ep.name IN (
    'Karaikudi Road', 'Sivagangai Road', 'Manamadurai Road',
    'Parthipanur Road', 'Paramakudi Road'
  )
  AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.allowed_entry_point_id = ep.id)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.entry_point_id = ep.id)
  AND NOT EXISTS (SELECT 1 FROM scan_log s WHERE s.entry_point_id = ep.id);

-- Remove the sample police stations where unreferenced.
DELETE FROM police_stations AS ps
WHERE ps.station_name IN ('Madurai East', 'Madurai West', 'Karaikudi', 'Sivagangai Town', 'Paramakudi')
  AND ps.district IN ('Madurai', 'Sivaganga', 'Ramanathapuram')
  AND NOT EXISTS (SELECT 1 FROM registrations r WHERE r.police_station_id = ps.id)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.police_station_id = ps.id);
