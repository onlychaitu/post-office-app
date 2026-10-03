-- Up Migration

CREATE TABLE post_office (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zip_code  VARCHAR(20)  NOT NULL UNIQUE,
  name      VARCHAR(200) NOT NULL,
  address   VARCHAR(500) NOT NULL
);

-- Shipment numbers come from a sequence: unique by construction, no app-side
-- generation or collision retries. Format: SHP-0000000001.
CREATE SEQUENCE shipment_seq;

CREATE TABLE shipment (
  shipment_number            VARCHAR(32) PRIMARY KEY
                             DEFAULT ('SHP-' || lpad(nextval('shipment_seq')::text, 10, '0')),
  type                       VARCHAR(20) NOT NULL
                             CHECK (type IN ('LETTER', 'PACKAGE')),
  weight_category            VARCHAR(30) NOT NULL
                             CHECK (weight_category IN ('LESS_THAN_1KG', 'BETWEEN_1_AND_5KG', 'MORE_THAN_5KG')),
  origin_post_office_id      BIGINT NOT NULL REFERENCES post_office (id) ON DELETE CASCADE,
  destination_post_office_id BIGINT NOT NULL REFERENCES post_office (id) ON DELETE CASCADE,
  current_status             VARCHAR(30) NOT NULL
                             CHECK (current_status IN ('RECEIVED_AT_ORIGIN', 'RECEIVED_AT_DESTINATION', 'DELIVERED')),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shipment_origin_destination_differ
    CHECK (origin_post_office_id <> destination_post_office_id)
);

CREATE TABLE shipment_status_history (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_number  VARCHAR(32) NOT NULL REFERENCES shipment (shipment_number) ON DELETE CASCADE,
  status           VARCHAR(30) NOT NULL
                   CHECK (status IN ('RECEIVED_AT_ORIGIN', 'RECEIVED_AT_DESTINATION', 'DELIVERED')),
  post_office_id   BIGINT NOT NULL REFERENCES post_office (id) ON DELETE CASCADE,
  timestamp        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes. PKs and UNIQUE constraints are indexed implicitly; Postgres does not
-- index foreign key columns, so those are added explicitly.
CREATE INDEX idx_shipment_created_at   ON shipment (created_at DESC);
CREATE INDEX idx_shipment_origin       ON shipment (origin_post_office_id);
CREATE INDEX idx_shipment_destination  ON shipment (destination_post_office_id);
CREATE INDEX idx_shipment_status       ON shipment (current_status);
CREATE INDEX idx_history_shipment_time ON shipment_status_history (shipment_number, timestamp);
CREATE INDEX idx_history_post_office   ON shipment_status_history (post_office_id);

-- Down Migration

DROP TABLE shipment_status_history;
DROP TABLE shipment;
DROP SEQUENCE shipment_seq;
DROP TABLE post_office;
