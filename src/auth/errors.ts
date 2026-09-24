export const SIGN_IN_CANCELLED = "Sign-in was cancelled.";
export const SIGN_IN_BLOCKED =
  "Sign in is blocked — add this site's host name to the Firebase project's Authorized Domains (host name only, no protocol or port), then retry.";
export const PROVIDER_DISABLED =
  "Google sign-in is not enabled in this Firebase project — enable Authentication → Sign-in method → Google, then reload.";
export const SIGN_IN_FAILED = "Could not sign in. Please try again.";

export function authErrorMessage(code?: string): string {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/popup-blocked":
      return SIGN_IN_CANCELLED;
    case "auth/unauthorized-domain":
      return SIGN_IN_BLOCKED;
    case "auth/operation-not-allowed":
    case "auth/admin-restricted-operation":
      return PROVIDER_DISABLED;
    default:
      return SIGN_IN_FAILED;
  }
}
