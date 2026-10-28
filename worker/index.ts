import { ARCHIVE_ADMIN_PATH, archiveAdmin } from './archive-admin.js'
import { PDF_FILE_ID, storedPdf } from './archive.js'
import { UploadError, errorResponse } from './errors.js'
import { abortMultipart, completeMultipart, createMultipart, uploadPart } from './multipart.js'
import { MULTIPART_PATH, UPLOAD_PATH, type PdfStorageEnv } from './pdf.js'
import { RELAY_PATH, relayUpload } from './relay.js'
import { singleUpload } from './single-upload.js'
import { DOWNLOAD_PATH, downloadArchive } from './download.js'
import { LIBRARY_PATH, LIBRARY_SOURCE_PATH, libraryEnv, libraryFile, librarySource, listLibraryFiles } from './library.js'
import { importLegacyFiles } from './library-import.js'
import { LIBRARY_FOLDERS_PATH, folderCollection, folderItem } from './library-folders.js'
import { createRouter, decodeParam, pattern, under, type Route } from './router.js'

type Storage = (request: Request, env: Env) => PdfStorageEnv

/** Create, fill, complete and abort a multipart upload into one storage scope. */
function multipartRoutes(base: string, storage: Storage, version: 1 | 2): Route[] {
  const uploadId = (raw: string) => decodeParam(raw, '上传编号格式无效', 'INVALID_UPLOAD_ID')
  return [
    { path: base, methods: { POST: async ({ request, env, owner }) => createMultipart(request, storage(request, env), await owner(), version) } },
    {
      path: pattern(base, '/:id/parts/:number'),
      methods: {
        PUT: async ({ request, env, params, owner }) => {
          const id = uploadId(params[0])
          return uploadPart(request, storage(request, env), await owner(), id, params[1], version)
        },
      },
    },
    {
      path: pattern(base, '/:id/complete'),
      methods: {
        POST: async ({ request, env, params, owner }) => {
          const id = uploadId(params[0])
          return completeMultipart(request, storage(request, env), await owner(), id, version)
        },
      },
    },
    {
      path: pattern(base, '/:id'),
      methods: {
        DELETE: async ({ request, env, params, owner }) => {
          const id = uploadId(params[0])
          return abortMultipart(request, storage(request, env), await owner(), id, version)
        },
      },
    },
  ]
}

const conversionStorage: Storage = (_request, env) => env

/**
 * Every `/api/*` endpoint of the Remote edge worker. Static assets and the SPA fallback never
 * reach this table. Specific paths come before the prefixes that contain them.
 */
const routes: Route[] = [
  { path: under(ARCHIVE_ADMIN_PATH), any: ({ request, env }) => archiveAdmin(request, env) },
  // Persistent file library (R2 LIBRARY_FILES).
  { path: `${LIBRARY_PATH}/import`, methods: { POST: async ({ request, env, owner }) => importLegacyFiles(request, env, await owner()) } },
  { path: under(LIBRARY_SOURCE_PATH), any: ({ request, env, params, ctx }) => librarySource(request, env, params[0], ctx) },
  { path: LIBRARY_PATH, methods: { GET: async ({ request, env, owner }) => listLibraryFiles(request, libraryEnv(request, env), await owner()) } },
  ...multipartRoutes(`${LIBRARY_PATH}/uploads/multipart`, libraryEnv, 2),
  { path: under(LIBRARY_PATH), any: async ({ request, env, params, owner }) => libraryFile(request, libraryEnv(request, env), await owner(), params[0]) },
  {
    path: LIBRARY_FOLDERS_PATH,
    methods: {
      GET: async ({ request, env, owner }) => folderCollection(request, libraryEnv(request, env), await owner()),
      POST: async ({ request, env, owner }) => folderCollection(request, libraryEnv(request, env), await owner()),
    },
  },
  { path: pattern(LIBRARY_FOLDERS_PATH, '/:id'), any: async ({ request, env, params, owner }) => folderItem(request, libraryEnv(request, env), await owner(), params[0]) },

  // File conversion: artifact downloads, the private coordinator binding and source uploads.
  { path: DOWNLOAD_PATH, any: ({ request, env }) => downloadArchive(request, env) },
  {
    path: '/api/file-conversion/dispatcher',
    methods: {
      GET: async ({ env, owner }) => {
        await owner()
        return env.FILE_CONVERTER.fetch('https://converter.internal/status')
      },
    },
  },
  {
    path: '/api/file-conversion/wake',
    methods: {
      POST: async ({ env, owner }) => {
        await owner()
        // Only a wake signal crosses the private binding. Jobs and parameters come from PocketBase.
        return env.FILE_CONVERTER.fetch('https://converter.internal/wake', { method: 'POST' })
      },
    },
  },
  {
    path: UPLOAD_PATH,
    methods: {
      PUT: async ({ request, env, owner }) => {
        await owner()
        return singleUpload(request, env)
      },
    },
  },
  // Converter relay: authenticated by the server secret inside, not by a user session.
  { path: RELAY_PATH, methods: { PUT: ({ request, env }) => relayUpload(request, env) } },
  ...multipartRoutes(MULTIPART_PATH, conversionStorage, 1),
]

const apiRequest = createRouter(routes)

export default {
  async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    try {
      // Preserve already-issued R2 domain URLs after moving their bytes to Assets.
      if (env.PDF_PUBLIC_BASE_URL && url.origin === new URL(env.PDF_PUBLIC_BASE_URL).origin) {
        const key = url.pathname.slice(1)
        if (!PDF_FILE_ID.test(key)) throw new UploadError('文件不存在', 404, 'FILE_NOT_FOUND')
        if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } })
        return await storedPdf(request, env, env.PDF_UPLOADS, key, ctx)
      }
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
      return await apiRequest(request, env, url.pathname, ctx)
    } catch (error) {
      if (error instanceof UploadError) return errorResponse(error)
      console.error(JSON.stringify({ event: 'pdf_upload_failed', code: 'INTERNAL_ERROR' }))
      return errorResponse(new UploadError('上传失败，请稍后重试', 500, 'INTERNAL_ERROR'))
    }
  },
} satisfies ExportedHandler<Env>
