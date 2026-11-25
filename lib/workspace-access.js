/**
 * RBAC de workspace — extensão (sem ES modules).
 */
(function (root) {
  "use strict";

  var ROLE_PERMISSIONS = {
    owner: {
      read_phi: true,
      sync: true,
      delete_patient: true,
      invite_member: true,
      manage_members: true,
      billing: true,
      manage_study_protocols: true,
      set_active_study_protocol: true,
      triage_study_enrollment: true,
      write_research_crf: true,
      write_clinical_capture: true,
      view_peer_performance: true,
      decide_cpi_governance: true,
    },
    admin: {
      read_phi: true,
      sync: true,
      delete_patient: true,
      invite_member: true,
      manage_members: true,
      billing: false,
      manage_study_protocols: true,
      set_active_study_protocol: true,
      triage_study_enrollment: true,
      write_research_crf: true,
      write_clinical_capture: true,
      view_peer_performance: true,
      decide_cpi_governance: true,
    },
    physician: {
      read_phi: true,
      sync: true,
      delete_patient: true,
      invite_member: false,
      manage_members: false,
      billing: false,
      manage_study_protocols: true,
      set_active_study_protocol: true,
      triage_study_enrollment: true,
      write_research_crf: true,
      write_clinical_capture: true,
      view_peer_performance: false,
      decide_cpi_governance: true,
    },
    resident: {
      read_phi: true,
      sync: true,
      delete_patient: false,
      invite_member: false,
      manage_members: false,
      billing: false,
      manage_study_protocols: false,
      set_active_study_protocol: true,
      triage_study_enrollment: true,
      write_research_crf: true,
      write_clinical_capture: true,
      view_peer_performance: false,
      decide_cpi_governance: false,
    },
    read_only: {
      read_phi: true,
      sync: false,
      delete_patient: false,
      invite_member: false,
      manage_members: false,
      billing: false,
      manage_study_protocols: false,
      set_active_study_protocol: false,
      triage_study_enrollment: false,
      write_research_crf: false,
      write_clinical_capture: false,
      view_peer_performance: false,
      decide_cpi_governance: false,
    },
  };

  function canPerformRole(role, operation) {
    var perms = ROLE_PERMISSIONS[role];
    return !!(perms && perms[operation]);
  }

  root.AghuWorkspaceAccess = {
    WORKSPACE_HEADER: "X-AGHU-Workspace-Id",
    WORKSPACE_STORAGE_KEY: "aghu_active_workspace_v1",
    canPerformRole: canPerformRole,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.AghuWorkspaceAccess;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {});
