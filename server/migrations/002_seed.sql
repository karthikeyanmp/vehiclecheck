-- Sample master data (Madurai entry points for Emmanuel Sekaran Remembrance Day,
-- plus a few example police stations). Edit to match the real list before go-live.

INSERT INTO entry_points (name, district) VALUES
    ('Karaikudi Road', 'Madurai'),
    ('Sivagangai Road', 'Madurai'),
    ('Manamadurai Road', 'Madurai'),
    ('Parthipanur Road', 'Madurai'),
    ('Paramakudi Road', 'Madurai')
ON CONFLICT DO NOTHING;

INSERT INTO police_stations (district, station_name) VALUES
    ('Madurai', 'Madurai East'),
    ('Madurai', 'Madurai West'),
    ('Sivaganga', 'Karaikudi'),
    ('Sivaganga', 'Sivagangai Town'),
    ('Ramanathapuram', 'Paramakudi')
ON CONFLICT DO NOTHING;

-- The initial admin account is NOT created here (a hand-typed bcrypt hash in
-- SQL is a good way to lock yourself out). Run `npm run seed:admin` instead —
-- see server/scripts/seed-admin.js — which hashes a real password for you.
