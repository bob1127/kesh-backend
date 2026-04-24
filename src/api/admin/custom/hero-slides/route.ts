import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import fs from "fs";
import path from "path";

const dirPath = path.join(process.cwd(), "data");
const filePath = path.join(dirPath, "hero-slides.json");

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    // 確保資料夾存在
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // 取得前端傳來的 slides 陣列
    const { slides } = req.body as any;

    if (!slides || !Array.isArray(slides)) {
      return res.status(400).json({ message: "Invalid payload. 'slides' array required." });
    }

    // 寫入 JSON 檔案
    fs.writeFileSync(filePath, JSON.stringify(slides, null, 2), "utf-8");

    res.status(200).json({ message: "Hero slides saved successfully!" });
  } catch (error) {
    console.error("Error saving hero slides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};