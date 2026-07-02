#!/usr/bin/env node
// Script to extract Room and Furniture components from app/design/page.tsx
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pagePath = path.join(root, 'app/design/page.tsx');
const content = fs.readFileSync(pagePath, 'utf8');
const lines = content.split('\n');

console.log('Total lines in page.tsx:', lines.length);

// --- Build RoomEnvironment.tsx ---
// Contains: RoomProps type (lines 233-238) + Room function (lines 240-445)
// 0-indexed: 232-444
const roomHeader = [
  '"use client";',
  '',
  'import * as THREE from "three";',
  'import { useFrame, useThree } from "@react-three/fiber";',
  'import { useMemo, useEffect, useRef } from "react";',
  '',
].join('\n');

const roomBody = lines.slice(232, 445).join('\n');

const roomContent = roomHeader + roomBody + '\n';
const roomOutPath = path.join(root, 'components/scene/RoomEnvironment.tsx');
fs.writeFileSync(roomOutPath, roomContent);
console.log('Created RoomEnvironment.tsx');

// --- Build FurnitureItem.tsx ---
// FurnitureProps type: lines 175-228 (0-indexed 174-227)
// SnapType type: line 231 (0-indexed 230)
// Furniture function: lines 454-1651 (0-indexed 453-1650)
// CameraCapture function: lines 1652-1674 (0-indexed 1651-1673)

const furnitureHeader = [
  '"use client";',
  '',
  'import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";',
  'import * as THREE from "three";',
  'import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";',
  'import { Edges, Html, Line, useCursor } from "@react-three/drei";',
  'import { track } from "@/lib/analytics";',
  'import { CATALOG_ITEMS } from "@/lib/catalog";',
  'import type { CatalogItemSchema } from "@/lib/catalog-schema";',
  'import {',
  '  computeSnapCandidates,',
  '  computeAABB,',
  '  pickGuides,',
  '  snapGuideToGuide,',
  '  type Guide,',
  '  type AABB,',
  '} from "@/lib/snapGuides";',
  'import { generateMeasurements, type Measure } from "@/lib/measurements";',
  'import { resolveMaterialProps } from "@/lib/design-page-material-props";',
  'import {',
  '  clamp,',
  '  getRotatedFootprint,',
  '  normalizeRotationDegrees,',
  '  ROTATION_SNAP_STEP_DEGREES,',
  '  ROTATION_SNAP_STEP_RADIANS,',
  '  snapRotationRadians,',
  '} from "@/lib/design-page-utils";',
  'import { type GLBCalibration, getModelCalibration } from "@/lib/design-page-calibration";',
  'import {',
  '  type SnapNeighbor,',
  '  type ConfigurableNodeTransform,',
  '  type PlanMeasurementUnit,',
  '  type WallDescriptor,',
  '} from "@/lib/design-page-types";',
  'import { SnapGuides } from "@/components/SnapGuides";',
  'import { Measurements } from "@/components/Measurements";',
  'import { GLBScaledModel } from "@/components/scene/GLBScaledModel";',
  'import ItemRenderer2D from "@/components/editor/renderers/ItemRenderer2D";',
  'import { radiansToDeg } from "@/lib/editorScene";',
  'import type { EditorViewMode } from "@/components/editor/EditorViewToggle";',
  'import type { DesignItem } from "@/lib/room-types";',
  '',
].join('\n');

// FurnitureProps type body (lines 175-228, 0-indexed 174-227)
const furniturePropsBody = lines.slice(174, 228).join('\n');

// SnapType type (line 231, 0-indexed 230)
const snapTypeLine = lines[230];

// Furniture + CameraCapture body (lines 454-1674, 0-indexed 453-1673)
const furnitureFunctionBody = lines.slice(453, 1674).join('\n');

const furnitureContent = furnitureHeader + furniturePropsBody + '\n\n' + snapTypeLine + '\n\n' + furnitureFunctionBody + '\n';

const furnitureOutPath = path.join(root, 'components/scene/FurnitureItem.tsx');
fs.writeFileSync(furnitureOutPath, furnitureContent);
console.log('Created FurnitureItem.tsx');

// --- Modify page.tsx ---
// Remove lines 175-1674 and replace with imports + STORAGE_KEY

// Lines to keep: 1-174 (indices 0-173)
// Lines to add: new import lines + STORAGE_KEY  
// Lines to keep: 1675-end (indices 1674-end)

const newImports = [
  'import { Room } from "@/components/scene/RoomEnvironment";',
  'import { Furniture, CameraCapture } from "@/components/scene/FurnitureItem";',
  '',
  'const STORAGE_KEY = "interior-ai:v1:livingroom-design";',
  '',
].join('\n');

const beforeBlock = lines.slice(0, 174).join('\n');
const afterBlock = lines.slice(1674).join('\n');

const newPageContent = beforeBlock + '\n' + newImports + afterBlock + '\n';

// Fix: replace <ZoneOutline usage with <SceneZoneOutline (the thin wrapper is gone)
const fixedPageContent = newPageContent.replace(/<ZoneOutline\b/g, '<SceneZoneOutline');

fs.writeFileSync(pagePath, fixedPageContent);
const newLines = fixedPageContent.split('\n').length;
console.log('Updated page.tsx:', newLines, 'lines');
console.log('Reduction:', lines.length - newLines, 'lines removed');
