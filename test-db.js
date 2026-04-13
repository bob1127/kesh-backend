const { Client } = require('pg');

// 使用你提供的 Supabase 帳密
const client = new Client({
  connectionString: "postgresql://postgres.qhefiwluztdmxractwln:jofja5-patZih-hihfet@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres",
  ssl: { rejectUnauthorized: false }
});

console.log("🚀 [照妖鏡啟動] 正在嘗試直連 Supabase...");

client.connect()
  .then(() => {
    console.log("✅ [破案] 連線大成功！原來是 Medusa 的設定在搞鬼！");
    client.end();
  })
  .catch(err => {
    console.error("❌ [抓到兇手] 真正的死因是：", err.message);
    client.end();
  });