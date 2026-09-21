import type { SVGProps } from "react";

export function GoogleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3.01h3.87c2.27-2.09 3.55-5.17 3.55-8.66Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.87-3a7.15 7.15 0 0 1-10.6-3.76H1.5v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.47 14.34a7.2 7.2 0 0 1 0-4.62v-3.1H1.5a12 12 0 0 0 0 10.82l3.97-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.43C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.5 6.62l3.97 3.1A7.15 7.15 0 0 1 12 4.75Z"
      />
    </svg>
  );
}
