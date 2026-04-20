import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Button, toast } from "@medusajs/ui";
import { useState } from "react";

// 🏆 Medusa V2 的標準寫法：傳入的實體資料一律叫做 "data"
const CategoryImageWidget = ({ data }: { data: any }) => {
  const [isUploading, setIsUploading] = useState(false);

  // 防呆：如果還沒拿到資料，顯示載入中
  if (!data) {
    return (
      <Container className="p-6 flex justify-center">
        <Text className="text-ui-fg-muted">載入分類圖片模組中...</Text>
      </Container>
    );
  }

  // 讀取目前的圖片網址
  const currentImageUrl = data?.metadata?.image_url || "";

  // 處理圖片選擇與上傳
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("files", file);

      // 1. 呼叫 Medusa V2 API 上傳檔案
      const uploadRes = await fetch(`/admin/uploads`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("圖片上傳失敗，請確認後端是否已設定 File Service");
      }

      const uploadData = await uploadRes.json();

      // 取得圖片網址 (相容 V2 的 files 結構)
      const uploadedUrl =
        uploadData.files?.[0]?.url || uploadData.uploads?.[0]?.url;

      if (!uploadedUrl) throw new Error("無法取得上傳後的圖片網址");

      // 2. 更新分類的 metadata
      const updateRes = await fetch(`/admin/product-categories/${data.id}`, {
        method: "POST", // Medusa V2 更新分類使用 POST
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            ...(data?.metadata || {}), // 保留舊的 metadata
            image_url: uploadedUrl, // 存入新圖片網址
          },
        }),
      });

      if (!updateRes.ok) {
        throw new Error("更新分類資料失敗");
      }

      toast.success("上傳成功", {
        description: "分類圖片已成功更新！",
      });

      // 延遲 1 秒後重新整理頁面顯示新圖
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error(error);
      toast.error("發生錯誤", {
        description: error.message || "系統處理錯誤",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Container className="p-6">
      <div className="flex flex-col gap-4">
        <Heading level="h2">分類展示圖片</Heading>
        <Text className="text-ui-fg-subtle">
          上傳一張圖片，作為此分類在首頁與導覽列 (Navbar) 的代表圖。
        </Text>

        {/* 圖片預覽區 */}
        <div className="mt-4 flex items-center gap-6">
          <div className="w-32 h-32 rounded-lg border border-ui-border-base bg-ui-bg-subtle overflow-hidden flex items-center justify-center shrink-0">
            {currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt="Category"
                className="w-full h-full object-cover"
              />
            ) : (
              <Text className="text-ui-fg-muted text-xs">尚無圖片</Text>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {/* 隱藏的 File Input */}
            <input
              type="file"
              id={`category-image-upload-${data.id}`}
              className="hidden"
              accept="image/jpeg, image/png, image/webp"
              onChange={handleFileChange}
            />
            <Button
              variant="secondary"
              size="small"
              isLoading={isUploading}
              onClick={() =>
                document
                  .getElementById(`category-image-upload-${data.id}`)
                  ?.click()
              }
            >
              {currentImageUrl ? "更換圖片" : "上傳圖片"}
            </Button>
            <Text className="text-xs text-ui-fg-muted mt-1">
              建議尺寸：800x800px，支援 JPG, PNG, WebP。
            </Text>
          </div>
        </div>
      </div>
    </Container>
  );
};

// 設定插入位置
export const config = defineWidgetConfig({
  zone: "product_category.details.after",
});

export default CategoryImageWidget;
