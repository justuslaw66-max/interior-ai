/** Reads the emitted PDF drawing operators, independently of exporter layout arithmetic. */
export function physicalDimensionLineMm(content: string, modelLength: number): number | undefined {
  type Matrix = [number, number, number, number, number, number];
  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let start: { model: number[]; page: number[] } | undefined;
  const point = (x: number, y: number) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];
  for (const line of content.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    const operator = parts.pop();
    const n = parts.map(Number);
    if (operator === "q") stack.push([...matrix]);
    if (operator === "Q") matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
    if (operator === "cm" && n.length === 6 && n.every(Number.isFinite)) {
      const [a, b, c, d, e, f] = matrix;
      matrix = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f];
    }
    if (operator === "m" && n.length === 2) start = { model: n, page: point(n[0], n[1]) };
    if (operator === "l" && n.length === 2 && start && start.model[0] === 0 && start.model[1] === -500 && n[0] === modelLength && n[1] === -500) {
      const end = point(n[0], n[1]);
      return Math.hypot(end[0] - start.page[0], end[1] - start.page[1]) * 25.4 / 72;
    }
  }
}
