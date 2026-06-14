-- Store the canonical multi-room design snapshot while keeping legacy fields
-- for backward compatibility with older single-room records and APIs.
ALTER TABLE "Design" ADD COLUMN "snapshot" JSONB;
