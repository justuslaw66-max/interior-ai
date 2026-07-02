type CaptureOptions = {
  tags?: Record<string, string>;
  contexts?: Record<string, unknown>;
};

export function setContext(_name: string, _context: unknown) {}

export function setUser(_user: unknown) {}

export function captureException(_error: unknown, _options?: CaptureOptions) {}
