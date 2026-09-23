import ts from "typescript";

export default function guestSaveOverlayTsLoader(source) {
  return ts.transpileModule(source, {
    fileName: this.resourcePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  }).outputText;
}
