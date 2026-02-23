import { Html } from "@react-three/drei";
import { Measure } from "@/lib/measurements";

interface MeasurementsProps {
  measures: Measure[];
  visible?: boolean;
}

/**
 * Real-time measurement overlays during furniture drag
 * Shows spacing, gaps, and clearance warnings
 */
export function Measurements({ measures, visible = true }: MeasurementsProps) {
  if (!visible || !measures.length) {
    return null;
  }

  const severityStyles = {
    ok: {
      bg: "rgba(51, 171, 111, 0.85)",
      text: "#ffffff",
      icon: "✓",
    },
    good: {
      bg: "rgba(16, 185, 129, 1)",
      text: "#ffffff",
      icon: "✓",
    },
    warn: {
      bg: "rgba(245, 158, 11, 0.9)",
      text: "#1f2937",
      icon: "⚠",
    },
  };

  return (
    <>
      {measures.map((m, idx) => {
        const style = severityStyles[m.severity || "ok"];
        return (
          <Html
            key={`measure-${idx}`}
            position={m.at}
            center
            transform={false}
            occlude={false}
            style={{
              pointerEvents: "none",
              fontSize: "11px",
              fontWeight: 600,
              padding: "4px 8px",
              borderRadius: "4px",
              background: style.bg,
              color: style.text,
              whiteSpace: "nowrap",
              lineHeight: 1.2,
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.4)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>{style.icon}</span>
            <span>{m.label}</span>
          </Html>
        );
      })}
    </>
  );
}
