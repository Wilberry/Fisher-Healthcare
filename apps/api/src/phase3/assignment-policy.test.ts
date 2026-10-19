import { describe, expect, it } from 'vitest';
import { advanceAssignment } from './assignment-policy';
describe('field assignment versioned lifecycle', () => {
  it('requires arrival before collection begins', () => {
    expect(advanceAssignment({ status:'assigned',version:0 },
      { action:'arrive',expectedVersion:0 })).toEqual({ status:'arrived',version:1 });
    expect(advanceAssignment({ status:'arrived',version:1 },
      { action:'start_collection',expectedVersion:1 })).toEqual({ status:'collecting',version:2 });
  });
  it('refuses jumping directly into collection and stale versions', () => {
    expect(() => advanceAssignment({ status:'assigned',version:0 },
      { action:'start_collection',expectedVersion:0 })).toThrow('INVALID_ASSIGNMENT_TRANSITION');
    expect(() => advanceAssignment({ status:'assigned',version:1 },
      { action:'arrive',expectedVersion:0 })).toThrow('STALE_ASSIGNMENT_VERSION');
  });
  it('requires controlled failure reason and forbids terminal replay as a new event', () => {
    expect(() => advanceAssignment({ status:'collecting',version:2 },
      { action:'fail',expectedVersion:2 })).toThrow('ASSIGNMENT_FAILURE_REASON_REQUIRED');
    expect(advanceAssignment({ status:'collecting',version:2 },
      { action:'fail',expectedVersion:2,failureCode:'collection_not_safe' }))
      .toEqual({ status:'failed',version:3 });
    expect(() => advanceAssignment({ status:'failed',version:3 },
      { action:'arrive',expectedVersion:3 })).toThrow('INVALID_ASSIGNMENT_TRANSITION');
  });
});
