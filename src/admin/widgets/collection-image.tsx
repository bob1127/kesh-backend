import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Text, Button, toast } from "@medusajs/ui";
import { useState } from "react";

// 接收商品系列的資料 (Medusa V2 統一叫 data)
const CollectionImageWidget = ({ data }: { data: any }) => {
  const [isUploading, setIsUploading] = useState(false);

  if (!data) {
    return (
      <Container className="p-6 flex justify-center">
        <Text className="text-ui-fg-muted">載入商品系列圖片模組中...</Text>
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

      const uploadedUrl =
        uploadData.files?.[0]?.url || uploadData.uploads?.[0]?.url;

      if (!uploadedUrl) throw new Error("無法取得上傳後的圖片網址");

      // 2. 更新「商品系列」的 metadata
      // 🔥 注意這裡的 API 是 /admin/collections
      const updateRes = await fetch(`/admin/collections/${data.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            ...(data?.metadata || {}),
            image_url: uploadedUrl,
          },
        }),
      });

      if (!updateRes.ok) {
        throw new Error("更新商品系列資料失敗");
      }

      toast.success("上傳成功", {
        description: "商品系列圖片已成功更新！",
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
        <Heading level="h2">品牌 / 系列展示圖片</Heading>
        <Text className="text-ui-fg-subtle">
          上傳一張圖片，作為此品牌或系列在前端畫面的代表圖。
        </Text>

        {/* 圖片預覽區 */}
        <div className="mt-4 flex items-center gap-6">
          <div className="w-32 h-32 rounded-lg border border-ui-border-base bg-ui-bg-subtle overflow-hidden flex items-center justify-center shrink-0">
            {currentImageUrl ? (
              <img
                src={currentImageUrl}
                alt="Collection"
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
              id={`collection-image-upload-${data.id}`}
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
                  .getElementById(`collection-image-upload-${data.id}`)
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

// 🔥 設定插入位置：這次是插在「商品系列 (Collection)」詳情頁
export const config = defineWidgetConfig({
  zone: "product_collection.details.after",
});

export default CollectionImageWidget;
