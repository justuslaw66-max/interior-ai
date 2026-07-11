"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { CabinetMeasurementUnit } from "../measurementUnits";

const CabinetMeasurementUnitContext = createContext<CabinetMeasurementUnit>("mm");

export function CabinetMeasurementUnitProvider({
  unit,
  children,
}: {
  unit: CabinetMeasurementUnit;
  children: ReactNode;
}) {
  return (
    <CabinetMeasurementUnitContext.Provider value={unit}>
      {children}
    </CabinetMeasurementUnitContext.Provider>
  );
}

export function useCabinetMeasurementUnit(): CabinetMeasurementUnit {
  return useContext(CabinetMeasurementUnitContext);
}
