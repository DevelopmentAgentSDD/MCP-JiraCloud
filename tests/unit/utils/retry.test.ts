import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../../../src/utils/retry.js';

// ============================================================================
// T012 - Tests unitarios de rate limiting
// ============================================================================

describe('Retry', () => {
  describe('withRetry - without fake timers', () => {
    it('should pass through successful responses without retry', async () => {
      // Arrange
      const fn = vi.fn().mockResolvedValue('success');

      // Act
      const result = await withRetry(fn, { maxRetries: 3, baseTimeoutMs: 10 });

      // Assert
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on error and succeed on second attempt', async () => {
      // Arrange
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('success');

      // Act
      const result = await withRetry(fn, {
        maxRetries: 3,
        baseTimeoutMs: 5,
      });

      // Assert
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 status with retryAfter and then succeed', async () => {
      // Arrange
      const rateLimitError = { status: 429, retryAfter: 10, message: 'Rate limited' };
      const fn = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce('success');

      // Act
      const result = await withRetry(fn, {
        maxRetries: 3,
        baseTimeoutMs: 5,
      });

      // Assert
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries (3 total attempts)', async () => {
      // Arrange
      const rateLimitError = { status: 429, retryAfter: 1 };
      const fn = vi.fn().mockRejectedValue(rateLimitError);

      // Act
      const promise = withRetry(fn, {
        maxRetries: 2, // 0 retries left after 2 = 3 attempts total
        baseTimeoutMs: 1,
      });

      // Assert
      await expect(promise).rejects.toEqual(rateLimitError);
      // intentos: attempt 0, 1, 2 = 3 total
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should retry on regular errors too and eventually throw if persistent', async () => {
      // Arrange
      const regularError = new Error('Bad request');
      const fn = vi.fn().mockRejectedValue(regularError);

      // Act
      const promise = withRetry(fn, {
        maxRetries: 2,
        baseTimeoutMs: 1,
      });

      // Assert - withRetry DOES retry non-429 errors too (just with exponential backoff)
      await expect(promise).rejects.toEqual(regularError);
      // 3 attempts total (0, 1, 2)
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should use exponential backoff for retries', async () => {
      // Arrange: 2 failures then success
      const rateLimitError = { status: 429, retryAfter: 1 };
      const fn = vi
        .fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce('finally success');

      // Act
      const result = await withRetry(fn, {
        maxRetries: 3,
        baseTimeoutMs: 5,
      });

      // Assert
      expect(result).toBe('finally success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('withRetry - with fake timers', () => {
    const retryOptions = {
      maxRetries: 3,
      baseTimeoutMs: 10,
    };

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should respect Retry-After header over exponential backoff', async () => {
      // Arrange
      const rateLimitError = { status: 429, retryAfter: 200 };
      const fn = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce('success');

      // Act
      const promise = withRetry(fn, retryOptions);

      // retryAfter (200) > exponential (10*2^0 = 10), debe usar 200
      await vi.advanceTimersByTimeAsync(200);
      const result = await promise;

      // Assert
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should wait exponential time when retryAfter is smaller', async () => {
      // Arrange
      const rateLimitError = { status: 429, retryAfter: 5 };
      const fn = vi.fn().mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce('success');

      // Act
      const promise = withRetry(fn, retryOptions);

      // backoff: max(5, 10*2^0) = max(5, 10) = 10
      await vi.advanceTimersByTimeAsync(10);
      const result = await promise;

      // Assert
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
