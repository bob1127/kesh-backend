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
      storeCors: "http://localhost:3000",
      adminCors: "http://localhost:7001,http://localhost:9000",
      authCors: "http://localhost:3000",
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  admin: {
    disable: false, 
  },
  modules: {
    // 🚨 1. 正確掛載 Redis 鎖定模組 (使用 Provider 模式！)
    [Modules.LOCKING]: {
      resolve: "@medusajs/medusa/locking", // 👈 核心鎖定模組
      options: {
        providers: [
          {
            resolve: "@medusajs/locking-redis", // 👈 Redis 作為儲存提供者
            id: "redis",
            options: {
              redisUrl: process.env.REDIS_URL,
            }
          }
        ]
      }
    },
    // 🚨 2. 掛載 Redis 事件匯流排
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
    // 🔥 指定使用我們自建的 TapPay 模組
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
    }
  }
})