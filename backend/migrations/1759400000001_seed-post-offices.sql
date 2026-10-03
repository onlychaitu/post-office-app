-- Up Migration

INSERT INTO post_office (zip_code, name, address) VALUES
  ('10001', 'Midtown Post Office',      '421 8th Ave, New York, NY'),
  ('11201', 'Brooklyn Heights Station', '271 Cadman Plaza E, Brooklyn, NY'),
  ('02108', 'Beacon Hill Post Office',  '25 Dorchester Ave, Boston, MA'),
  ('19104', 'University City Station',  '3015 Market St, Philadelphia, PA'),
  ('20001', 'Washington Main Office',   '900 Brentwood Rd NE, Washington, DC'),
  ('30301', 'Atlanta Downtown Station', '3900 Crown Rd SW, Atlanta, GA'),
  ('60601', 'Chicago Loop Post Office', '211 S Clinton St, Chicago, IL'),
  ('94105', 'Rincon Annex',             '180 Steuart St, San Francisco, CA')
ON CONFLICT (zip_code) DO NOTHING;

-- Down Migration

DELETE FROM post_office
WHERE zip_code IN ('10001', '11201', '02108', '19104', '20001', '30301', '60601', '94105');
