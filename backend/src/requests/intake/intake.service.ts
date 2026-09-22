import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { INTAKE_PROVIDER, IntakeCandidate, IntakeProvider } from './intake.provider';

export const PRODUCT_DEPARTMENTS = ['IT', 'HR', 'Finance'] as const;
export const PRODUCT_CATEGORIES = ['Hardware', 'Access', 'People', 'Finance', 'Other'] as const;
export const PRODUCT_PRIORITIES = ['Low', 'Medium', 'High'] as const;

export type IntakeOutcome = 'READY' | 'NEEDS_CLARIFICATION' | 'INVALID_AI_OUTPUT' | 'PROVIDER_UNAVAILABLE';

export type IntakeResult = {
  outcome: IntakeOutcome;
  candidate: {
    title: string;
    description: string;
    category: string;
    priority: string;
    departmentId: string;
  } | null;
  clarification?: string;
};

@Injectable()
export class IntakeService {
  constructor(@Inject(INTAKE_PROVIDER) private readonly provider: IntakeProvider) {}

  async classify(text: string, trustedDepartmentId?: string): Promise<IntakeResult> {
    let raw: unknown;
    try {
      raw = await this.provider.complete(text);
    } catch {
      throw new ServiceUnavailableException({
        outcome: 'PROVIDER_UNAVAILABLE',
        candidate: null,
        clarification: 'The advisory classifier is unavailable. Submit the request using the normal form.',
      });
    }

    const candidate = this.validateCandidate(raw);
    if (!candidate) {
      return {
        outcome: 'INVALID_AI_OUTPUT',
        candidate: null,
        clarification: 'The advisory result did not match product rules. Submit the request using the normal form.',
      };
    }

    const departmentId = trustedDepartmentId ?? candidate.departmentId;
    if (!PRODUCT_DEPARTMENTS.includes(departmentId as typeof PRODUCT_DEPARTMENTS[number])) {
      return {
        outcome: 'NEEDS_CLARIFICATION',
        candidate: null,
        clarification: 'Which department should handle this request: IT, HR, or Finance?',
      };
    }

    return { outcome: 'READY', candidate: { ...candidate, departmentId } };
  }

  private validateCandidate(raw: unknown): {
    title: string;
    description: string;
    category: string;
    priority: string;
    departmentId: string;
  } | null {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as IntakeCandidate;
    if (typeof candidate.title !== 'string' || !candidate.title.trim()) return null;
    if (typeof candidate.description !== 'string' || !candidate.description.trim()) return null;
    if (!PRODUCT_CATEGORIES.includes(candidate.category as typeof PRODUCT_CATEGORIES[number])) return null;
    if (!PRODUCT_PRIORITIES.includes(candidate.priority as typeof PRODUCT_PRIORITIES[number])) return null;
    return {
      title: candidate.title.trim(),
      description: candidate.description.trim(),
      category: candidate.category as string,
      priority: candidate.priority as string,
      departmentId: PRODUCT_DEPARTMENTS.includes(candidate.departmentId as typeof PRODUCT_DEPARTMENTS[number])
        ? candidate.departmentId as string
        : '',
    };
  }
}