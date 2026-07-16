import type { ReactNode } from "react";

type DesignPageCompositionProps = {
  configuration: {
    designerTheme: boolean;
  };
  children: ReactNode;
};

export function DesignPageComposition({
  configuration,
  children,
}: DesignPageCompositionProps) {
  return (
    <main
      className="appShell relative min-h-screen w-screen"
      data-theme={configuration.designerTheme ? "designer" : "default"}
      style={{ transition: "background 200ms ease, color 200ms ease" }}
    >
      {children}
    </main>
  );
}
