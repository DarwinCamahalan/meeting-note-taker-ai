/**
 * Device-code activation view types. The desktop app opens the system browser
 * to `/activate?code=<device_code>` (docs/40-authentication.md, this spec's
 * PKCE MVP); approving here flips the device_code to "approved" server-side so
 * the desktop's polling `pkceExchange` succeeds.
 *
 * NOTE: `POST /v1/auth/pkce/approve` is NOT part of the 4-endpoint SDK surface
 * (start/exchange/refresh/me). It is the device-approval step the `api` service
 * must expose for this screen.
 *
 * TODO(api): implement `POST /v1/auth/pkce/approve { device_code }` — MVP may
 * auto-approve for a dev user.
 * TODO(real IdP: Clerk/WorkOS): replace this hand-rolled approval with the
 * IdP's device-authorization consent screen.
 */
export interface ApproveDeviceRequest {
  device_code: string;
}

export interface ApproveDeviceResponse {
  approved: true;
}

export type ActivateStatus = 'idle' | 'approving' | 'approved' | 'error';

export interface ActivateState {
  status: ActivateStatus;
  error: string | null;
}
