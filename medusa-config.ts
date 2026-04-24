import { loadEnv, defineConfig, Modules } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const DB_URL = "postgresql://postgres.qhefiwluztdmxractwln:jofja5-patZih-hihfet@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres"

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: DB_URL, 
    redisUrl: process.env.REDIS_URL, 
    databaseDriverOptions: {
      ssl: {
        rejectUnauthorized: false,
      },
    },
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7001,http://localhost:9000",
      authCors: process.env.AUTH_CORS || "http://localhost:3000",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  admin: {
    // 1. 智慧判斷：Vercel 部署時強制開啟打包
    disable: process.env.VERCEL === "1" ? false : process.env.NODE_ENV === 'production', 
    // 🔥 2. 路徑校正：在 Vercel 上把路徑改回根目錄 '/'，解決 MIME type 找不到檔案的問題！
    path: process.env.VERCEL === "1" ? "/" : "/app",
    // 🔥 3. 認祖歸宗：告訴 Vercel 上的後台，它的「大腦 (API)」在 Railway 上！
    backendUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  },
  modules: {
    [Modules.LOCKING]: {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/locking-redis",
            id: "redis",
            options: {
              redisUrl: process.env.REDIS_URL,
            }
          }
        ]
      }
    },
    [Modules.EVENT_BUS]: {
      resolve: "@medusajs/event-bus-redis",
      options: {
        redisUrl: process.env.REDIS_URL,
      },
    },
    auth: {
      resolve: "@medusajs/auth",
      options: {
        providers: [
          { resolve: "@medusajs/auth-emailpass", id: "emailpass" },
          {
            resolve: "@medusajs/auth-google",
            id: "google",
            options: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
              callbackUrl: process.env.STORE_AUTH_CALLBACK_URL,
            },
          },
        ],
      },
    },
    [Modules.PAYMENT]: {
      resolve: "@medusajs/payment",
      options: {
        providers: [
          {
            resolve: "./src/modules/tappay",
            id: "tappay",
            options: {}
          }
        ]
      }
    },
    // S3 檔案上傳模組
    file: {
      resolve: "@medusajs/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/file-s3",
            id: "s3",
            options: {
              file_url: process.env.S3_FILE_URL,
              access_key_id: process.env.S3_ACCESS_KEY_ID,
              secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
              region: process.env.S3_REGION,
              bucket: process.env.S3_BUCKET,
              endpoint: process.env.S3_ENDPOINT,
              additional_client_config: {
                forcePathStyle: true,
              }
            },
          },
        ],
      },
    },
    // 通知模組
    [Modules.NOTIFICATION]: {
      resolve: "@medusajs/notification",
      options: {
        providers: [
          {
            resolve: "@medusajs/notification-local",
            id: "local",
            options: {
              channels: ["email"],
            },
          },
        ],
      },
    },
    // News (最新消息/文章) 模組
    news: {
      resolve: "./src/modules/news",
    },
  }
})