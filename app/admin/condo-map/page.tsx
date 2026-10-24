import type { Metadata } from "next";
import { canAccessAdmin } from "@/lib/admin";
import { readCondoMapIndex } from "@/lib/condo-map/condo-map-files";
import { mapboxPublicToken } from "@/lib/condo-map/mapbox-token";
import { AdminPageHeader } from "../AdminPageHeader";
import { adminTitle } from "../admin-navigation";
import { auth } from "../admin-session";
import { CondoMapExplorer } from "./CondoMapExplorer";

export const metadata: Metadata = { title: adminTitle("Condo map") };

/**
 * The condo map, for admins (unlisted: not in the admin menu yet). The developments come from catalog/condo-map, exported
 * from the floor-plan masters; the Mapbox token is read here, on the server, and must be a public one.
 */
export default async function AdminCondoMapPage() {
  const session = await auth();
  if (!canAccessAdmin(session?.user?.email)) return null;
  const developments = await readCondoMapIndex();
  return (
    <div className="p-6">
      <AdminPageHeader
        crumbs={[{ title: "Condo map" }]}
        title="Condo map"
        description="The developments from the floor-plan masters on their sites: choose a floor to see its units, or a unit for its plan."
      />
      <CondoMapExplorer developments={developments} token={mapboxPublicToken()} />
    </div>
  );
}
