export type PhotoPoint = { x: number; y: number };
export type PhotoMatrix = [number, number, number, number, number, number, number, number, number];

export function mapPhotoPoint(matrix: PhotoMatrix, point: PhotoPoint): PhotoPoint {
  const w = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-10) throw new Error("The correction crosses the image horizon.");
  return { x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / w,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / w };
}

export function inversePhotoMatrix(m: PhotoMatrix): PhotoMatrix {
  const [a, b, c, d, e, f, g, h, i] = m;
  const adj: PhotoMatrix = [e*i-f*h, c*h-b*i, b*f-c*e, f*g-d*i, a*i-c*g, c*d-a*f, d*h-e*g, b*g-a*h, a*e-b*d];
  const det = a * adj[0] + b * adj[3] + c * adj[6];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error("The correction is not invertible.");
  return [adj[0]/det, adj[1]/det, adj[2]/det, adj[3]/det, adj[4]/det, adj[5]/det, adj[6]/det, adj[7]/det, adj[8]/det];
}

export function multiplyPhotoMatrices(a: PhotoMatrix, b: PhotoMatrix): PhotoMatrix {
  const at = (row: number, column: number) => a[row*3] * b[column] + a[row*3+1] * b[column+3] + a[row*3+2] * b[column+6];
  return [at(0,0), at(0,1), at(0,2), at(1,0), at(1,1), at(1,2), at(2,0), at(2,1), at(2,2)];
}

export function solvePhotoSystem(matrix: number[][], values: number[]): number[] | null {
  const rows = matrix.map((row, i) => [...row, values[i]]), n = rows.length;
  for (let k = 0; k < n; k++) {
    let best = k;
    for (let j = k + 1; j < n; j++) if (Math.abs(rows[j][k]) > Math.abs(rows[best][k])) best = j;
    if (Math.abs(rows[best][k]) < 1e-12) return null;
    [rows[k], rows[best]] = [rows[best], rows[k]];
    const divisor = rows[k][k];
    for (let j = k; j <= n; j++) rows[k][j] /= divisor;
    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const factor = rows[i][k];
      for (let j = k; j <= n; j++) rows[i][j] -= factor * rows[k][j];
    }
  }
  return rows.map((row) => row[n]);
}

export const photoDistance = (a: PhotoPoint, b: PhotoPoint) => Math.hypot(b.x-a.x, b.y-a.y);
export const photoCorners = (width: number, height: number): PhotoPoint[] =>
  [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
