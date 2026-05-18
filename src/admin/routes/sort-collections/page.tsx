import { defineRouteConfig } from "@medusajs/admin-sdk";
import { Container, Heading, Button, toast, Text } from "@medusajs/ui";
import { useState, useEffect, useRef } from "react";

const SortCollectionsPage = () => {
  const [collections, setCollections] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // 用於原生 HTML5 拖拉的 Ref
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // 1. 載入所有 Collections
  const fetchCollections = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/admin/collections?limit=250");
      const data = await res.json();

      // 依照目前的 metadata.rank 排序，若無則排最後
      let sorted = data.collections || [];
      sorted.sort((a: any, b: any) => {
        const rankA =
          a.metadata?.rank !== undefined ? Number(a.metadata.rank) : 999;
        const rankB =
          b.metadata?.rank !== undefined ? Number(b.metadata.rank) : 999;
        return rankA - rankB;
      });

      setCollections(sorted);
    } catch (error) {
      toast.error("載入失敗", { description: "無法取得商品系列" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  // 2. 處理拖拉邏輯
  const handleSort = () => {
    if (dragItem.current !== null && dragOverItem.current !== null) {
      let _collections = [...collections];
      // 取出被拖拉的項目
      const draggedItemContent = _collections.splice(dragItem.current, 1)[0];
      // 插入到目標位置
      _collections.splice(dragOverItem.current, 0, draggedItemContent);

      dragItem.current = null;
      dragOverItem.current = null;
      setCollections(_collections);
    }
  };

  // 3. 儲存排序結果到資料庫
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 透過 Promise.all 平行處理，將新的順序 (index + 1) 寫入每一個 collection 的 metadata
      await Promise.all(
        collections.map(async (col, index) => {
          const newRank = index + 1;

          // 如果 rank 沒變，就不發送 API 節省資源
          if (col.metadata?.rank === newRank) return Promise.resolve();

          const newMetadata = {
            ...(col.metadata || {}),
            rank: newRank,
          };

          return fetch(`/admin/collections/${col.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metadata: newMetadata }),
          });
        }),
      );

      toast.success("排序已更新！", {
        description: "前端的選單排序已同步生效。",
      });
      fetchCollections(); // 重新載入最新狀態
    } catch (error) {
      toast.error("儲存失敗", { description: "更新排序時發生錯誤" });
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Container className="p-8 max-w-[800px] mx-auto mt-8">
      <div className="flex justify-between items-center mb-8 border-b border-gray-200 pb-4">
        <div>
          <Heading level="h1" className="text-2xl">
            商品系列排序
          </Heading>
          <Text className="text-gray-500 mt-1">
            拖曳以調整品牌順序。此處的排序將直接影響前台 Navbar
            與側邊欄的顯示順序。
          </Text>
        </div>
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          className="bg-black text-white hover:bg-gray-800"
        >
          儲存排序
        </Button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-gray-500">載入中...</div>
      ) : (
        <div className="flex flex-col gap-2">
          {collections.map((col, index) => (
            <div
              key={col.id}
              draggable
              onDragStart={(e) => (dragItem.current = index)}
              onDragEnter={(e) => (dragOverItem.current = index)}
              onDragEnd={handleSort}
              onDragOver={(e) => e.preventDefault()} // 必須加這行才能讓 drop 生效
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-md shadow-sm cursor-move hover:border-gray-400 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center gap-4">
                <div className="text-gray-400 cursor-grab active:cursor-grabbing text-xl font-bold px-2">
                  ⠿
                </div>
                <div className="flex flex-col">
                  <Text className="font-bold text-gray-900">{col.title}</Text>
                  <Text className="text-xs text-gray-500 font-mono">
                    {col.handle}
                  </Text>
                </div>
              </div>
              <div className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">
                Rank: {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}
    </Container>
  );
};

// 讓這個頁面出現在後台左側選單中
export const config = defineRouteConfig({
  label: "排序設定 (拖拉)",
});

export default SortCollectionsPage;
