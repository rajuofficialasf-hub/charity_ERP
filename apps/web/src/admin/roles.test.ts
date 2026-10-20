import { describe, expect, it } from 'vitest';
import {
  canApproveStaff,
  canBlock,
  canDecideEdits,
  canHandOver,
  canApproveRegistrations,
  canManagePermissions,
  canOpenAdmin,
  canSeeBeneficiaries,
  canSeeCategories,
  canSeeVolunteers,
} from './roles';

// What the admin area shows per role (permissions.yaml role defaults; the server decides anyway).
const as = (...roles: string[]) => ({ roles });

describe('admin role lists', () => {
  it('opens the admin area for every role with a destination there', () => {
    for (const role of [
      'department_head',
      'monitoring_team',
      'program_manager',
      'regional_program_manager',
      'project_executive',
      'official_daee',
      'implementer',
      'media_team',
      'procurement_team',
    ])
      expect(canOpenAdmin(as(role)), role).toBe(true);
    for (const role of ['finance_team', 'volunteer_general', 'volunteer_team_member'])
      expect(canOpenAdmin(as(role)), role).toBe(false);
  });

  it('gives the volunteer tab to officials and the beneficiary tab also to Media and Procurement', () => {
    for (const role of ['official_daee', 'implementer', 'regional_program_manager'])
      expect(canSeeVolunteers(as(role)), role).toBe(true);
    for (const role of ['media_team', 'procurement_team', 'finance_team'])
      expect(canSeeVolunteers(as(role)), role).toBe(false);
    for (const role of ['media_team', 'procurement_team', 'official_daee'])
      expect(canSeeBeneficiaries(as(role)), role).toBe(true);
    expect(canSeeBeneficiaries(as('finance_team'))).toBe(false);
  });

  it('keeps registrations and categories for the management roles', () => {
    expect(canApproveRegistrations(as('project_executive'))).toBe(true);
    expect(canApproveRegistrations(as('official_daee'))).toBe(false);
    expect(canSeeCategories(as('regional_program_manager'))).toBe(true);
    expect(canSeeCategories(as('official_daee'))).toBe(false);
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
