#!/usr/bin/env node
/**
 * Supabase Storage → Cloudflare R2 圖片遷移
 *
 * 策略：只遷移 DB / hero-slides 中「實際引用」的 URL（最安全）
 * 流程：收集 URL → 並行下載 → 上傳 R2 → 驗證 → 更新 DB + JSON
 *
 * 用法：
 *   node scripts/migrate-supabase-to-r2.mjs --dry-run          # 只掃描，不動任何資料
 *   node scripts/migrate-supabase-to-r2.mjs --copy-only        # 只複製到 R2，不改 DB
 *   node scripts/migrate-supabase-to-r2.mjs                    # 完整遷移
 *   node scripts/migrate-supabase-to-r2.mjs --concurrency 12
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import pg from "pg"

const { Client } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const HERO_SLIDES_PATH = resolve(ROOT, "data/hero-slides.json")
const MANIFEST_DIR = resolve(ROOT, "data/migration")

const SUPABASE_HOST = "qhefiwluztdmxractwln.supabase.co"
const SUPABASE_PREFIX = `https://${SUPABASE_HOST}/storage/v1/object/public/`

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const COPY_ONLY = args.includes("--copy-only")
const ALLOW_MISSING = args.includes("--allow-missing")
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="))
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : 10

function loadEnv() {
  const text = readFileSync(resolve(ROOT, ".env"), "utf8")
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

loadEnv()

const R2 = {
  bucket: process.env.S3_BUCKET,
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  fileUrl: (process.env.S3_FILE_URL || "").replace(/\/$/, ""),
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
}

function parseSupabaseUrl(url) {
  if (!url || !url.includes(SUPABASE_HOST)) return null
  const idx = url.indexOf("/storage/v1/object/public/")
  if (idx === -1) return null
  const after = url.slice(idx + "/storage/v1/object/public/".length)
  const slash = after.indexOf("/")
  if (slash === -1) return null
  const bucket = after.slice(0, slash)
  const key = after.slice(slash + 1)
  return { bucket, key, sourceUrl: url }
}

function r2PublicUrl(key) {
  return `${R2.fileUrl}/${key}`
}

function replaceSupabaseUrls(text, urlMap) {
  if (!text || typeof text !== "string") return text
  let out = text
  for (const [oldUrl, newUrl] of urlMap) {
    out = out.split(oldUrl).join(newUrl)
  }
  return out
}

function collectUrlsFromJson(obj, set) {
  if (!obj) return
  if (typeof obj === "string" && obj.includes(SUPABASE_HOST)) {
    set.add(obj)
    return
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectUrlsFromJson(item, set)
    return
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj)) collectUrlsFromJson(v, set)
  }
}

async function poolMap(items, limit, fn) {
  const results = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function getDbClient() {
  let url = process.env.DATABASE_URL
  if (!url) throw new Error("缺少 DATABASE_URL")

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  try {
    await client.connect()
    return client
  } catch (e) {
    // medusa-config.ts 可能與 .env 密碼不同步，嘗試讀取 hardcoded fallback
    const cfgText = readFileSync(resolve(ROOT, "medusa-config.ts"), "utf8")
    const m =
      cfgText.match(/databaseUrl:\s*["']([^"']+)["']/) ||
      cfgText.match(/const DB_URL\s*=\s*["']([^"']+)["']/)
    if (m && m[1] !== url) {
      console.warn("⚠️  DATABASE_URL 連線失敗，改用 medusa-config.ts 中的 databaseUrl")
      const fallback = new Client({ connectionString: m[1], ssl: { rejectUnauthorized: false } })
      await fallback.connect()
      return fallback
    }
    throw e
  }
}

async function collectUrlsFromDb(client) {
  const urlSet = new Set()

  const { rows: images } = await client.query(
    `SELECT DISTINCT url FROM image WHERE url LIKE $1`,
    [`%${SUPABASE_HOST}%`]
  )
  for (const r of images) urlSet.add(r.url)

  const { rows: products } = await client.query(
    `SELECT DISTINCT thumbnail FROM product WHERE thumbnail LIKE $1`,
    [`%${SUPABASE_HOST}%`]
  )
  for (const r of products) if (r.thumbnail) urlSet.add(r.thumbnail)

  const { rows: categories } = await client.query(
    `SELECT metadata FROM product_category WHERE metadata::text LIKE $1`,
    [`%${SUPABASE_HOST}%`]
  )
  for (const r of categories) collectUrlsFromJson(r.metadata, urlSet)

  const { rows: collections } = await client.query(
    `SELECT metadata FROM product_collection WHERE metadata::text LIKE $1`,
    [`%${SUPABASE_HOST}%`]
  )
  for (const r of collections) collectUrlsFromJson(r.metadata, urlSet)

  const { rows: posts } = await client.query(
    `SELECT thumbnail, content, content_en, content_ko FROM post
     WHERE thumbnail LIKE $1 OR content LIKE $1 OR content_en LIKE $1 OR content_ko LIKE $1`,
    [`%${SUPABASE_HOST}%`]
  )
  for (const r of posts) {
    if (r.thumbnail) urlSet.add(r.thumbnail)
    for (const field of [r.content, r.content_en, r.content_ko]) {
      if (!field) continue
      const re = new RegExp(`https://${SUPABASE_HOST.replace(".", "\\.")}/storage/v1/object/public/[^"'\\s<>]+`, "g")
      for (const match of field.match(re) || []) urlSet.add(match)
    }
  }

  const { rows: customers } = await client.query(
    `SELECT metadata FROM customer WHERE metadata::text LIKE $1`,
    [`%${SUPABASE_HOST}%`]
  )
  for (const r of customers) collectUrlsFromJson(r.metadata, urlSet)

  return urlSet
}

async function copyOne(s3, parsed, stats) {
  const { key, sourceUrl } = parsed
  const destUrl = r2PublicUrl(key)

  if (!DRY_RUN) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: R2.bucket, Key: key }))
      stats.skipped++
      return { sourceUrl, destUrl, key, status: "skipped_exists" }
    } catch {
      // not exists, continue
    }
  }

  if (DRY_RUN) {
    stats.planned++
    return { sourceUrl, destUrl, key, status: "dry_run" }
  }

  const res = await fetch(sourceUrl)
  if (!res.ok) {
    if (ALLOW_MISSING && res.status === 404) {
      stats.missing++
      return { sourceUrl, destUrl, key, status: "missing_source", error: `HTTP ${res.status}` }
    }
    stats.failed++
    return { sourceUrl, destUrl, key, status: "download_failed", error: `HTTP ${res.status}` }
  }

  const buf = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get("content-type") || "application/octet-stream"

  await s3.send(
    new PutObjectCommand({
      Bucket: R2.bucket,
      Key: key,
      Body: buf,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  )

  // 驗證公開 URL 可讀
  const verify = await fetch(destUrl, { method: "HEAD" })
  if (!verify.ok) {
    stats.failed++
    return { sourceUrl, destUrl, key, status: "verify_failed", error: `HTTP ${verify.status}` }
  }

  stats.copied++
  return { sourceUrl, destUrl, key, status: "copied", bytes: buf.length }
}

async function updateDatabase(client, urlMap) {
  await client.query("BEGIN")
  try {
    let total = 0

    for (const [oldUrl, newUrl] of urlMap) {
      const r1 = await client.query(`UPDATE image SET url = $1 WHERE url = $2`, [newUrl, oldUrl])
      total += r1.rowCount
      const r2 = await client.query(`UPDATE product SET thumbnail = $1 WHERE thumbnail = $2`, [
        newUrl,
        oldUrl,
      ])
      total += r2.rowCount
    }

    const { rows: categories } = await client.query(
      `SELECT id, metadata FROM product_category WHERE metadata::text LIKE $1`,
      [`%${SUPABASE_HOST}%`]
    )
    for (const row of categories) {
      const updated = JSON.parse(replaceSupabaseUrls(JSON.stringify(row.metadata), urlMap))
      await client.query(`UPDATE product_category SET metadata = $1::jsonb WHERE id = $2`, [
        JSON.stringify(updated),
        row.id,
      ])
      total++
    }

    const { rows: collections } = await client.query(
      `SELECT id, metadata FROM product_collection WHERE metadata::text LIKE $1`,
      [`%${SUPABASE_HOST}%`]
    )
    for (const row of collections) {
      const updated = JSON.parse(replaceSupabaseUrls(JSON.stringify(row.metadata), urlMap))
      await client.query(`UPDATE product_collection SET metadata = $1::jsonb WHERE id = $2`, [
        JSON.stringify(updated),
        row.id,
      ])
      total++
    }

    const { rows: posts } = await client.query(
      `SELECT id, thumbnail, content, content_en, content_ko FROM post
       WHERE thumbnail LIKE $1 OR content LIKE $1 OR content_en LIKE $1 OR content_ko LIKE $1`,
      [`%${SUPABASE_HOST}%`]
    )
    for (const row of posts) {
      await client.query(
        `UPDATE post SET thumbnail = $1, content = $2, content_en = $3, content_ko = $4 WHERE id = $5`,
        [
          replaceSupabaseUrls(row.thumbnail, urlMap),
          replaceSupabaseUrls(row.content, urlMap),
          replaceSupabaseUrls(row.content_en, urlMap),
          replaceSupabaseUrls(row.content_ko, urlMap),
          row.id,
        ]
      )
      total++
    }

    const { rows: customers } = await client.query(
      `SELECT id, metadata FROM customer WHERE metadata::text LIKE $1`,
      [`%${SUPABASE_HOST}%`]
    )
    for (const row of customers) {
      const updated = JSON.parse(replaceSupabaseUrls(JSON.stringify(row.metadata), urlMap))
      await client.query(`UPDATE customer SET metadata = $1::jsonb WHERE id = $2`, [
        JSON.stringify(updated),
        row.id,
      ])
      total++
    }

    await client.query("COMMIT")
    return total
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  }
}

function updateHeroSlides(urlMap) {
  if (!readFileSync(HERO_SLIDES_PATH, "utf8").includes(SUPABASE_HOST)) {
    return { updated: false, reason: "no_supabase_urls" }
  }

  const backupPath = `${HERO_SLIDES_PATH}.backup-${Date.now()}`
  copyFileSync(HERO_SLIDES_PATH, backupPath)

  const data = JSON.parse(readFileSync(HERO_SLIDES_PATH, "utf8"))
  for (const slide of data.slides || []) {
    if (slide.mediaUrl) {
      slide.mediaUrl = replaceSupabaseUrls(slide.mediaUrl, urlMap)
    }
  }
  writeFileSync(HERO_SLIDES_PATH, JSON.stringify(data, null, 2) + "\n")
  return { updated: true, backupPath }
}

async function main() {
  console.log("=== Supabase → R2 圖片遷移 ===")
  console.log({ mode: DRY_RUN ? "dry-run" : COPY_ONLY ? "copy-only" : "full", concurrency: CONCURRENCY })

  const client = await getDbClient()
  const urlSet = await collectUrlsFromDb(client)

  // hero-slides.json
  try {
    const hero = JSON.parse(readFileSync(HERO_SLIDES_PATH, "utf8"))
    collectUrlsFromJson(hero, urlSet)
  } catch {
    console.warn("⚠️  找不到 hero-slides.json，略過")
  }

  const urls = [...urlSet].filter((u) => u.includes(SUPABASE_HOST))
  const parsed = urls.map(parseSupabaseUrl).filter(Boolean)

  console.log(`\n📋 待遷移唯一 URL：${urls.length} 個`)
  const byBucket = {}
  for (const p of parsed) {
    byBucket[p.bucket] = (byBucket[p.bucket] || 0) + 1
  }
  console.log("   依 bucket:", byBucket)

  if (urls.length === 0) {
    console.log("✅ 沒有需要遷移的 Supabase 圖片")
    await client.end()
    return
  }

  if (DRY_RUN) {
    console.log("\n範例 URL（前 3 個）：")
    for (const u of urls.slice(0, 3)) {
      const p = parseSupabaseUrl(u)
      console.log(`  ${u}\n  → ${r2PublicUrl(p.key)}`)
    }
    console.log("\n✅ dry-run 完成。執行不帶 --dry-run 開始遷移。")
    await client.end()
    return
  }

  mkdirSync(MANIFEST_DIR, { recursive: true })
  const manifestPath = resolve(MANIFEST_DIR, `supabase-to-r2-${Date.now()}.json`)

  const s3 = new S3Client({
    region: R2.region,
    endpoint: R2.endpoint,
    credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
    forcePathStyle: true,
  })

  const stats = { copied: 0, skipped: 0, failed: 0, missing: 0, planned: 0 }
  let done = 0

  console.log(`\n⬆️  開始複製（並行 ${CONCURRENCY}）...`)
  const results = await poolMap(parsed, CONCURRENCY, async (item) => {
    const result = await copyOne(s3, item, stats)
    done++
    if (done % 50 === 0 || done === parsed.length) {
      process.stdout.write(`\r   進度 ${done}/${parsed.length}（成功 ${stats.copied}，略過 ${stats.skipped}，缺檔 ${stats.missing}，失敗 ${stats.failed}）`)
    }
    return result
  })
  console.log("")

  const failures = results.filter((r) => r.status.includes("failed"))
  const missing = results.filter((r) => r.status === "missing_source")
  if (failures.length) {
    console.error(`\n❌ ${failures.length} 個檔案複製失敗（前 5 個）：`)
    for (const f of failures.slice(0, 5)) {
      console.error(`   ${f.sourceUrl} → ${f.error}`)
    }
    console.error("\n已中止 DB 更新。請修正後重跑（已成功的檔案會自動略過）。")
    writeFileSync(manifestPath, JSON.stringify({ stats, results, urlMap: [] }, null, 2))
    await client.end()
    process.exit(1)
  }

  if (missing.length) {
    console.warn(`\n⚠️  ${missing.length} 個 URL 在 Supabase 已不存在（404），DB 中仍保留原 URL：`)
    for (const m of missing) console.warn(`   ${m.sourceUrl}`)
  }

  const urlMap = new Map(
    results.filter((r) => r.status === "copied" || r.status === "skipped_exists").map((r) => [r.sourceUrl, r.destUrl])
  )
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        stats,
        urlMap: Object.fromEntries(urlMap),
        results,
      },
      null,
      2
    )
  )
  console.log(`\n📄 Manifest: ${manifestPath}`)

  if (COPY_ONLY) {
    console.log("\n✅ copy-only 完成，未更新 DB。")
    await client.end()
    return
  }

  console.log("\n📝 更新資料庫...")
  const dbUpdates = await updateDatabase(client, urlMap)
  console.log(`   DB 更新 ${dbUpdates} 筆`)

  console.log("📝 更新 hero-slides.json...")
  const heroResult = updateHeroSlides(urlMap)
  console.log("   ", heroResult)

  // 驗證：DB 中不應再有 supabase URL
  const { rows: remaining } = await client.query(
    `SELECT count(*)::int as n FROM image WHERE url LIKE $1`,
    [`%${SUPABASE_HOST}%`]
  )
  console.log(`\n🔍 驗證：image 表剩餘 Supabase URL = ${remaining[0].n}`)

  await client.end()
  console.log("\n✅ 遷移完成！Supabase 原檔未刪除，確認網站正常後可手動清理。")
}

main().catch((err) => {
  console.error("\n❌ 遷移失敗:", err.message || err)
  process.exit(1)
})
