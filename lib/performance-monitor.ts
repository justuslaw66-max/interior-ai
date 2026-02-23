import * as Sentry from '@sentry/nextjs';

interface PerformanceMetrics {
  fps: number;
  drawCalls?: number;
  textureMemory?: number;
  modelCount?: number;
}

const isDevEnv =
  process.env.NEXT_PUBLIC_APP_ENV === "development" || process.env.NODE_ENV === "development";

let lastFrameTime = performance.now();
let frameCount = 0;
let currentFPS = 60;

export class PerformanceMonitor {
  private static readonly FPS_THRESHOLD = 30;
  private static readonly LOW_FPS_DURATION = 5000; // 5 seconds
  private static readonly DRAW_CALL_WARNING = 2000;
  private static readonly TEXTURE_WARNING = 512; // MB

  static updateFPS(deltaTime: number) {
    frameCount++;
    const now = performance.now();
    
    if (now - lastFrameTime >= 1000) {
      currentFPS = frameCount;
      frameCount = 0;
      lastFrameTime = now;
      
      // Log warning if FPS is too low
      if (isDevEnv) {
        if (currentFPS < this.FPS_THRESHOLD) {
          console.warn(`⚠️ Low FPS: ${currentFPS}`, { drawCalls: (window as any).__DREI_STATS?.drawCalls });
        }
      }
    }
  }

  static getFPS(): number {
    return currentFPS;
  }

  static trackLowPerformance(metrics: PerformanceMetrics, context: { itemCount: number; mode: string; plan: string }) {
    // Only send events for bad performance, not good performance
    if (metrics.fps < this.FPS_THRESHOLD) {
      Sentry.captureMessage('Low FPS detected', {
        level: 'warning',
        tags: {
          component: 'performance',
          metric_type: 'fps',
        },
        contexts: {
          performance: {
            fps: metrics.fps,
            itemCount: context.itemCount,
            mode: context.mode,
            plan: context.plan,
            drawCalls: metrics.drawCalls,
          },
        },
      });
    }

    if (metrics.drawCalls && metrics.drawCalls > this.DRAW_CALL_WARNING) {
      Sentry.captureMessage('High draw call count', {
        level: 'warning',
        tags: {
          component: 'performance',
          metric_type: 'draw_calls',
        },
        contexts: {
          performance: {
            drawCalls: metrics.drawCalls,
            itemCount: context.itemCount,
          },
        },
      });
    }

    if (metrics.textureMemory && metrics.textureMemory > this.TEXTURE_WARNING) {
      Sentry.captureMessage('High texture memory usage', {
        level: 'warning',
        tags: {
          component: 'performance',
          metric_type: 'texture_memory',
        },
        contexts: {
          performance: {
            textureMemory: `${metrics.textureMemory}MB`,
            itemCount: context.itemCount,
          },
        },
      });
    }
  }

  static logDevMetrics(metrics: PerformanceMetrics) {
    if (isDevEnv) {
      console.log('📊 Performance Metrics:', {
        fps: `${metrics.fps}fps`,
        drawCalls: metrics.drawCalls,
        textureMemory: metrics.textureMemory ? `${metrics.textureMemory}MB` : 'N/A',
        modelCount: metrics.modelCount,
      });
    }
  }
}
