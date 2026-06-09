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

export class R2FileService extends S3FileService {
  static override identifier = "s3"

  constructor({ logger }: { logger: Logger }, options: S3FileServiceOptions) {
    super({ logger }, options)
    log("provider 初始化", {
      bucket: this.config_.bucket,
      region: this.config_.region,
      endpoint: this.config_.endpoint,
      fileUrl: this.config_.fileUrl,
      hasAccessKey: Boolean(this.config_.accessKeyId),
      hasSecret: Boolean(this.config_.secretAccessKey),
    })
  }

  override async upload(
    file: FileTypes.ProviderUploadFileDTO
  ): Promise<FileTypes.ProviderFileResultDTO> {
    if (!file?.filename) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No filename provided")
    }

    const parsedFilename = path.parse(file.filename)
    const fileKey = `${this.config_.prefix}${parsedFilename.name}-${ulid()}${parsedFilename.ext}`

    log("upload() 開始", { filename: file.filename, fileKey, mimeType: file.mimeType })

    const command = new PutObjectCommand({
      Bucket: this.config_.bucket,
      Body: decodeContent(file.content),
      Key: fileKey,
      ContentType: file.mimeType,
      CacheControl: this.config_.cacheControl,
      Metadata: {
        "original-filename": encodeURIComponent(file.filename),
      },
    })

    try {
      await this.client_.send(command)
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

    const parsedFilename = path.parse(fileData.filename)
    const fileKey = `${this.config_.prefix}${parsedFilename.name}-${ulid()}${parsedFilename.ext}`
    const pass = new PassThrough()

    log("getUploadStream()", { filename: fileData.filename, fileKey })

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
   * Medusa Admin 用 presigned PUT 上傳，瀏覽器不帶 Content-Type header。
   * 簽名時不可包含 ContentType，否則 R2 會回 403。
   */
  override async getPresignedUploadUrl(
    fileData: FileTypes.ProviderGetPresignedUploadUrlDTO
  ) {
    if (!fileData?.filename) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "No filename provided")
    }

    const fileKey = `${this.config_.prefix}${fileData.filename}`

    log("getPresignedUploadUrl()", {
      filename: fileData.filename,
      fileKey,
      mimeType: fileData.mimeType,
    })

    const command = new PutObjectCommand({
      Bucket: this.config_.bucket,
      Key: fileKey,
    })

    try {
      const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner")
      const signedUrl = await getSignedUrl(this.client_, command, {
        expiresIn: fileData.expiresIn ?? 60 * 60,
      })
      const publicFileUrl = publicUrl(this.config_.fileUrl, fileKey)
      log("getPresignedUploadUrl() 成功", {
        fileKey,
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
