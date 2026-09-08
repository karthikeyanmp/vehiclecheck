-- Master data: Thanjavur-district police stations and border check posts.
-- (Historic Madurai sample rows were retired in 008_thanjavur_master_data.sql.)

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
ON CONFLICT DO NOTHING;

-- Each check post's name carries its managing police station in brackets.
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
ON CONFLICT DO NOTHING;

-- The initial admin account is NOT created here (a hand-typed bcrypt hash in
-- SQL is a good way to lock yourself out). Run `npm run seed:admin` instead —
-- see server/scripts/seed-admin.js — which hashes a real password for you.
