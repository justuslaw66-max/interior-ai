const scopedTailwindEntrySuffixes = [
  "/app/admin/admin-tailwind.css",
  "/app/tools/tools-tailwind.css",
  "/features/cabinetry/cabinetry-tailwind.css",
];

function stripScopedTailwindProperties() {
  return {
    postcssPlugin: "strip-scoped-tailwind-properties",
    OnceExit(root) {
      const sourcePath = root.source?.input.file?.replaceAll("\\", "/") ?? "";
      if (!scopedTailwindEntrySuffixes.some((suffix) => sourcePath.endsWith(suffix))) {
        return;
      }

      root.walkAtRules("property", (rule) => {
        if (rule.params.startsWith("--tw-")) {
          rule.remove();
        }
      });
    },
  };
}

stripScopedTailwindProperties.postcss = true;

module.exports = stripScopedTailwindProperties;
