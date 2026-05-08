import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "data", "hero-slides.json");

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    if (fs.existsSync(filePath)) {
      const fileData = fs.readFileSync(filePath, "utf-8");
      if (!fileData.trim()) {
        res.json({ slides: [] });
        return;
      }
      const parsedData = JSON.parse(fileData);
      
      // 🔥 修正點：加上 any[] 型別宣告
      let slidesArray: any[] = []; 
      
      if (Array.isArray(parsedData)) {
        slidesArray = parsedData;
      } else if (parsedData && Array.isArray(parsedData.slides)) {
        slidesArray = parsedData.slides;
      }
      
      res.json({ slides: slidesArray });
    } else {
      res.json({ slides: [] });
    }
  } catch (error) {
    console.error("Admin GET Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  try {
    const body = req.body as any;
    const slides = body.slides;

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 🔥 修正點：確保寫入時也是陣列格式
    const slidesToSave: any[] = Array.isArray(slides) ? slides : [];
    fs.writeFileSync(filePath, JSON.stringify({ slides: slidesToSave }, null, 2), "utf-8");

    res.json({ success: true, slides: slidesToSave });
  } catch (error) {
    console.error("Admin POST Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};