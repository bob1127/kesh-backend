import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "data", "hero-slides.json");

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, "utf-8");
      const slides = JSON.parse(fileData);
      return res.status(200).json({ slides });
    } else {
      // 找不到檔案回傳空陣列
      return res.status(200).json({ slides: [] });
    }
  } catch (error) {
    console.error("Error reading hero slides:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};