import { z } from "zod";

const roomTypeSchema = z.enum([
  "living",
  "bedroom",
  "dining",
  "kitchen",
  "toilet",
  "custom",
]);

const wallSchema = z.enum(["north", "south", "east", "west"]);
const floorPlanLibraryIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const floorPlanLibraryFloorRangeSchema = z
  .object({
    from: z.number().int().min(1).max(99),
    to: z.number().int().min(1).max(99),
  })
  .refine((range) => range.from <= range.to, {
    message: "Floor range must start at or before it ends.",
  });

const floorPlanLibraryUnitGroupSchema = z.object({
  stacks: z.array(z.string().regex(/^\d{2,5}[a-z]?$/i)).min(1),
  floor_ranges: z.array(floorPlanLibraryFloorRangeSchema).min(1),
  layout_ids: z.array(floorPlanLibraryIdSchema).min(1),
});

const floorPlanLibraryUnitDistributionSchema = z.object({
  status: z.enum(["partial", "verified"]),
  source_pdf_page: z.number().int().positive(),
  source_brochure_page: z.number().int().positive(),
  groups: z.array(floorPlanLibraryUnitGroupSchema).min(1),
});

const floorPlanLibraryPolygonPointSchema = z.object({
  x: z.number().finite(),
  z: z.number().finite(),
});

type FloorPlanLibraryPolygonPoint = z.infer<
  typeof floorPlanLibraryPolygonPointSchema
>;

function polygonArea(points: FloorPlanLibraryPolygonPoint[]): number {
  return Math.abs(
    points.reduce((total, point, index) => {
      const next = points[(index + 1) % points.length];
      return total + point.x * next.z - next.x * point.z;
    }, 0) / 2
  );
}

function segmentsIntersect(
  firstStart: FloorPlanLibraryPolygonPoint,
  firstEnd: FloorPlanLibraryPolygonPoint,
  secondStart: FloorPlanLibraryPolygonPoint,
  secondEnd: FloorPlanLibraryPolygonPoint
): boolean {
  const cross = (
    start: FloorPlanLibraryPolygonPoint,
    end: FloorPlanLibraryPolygonPoint,
    point: FloorPlanLibraryPolygonPoint
  ) =>
    (end.x - start.x) * (point.z - start.z) -
    (end.z - start.z) * (point.x - start.x);
  const firstSideStart = cross(firstStart, firstEnd, secondStart);
  const firstSideEnd = cross(firstStart, firstEnd, secondEnd);
  const secondSideStart = cross(secondStart, secondEnd, firstStart);
  const secondSideEnd = cross(secondStart, secondEnd, firstEnd);
  return (
    firstSideStart * firstSideEnd < -1e-8 &&
    secondSideStart * secondSideEnd < -1e-8
  );
}

function hasSelfIntersection(points: FloorPlanLibraryPolygonPoint[]): boolean {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstNext = (firstIndex + 1) % points.length;
    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const secondNext = (secondIndex + 1) % points.length;
      if (
        firstIndex === secondIndex ||
        firstNext === secondIndex ||
        secondNext === firstIndex
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          points[firstIndex],
          points[firstNext],
          points[secondIndex],
          points[secondNext]
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

const floorPlanLibraryRoomSchema = z
  .object({
    id: z.string().min(1),
    source_label: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    room_type: roomTypeSchema.optional(),
    shape: z
      .enum(["rectangle", "l_shape", "custom_polygon"])
      .default("rectangle"),
    width: z.number().positive().max(30),
    depth: z.number().positive().max(30),
    x: z.number().finite(),
    z: z.number().finite(),
    wall_thickness: z.number().min(0.05).max(0.6).optional(),
    plan_polygon: z.array(floorPlanLibraryPolygonPointSchema).min(3).optional(),
  })
  .superRefine((room, context) => {
    if (!room.source_label && (!room.name || !room.room_type)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Room ${room.id} needs source_label or an explicit name and room_type.`,
      });
    }

    if (room.shape === "custom_polygon" && !room.plan_polygon) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Custom polygon room ${room.id} needs plan_polygon.`,
      });
      return;
    }
    if (!room.plan_polygon) return;

    const uniquePoints = new Set(
      room.plan_polygon.map((point) => `${point.x.toFixed(6)}:${point.z.toFixed(6)}`)
    );
    if (uniquePoints.size < 3 || polygonArea(room.plan_polygon) <= 0.0001) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Room ${room.id} has a zero-area plan_polygon.`,
      });
    }
    if (hasSelfIntersection(room.plan_polygon)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Room ${room.id} has a self-intersecting plan_polygon.`,
      });
    }

    const xs = room.plan_polygon.map((point) => point.x);
    const zs = room.plan_polygon.map((point) => point.z);
    const polygonWidth = Math.max(...xs) - Math.min(...xs);
    const polygonDepth = Math.max(...zs) - Math.min(...zs);
    if (
      Math.abs(polygonWidth - room.width) > 0.02 ||
      Math.abs(polygonDepth - room.depth) > 0.02
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Room ${room.id} width/depth must match its plan_polygon bounds.`,
      });
    }
  });

const floorPlanLibraryDoorwaySchema = z.object({
  from_room_id: z.string().min(1),
  to_room_id: z.string().min(1).optional(),
  wall: wallSchema,
  offset_meters: z.number().finite().optional(),
  width_meters: z.number().positive().max(4).optional(),
  kind: z.enum(["door", "opening"]).default("door"),
});

const floorPlanLibraryWindowSchema = z.object({
  room_id: z.string().min(1),
  wall: wallSchema,
  offset_meters: z.number().finite().optional(),
  width_meters: z.number().positive().max(6).optional(),
});

const floorPlanLibraryReferenceZoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["exterior", "structural"]),
  width: z.number().positive().max(30),
  depth: z.number().positive().max(30),
  x: z.number().finite(),
  z: z.number().finite(),
  locked: z.boolean().default(true),
});

const floorPlanLibraryLayoutSchema = z
  .object({
    layout_id: floorPlanLibraryIdSchema,
    label: z.string().min(1),
    source_page: z.number().int().positive(),
    flat_type: z.string().min(1),
    bedroom_count: z.number().int().nonnegative().max(12),
    floor_area_sqm: z.number().positive().nullable(),
    applies_to_building_ids: z.array(z.string().min(1)).min(1),
    preview_url: z.string().regex(/^\/assets\/floor-plans\//),
    fidelity: z.literal("approximate_editable"),
    verification_note: z.string().min(1),
    template: z.object({
      summary: z.string().min(1),
      best_for: z.string().min(1),
      layout_type: z.enum(["studio", "one_bed", "two_bed", "flat", "adu"]),
      footprint: z.enum(["compact", "narrow", "wide", "corner", "long"]),
      tags: z.array(z.string().min(1)),
      zones: z.array(z.string().min(1)),
      real_life_checks: z.array(z.string().min(1)),
      rooms: z.array(floorPlanLibraryRoomSchema).min(1),
      doorways: z.array(floorPlanLibraryDoorwaySchema),
      windows: z.array(floorPlanLibraryWindowSchema),
      reference_zones: z.array(floorPlanLibraryReferenceZoneSchema).default([]),
    }),
  })
  .superRefine((layout, context) => {
    const roomIds = new Set<string>();
    for (const room of layout.template.rooms) {
      if (roomIds.has(room.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate room id: ${room.id}`,
        });
      }
      roomIds.add(room.id);
    }

    for (const doorway of layout.template.doorways) {
      if (
        !roomIds.has(doorway.from_room_id) ||
        (doorway.to_room_id !== undefined && !roomIds.has(doorway.to_room_id))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Doorway references an unknown room: ${doorway.from_room_id} -> ${doorway.to_room_id ?? "outside"}`,
        });
      }
    }

    for (const window of layout.template.windows) {
      if (!roomIds.has(window.room_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Window references an unknown room: ${window.room_id}`,
        });
      }
    }
  });

export const floorPlanLibraryCatalogSchema = z
  .object({
    schema_version: z.literal(1),
    floor_plan: z.object({
      plan_id: floorPlanLibraryIdSchema,
      slug: floorPlanLibraryIdSchema,
      project_name: z.string().min(1),
      title: z.string().min(1),
      country_code: z.string().length(2),
      property_type: z.string().min(1),
    }),
    address: z.object({
      street_name: z.string().min(1),
      street_aliases: z.array(z.string().min(1)),
      buildings: z
        .array(
          z.object({
            id: floorPlanLibraryIdSchema,
            block: z.string().min(1),
            postal_code: z.string().nullable(),
            aliases: z.array(z.string().min(1)).min(1),
            unit_distribution: floorPlanLibraryUnitDistributionSchema.optional(),
          })
        )
        .min(1),
    }),
    source: z.object({
      source_url: z.string().url(),
      source_title: z.string().min(1),
      publisher: z.string().min(1),
      retrieved_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
      license_status: z.enum(["unknown", "permission_granted", "public_domain"]),
      corroborating_sources: z.array(
        z.object({
          source_url: z.string().url(),
          source_title: z.string().min(1),
          publisher: z.string().min(1),
        })
      ),
    }),
    unit_distribution_source: z
      .object({
        source_url: z.string().url(),
        source_title: z.string().min(1),
        publisher: z.string().min(1),
      })
      .optional(),
    publication: z.object({
      status: z.enum(["draft", "published"]),
      accuracy_notice: z.string().min(1),
    }),
    layouts: z.array(floorPlanLibraryLayoutSchema).min(1),
  })
  .superRefine((catalog, context) => {
    const buildingIds = new Set<string>();
    const blocks = new Set<string>();
    for (const building of catalog.address.buildings) {
      const normalizedBlock = building.block.trim().toLowerCase();
      if (buildingIds.has(building.id) || blocks.has(normalizedBlock)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate building: ${building.block}`,
        });
      }
      buildingIds.add(building.id);
      blocks.add(normalizedBlock);
    }

    const layoutIds = new Set<string>();
    const layoutById = new Map<string, (typeof catalog.layouts)[number]>();
    for (const layout of catalog.layouts) {
      if (layoutIds.has(layout.layout_id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate layout id: ${layout.layout_id}`,
        });
      }
      layoutIds.add(layout.layout_id);
      layoutById.set(layout.layout_id, layout);
      for (const buildingId of layout.applies_to_building_ids) {
        if (!buildingIds.has(buildingId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Layout ${layout.layout_id} references unknown building ${buildingId}`,
          });
        }
      }
    }

    for (const building of catalog.address.buildings) {
      const distribution = building.unit_distribution;
      if (!distribution) continue;
      if (!catalog.unit_distribution_source) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Building ${building.block} has unit distribution data without a unit_distribution_source.`,
        });
      }

      const floorRangesByStack = new Map<
        string,
        Array<{ from: number; to: number }>
      >();
      const mappedLayoutIds = new Set<string>();
      for (const group of distribution.groups) {
        for (const stack of group.stacks) {
          const normalizedStack = stack.toLowerCase();
          const previousRanges = floorRangesByStack.get(normalizedStack) ?? [];
          for (const range of group.floor_ranges) {
            if (
              previousRanges.some(
                (previous) =>
                  Math.max(previous.from, range.from) <=
                  Math.min(previous.to, range.to)
              )
            ) {
              context.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Building ${building.block} has overlapping mappings for stack ${stack}.`,
              });
            }
            previousRanges.push(range);
          }
          floorRangesByStack.set(normalizedStack, previousRanges);
        }

        const groupLayoutIds = new Set<string>();
        const groupFlatTypes = new Set<string>();
        for (const layoutId of group.layout_ids) {
          if (groupLayoutIds.has(layoutId)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Building ${building.block} repeats layout ${layoutId} in a unit group.`,
            });
          }
          groupLayoutIds.add(layoutId);
          mappedLayoutIds.add(layoutId);

          const layout = layoutById.get(layoutId);
          if (!layout) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Building ${building.block} unit distribution references unknown layout ${layoutId}.`,
            });
            continue;
          }
          if (!layout.applies_to_building_ids.includes(building.id)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Layout ${layoutId} does not apply to building ${building.block}.`,
            });
          }
          groupFlatTypes.add(layout.flat_type);
        }

        if (groupFlatTypes.size > 1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Building ${building.block} unit group mixes different flat types.`,
          });
        }
      }

      if (distribution.status === "verified") {
        for (const layout of catalog.layouts) {
          if (
            layout.applies_to_building_ids.includes(building.id) &&
            !mappedLayoutIds.has(layout.layout_id)
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Verified unit distribution for ${building.block} does not map layout ${layout.layout_id}.`,
            });
          }
        }
      }
    }
  });

export type FloorPlanLibraryCatalog = z.infer<typeof floorPlanLibraryCatalogSchema>;
export type FloorPlanLibraryLayout = FloorPlanLibraryCatalog["layouts"][number];
