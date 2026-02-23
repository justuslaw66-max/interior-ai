import { prisma } from "@/lib/prisma";
import { legacyApiToSnapshot } from "@/lib/room-persistence";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
import Link from "next/link";
import ExportTracking from "./ExportTracking";
import PrintButton from "./PrintButton";
import ShoppingList from "./ShoppingList";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Design Export",
};

export default async function ExportPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  const design = await prisma.design.findFirst({
    where: { shareToken, shareEnabled: true },
    select: {
      id: true,
      title: true,
      roomWidth: true,
      roomDepth: true,
      items: true,
      zones: true,
      savedViews: true,
      style: true,
      budget: true,
      notes: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  if (!design) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-xl border bg-white p-6">
          <div className="text-lg font-semibold">Link not available</div>
          <div className="text-sm text-neutral-600">
            This share link is disabled or invalid.
          </div>
        </div>
      </main>
    );
  }

  // Convert to v3 format
  const designSnapshot: DesignSnapshot = legacyApiToSnapshot({
    id: design.id,
    title: design.title,
    roomWidth: design.roomWidth,
    roomDepth: design.roomDepth,
    items: design.items as any[],
    zones: (design.zones as any[]) || [],
    savedViews: (design.savedViews as any[]) || [],
  });

  const rooms = designSnapshot.rooms || [];

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
        }
      `}</style>

      <main className="min-h-screen bg-white">
        <ExportTracking shareToken={shareToken} designId={design.id} />
        
        {/* Header - No Print */}
        <div className="no-print sticky top-0 z-10 border-b bg-white px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <div>
              <Link
                href={`/share/${shareToken}`}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                ← Back to 3D View
              </Link>
            </div>
            <PrintButton shareToken={shareToken} designId={design.id} />
          </div>
        </div>

        {/* Export Pack Content */}
        <div className="mx-auto max-w-4xl px-6 py-12">
          {/* Cover */}
          <div className="mb-12">
            <h1 className="mb-2 text-4xl font-bold text-gray-900">{design.title}</h1>
            <div className="text-sm text-gray-600">
              <div>Created: {new Date(design.createdAt).toLocaleDateString()}</div>
              {design.user?.name && <div>Prepared by: {design.user.name}</div>}
              {design.style && <div>Style: {design.style}</div>}
              {design.budget && <div>Budget: {design.budget}</div>}
            </div>
          </div>

          {/* Rooms & Views */}
          {rooms.map((room: RoomSnapshot, index: number) => (
            <div key={room.id} className={index > 0 ? "page-break mt-12" : "mb-12"}>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">{room.name}</h2>
              
              {/* Room Details */}
              <div className="mb-4 text-sm text-gray-600">
                <div>Dimensions: {room.geometry.width}m × {room.geometry.depth}m</div>
                <div>Type: {room.roomType}</div>
              </div>

              {/* Saved Views */}
              {room.savedViews && room.savedViews.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-2 text-lg font-semibold text-gray-800">Saved Views</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {room.savedViews.map((view: any) => (
                      <div
                        key={view.name}
                        className="rounded-lg border bg-gray-50 p-4"
                      >
                        <div className="text-sm font-medium text-gray-700">{view.name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          View position: {view.pos?.[0]?.toFixed(1)}, {view.pos?.[1]?.toFixed(1)}, {view.pos?.[2]?.toFixed(1)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shopping List for this Room */}
              <ShoppingList items={room.items} roomName={room.name} />
            </div>
          ))}

          {/* Design Notes */}
          {design.notes && (
            <div className="page-break mb-12">
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Design Notes</h2>
              <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                {design.notes}
              </div>
            </div>
          )}

          {/* Practical Checks */}
          <div className="mb-12">
            <h2 className="mb-4 text-2xl font-bold text-gray-900">Practical Checks</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>Walkways: Clear and accessible</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-green-600">✓</span>
                <span>Clearances: Adequate space around furniture</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-600">ℹ</span>
                <span>Rug sizing: Review in 3D view for final placement</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t pt-6 text-center text-xs text-gray-500">
            <div>Created with Interior AI</div>
            <div className="mt-1">{new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </main>
    </>
  );
}
