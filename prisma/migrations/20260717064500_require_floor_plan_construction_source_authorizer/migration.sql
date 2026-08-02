-- Applied construction-source rows without an authorizing admin must continue
-- to fail closed in application parsing. This NOT VALID constraint protects
-- every new/updated row without inventing an actor for any pre-existing data.
ALTER TABLE "FloorPlanConstructionSource"
  ADD CONSTRAINT "FloorPlanConstructionSource_authorizedByEmail_check"
  CHECK (
    "authorizedByEmail" IS NOT NULL AND
    btrim("authorizedByEmail") <> ''
  ) NOT VALID;
