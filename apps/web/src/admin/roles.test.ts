import { describe, expect, it } from 'vitest';
import {
  canApproveStaff,
  canBuildForms,
  canManagePublicLink,
  canPlaceForms,
  canAssignVolunteers,
  canGrantOnProject,
  canMarkPaid,
  canBlock,
  canCreateProjects,
  canDecideEdits,
  canHandOver,
  canApproveRegistrations,
  canManagePermissions,
  canManagePrograms,
  canOpenAdmin,
  canSeeBeneficiaries,
  canSeeCategories,
  canSeePrograms,
  canSeeProjects,
  canSeeVolunteers,
  canAdministerSystem,
  canDecideStaffEdits,
  canEndSessions,
  canEndStaffSessions,
  canKeepNisab,
  canManageOfficials,
  canOversee,
  canSeeStaff,
  holdsGlobalRole,
} from './roles';

// What the admin area shows per role (permissions.yaml role defaults; the server decides anyway).
const as = (...roles: string[]) => ({ roles });

describe('admin role lists', () => {
  it('opens the admin area for every role with a destination there', () => {
    for (const role of [
      'admin',
      'department_head',
      'monitoring_team',
      'program_manager',
      'regional_program_manager',
      'project_executive',
      'official_daee',
      'media_team',
      'media_director',
      'media_assistant_director',
      'procurement_team',
    ])
      expect(canOpenAdmin(as(role)), role).toBe(true);
    for (const role of ['finance_team', 'volunteer_general', 'volunteer_team_member'])
      expect(canOpenAdmin(as(role)), role).toBe(false);
  });

  it('gives the volunteer tab to officials and the beneficiary tab also to Media and Procurement', () => {
    for (const role of ['official_daee', 'regional_program_manager'])
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

  it('keeps the administration for an Admin and the Department Head, and from the Monitoring Team', () => {
    for (const check of [
      canManagePermissions,
      canApproveStaff,
      canDecideStaffEdits,
      canHandOver,
      canManageOfficials,
      canAdministerSystem,
      canEndStaffSessions,
    ]) {
      expect(check(as('admin'))).toBe(true);
      expect(check(as('department_head'))).toBe(true);
      expect(check(as('monitoring_team'))).toBe(false);
      expect(check(as('program_manager', 'regional_program_manager'))).toBe(false);
    }
    // an RPM ends the sessions of the region's volunteers; the Monitoring Team ends nobody's
    expect(canEndSessions(as('regional_program_manager'))).toBe(true);
    expect(canEndSessions(as('monitoring_team'))).toBe(false);
  });

  it('leaves the Monitoring Team the oversight: the audit log, the message deliveries, the nisab and the staff list', () => {
    for (const role of ['admin', 'department_head', 'monitoring_team']) {
      expect(canOversee(as(role)), role).toBe(true);
      expect(canKeepNisab(as(role)), role).toBe(true);
      expect(canSeeStaff(as(role)), role).toBe(true);
      expect(holdsGlobalRole(as(role)), role).toBe(true);
    }
    expect(canOversee(as('program_manager'))).toBe(false);
    expect(holdsGlobalRole(as('program_manager'))).toBe(false);
  });

  it('gives an Admin everything the Department Head has', () => {
    for (const check of [
      canManagePrograms,
      canCreateProjects,
      canAssignVolunteers,
      canMarkPaid,
      canGrantOnProject,
      canBuildForms,
      canPlaceForms,
      canManagePublicLink,
      canBlock,
      canDecideEdits,
      canSeeVolunteers,
      canSeeBeneficiaries,
      canApproveRegistrations,
    ])
      expect(check(as('admin'))).toBe(check(as('department_head')));
  });

  it('gives edit decisions to the RPM and the Executive, the blocklist to the PM and the RPM', () => {
    expect(canDecideEdits(as('regional_program_manager'))).toBe(true);
    expect(canDecideEdits(as('project_executive'))).toBe(true);
    expect(canDecideEdits(as('program_manager'))).toBe(false);
    expect(canBlock(as('program_manager'))).toBe(true);
    expect(canBlock(as('regional_program_manager'))).toBe(true);
    expect(canBlock(as('project_executive'))).toBe(false);
  });

  it('gives the programs to the PM read-only and their changes to the global roles', () => {
    expect(canSeePrograms(as('program_manager'))).toBe(true);
    expect(canManagePrograms(as('program_manager'))).toBe(false);
    expect(canSeePrograms(as('regional_program_manager'))).toBe(false);
    for (const role of ['department_head', 'monitoring_team'])
      expect(canManagePrograms(as(role)), role).toBe(true);
  });

  it('shows projects to the field management and lets the PM and the global roles create them', () => {
    for (const role of ['regional_program_manager', 'project_executive', 'program_manager'])
      expect(canSeeProjects(as(role)), role).toBe(true);
    expect(canSeeProjects(as('official_daee'))).toBe(false);
    expect(canCreateProjects(as('program_manager'))).toBe(true);
    expect(canCreateProjects(as('regional_program_manager'))).toBe(false);
  });

  it('gives assignment to the RPM, the executive and the global roles, never to the PM', () => {
    for (const role of ['regional_program_manager', 'project_executive', 'department_head'])
      expect(canAssignVolunteers(as(role)), role).toBe(true);
    expect(canAssignVolunteers(as('program_manager'))).toBe(false);
    expect(canAssignVolunteers(as('volunteer_general'))).toBe(false);
  });

  it('lets only the RPM and the global roles mark paid and grant an executive', () => {
    for (const role of ['regional_program_manager', 'monitoring_team']) {
      expect(canMarkPaid(as(role)), role).toBe(true);
      expect(canGrantOnProject(as(role)), role).toBe(true);
    }
    for (const role of ['project_executive', 'program_manager']) {
      expect(canMarkPaid(as(role)), role).toBe(false);
      expect(canGrantOnProject(as(role)), role).toBe(false);
    }
  });

  it('lets only the two global roles build forms, and no PM, RPM or field role', () => {
    for (const role of ['department_head', 'monitoring_team'])
      expect(canBuildForms(as(role)), role).toBe(true);
    for (const role of [
      'program_manager',
      'regional_program_manager',
      'project_executive',
      'volunteer_general',
    ])
      expect(canBuildForms(as(role)), role).toBe(false);
  });

  it('lets the PM and the two global roles place ready forms, and no RPM or field role', () => {
    for (const role of ['program_manager', 'department_head', 'monitoring_team'])
      expect(canPlaceForms(as(role)), role).toBe(true);
    for (const role of ['regional_program_manager', 'project_executive', 'volunteer_general'])
      expect(canPlaceForms(as(role)), role).toBe(false);
  });

  it('lets the PM and the two global roles manage the public link, and no RPM or field role', () => {
    for (const role of ['program_manager', 'department_head', 'monitoring_team'])
      expect(canManagePublicLink(as(role)), role).toBe(true);
    for (const role of ['regional_program_manager', 'project_executive', 'volunteer_general'])
      expect(canManagePublicLink(as(role)), role).toBe(false);
  });
});
