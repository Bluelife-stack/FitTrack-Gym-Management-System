-- FitTrack PostgreSQL schema. Run with: pnpm db:init
CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL CHECK (length(trim(full_name)) >= 2),
  phone VARCHAR(20) NOT NULL UNIQUE CHECK (length(trim(phone)) >= 7),
  email VARCHAR(255) UNIQUE,
  joined_on DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS membership_plans (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  price NUMERIC(10,2) NOT NULL CHECK (price > 0),
  duration_days INTEGER NOT NULL CHECK (duration_days BETWEEN 1 AND 3650),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS memberships (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  plan_id BIGINT NOT NULL REFERENCES membership_plans(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);
CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  check_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, check_in_date)
);
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
  membership_id BIGINT NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','upi','card','bank')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, member_id)
);
-- Ensures a payment can only reference a membership owned by its member.
CREATE UNIQUE INDEX IF NOT EXISTS memberships_id_member_id_uq ON memberships (id, member_id);
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_membership_member_fk;
ALTER TABLE payments ADD CONSTRAINT payments_membership_member_fk FOREIGN KEY (membership_id, member_id)
  REFERENCES memberships(id, member_id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS memberships_end_date_idx ON memberships (end_date);
CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance (check_in_date);
CREATE INDEX IF NOT EXISTS payments_date_idx ON payments (payment_date);
