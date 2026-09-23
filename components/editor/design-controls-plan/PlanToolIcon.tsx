import type { ReactNode } from "react";

export type PlanToolIconName =
  | "upload"
  | "straightWall"
  | "rectangleWall"
  | "arcWall"
  | "externalArea"
  | "door"
  | "window"
  | "opening"
  | "bayWindow"
  | "template";

function PlanToolSvg({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      shapeRendering="geometricPrecision"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function PlanToolIcon({
  name,
  dark,
  muted = false,
}: {
  name: PlanToolIconName;
  dark: boolean;
  muted?: boolean;
}) {
  const svgClass = "mx-auto h-12 w-12 max-w-full";
  const stroke = muted
    ? dark
      ? "#7f8794"
      : "#858a92"
    : dark
      ? "#d6dae2"
      : "#50535a";
  const lightStroke = muted
    ? dark
      ? "#646c78"
      : "#c4c9d0"
    : dark
      ? "#858d9b"
      : "#9ca1a8";
  const fill = muted
    ? dark
      ? "#343a44"
      : "#d7d9dc"
    : dark
      ? "#3c424d"
      : "#c0c2c5";
  const side = muted
    ? dark
      ? "#292f38"
      : "#b7bbc1"
    : dark
      ? "#272d36"
      : "#a7a9ad";
  const top = muted
    ? dark
      ? "#464d58"
      : "#e7e8ea"
    : dark
      ? "#555d69"
      : "#ebeced";
  const glass = dark ? "#29475a" : "#d9edf7";
  const inset = muted
    ? dark
      ? "#303640"
      : "#c6c9ce"
    : dark
      ? "#171b21"
      : "#b7b9bd";

  if (name === "upload") {
    return (
      <PlanToolSvg className={svgClass}>
        <path
          d="M12 18V10h8M44 10h8v8M52 46v8h-8M20 54h-8v-8"
          stroke="#60a5fa"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M23 13h18l8 8v29H23V13Z"
          fill="#bfdbfe"
          stroke="#93c5fd"
          strokeWidth="2"
        />
        <path d="M41 13v10h8" fill="#dbeafe" stroke="#93c5fd" strokeWidth="2" />
        <rect x="27" y="30" width="18" height="10" rx="1.5" fill="#60a5fa" />
        <text x="28" y="27" fill="#60a5fa" fontSize="8" fontWeight="700">
          JPG
        </text>
        <text x="29" y="38" fill="#ffffff" fontSize="8" fontWeight="700">
          CAD
        </text>
      </PlanToolSvg>
    );
  }

  if (name === "straightWall") {
    return (
      <PlanToolSvg className={svgClass}>
        <path d="m9 17 6-6h41l-6 6Z" fill={top} stroke={stroke} strokeWidth="1.75" />
        <path d="m50 17 6-6v41l-6 6Z" fill={side} stroke={stroke} strokeWidth="1.75" />
        <path d="M9 17h41v41H9Z" fill={fill} stroke={stroke} strokeWidth="1.75" />
      </PlanToolSvg>
    );
  }

  if (name === "rectangleWall") {
    return (
      <PlanToolSvg className={svgClass}>
        <path d="M9 25h39v34H9Z" fill={fill} stroke={stroke} strokeWidth="1.75" />
        <path d="m48 25 11-12.5v34L48 59Z" fill={side} stroke={stroke} strokeWidth="1.75" />
        <path d="m9 25 12.5-12.5H59L48 25Z" fill={top} stroke={stroke} strokeWidth="1.75" />
        <path
          d="m17.5 21.5 7.5-6h28l-7 6Z"
          fill={inset}
          stroke={lightStroke}
          strokeWidth="1.25"
        />
      </PlanToolSvg>
    );
  }

  if (name === "arcWall") {
    return (
      <PlanToolSvg className={svgClass}>
        <path
          d="M10.5 20.8C17.4 25.6 28.8 27.5 38.2 24.8C46.4 22.5 50.8 18.2 50.2 13C54.8 13.4 58 15.5 58 18.6v29C58 54.1 51 58.4 41.5 60C29.8 62 17.3 59 10.5 54.3Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.75"
        />
        <path
          d="M10.5 20.8C15.8 16.6 22.8 14.2 29.6 13.8C36.4 13.4 42.3 15.1 45.1 18.2C46.5 19.7 46.6 21.2 46 22.5C43.8 23.5 41.2 24.3 38.2 24.8C28.8 27.5 17.4 25.6 10.5 20.8Z"
          fill={top}
          stroke={stroke}
          strokeWidth="1.75"
        />
      </PlanToolSvg>
    );
  }

  if (name === "externalArea") {
    return (
      <PlanToolSvg className={svgClass}>
        <path d="m3 23 15-17 21 9-16 16Z" fill={dark ? "#2b313a" : "#f5f6f7"} />
        <path
          d="m3 23 20 8v21L3 43Z"
          fill={dark ? "#252b34" : "#eef0f2"}
          stroke={lightStroke}
          strokeWidth="1.4"
        />
        <path
          d="m23 31 16-16v20L23 52Z"
          fill={dark ? "#20262e" : "#e4e6e9"}
          stroke={lightStroke}
          strokeWidth="1.4"
        />
        <path
          d="M3 23 18 6l21 9"
          stroke={lightStroke}
          strokeWidth="1.4"
          strokeDasharray="3 2.5"
        />
        <path d="m20 40 30-19 13 7-30 23Z" fill={fill} stroke={stroke} strokeWidth="1.75" />
        <path
          d="m27.5 35.3 13 9.7M35 30.5l13 8.8M42.5 25.8l13 7.7M26.5 44.8l30-19"
          stroke={lightStroke}
          strokeWidth="1.2"
        />
        <path d="m33 51 30-23v4L33 56Z" fill={side} stroke={stroke} strokeWidth="1.4" />
      </PlanToolSvg>
    );
  }

  if (name === "door") {
    return (
      <PlanToolSvg className={svgClass}>
        <rect
          x="20"
          y="9"
          width="26"
          height="46"
          rx="2"
          fill={fill}
          stroke={stroke}
          strokeWidth="3"
        />
        <rect
          x="25"
          y="15"
          width="16"
          height="34"
          rx="1.5"
          fill="#eeeeef"
          stroke={lightStroke}
          strokeWidth="2"
        />
        <circle cx="26" cy="33" r="2" fill={stroke} />
        <path d="M20 9h26l5 5v42" stroke={stroke} strokeWidth="2" />
      </PlanToolSvg>
    );
  }

  if (name === "window") {
    return (
      <PlanToolSvg className={svgClass}>
        <rect x="14" y="18" width="36" height="32" fill={glass} stroke={stroke} strokeWidth="3" />
        <path d="M32 18v32M14 34h36" stroke={stroke} strokeWidth="2.5" />
        <path d="M18 14h36v32" stroke={lightStroke} strokeWidth="2" />
        <path d="M18 52h36" stroke={lightStroke} strokeWidth="2" />
      </PlanToolSvg>
    );
  }

  if (name === "bayWindow") {
    return (
      <PlanToolSvg className={svgClass}>
        <polygon
          points="12 27 22 18 48 18 56 27 56 47 12 47"
          fill={glass}
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M22 18v29M48 18v29M12 33h44" stroke={stroke} strokeWidth="2" />
        <path d="M16 49h36l-5 7H21Z" fill="#d8d8d9" stroke={stroke} strokeWidth="2" />
      </PlanToolSvg>
    );
  }

  if (name === "opening") {
    return (
      <PlanToolSvg className={svgClass}>
        <path
          d="M16 53V21h32v32"
          fill="#f5f5f5"
          stroke={lightStroke}
          strokeWidth="2"
          strokeDasharray="4 3"
        />
        <path
          d="M23 53V34c0-7 4-13 9-13s9 6 9 13v19"
          fill="#ffffff"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M23 53h18" stroke="#ffffff" strokeWidth="5" />
      </PlanToolSvg>
    );
  }

  return (
    <PlanToolSvg className={svgClass}>
      <rect
        x="10"
        y="12"
        width="44"
        height="40"
        rx="2"
        fill="#eff6ff"
        stroke={stroke}
        strokeWidth="3"
      />
      <rect
        x="14"
        y="16"
        width="15"
        height="14"
        fill="#dbeafe"
        stroke="#bfdbfe"
        strokeWidth="1.5"
      />
      <rect
        x="35"
        y="16"
        width="15"
        height="14"
        fill="#f8fafc"
        stroke="#d6d9de"
        strokeWidth="1.5"
      />
      <rect
        x="14"
        y="37"
        width="15"
        height="11"
        fill="#f8fafc"
        stroke="#d6d9de"
        strokeWidth="1.5"
      />
      <rect
        x="36"
        y="37"
        width="14"
        height="11"
        fill="#dbeafe"
        stroke="#bfdbfe"
        strokeWidth="1.5"
      />
      <path d="M32 12v40M10 33h44" stroke={stroke} strokeWidth="3" strokeLinecap="square" />
      <path d="M21 33h8M32 40v8" stroke="#eff6ff" strokeWidth="5" strokeLinecap="butt" />
      <path
        d="M21 33a8 8 0 0 1 8 8M32 40a8 8 0 0 0 8 8"
        stroke="#60a5fa"
        strokeWidth="2"
        fill="none"
      />
    </PlanToolSvg>
  );
}
