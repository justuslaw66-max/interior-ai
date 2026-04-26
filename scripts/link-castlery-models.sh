#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/justus/Documents/Interior-AI/interior-ai"
SRC="/Users/justus/Desktop/funiture/castlery"
DST="$ROOT/public/assets/models"

mkdir -p "$DST"

cp -f "$SRC/Dining table/Brighton Oval Dining Table.glb" "$DST/dining-real-castlery-brighton-oval-180.glb"
cp -f "$SRC/Dining table/Forma Oval Dining Table.glb" "$DST/dining-real-castlery-forma-oval-150.glb"
cp -f "$SRC/Dining table/Forma Round Dining Table 90cm.glb" "$DST/dining-real-castlery-forma-round-90.glb"
cp -f "$SRC/Dining table/Forma Round Dining Table 120cm.glb" "$DST/dining-real-castlery-forma-round-120.glb"
cp -f "$SRC/Dining table/Sloane Travertine Dining Table 180cm.glb" "$DST/dining-real-castlery-sloane-travertine-180.glb"
cp -f "$SRC/Dining table/Sloane Travertine Dining Table 220cm.glb" "$DST/dining-real-castlery-sloane-travertine-220.glb"

cp -f "$SRC/Sofa/Sofa Jaron/Jaron Leather Recliner 3 Seater Sofa slim arm ( Cooca).glb" "$DST/sofa-real-castlery-jaron-3s.glb"
cp -f "$SRC/Sofa/Sofa Jaron/Jaron Leather Recliner 3 Seater Sofa wide arm(leather(Marche) Cooca).glb" "$DST/sofa-real-castlery-jaron-3s-wide-arm.glb"
cp -f "$SRC/Sofa/Sofa Jaron/Jaron Leather Recliner Extended 3 Seater Sofa slim arm ( shinny).glb" "$DST/sofa-real-castlery-jaron-extended-3s.glb"
cp -f "$SRC/Sofa/Sofa Jaron/Jaron Leather Recliner Extended 3 Seater Sofa wide arm (leather(Marche) Cooca).glb" "$DST/sofa-real-castlery-jaron-extended-3s-wide-arm.glb"

cp -f "$SRC/Sofa/Sofa Madison/Madison 2 Seater Sofa frabic (bisque).glb" "$DST/sofa-real-castlery-madison-2s.glb"
cp -f "$SRC/Sofa/Sofa Madison/Madison 3 Seater Sofa frabic (bisque).glb" "$DST/sofa-real-castlery-madison-3s.glb"
cp -f "$SRC/Sofa/Sofa Madison/Madison Ottoman.glb" "$DST/sofa-real-castlery-madison-ottoman.glb"

echo "Copied mapped files into $DST"
ls -lh "$DST"
