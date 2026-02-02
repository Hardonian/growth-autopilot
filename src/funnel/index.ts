import * as fs from 'fs/promises';
import {
  type FunnelMetrics,
  type TenantContext,
  type FunnelStep,
  type EvidenceLink,
} from '../contracts/index.js';

/**
 * Raw event from export
 */
export interface RawEvent {
  user_id: string;
  event_name: string;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Options for funnel analysis
 */
export interface FunnelOptions {
  tenantContext: TenantContext;
  sourceFile: string;
  funnelName: string;
  steps: string[]; // Ordered list of event names representing the funnel
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create an evidence link
 */
function createEvidence(
  type: EvidenceLink['type'],
  path: string,
  description: string,
  value?: string | number | boolean
): EvidenceLink {
  return { type, path, description, value };
}

/**
 * Load and parse event JSON file
 */
async function loadEvents(filePath: string): Promise<RawEvent[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content) as unknown;

  if (!Array.isArray(data)) {
    throw new Error('Event data must be an array');
  }

  return data as RawEvent[];
}

/**
 * Validate that events have required fields
 */
function validateEvents(events: RawEvent[]): void {
  if (events.length === 0) {
    throw new Error('No events found in file');
  }

  const firstEvent = events[0];
  if (!firstEvent.user_id || !firstEvent.event_name || !firstEvent.timestamp) {
    throw new Error('Events must have user_id, event_name, and timestamp fields');
  }
}

/**
 * Build funnel steps from events
 */
function buildFunnelSteps(
  events: RawEvent[],
  stepNames: string[]
): { steps: FunnelStep[]; biggestDropOffStep: string | undefined } {
  // Sort events by timestamp
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Track unique users at each step
  const stepData: Map<
    string,
    {
      users: Set<string>;
      events: number;
      nextStepTimes: number[];
    }
  > = new Map();

  for (const stepName of stepNames) {
    stepData.set(stepName, { users: new Set(), events: 0, nextStepTimes: [] });
  }

  // Track user progress through funnel
  const userProgress: Map<string, { currentStep: number; lastEventTime: Date }> = new Map();

  for (const event of sortedEvents) {
    const stepIndex = stepNames.indexOf(event.event_name);
    if (stepIndex === -1) continue; // Not a funnel step

    const stepName = stepNames[stepIndex];
    const data = stepData.get(stepName)!;

    // Count unique users and total events
    data.users.add(event.user_id);
    data.events++;

    // Track time to next step
    const userState = userProgress.get(event.user_id);
    if (userState) {
      // Check if user is progressing forward
      if (stepIndex > userState.currentStep) {
        const prevStepName = stepNames[userState.currentStep];
        const prevData = stepData.get(prevStepName)!;
        const timeDiff =
          new Date(event.timestamp).getTime() - userState.lastEventTime.getTime();
        prevData.nextStepTimes.push(timeDiff / 1000); // Convert to seconds
        userState.currentStep = stepIndex;
        userState.lastEventTime = new Date(event.timestamp);
      }
    } else if (stepIndex === 0) {
      // First step
      userProgress.set(event.user_id, {
        currentStep: 0,
        lastEventTime: new Date(event.timestamp),
      });
    }
  }

  // Build funnel steps
  const steps: FunnelStep[] = [];
  let previousUsers = 0;
  let biggestDropOffStep: string | undefined;
  let maxDropOffRate = 0;

  for (let i = 0; i < stepNames.length; i++) {
    const stepName = stepNames[i];
    const data = stepData.get(stepName)!;
    const uniqueUsers = data.users.size;

    let dropOffCount = 0;
    let dropOffRate = 0;

    if (i === 0) {
      // First step - drop-off is users who never entered
      dropOffCount = 0;
      dropOffRate = 0;
    } else {
      // Subsequent steps
      dropOffCount = previousUsers - uniqueUsers;
      dropOffRate = previousUsers > 0 ? dropOffCount / previousUsers : 0;
    }

    // Calculate average time to next step
    const avgTimeToNext =
      data.nextStepTimes.length > 0
        ? data.nextStepTimes.reduce((a, b) => a + b, 0) / data.nextStepTimes.length
        : undefined;

    steps.push({
      step_name: stepName,
      event_name: stepName,
      unique_users: uniqueUsers,
      total_events: data.events,
      drop_off_count: Math.max(0, dropOffCount),
      drop_off_rate: Math.max(0, dropOffRate),
      avg_time_to_next_seconds: avgTimeToNext,
    });

    // Track biggest drop-off
    if (i > 0 && dropOffRate > maxDropOffRate) {
      maxDropOffRate = dropOffRate;
      biggestDropOffStep = stepName;
    }

    previousUsers = uniqueUsers;
  }

  return { steps, biggestDropOffStep };
}

/**
 * Analyze events and compute funnel metrics
 */
export async function analyzeFunnel(options: FunnelOptions): Promise<FunnelMetrics> {
  const { tenantContext, sourceFile, funnelName, steps } = options;

  // Load and validate events
  const events = await loadEvents(sourceFile);
  validateEvents(events);

  // Get date range
  const timestamps = events.map((e) => new Date(e.timestamp).getTime());
  const minDate = new Date(Math.min(...timestamps));
  const maxDate = new Date(Math.max(...timestamps));

  // Build funnel
  const { steps: funnelSteps, biggestDropOffStep } = buildFunnelSteps(events, steps);

  // Calculate totals
  const totalEntrances = funnelSteps[0]?.unique_users ?? 0;
  const totalConversions = funnelSteps[funnelSteps.length - 1]?.unique_users ?? 0;
  const overallConversionRate = totalEntrances > 0 ? totalConversions / totalEntrances : 0;

  // Build evidence
  const evidence: EvidenceLink[] = [
    createEvidence('json_path', '$.length', 'Total events processed', events.length),
    createEvidence(
      'json_path',
      '$[*].timestamp',
      'Date range',
      `${minDate.toISOString()} to ${maxDate.toISOString()}`
    ),
  ];

  if (biggestDropOffStep) {
    const dropOffStep = funnelSteps.find((s) => s.step_name === biggestDropOffStep);
    if (dropOffStep) {
      evidence.push(
        createEvidence(
          'calculation',
          'drop_off_rate',
          `Biggest drop-off at ${biggestDropOffStep}`,
          Math.round(dropOffStep.drop_off_rate * 100)
        )
      );
    }
  }

  return {
    ...tenantContext,
    id: generateId(),
    computed_at: new Date().toISOString(),
    source_file: sourceFile,
    funnel_name: funnelName,
    date_range: {
      start: minDate.toISOString(),
      end: maxDate.toISOString(),
    },
    total_entrances: totalEntrances,
    total_conversions: totalConversions,
    overall_conversion_rate: overallConversionRate,
    steps: funnelSteps,
    biggest_drop_off_step: biggestDropOffStep,
    evidence,
  };
}

/**
 * Infer funnel steps from event data by frequency
 */
export function inferFunnelSteps(events: RawEvent[], maxSteps = 5): string[] {
  const eventCounts = new Map<string, number>();

  for (const event of events) {
    const count = eventCounts.get(event.event_name) ?? 0;
    eventCounts.set(event.event_name, count + 1);
  }

  // Sort by frequency and return top events
  return Array.from(eventCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxSteps)
    .map(([name]) => name);
}