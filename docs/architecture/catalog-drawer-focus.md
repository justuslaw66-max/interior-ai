# Catalog drawer focus restoration

`ARCH-RC52-DRAWER-FOCUS` is owned by
`components/catalog/useCatalogDrawerFocusRestoration.ts`. Consumer and Pro use
the same `CatalogPanel`, drawer, semantic target, and fallback policy.

## Current flow and ownership

| Step | Owner and symbol | Active element and identity | Lifecycle, replacement, and fallback | Coverage |
| --- | --- | --- | --- | --- |
| 1. Activate | `CatalogCard` product-details button or `CatalogCompareTray` available-item Open button | Pointer, Enter, or Space supplies the activated `HTMLButtonElement`. The stable descriptor is `{productId, action: "details", source: "product-card" | "compare-tray"}`. Display text, array position, React instance, and authorization state are not identity. | `useCatalogDrawerPreviewFocus.openCatalogDrawerPreview` captures the current catalog scope and direct element synchronously, then selects the product and prefetches details. This is independent of whether WebKit moves pointer focus. | Focused unit/render identity assertions; Chromium/WebKit pointer and keyboard workflows; compare-tray and searched-card cases. |
| 2. Establish drawer state | `CatalogPanel.selectedId`, variant selection, and `useCatalogDrawerPreviewFocus` | The selected product and restoration request are distinct interaction state with one owner each. Reopening creates a new request. Related/configuration product changes retain the original semantic opener. | No duplicate drawer state or selector registry is introduced. Product and purchase behavior remain on the existing paths. Every close path clears the DOM-bearing request after the drawer cleanup captured it, so a disconnected optimization is not retained for the panel lifetime. | Different-product reopen, related product behavior through existing product-flow tests, fixed Consumer/Pro browser cases, and add-to-room review. |
| 3. Initial focus | `useCatalogDrawerFocusRestoration` and `CatalogItemDrawer.closeButtonRef` | The drawer close button receives focus on the next animation frame. The dialog remains labelled by `titleId`, modal, and Tab-contained. | The entry frame and document listener are cancelled on close/unmount. A newer visible `dialog` or `alertdialog` owns focus before entry. Escape is consumed only when its event target is inside this drawer and no newer modal owns the interaction. | Role/name/modal/initial-focus, Tab containment, close, Escape, and alertdialog entry-race assertions in the focused browser workflow and catalog accessibility coverage. |
| 4. Hydration or responsive change | `CatalogPanel` public item projection, filtering/grouping, virtualized `CatalogGrid`, and the CSS-responsive editor panel | Focus stays in the drawer. The stored descriptor and catalog scope remain stable while the exact opener may disconnect and an equivalent control may mount. | No detached element is retained as authority. Both desktop-to-mobile and mobile-to-desktop projections resolve at close time. Hydration/category/filter replacement can remove the exact source without invalidating the descriptor. | Deterministic connected-node replacement, both viewport directions, filtering, and unavailable-product cases in Chromium and WebKit. |
| 5. Close or supersession | `closeCatalogDrawer`; `CatalogItemDrawer.onClose`; restoration effect cleanup | Close button, Escape, backdrop, add-to-room, unavailable content, or parent state closes the same drawer. Product/configuration changes while open do not restore early. | Cleanup removes the key listener, restores body overflow, and schedules one generation-bound restoration frame. A newer open invalidates the old generation. The unavailable-content policy closes after live-catalog pruning; the centralized close owner releases the stored element and scope. | Close button, Escape, real live-catalog product removal, add/product-flow regression suites, and different-product reopen coverage. |
| 6. Resolve and focus | `restoreCatalogDrawerFocus` and `findCurrentSemanticTarget` | Resolution requires a connected, rendered, non-hidden, enabled target. | Order: matching direct element; current exact product/action/source control; current same-product semantic control; focusable catalog-results region. If the catalog scope unmounted or another visible modal (`dialog` or `alertdialog` with `aria-modal=true`) is active, restoration is cancelled and no focus mutation occurs. `body` is not an accepted fallback. | Active-element, connectedness, visibility, enabled state, unique exact target, safe fallback, production-shaped alertdialog, route/workspace unmount, Chromium, and WebKit assertions. |

## Verified former defect

Before this remediation, `CatalogItemDrawer` read `document.activeElement` in
its open effect and retained only that `HTMLElement`. Its cleanup executed
`if (opener?.isConnected) opener.focus()`. Catalog hydration, controlled
category changes, filtering, virtualization, or a responsive projection could
disconnect the opener before close. The false `isConnected` branch had no
semantic lookup and no fallback, so the removed drawer commonly left
`document.activeElement` on `body`. Pointer activation in WebKit also does not
guarantee that the button becomes active, so the old capture could be missing
even without replacement.

The archival RC52 patch froze the opening category to reduce one unmount path.
It was used only as intent evidence. The current architecture instead makes the
semantic action authoritative and resolves the live control when restoration
actually occurs; catalog category, filtering, responsive layout, appearance,
analytics, publication, entitlement, and purchase behavior remain unchanged.

## Safety boundaries and rollback

The mechanism is accessibility interaction state, not an authorization or
publication boundary. It never synthesizes a product, bypasses availability,
or exposes a hidden action. A visible semantic modal (`dialog` or `alertdialog`
with `aria-modal=true`) owns focus and Escape. Parent
unmount marks the owner inactive and cancels any queued frame, so route, room,
or workspace replacement cannot cause a late mutation in the next surface.

Rollback is a revert of the single `ARCH-RC52-DRAWER-FOCUS` implementation
commit. That restores direct-node-only behavior and the previous quality
baseline; no data migration or external rollback is required.
