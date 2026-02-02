import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { analyzeFunnel, inferFunnelSteps } from '../src/funnel/index.js';
import type { TenantContext, RawEvent } from '../src/funnel/index.js';

describe('Funnel Analysis', () => {
  let tempDir: string;

  const tenantContext: TenantContext = {
    tenant_id: 'test-tenant',
    project_id: 'test-project',
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'growth-funnel-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('basic funnel calculation', () => {
    it('should calculate conversion rates correctly', async () => {
      const events: RawEvent[] = [
        { user_id: 'user1', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user1', event_name: 'signup_start', timestamp: '2024-01-01T00:01:00Z' },
        { user_id: 'user1', event_name: 'signup_complete', timestamp: '2024-01-01T00:02:00Z' },
        { user_id: 'user2', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user2', event_name: 'signup_start', timestamp: '2024-01-01T00:01:00Z' },
        { user_id: 'user3', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
      ];

      const eventsFile = path.join(tempDir, 'events.json');
      await fs.writeFile(eventsFile, JSON.stringify(events));

      const result = await analyzeFunnel({
        tenantContext,
        sourceFile: eventsFile,
        funnelName: 'signup-funnel',
        steps: ['page_view', 'signup_start', 'signup_complete'],
      });

      expect(result.total_entrances).toBe(3);
      expect(result.total_conversions).toBe(1);
      expect(result.overall_conversion_rate).toBeCloseTo(0.333, 2);
    });

    it('should identify the biggest drop-off step', async () => {
      const events: RawEvent[] = [
        { user_id: 'user1', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user1', event_name: 'signup_start', timestamp: '2024-01-01T00:01:00Z' },
        { user_id: 'user1', event_name: 'signup_complete', timestamp: '2024-01-01T00:02:00Z' },
        { user_id: 'user2', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user3', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user4', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user4', event_name: 'signup_start', timestamp: '2024-01-01T00:01:00Z' },
      ];

      const eventsFile = path.join(tempDir, 'events.json');
      await fs.writeFile(eventsFile, JSON.stringify(events));

      const result = await analyzeFunnel({
        tenantContext,
        sourceFile: eventsFile,
        funnelName: 'signup-funnel',
        steps: ['page_view', 'signup_start', 'signup_complete'],
      });

      expect(result.biggest_drop_off_step).toBe('signup_start');

      const signupStartStep = result.steps.find((s) => s.step_name === 'signup_start');
      expect(signupStartStep?.drop_off_rate).toBeCloseTo(0.5, 1); // 2 out of 4 dropped off
    });

    it('should calculate per-step metrics', async () => {
      const events: RawEvent[] = [
        { user_id: 'user1', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user1', event_name: 'page_view', timestamp: '2024-01-01T00:00:01Z' }, // duplicate
        { user_id: 'user1', event_name: 'signup_start', timestamp: '2024-01-01T00:01:00Z' },
        { user_id: 'user1', event_name: 'signup_complete', timestamp: '2024-01-01T00:02:00Z' },
      ];

      const eventsFile = path.join(tempDir, 'events.json');
      await fs.writeFile(eventsFile, JSON.stringify(events));

      const result = await analyzeFunnel({
        tenantContext,
        sourceFile: eventsFile,
        funnelName: 'signup-funnel',
        steps: ['page_view', 'signup_start', 'signup_complete'],
      });

      const pageViewStep = result.steps.find((s) => s.step_name === 'page_view');
      expect(pageViewStep?.unique_users).toBe(1);
      expect(pageViewStep?.total_events).toBe(2); // counts all events

      const signupStartStep = result.steps.find((s) => s.step_name === 'signup_start');
      expect(signupStartStep?.unique_users).toBe(1);
      expect(signupStartStep?.drop_off_count).toBe(0);
    });
  });

  describe('step inference', () => {
    it('should infer most common events as funnel steps', () => {
      const events: RawEvent[] = [
        { user_id: 'user1', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user2', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user3', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user1', event_name: 'click', timestamp: '2024-01-01T00:00:01Z' },
        { user_id: 'user2', event_name: 'click', timestamp: '2024-01-01T00:00:01Z' },
        { user_id: 'user1', event_name: 'purchase', timestamp: '2024-01-01T00:01:00Z' },
      ];

      const steps = inferFunnelSteps(events, 3);

      expect(steps[0]).toBe('page_view');
      expect(steps[1]).toBe('click');
      expect(steps[2]).toBe('purchase');
    });
  });

  describe('evidence generation', () => {
    it('should include evidence links', async () => {
      const events: RawEvent[] = [
        { user_id: 'user1', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
      ];

      const eventsFile = path.join(tempDir, 'events.json');
      await fs.writeFile(eventsFile, JSON.stringify(events));

      const result = await analyzeFunnel({
        tenantContext,
        sourceFile: eventsFile,
        funnelName: 'test-funnel',
        steps: ['page_view'],
      });

      expect(result.evidence.length).toBeGreaterThan(0);
      expect(result.evidence[0]).toHaveProperty('type');
      expect(result.evidence[0]).toHaveProperty('path');
      expect(result.evidence[0]).toHaveProperty('description');
    });
  });

  describe('date range calculation', () => {
    it('should calculate correct date range from events', async () => {
      const events: RawEvent[] = [
        { user_id: 'user1', event_name: 'page_view', timestamp: '2024-01-01T00:00:00Z' },
        { user_id: 'user1', event_name: 'signup', timestamp: '2024-01-05T00:00:00Z' },
        { user_id: 'user2', event_name: 'page_view', timestamp: '2024-01-03T00:00:00Z' },
      ];

      const eventsFile = path.join(tempDir, 'events.json');
      await fs.writeFile(eventsFile, JSON.stringify(events));

      const result = await analyzeFunnel({
        tenantContext,
        sourceFile: eventsFile,
        funnelName: 'test-funnel',
        steps: ['page_view', 'signup'],
      });

      expect(result.date_range.start).toBe('2024-01-01T00:00:00.000Z');
      expect(result.date_range.end).toBe('2024-01-05T00:00:00.000Z');
    });
  });
});