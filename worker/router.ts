import { authenticate } from './auth.js'
import { UploadError, errorResponse, methodNotAllowed } from './errors.js'

export interface RouteContext {
  request: Request
  env: Env
  /** Capture groups of the route pattern, raw (not URI-decoded). */
  params: string[]
  /** The signed-in PocketBase owner. Called by the handler, after its own input checks. */
  owner: () => Promise<string>
}

type Handler = (context: RouteContext) => Promise<Response> | Response

/**
 * One API path. `methods` maps each allowed method to its handler; a path whose handler checks
 * methods itself (downloads, file actions) uses `any`. A matched path never falls through to a
 * later route: a wrong method answers 405 with Allow, as it always has.
 */
export interface Route {
  path: string | RegExp
  methods?: Partial<Record<'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE', Handler>>
  any?: Handler
}

function match(path: string | RegExp, pathname: string): string[] | null {
  if (typeof path === 'string') return path === pathname ? [] : null
  const result = path.exec(pathname)
  return result ? result.slice(1) : null
}

/** First matching path wins, so list specific paths before the prefixes that contain them. */
export function createRouter(routes: Route[]) {
  return async (request: Request, env: Env, pathname: string): Promise<Response> => {
    for (const route of routes) {
      const params = match(route.path, pathname)
      if (!params) continue
      const handler = route.any ?? route.methods?.[request.method as keyof NonNullable<Route['methods']>]
      if (!handler) return methodNotAllowed(Object.keys(route.methods ?? {}).join(', '))
      return handler({ request, env, params, owner: () => authenticate(request, env) })
    }
    return errorResponse(new UploadError('接口不存在', 404, 'NOT_FOUND'))
  }
}

/** Decode a path segment, rejecting malformed escapes as a client error. */
export function decodeParam(value: string, message: string, code: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new UploadError(message, 400, code)
  }
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** `^<base>/(rest)$` for prefix routes such as file actions under a collection path. */
export function under(base: string): RegExp {
  return new RegExp(`^${escape(base)}/(.+)$`, 'u')
}

/** `^<base>/<segment>/<segment>$` with each `:name` as one captured path segment. */
export function pattern(base: string, suffix: string): RegExp {
  return new RegExp(`^${escape(base)}${suffix.replace(/:[a-z]+/gu, '([^/]+)')}$`, 'u')
}
