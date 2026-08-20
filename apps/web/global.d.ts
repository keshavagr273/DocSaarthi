declare module 'next' {
  export interface Metadata {
    title?: string | { default: string; template?: string };
    description?: string;
    keywords?: string[];
    [key: string]: unknown;
  }
  export interface NextConfig {
    [key: string]: unknown;
  }
}

declare module 'next/link' {
  import React from 'react';
  export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string | { pathname?: string; query?: Record<string, string | number | boolean> };
    as?: string;
    replace?: boolean;
    scroll?: boolean;
    shallow?: boolean;
    passHref?: boolean;
    prefetch?: boolean;
  }
  const Link: React.ForwardRefExoticComponent<
    React.PropsWithoutRef<LinkProps> & React.RefAttributes<HTMLAnchorElement>
  >;
  export default Link;
}

declare module 'next/navigation' {
  export function useRouter(): {
    push(url: string): void;
    replace(url: string): void;
    back(): void;
    forward(): void;
    refresh(): void;
    prefetch(url: string): void;
  };
  export function usePathname(): string;
  export function useSearchParams(): URLSearchParams;
  export function useParams<T = Record<string, string | string[]>>(): T;
}

declare module 'next/server' {
  export class NextResponse extends Response {
    static next(init?: ResponseInit): NextResponse;
    static redirect(url: string | URL, init?: number | ResponseInit): NextResponse;
    static json(body: unknown, init?: ResponseInit): NextResponse;
  }
  export interface NextRequest extends Request {
    nextUrl: URL;
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): Array<{ name: string; value: string }>;
      set(name: string, value: string): void;
      delete(name: string): void;
      has(name: string): boolean;
    };
  }
}

declare module 'next/font/google' {
  export type FontFunction = (options?: Record<string, unknown>) => { className: string; style: Record<string, string>; variable?: string };
  export const Plus_Jakarta_Sans: FontFunction;
  export const Playfair_Display: FontFunction;
  export const Inter: FontFunction;
  export const JetBrains_Mono: FontFunction;
  export const Noto_Sans_Devanagari: FontFunction;
}

declare module 'next/dist/lib/metadata/types/metadata-interface.js' {
  export interface Metadata {
    [key: string]: unknown;
  }
  export type ResolvingMetadata = Promise<Metadata>;
  export type ResolvingViewport = Promise<unknown>;
}
