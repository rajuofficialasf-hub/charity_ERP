/// <reference types="vite/client" />
/// <reference types="@serwist/vite/typings" />

interface ImportMetaEnv {
  /** Adds the dev-only component gallery route to a build (the E2E build only). */
  readonly VITE_DEV_GALLERY?: string;
  /** Shows the dummy-OTP note on the reset screen (development and E2E builds only, BD-49). */
  readonly VITE_OTP_DUMMY?: string;
  /** The app version sent as X-Client-Version (defined in vite.config.ts). */
  readonly VITE_APP_VERSION?: string;
}
