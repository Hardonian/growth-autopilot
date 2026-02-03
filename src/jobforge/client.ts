import { type JobRequest, type TenantContext } from '../contracts/index.js';

/**
 * Compatibility shim for @autopilot/jobforge-client.
 * Replace this module with the official package when available.
 */

export interface JobRequestOptions {
  priority?: JobRequest['priority'];
  triggeredBy?: string;
  correlationId?: string;
  relatedAuditId?: string;
  notes?: string;
  scheduledFor?: string;
  maxCostUsd?: number;
  deadline?: string;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function buildJobRequest(
  tenantContext: TenantContext,
  jobType: JobRequest['job_type'],
  payload: JobRequest['payload'],
  options?: JobRequestOptions
): JobRequest {
  return {
    tenant_id: tenantContext.tenant_id,
    project_id: tenantContext.project_id,
    id: generateId(),
    created_at: new Date().toISOString(),
    job_type: jobType,
    payload,
    priority: options?.priority ?? 'normal',
    context: {
      triggered_by: options?.triggeredBy ?? 'growth-autopilot',
      correlation_id: options?.correlationId,
      related_audit_id: options?.relatedAuditId,
      notes: options?.notes,
    },
    constraints: {
      auto_execute: false,
      require_approval: true,
      deadline: options?.deadline ?? options?.scheduledFor,
      max_cost_usd: options?.maxCostUsd,
    },
  };
}

export function createGrowthSEOScanRequest(
  tenantContext: TenantContext,
  sourcePath: string,
  options?: JobRequestOptions
): JobRequest {
  return buildJobRequest(
    tenantContext,
    'autopilot.growth.seo_scan',
    {
      source_path: sourcePath,
    },
    options
  );
}

export type { JobRequest, TenantContext };
