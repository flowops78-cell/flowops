declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(...args: unknown[]): any;
}

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };

  function serve(handler: (request: Request) => Response | Promise<Response>): void;
}