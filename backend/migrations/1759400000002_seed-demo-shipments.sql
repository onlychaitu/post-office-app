-- Up Migration

-- Demo data so the app is not empty on first start: 30 shipments between the seeded
-- post offices, spread over ~17 days, in all three statuses with consistent history.
-- Deterministic (no randomness). Skipped entirely if any shipment already exists.
-- Production deployments should leave this migration out.

WITH zips AS (
  SELECT ARRAY['10001', '11201', '02108', '19104', '20001', '30301', '60601', '94105'] AS z
),
demo AS (
  SELECT
    g.i,
    'SHP-' || lpad(g.i::text, 10, '0')                                         AS shipment_number,
    CASE WHEN g.i % 2 = 0 THEN 'PACKAGE' ELSE 'LETTER' END                    AS type,
    (ARRAY['LESS_THAN_1KG', 'BETWEEN_1_AND_5KG', 'MORE_THAN_5KG'])[1 + g.i % 3] AS weight_category,
    o.id                                                                        AS origin_id,
    d.id                                                                        AS destination_id,
    CASE WHEN g.i % 4 = 0 THEN 'DELIVERED'
         WHEN g.i % 3 = 0 THEN 'RECEIVED_AT_DESTINATION'
         ELSE 'RECEIVED_AT_ORIGIN' END                                         AS status,
    now() - (31 - g.i) * interval '14 hours'                                   AS created_at
  FROM generate_series(1, 30) AS g(i)
  CROSS JOIN zips
  CROSS JOIN LATERAL (
    SELECT (g.i - 1) % 8 AS o_idx,
           CASE WHEN (g.i - 1) % 8 = ((g.i - 1) * 3 + 1) % 8
                THEN ((g.i - 1) + 4) % 8
                ELSE ((g.i - 1) * 3 + 1) % 8 END AS d_idx
  ) AS idx
  JOIN post_office o ON o.zip_code = zips.z[idx.o_idx + 1]
  JOIN post_office d ON d.zip_code = zips.z[idx.d_idx + 1]
  WHERE NOT EXISTS (SELECT 1 FROM shipment)
),
inserted_shipments AS (
  INSERT INTO shipment
    (shipment_number, type, weight_category, origin_post_office_id, destination_post_office_id,
     current_status, created_at, updated_at)
  SELECT shipment_number, type, weight_category, origin_id, destination_id, status, created_at,
         created_at + CASE status WHEN 'DELIVERED' THEN interval '10 hours'
                                  WHEN 'RECEIVED_AT_DESTINATION' THEN interval '6 hours'
                                  ELSE interval '0' END
  FROM demo
  RETURNING shipment_number
)
INSERT INTO shipment_status_history (shipment_number, status, post_office_id, timestamp)
SELECT shipment_number, 'RECEIVED_AT_ORIGIN', origin_id, created_at FROM demo
UNION ALL
SELECT shipment_number, 'RECEIVED_AT_DESTINATION', destination_id, created_at + interval '6 hours'
  FROM demo WHERE status IN ('RECEIVED_AT_DESTINATION', 'DELIVERED')
UNION ALL
SELECT shipment_number, 'DELIVERED', destination_id, created_at + interval '10 hours'
  FROM demo WHERE status = 'DELIVERED';

-- Continue numbering after the demo shipments (never moves the sequence backwards).
SELECT setval('shipment_seq', GREATEST(30, (SELECT last_value FROM shipment_seq)));

-- Down Migration

DELETE FROM shipment
WHERE shipment_number IN (SELECT 'SHP-' || lpad(i::text, 10, '0') FROM generate_series(1, 30) AS g(i));
