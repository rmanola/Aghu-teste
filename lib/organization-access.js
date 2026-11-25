/**
 * RBAC de organização — ortogonal a lib/workspace-access.js (CPIORG-AC-04).
 * Papéis lidos só de aghu_organization_members; nunca herdados do workspace.
 */
(function (root) {
  "use strict";

  var ORG_ROLE_PERMISSIONS = {
    org_admin: {
      manage_organization: true,
      admit_workspace: true,
      remove_workspace: true,
      manage_org_members: true,
      view_org_rollup: true,
    },
    org_viewer: {
      manage_organization: false,
      admit_workspace: false,
      remove_workspace: false,
      manage_org_members: false,
      view_org_rollup: true,
    },
  };

  function canPerformOrgRole(role, operation) {
    var perms = ORG_ROLE_PERMISSIONS[role];
    return !!(perms && perms[operation]);
  }

  /**
   * CPIORG-AC-02: transição de request_workspace.
   * Nunca rebaixa active nem limpa accepted_by de uma admissão viva.
   * removed → novo pending; pending → no-op; ausente → write pending.
   */
  function planWorkspaceAdmissionRequest(existing) {
    var status = existing && existing.status;
    if (status === "active") {
      return {
        kind: "conflict",
        httpStatus: 409,
        error: "admission_already_active",
        status: "active",
      };
    }
    if (status === "pending") {
      return { kind: "noop", httpStatus: 200, status: "pending" };
    }
    return { kind: "write", httpStatus: 200, status: "pending" };
  }

  /**
   * CPIORG-AC-02: o owner/admin do workspace é o outro lado do consentimento.
   * Membership do aceitante na org NÃO entra — só o papel de workspace
   * e a revalidação de que requested_by continua org_admin activo.
   */
  function authorizeWorkspaceAdmissionAccept(input) {
    var wsRole = input && input.acceptorWorkspaceRole;
    if (wsRole !== "owner" && wsRole !== "admin") {
      return {
        ok: false,
        error: "workspace_role_forbidden",
        httpStatus: 403,
      };
    }
    if (
      !input ||
      input.requesterOrgStatus !== "active" ||
      !canPerformOrgRole(input.requesterOrgRole, "admit_workspace")
    ) {
      return { ok: false, error: "org_role_forbidden", httpStatus: 403 };
    }
    return { ok: true };
  }

  root.AghuOrganizationAccess = {
    ORG_ROLE_PERMISSIONS: ORG_ROLE_PERMISSIONS,
    canPerformOrgRole: canPerformOrgRole,
    planWorkspaceAdmissionRequest: planWorkspaceAdmissionRequest,
    authorizeWorkspaceAdmissionAccept: authorizeWorkspaceAdmissionAccept,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.AghuOrganizationAccess;
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : {});
