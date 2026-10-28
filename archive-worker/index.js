// Private service only: no workers.dev, preview URL, route or custom domain.
export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname
    if (!/^\/chunks\/[a-f0-9]{32}\.bin$/u.test(path) || !['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, { status: 404 })
    }
    return env.ASSETS.fetch(request)
  },
}
