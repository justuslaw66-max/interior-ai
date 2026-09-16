/** Local grayscale contrast, without rescaling, rectifying or applying OCR boxes. */
export type TracePixels = { gray: Uint8Array; width: number; height: number; signal?: AbortSignal };
export const TRACE_SETTINGS = Object.freeze({ version: "source-strokes-v1", contrast: 14,
  maximumGray: 240, solidInkMaximumGray: 160, backgroundRadius: 12, fitErrorPx: 0.65, minimumComponentPixels: 3, fillRadius: 3 });

function maximumPass(input: Uint8Array, width: number, height: number, radius: number, vertical: boolean) {
  const output = new Uint8Array(input.length), size = vertical ? height : width, count = vertical ? width : height;
  for (let line = 0; line < count; line++) {
    const queue: number[] = []; let head = 0, end = 0;
    const index = (i: number) => vertical ? i * width + line : line * width + i;
    for (let i = 0; i < size; i++) {
      while (end < Math.min(size, i + radius + 1)) {
        while (queue.length > head && input[index(queue[queue.length - 1])] <= input[index(end)]) queue.pop();
        queue.push(end++);
      }
      while (queue[head] < i - radius) head++;
      output[index(i)] = input[index(queue[head])];
    }
  }
  return output;
}

export function traceInkMask({ gray, width, height, signal }: TracePixels) {
  signal?.throwIfAborted();
  const background = maximumPass(maximumPass(gray, width, height, TRACE_SETTINGS.backgroundRadius, false), width, height, TRACE_SETTINGS.backgroundRadius, true);
  const mask = Uint8Array.from(gray, (v, i) => v <= TRACE_SETTINGS.maximumGray && (v <= TRACE_SETTINGS.solidInkMaximumGray || background[i] - v >= TRACE_SETTINGS.contrast) ? 1 : 0);
  return { mask, background };
}

export function removeTraceSpecks(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(mask.length); let removed = 0;
  for (let seed = 0; seed < mask.length; seed++) {
    if (!mask[seed] || seen[seed]) continue;
    const component = [seed]; seen[seed] = 1;
    for (let k = 0; k < component.length; k++) {
      appendNeighbours(component[k],mask,seen,width,height,component);
    }
    if (component.length < TRACE_SETTINGS.minimumComponentPixels) for (const at of component) { mask[at] = 0; removed++; }
  }
  return removed;
}

/** Opening separates broad ink from strokes; dilation is clipped to observed ink. No invented fill. */
export function traceFillMask(mask: Uint8Array, width: number, height: number) {
  const radius = TRACE_SETTINGS.fillRadius, core = new Uint8Array(mask.length), fill = new Uint8Array(mask.length);
  const offsets: number[] = [];
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) if (x*x+y*y <= radius*radius) offsets.push(y*width+x);
  for (let y = radius; y < height-radius; y++) for (let x = radius; x < width-radius; x++) {
    const at = y*width+x; if (offsets.every(d => mask[at+d])) core[at] = 1;
  }
  for (let at = 0; at < core.length; at++) if (core[at]) for (const d of offsets) if (mask[at+d]) fill[at+d] = 1;
  return fill;
}

function appendNeighbours(at:number,mask:Uint8Array,seen:Uint8Array,width:number,height:number,component:number[]) {
  const x=at%width,y=Math.floor(at/width);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
    const next=at+dy*width+dx;
    if(x+dx<0||x+dx>=width||y+dy<0||y+dy>=height||seen[next]||!mask[next])continue;
    seen[next]=1;component.push(next);
  }
}
