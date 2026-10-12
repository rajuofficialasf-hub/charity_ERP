import { describe, expect, it } from 'vitest';
import {
  canApproveStaff,
  canBlock,
  canDecideEdits,
  canHandOver,
  canManagePermissions,
  canOpenAdmin,
} from './roles';

// What the admin area shows per role (permissions.yaml role defaults; the server decides anyway).
const as = (...roles: string[]) => ({ roles });

describe('admin role lists', () => {
  it('opens the admin area for the five management roles only', () => {
    for (const role of [
      'department_head',
      'monitoring_team',
      'program_manager',
      'regional_program_manager',
      'project_executive',
    ])
      expect(canOpenAdmin(as(role))).toBe(true);
    for (const role of ['finance_team', 'media_team', 'volunteer_general', 'official_daee'])
      expect(canOpenAdmin(as(role))).toBe(false);
  });

  it('keeps the panel, the staff decision and the handover for the global roles', () => {
    for (const check of [canManagePermissions, canApproveStaff, canHandOver]) {
      expect(check(as('department_head'))).toBe(true);
      expect(check(as('monitoring_team'))).toBe(true);
      expect(check(as('program_manager', 'regional_program_manager'))).toBe(false);
    }
  });

  it('gives edit decisions to the RPM and the Executive, the blocklist to the PM and the RPM', () => {
    expect(canDecideEdits(as('regional_program_manager'))).toBe(true);
    expect(canDecideEdits(as('project_executive'))).toBe(true);
    expect(canDecideEdits(as('program_manager'))).toBe(false);
    expect(canBlock(as('program_manager'))).toBe(true);
    expect(canBlock(as('regional_program_manager'))).toBe(true);
    expect(canBlock(as('project_executive'))).toBe(false);
  });
});
