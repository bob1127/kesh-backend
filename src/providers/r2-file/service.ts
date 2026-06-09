/**
 * Cloudflare R2 file provider — same as @medusajs/file-s3 but without ACL.
 * R2 rejects PutObject ACL (public-read), which breaks Medusa admin uploads.
 */
import { PutObjectCommand } from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import { S3FileService } from "@medusajs/file-s3/dist/services/s3-file"
import type { FileTypes, Logger, S3FileServiceOptions } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import path from "path"
import { PassThrough } from "stream"
import { ulid } from "ulid"
import {
  assertR2UploadAllowed,
  getR2StorageLimits,
  recordR2Upload,
} from "../../lib/r2-storage-guard"

const LOG = "[R2 File]"

function log(msg: string, extra?: unknown) {
  if (extra !== undefined) {
    console.log(LOG, msg, extra)
  } else {
    console.log(LOG, msg)
  }
}

function logError(msg: string, err: unknown) {
  const detail =
    err instanceof Error
      ? { message: err.message, name: err.name, stack: err.stack?.split("\n").slice(0, 3) }
      : err
  console.error(LOG, msg, detail)
}

function decodeContent(content: string): Buffer {
  try {
    const decoded = Buffer.from(content, "base64")
    if (decoded.toString("base64") === content) {
      return decoded
    }
    return Buffer.from(content, "utf8")
  } catch {
    return Buffer.from(content, "binary")
  }
}

function publicUrl(fileUrl: string, fileKey: string): string {
  const base = fileUrl.replace(/\/$/, "")
  return `${base}/${fileKey}`
}

function formatErr(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif",
  ".avif", ".heic", ".heif", ".svg",
])

/**
 * 檔名消毒：
 * - 去除路徑穿越（../、./）
 * - 只保留允許的副檔名（防止上傳 .exe / .php 等）
 * - 將空白與特殊字元替換為安全字元
 */
function sanitizeFilename(filename: string): string {
  const base = path.basename(filename).replace(/\.\./g, "").replace(/[/\\]/g, "")
  const ext  = path.extname(base).toLowerCase()
  const stem = path.basename(base, ext).replace(/[^a-zA-Z0-9\-_\u4e00-\u9fff]/g, "_")
  const safeExt = ALLOWED_EXTENSIONS.has(ext) ? ext : ".jpg"
  return `${stem}${safeExt}`
}

export class R2FileService extends S3FileService {
  static override identifier = "s3"

  constructor({ logger }: { logger: Logger }, options: S3FileServiceOptions) {
    super({ logger }, options)
    const limits = getR2StorageLimits()
    log("provider 初始化", {
      bucket: this.config_.bucket,
      region: this.config_.region,
      endpoint: this.config_.endpoint,
      fileUrl: this.config_.fileUrl,
      hasAccessKey: Boolean(this.config_.accessKeyId),
      hasSecret: Boolean(this.config_.secretAccessKey),
      storageHardLimitGb: limits.hardLimitGb,
      storageWarnGb: limits.warnGb,
    })
  }

  override async upload(
    file: FileTypes.ProviderUploadFileDTO
  ): Promise<FileTypes.ProviderFileResultDTO> {
    if (!file?.filename) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No filename provided")
    }

    const sanitizedName = sanitizeFilename(file.filename)
    const parsedFilename = path.parse(sanitizedName)
    const fileKey = `${this.config_.prefix}${parsedFilename.name}-${ulid()}${parsedFilename.ext}`

    log("upload() 開始", { filename: file.filename, sanitized: sanitizedName, fileKey, mimeType: file.mimeType })

    const body = decodeContent(file.content)
    await assertR2UploadAllowed(this.client_, this.config_.bucket, body.length)

    const command = new PutObjectCommand({
      Bucket: this.config_.bucket,
      Body: body,
      Key: fileKey,
      ContentType: file.mimeType,
      CacheControl: this.config_.cacheControl,
      Metadata: {
        "original-filename": encodeURIComponent(file.filename),
      },
    })

    try {
      await this.client_.send(command)
      recordR2Upload(body.length)
      const url = publicUrl(this.config_.fileUrl, fileKey)
      log("upload() 成功", { fileKey, url })
      return { url, key: fileKey }
    } catch (e) {
      logError("upload() 失敗", e)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `[R2] 上傳失敗：${formatErr(e)}`
      )
    }
  }

  override async getUploadStream(fileData: FileTypes.ProviderUploadStreamDTO) {
    if (!fileData.filename) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No filename provided")
    }

    const sanitizedName = sanitizeFilename(fileData.filename)
    const parsedFilename = path.parse(sanitizedName)
    const fileKey = `${this.config_.prefix}${parsedFilename.name}-${ulid()}${parsedFilename.ext}`
    const pass = new PassThrough()

    log("getUploadStream()", { filename: fileData.filename, sanitized: sanitizedName, fileKey })

    await assertR2UploadAllowed(this.client_, this.config_.bucket)

    const upload = new Upload({
      client: this.client_,
      params: {
        Bucket: this.config_.bucket,
        Key: fileKey,
        Body: pass,
        ContentType: fileData.mimeType,
        CacheControl: this.config_.cacheControl,
        Metadata: {
          "original-filename": encodeURIComponent(fileData.filename),
        },
      },
    })

    const promise = upload.done().then(() => ({
      url: publicUrl(this.config_.fileUrl, fileKey),
      key: fileKey,
    }))

    return {
      writeStream: pass,
      promise,
      url: publicUrl(this.config_.fileUrl, fileKey),
      fileKey,
    }
  }

  /**
   * Presigned PUT — 效期固定 5 分鐘（300 秒）。
   * R2 不接受 ContentType 放進簽名，否則瀏覽器 PUT 會回 403。
   * 效期縮短可大幅降低洩漏風險：即使 URL 外流，5 分鐘後自動失效。
   */
  override async getPresignedUploadUrl(
    fileData: FileTypes.ProviderGetPresignedUploadUrlDTO
  ) {
    if (!fileData?.filename) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No filename provided")
    }

    const sanitizedName = sanitizeFilename(fileData.filename)
    const fileKey = `${this.config_.prefix}${sanitizedName}`

    log("getPresignedUploadUrl()", {
      filename: fileData.filename,
      sanitizedName,
      fileKey,
      mimeType: fileData.mimeType,
    })

    await assertR2UploadAllowed(this.client_, this.config_.bucket)

    const { maxSingleUploadBytes } = getR2StorageLimits()
    const command = new PutObjectCommand({
      Bucket: this.config_.bucket,
      Key: fileKey,
      ContentLength: maxSingleUploadBytes,
    })

    try {
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner")
      const signedUrl = await getSignedUrl(this.client_, command, {
        expiresIn: 300, // 5 分鐘，縮短洩漏視窗
      })
      const publicFileUrl = publicUrl(this.config_.fileUrl, fileKey)
      log("getPresignedUploadUrl() 成功", {
        fileKey,
        expiresIn: 300,
        signedUrlPrefix: signedUrl.slice(0, 80) + "...",
        publicFileUrl,
      })
      return { url: signedUrl, key: fileKey }
    } catch (e) {
      logError("getPresignedUploadUrl() 失敗", e)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `[R2] 取得 presigned URL 失敗：${formatErr(e)}`
      )
    }
  }
}
