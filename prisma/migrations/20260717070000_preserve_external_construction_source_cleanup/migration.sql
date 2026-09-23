-- Construction-source removal is coordinated by the API/retention outbox.
-- Deleting the metadata row in an AFTER DELETE trigger would orphan S3 bytes
-- before a durable deletion request could reference them.
CREATE OR REPLACE FUNCTION "delete_orphan_floor_plan_construction_asset"()
RETURNS trigger AS $$
BEGIN
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
