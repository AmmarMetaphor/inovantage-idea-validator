/*
  Wrapper that turns a handler into a Netlify Function (modern Request/
  Response signature). Builds the dependency container per invocation and
  converts thrown errors into JSON responses without leaking internals.
*/
import type { Context } from '@netlify/functions';
import { randomUUID } from 'node:crypto';
import { buildDeps, type Deps } from './deps';
import { errorResponse } from './http';

export type Handler = (req: Request, deps: Deps, contextIp?: string) => Promise<Response>;

export function netlifyFunction(name: string, handler: Handler) {
  return async (req: Request, context: Context): Promise<Response> => {
    const requestId = context?.requestId ?? randomUUID();
    const deps = buildDeps({ requestId, fn: name });
    try {
      return await handler(req, deps, context?.ip);
    } catch (err) {
      return errorResponse(err, deps.log);
    }
  };
}
