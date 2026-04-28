import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Container,
  Heading,
  Button,
  Input,
  Label,
  Textarea,
} from "@medusajs/ui";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { defineRouteConfig } from "@medusajs/admin-sdk";
import { DocumentText } from "@medusajs/icons";

// ==========================================
// 💎 TypeScript 類型定義
// ==========================================
type Lang = "zh" | "en" | "ko";

interface SchemaItem {
  id: string;
  type: string;
  data: any;
  initialTab?: "edit" | "code";
}

interface SchemaModalProps {
  schema: SchemaItem;
  initialTab?: "edit" | "code";
  onSave: (schema: SchemaItem) => void;
  onClose: () => void;
}

// ==========================================
// 💎 子元件：Schema 編輯器彈窗
// ==========================================
const SchemaEditorModal = ({
  schema,
  initialTab = "edit",
  onSave,
  onClose,
}: SchemaModalProps) => {
  const [localData, setLocalData] = useState<any>({ ...schema.data });
  const [activeTab, setActiveTab] = useState<"edit" | "code">(initialTab);

  const handleAddQuestion = () => {
    const newQuestions = [...(localData.questions || []), { q: "", a: "" }];
    setLocalData({ ...localData, questions: newQuestions });
  };
  const handleRemoveQuestion = (index: number) => {
    const newQuestions = (localData.questions || []).filter(
      (_: any, i: number) => i !== index,
    );
    setLocalData({ ...localData, questions: newQuestions });
  };
  const handleQuestionChange = (
    index: number,
    field: "q" | "a",
    value: string,
  ) => {
    const newQuestions = [...(localData.questions || [])];
    newQuestions[index][field] = value;
    setLocalData({ ...localData, questions: newQuestions });
  };

  const generateLiveCode = () => {
    let output: any = {};
    if (schema.type === "Article") {
      output = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": localData.articleType || "Article",
            headline: localData.headline || "%seo_title%",
            description: localData.description || "%seo_description%",
            keywords: localData.keywords || "%keywords%",
            author: { "@type": "Organization", name: "KÉSH de¹" },
          },
        ],
      };
    } else if (schema.type === "FAQPage") {
      output = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "FAQPage",
            mainEntity: (localData.questions || []).map((q: any) => ({
              "@type": "Question",
              name: q.q || "問題...",
              acceptedAnswer: {
                "@type": "Answer",
                text: q.a || "答案...",
              },
            })),
          },
        ],
      };
    }
    return JSON.stringify(output, null, 2);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[#f0f2f5] w-full max-w-4xl rounded-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-300">
        <div className="flex justify-between items-center bg-white px-6 py-4 border-b border-gray-200">
          <Heading level="h2" className="text-base font-bold text-gray-800 m-0">
            Schema Builder
          </Heading>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex bg-white px-6 border-b border-gray-200 relative">
          <button
            onClick={() => setActiveTab("edit")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "edit" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            Edit
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "code" ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            Code Validation
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === "edit" && (
            <div className="max-w-3xl mx-auto">
              <div className="bg-white px-6 py-2 inline-block border border-b-0 border-gray-200 rounded-t-md text-sm font-bold text-gray-700 relative top-[1px]">
                {schema.type}
              </div>
              <div className="bg-white border border-gray-200 p-6 rounded-b-md rounded-tr-md shadow-sm space-y-6">
                {schema.type === "Article" && (
                  <>
                    <div>
                      <Label className="mb-2 block text-xs font-bold text-gray-700 uppercase">
                        HEADLINE <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={localData.headline || ""}
                        onChange={(e) =>
                          setLocalData({
                            ...localData,
                            headline: e.target.value,
                          })
                        }
                        placeholder="%seo_title%"
                        className="w-full text-sm"
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block text-xs font-bold text-gray-700 uppercase">
                        DESCRIPTION
                      </Label>
                      <Textarea
                        value={localData.description || ""}
                        onChange={(e) =>
                          setLocalData({
                            ...localData,
                            description: e.target.value,
                          })
                        }
                        placeholder="%seo_description%"
                        className="w-full h-24 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block text-xs font-bold text-gray-700 uppercase">
                        KEYWORDS <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={localData.keywords || ""}
                        onChange={(e) =>
                          setLocalData({
                            ...localData,
                            keywords: e.target.value,
                          })
                        }
                        placeholder="%keywords%"
                        className="w-full text-sm"
                      />
                    </div>
                    <div>
                      <Label className="mb-2 block text-xs font-bold text-gray-700 uppercase">
                        ENABLE SPEAKABLE
                      </Label>
                      <select
                        value={localData.speakable || "Disable"}
                        onChange={(e) =>
                          setLocalData({
                            ...localData,
                            speakable: e.target.value,
                          })
                        }
                        className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="Disable">Disable</option>
                        <option value="Enable">Enable</option>
                      </select>
                    </div>
                    <div className="pt-2">
                      <Label className="mb-3 block text-xs font-bold text-gray-700 uppercase">
                        ARTICLE TYPE <span className="text-red-500">*</span>
                      </Label>
                      <div className="flex flex-col gap-3">
                        {["Article", "Blog Post", "News Article"].map(
                          (type) => {
                            const val =
                              type === "Blog Post"
                                ? "BlogPosting"
                                : type === "News Article"
                                  ? "NewsArticle"
                                  : "Article";
                            return (
                              <label
                                key={type}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <input
                                  type="radio"
                                  name="articleType"
                                  value={val}
                                  checked={
                                    (localData.articleType || "Article") === val
                                  }
                                  onChange={(e) =>
                                    setLocalData({
                                      ...localData,
                                      articleType: e.target.value,
                                    })
                                  }
                                  className="accent-blue-600 w-4 h-4"
                                />
                                <span className="text-sm text-gray-700">
                                  {type}
                                </span>
                              </label>
                            );
                          },
                        )}
                      </div>
                    </div>
                  </>
                )}
                {schema.type === "FAQPage" && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                      <Label className="font-bold text-sm text-gray-800">
                        Questions
                      </Label>
                      <button
                        onClick={handleAddQuestion}
                        className="text-gray-500 text-xs font-bold hover:text-blue-600 flex items-center gap-1"
                      >
                        ⊕ Add Property Group
                      </button>
                    </div>
                    {(localData.questions || []).map(
                      (item: any, index: number) => (
                        <div
                          key={index}
                          className="border border-gray-200 rounded p-5 bg-white shadow-sm relative"
                        >
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-sm font-bold text-gray-700">
                              Question {index + 1}
                            </span>
                            <button
                              onClick={() => handleRemoveQuestion(index)}
                              className="text-gray-400 hover:text-red-500 flex items-center gap-1 text-xs"
                            >
                              🗑️ Delete
                            </button>
                          </div>
                          <div className="space-y-4 bg-gray-50 p-4 border border-gray-100 rounded">
                            <div>
                              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                                QUESTION
                              </Label>
                              <Input
                                value={item.q}
                                onChange={(e) =>
                                  handleQuestionChange(
                                    index,
                                    "q",
                                    e.target.value,
                                  )
                                }
                                className="w-full bg-white text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1 block">
                                ANSWER
                              </Label>
                              <Textarea
                                value={item.a}
                                onChange={(e) =>
                                  handleQuestionChange(
                                    index,
                                    "a",
                                    e.target.value,
                                  )
                                }
                                className="w-full h-24 bg-white text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          {activeTab === "code" && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700">
                  JSON-LD Code
                </span>
              </div>
              <div className="bg-[#1e293b] rounded-lg p-6 overflow-hidden shadow-inner">
                <pre className="text-[#a5b4fc] text-xs font-mono overflow-x-auto m-0 leading-relaxed">
                  {generateLiveCode()}
                </pre>
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-gray-200 p-4 bg-white rounded-b-lg flex justify-end">
          <Button
            variant="primary"
            onClick={() => onSave({ ...schema, data: localData })}
            className="bg-[#0073e6] text-white hover:bg-blue-700 border-none px-6 shadow-sm"
          >
            Save for this Post
          </Button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 💎 主元件：NewsAdminPage
// ==========================================
export default function NewsAdminPage() {
  const [currentView, setCurrentView] = useState<"list" | "form">("list");
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeLangTab, setActiveLangTab] = useState<Lang>("zh");

  // 🔥 建立 Quill 編輯器的 Ref
  const quillRef = useRef<any>(null);

  const [title, setTitle] = useState<Record<Lang, string>>({
    zh: "",
    en: "",
    ko: "",
  });
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState<Record<Lang, string>>({
    zh: "",
    en: "",
    ko: "",
  });
  const [content, setContent] = useState<Record<Lang, string>>({
    zh: "",
    en: "",
    ko: "",
  });
  const [thumbnail, setThumbnail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [seoTitle, setSeoTitle] = useState<Record<Lang, string>>({
    zh: "",
    en: "",
    ko: "",
  });
  const [seoDescription, setSeoDescription] = useState<Record<Lang, string>>({
    zh: "",
    en: "",
    ko: "",
  });
  const [seoKeywords, setSeoKeywords] = useState<Record<Lang, string>>({
    zh: "",
    en: "",
    ko: "",
  });
  const [isUploading, setIsUploading] = useState(false);

  const [schemas, setSchemas] = useState<Record<Lang, SchemaItem[]>>({
    zh: [],
    en: [],
    ko: [],
  });
  const [editingSchema, setEditingSchema] = useState<SchemaItem | null>(null);
  const [showSchemaSelector, setShowSchemaSelector] = useState(false);

  // 🔥 核心修復：攔截 Quill 的圖片上傳，轉打 API 並進行中文檔名淨化
  const imageHandler = useCallback(() => {
    const input = document.createElement("input");
    input.setAttribute("type", "file");
    // 支援包含 WebP 的各種格式，破解 Mac Safari 限制
    input.setAttribute(
      "accept",
      "image/png, image/jpeg, image/jpg, image/gif, image/webp, .webp",
    );
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      // 產生安全的英文亂碼檔名，破解 S3 中文過敏症
      const ext = file.name.split(".").pop() || "jpg";
      const safeName = `article_inline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const safeFile = new File([file], safeName, { type: file.type });

      const formData = new FormData();
      formData.append("files", safeFile);

      try {
        const res = await fetch("/admin/uploads", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        const data = await res.json();

        if (res.ok && data.files && data.files.length > 0) {
          const url = data.files[0].url;
          // 將真實網址插入到編輯器的游標位置，徹底消滅 Base64
          const quill = quillRef.current?.getEditor();
          if (quill) {
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, "image", url);
          }
        } else {
          alert("編輯器圖片上傳失敗，請確認伺服器連線");
        }
      } catch (error) {
        console.error("Quill 圖片上傳錯誤:", error);
      }
    };
  }, []);

  // 綁定自訂的上傳處理器到 Quill
  const quillModules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, 4, 5, 6, false] }],
          ["bold", "italic", "underline", "strike", "blockquote"],
          [{ list: "ordered" }, { list: "bullet" }],
          [{ color: [] }, { background: [] }],
          [{ align: [] }],
          ["link", "image", "video"],
          ["clean"],
        ],
        handlers: {
          image: imageHandler,
        },
      },
    }),
    [imageHandler],
  );

  const fetchPosts = async () => {
    setIsLoadingList(true);
    try {
      const res = await fetch("/admin/custom/posts?t=" + Date.now(), {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) setPosts(data.posts || []);
    } catch (error) {
      console.error("Fetch list error:", error);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    if (currentView === "list") fetchPosts();
  }, [currentView]);

  const handleCreateNew = () => {
    setEditingId(null);
    setTitle({ zh: "", en: "", ko: "" });
    setSlug("");
    setExcerpt({ zh: "", en: "", ko: "" });
    setContent({ zh: "", en: "", ko: "" });
    setThumbnail("");
    setSeoTitle({ zh: "", en: "", ko: "" });
    setSeoDescription({ zh: "", en: "", ko: "" });
    setSeoKeywords({ zh: "", en: "", ko: "" });
    setSchemas({ zh: [], en: [], ko: [] });
    setIsActive(true);
    setActiveLangTab("zh");
    setCurrentView("form");
  };

  const parseSchemasFromDB = (dataStr: string): SchemaItem[] => {
    try {
      if (!dataStr) return [];
      const parsed = JSON.parse(dataStr);
      const schemaArray = parsed["@graph"] ? parsed["@graph"] : [parsed];

      return schemaArray.map((item: any, idx: number) => {
        if (item["@type"] === "FAQPage") {
          return {
            id: `faq-${Date.now()}-${idx}`,
            type: "FAQPage",
            data: {
              questions: (item.mainEntity || []).map((q: any) => ({
                q: q.name || "",
                a: q.acceptedAnswer?.text || "",
              })),
            },
          };
        }
        return {
          id: `article-${Date.now()}-${idx}`,
          type: "Article",
          data: {
            headline: item.headline || "",
            description: item.description || "",
            keywords: item.keywords || "",
            articleType: item["@type"] || "Article",
            speakable: "Disable",
          },
        };
      });
    } catch {
      return [];
    }
  };

  const buildJsonLdString = (schemaArray: SchemaItem[]) => {
    if (!schemaArray || schemaArray.length === 0) return "";
    const graph = schemaArray.map((schema) => {
      if (schema.type === "Article") {
        return {
          "@type": schema.data.articleType || "Article",
          headline: schema.data.headline || "%seo_title%",
          description: schema.data.description || "%seo_description%",
          keywords: schema.data.keywords || "%keywords%",
          author: { "@type": "Organization", name: "KÉSH de¹" },
        };
      }
      if (schema.type === "FAQPage") {
        return {
          "@type": "FAQPage",
          mainEntity: (schema.data.questions || []).map((q: any) => ({
            "@type": "Question",
            name: q.q,
            acceptedAnswer: { "@type": "Answer", text: q.a },
          })),
        };
      }
      return {};
    });
    return JSON.stringify({
      "@context": "https://schema.org",
      "@graph": graph,
    });
  };

  const handleEdit = async (id: string) => {
    setEditingId(id);
    setCurrentView("form");
    setActiveLangTab("zh");
    try {
      const res = await fetch(`/admin/custom/posts/${id}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.post) {
        const p = data.post;
        setTitle({
          zh: p.title || "",
          en: p.title_en || "",
          ko: p.title_ko || "",
        });
        setExcerpt({
          zh: p.excerpt || "",
          en: p.excerpt_en || "",
          ko: p.excerpt_ko || "",
        });
        setContent({
          zh: p.content || "",
          en: p.content_en || "",
          ko: p.content_ko || "",
        });
        setSeoTitle({
          zh: p.seo_title || "",
          en: p.seo_title_en || "",
          ko: p.seo_title_ko || "",
        });
        setSeoDescription({
          zh: p.seo_description || "",
          en: p.seo_description_en || "",
          ko: p.seo_description_ko || "",
        });
        setSeoKeywords({
          zh: p.seo_keywords || "",
          en: p.seo_keywords_en || "",
          ko: p.seo_keywords_ko || "",
        });
        setSchemas({
          zh: parseSchemasFromDB(p.structured_data),
          en: parseSchemasFromDB(p.structured_data_en),
          ko: parseSchemasFromDB(p.structured_data_ko),
        });
        setSlug(p.slug || "");
        setThumbnail(p.thumbnail || "");
        setIsActive(p.is_active ?? true);
      }
    } catch (error) {
      console.error("Fetch single post error:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("確定要刪除這篇文章嗎？此動作無法復原！")) return;
    try {
      const res = await fetch(`/admin/custom/posts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        alert("文章已刪除");
        fetchPosts();
      } else alert("刪除失敗");
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const handleSave = async () => {
    if (!title.zh || !slug)
      return alert("⚠️ 「中文文章標題」與「網址代稱 (Slug)」為必填項目！");
    setIsUploading(true);

    const postData = {
      title: title.zh,
      title_en: title.en,
      title_ko: title.ko,
      slug,
      excerpt: excerpt.zh,
      excerpt_en: excerpt.en,
      excerpt_ko: excerpt.ko,
      content: content.zh,
      content_en: content.en,
      content_ko: content.ko,
      thumbnail,
      is_active: isActive,
      seo_title: seoTitle.zh,
      seo_title_en: seoTitle.en,
      seo_title_ko: seoTitle.ko,
      seo_description: seoDescription.zh,
      seo_description_en: seoDescription.en,
      seo_description_ko: seoDescription.ko,
      seo_keywords: seoKeywords.zh,
      seo_keywords_en: seoKeywords.en,
      seo_keywords_ko: seoKeywords.ko,
      structured_data: buildJsonLdString(schemas.zh),
      structured_data_en: buildJsonLdString(schemas.en),
      structured_data_ko: buildJsonLdString(schemas.ko),
    };

    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId
        ? `/admin/custom/posts/${editingId}`
        : "/admin/custom/posts";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(postData),
        credentials: "include",
      });

      if (res.ok) {
        alert(editingId ? "文章更新成功！" : "文章發佈大成功！");
        setCurrentView("list");
      } else {
        const err = await res.json();
        alert(`❌ 儲存失敗: ${err.message}`);
      }
    } catch (error) {
      console.error("Save exception:", error);
      alert("伺服器連線失敗");
    } finally {
      setIsUploading(false);
    }
  };

  // 🔥 修復: 支援 WebP 格式的封面圖片上傳，並進行中文檔名淨化
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalFile = e.target.files?.[0];
    if (!originalFile) return;
    setIsUploading(true);
    try {
      const fileExtension = originalFile.name.split(".").pop() || "png";
      const safeFileName = `news_thumb_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExtension}`;
      const safeFile = new File([originalFile], safeFileName, {
        type: originalFile.type,
      });

      const formData = new FormData();
      formData.append("files", safeFile);

      const res = await fetch("/admin/uploads", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.files && data.files.length > 0) {
        setThumbnail(data.files[0].url);
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const addSchema = (type: string) => {
    const newSchema: SchemaItem = {
      id: `${type}-${Date.now()}`,
      type,
      data: {},
    };
    if (type === "FAQPage") newSchema.data = { questions: [{ q: "", a: "" }] };
    if (type === "Article")
      newSchema.data = { articleType: "Article", speakable: "Disable" };
    setSchemas({
      ...schemas,
      [activeLangTab]: [...schemas[activeLangTab], newSchema],
    });
    setShowSchemaSelector(false);
    setEditingSchema({ ...newSchema, initialTab: "edit" });
  };

  const removeSchema = (id: string) => {
    if (!window.confirm("確定移除此 Schema?")) return;
    setSchemas({
      ...schemas,
      [activeLangTab]: schemas[activeLangTab].filter((s) => s.id !== id),
    });
  };

  const saveEditedSchema = (updatedSchema: SchemaItem) => {
    const currentList = schemas[activeLangTab];
    const index = currentList.findIndex((s) => s.id === updatedSchema.id);
    const newList = [...currentList];
    if (index !== -1) newList[index] = updatedSchema;
    else newList.push(updatedSchema);

    setSchemas({ ...schemas, [activeLangTab]: newList });
    setEditingSchema(null);
  };

  if (currentView === "list") {
    return (
      <Container className="p-4 md:p-8 max-w-[1600px] mx-auto flex flex-col gap-6 w-full">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-200 pb-4 gap-4">
          <Heading level="h1">最新消息/文章 (News)</Heading>
          <Button
            variant="primary"
            onClick={handleCreateNew}
            className="w-full sm:w-auto"
          >
            + 新增文章
          </Button>
        </div>

        {isLoadingList ? (
          <p className="text-gray-500 text-center py-10">載入中...</p>
        ) : posts.length === 0 ? (
          <div className="text-center py-20 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 mx-auto w-full">
            目前還沒有任何文章，點擊右上角新增吧！
          </div>
        ) : (
          <div className="w-full overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-sm text-gray-700 min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-4">圖片</th>
                  <th className="px-4 py-4">文章標題 (繁中)</th>
                  <th className="px-4 py-4">網址 (Slug)</th>
                  <th className="px-4 py-4">狀態</th>
                  <th className="px-4 py-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {posts.map((post: any) => (
                  <tr key={post.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 w-24">
                      {post.thumbnail ? (
                        <img
                          src={post.thumbnail}
                          alt=""
                          className="w-12 h-12 object-cover rounded-md border"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-md border flex items-center justify-center text-[10px] text-gray-400">
                          無圖
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 font-bold text-gray-900">
                      {post.title}
                    </td>
                    <td className="px-4 py-4 text-gray-500">{post.slug}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`px-2 py-1 text-[10px] rounded-full font-bold ${post.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}
                      >
                        {post.is_active ? "已發布" : "草稿"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right space-x-2">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => handleEdit(post.id)}
                      >
                        編輯
                      </Button>
                      <Button
                        variant="danger"
                        size="small"
                        onClick={() => handleDelete(post.id)}
                      >
                        刪除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Container>
    );
  }

  return (
    <Container className="p-4 md:p-8 max-w-[1600px] mx-auto flex flex-col gap-6 md:gap-10 w-full relative">
      {editingSchema && (
        <SchemaEditorModal
          schema={editingSchema}
          initialTab={editingSchema.initialTab || "edit"}
          onSave={saveEditedSchema}
          onClose={() => setEditingSchema(null)}
        />
      )}

      {showSchemaSelector && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm rounded-lg shadow-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <Heading level="h2" className="text-lg font-bold m-0">
                Select Schema
              </Heading>
              <button
                onClick={() => setShowSchemaSelector(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <button
                onClick={() => addSchema("Article")}
                className="border border-gray-200 p-4 rounded hover:border-[#0073e6] hover:bg-blue-50 text-left flex items-center gap-4 transition-colors"
              >
                <div className="w-10 h-10 border border-gray-200 rounded flex items-center justify-center bg-white text-gray-500">
                  📝
                </div>
                <div className="font-bold text-gray-800 text-sm">Article</div>
              </button>
              <button
                onClick={() => addSchema("FAQPage")}
                className="border border-gray-200 p-4 rounded hover:border-[#0073e6] hover:bg-blue-50 text-left flex items-center gap-4 transition-colors"
              >
                <div className="w-10 h-10 border border-gray-200 rounded flex items-center justify-center bg-white text-gray-500">
                  💬
                </div>
                <div className="font-bold text-gray-800 text-sm">FAQ</div>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 pb-4 gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="transparent"
            onClick={() => setCurrentView("list")}
            className="text-gray-500 px-0"
          >
            ← 列表
          </Button>
          <Heading level="h1" className="text-xl font-bold m-0">
            {editingId ? "編輯文章" : "發佈新文章"}
          </Heading>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-black w-4 h-4 md:w-5 md:h-5"
            />
            <span className="text-sm font-bold text-gray-700">公開發佈</span>
          </label>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isUploading}
            className="bg-black text-white px-6"
          >
            {isUploading ? "處理中..." : "儲存設定"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 flex flex-col gap-6 w-full">
          <div className="flex gap-2 border-b border-gray-200">
            {[
              { id: "zh", label: "繁體中文" },
              { id: "en", label: "English" },
              { id: "ko", label: "한국어" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveLangTab(tab.id as Lang)}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeLangTab === tab.id ? "border-black text-black" : "border-transparent text-gray-400 hover:text-gray-600"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
            <Label className="mb-2 block font-bold text-stone-800">
              文章標題 ({activeLangTab.toUpperCase()}){" "}
              {activeLangTab === "zh" && "*"}
            </Label>
            <Input
              placeholder={`輸入${activeLangTab.toUpperCase()}標題...`}
              value={title[activeLangTab]}
              onChange={(e) =>
                setTitle({ ...title, [activeLangTab]: e.target.value })
              }
              className="w-full"
            />
          </div>

          <div className="p-4 bg-gray-50 border border-gray-100 rounded-lg">
            <Label className="mb-2 block font-bold text-stone-800">
              文章內容 ({activeLangTab.toUpperCase()})
            </Label>
            <div className="bg-white rounded-md border border-gray-200 w-full overflow-x-auto">
              <ReactQuill
                ref={quillRef}
                key={activeLangTab}
                theme="snow"
                modules={quillModules}
                value={content[activeLangTab]}
                onChange={(val) =>
                  setContent({ ...content, [activeLangTab]: val })
                }
                style={{
                  height: "400px",
                  paddingBottom: "40px",
                  minWidth: "100%",
                }}
                className="md:h-[500px]"
              />
            </div>
          </div>

          <div className="mt-8 bg-white border border-gray-200 rounded-md shadow-sm overflow-hidden w-full">
            <div className="bg-[#f0f2f5] border-b border-gray-200 px-6 py-4 flex items-center gap-3">
              <span className="text-xl opacity-80">⚙️</span>
              <Heading
                level="h2"
                className="text-sm font-bold text-gray-800 m-0"
              >
                SEO
              </Heading>
            </div>

            <div className="p-6 flex flex-col gap-6">
              <div className="space-y-4 border-b border-gray-100 pb-6">
                <div>
                  <Label className="mb-2 block text-sm font-bold text-gray-700">
                    標題 (Title)
                  </Label>
                  <Input
                    value={seoTitle[activeLangTab]}
                    onChange={(e) =>
                      setSeoTitle({
                        ...seoTitle,
                        [activeLangTab]: e.target.value,
                      })
                    }
                    className="w-full"
                    placeholder="%title% %sep% %sitename%"
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-bold text-gray-700">
                    描述 (Description)
                  </Label>
                  <Textarea
                    value={seoDescription[activeLangTab]}
                    onChange={(e) =>
                      setSeoDescription({
                        ...seoDescription,
                        [activeLangTab]: e.target.value,
                      })
                    }
                    className="w-full h-20"
                    placeholder="%excerpt%"
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-sm font-bold text-gray-700">
                    關鍵字 (Focus Keyword)
                  </Label>
                  <Input
                    value={seoKeywords[activeLangTab]}
                    onChange={(e) =>
                      setSeoKeywords({
                        ...seoKeywords,
                        [activeLangTab]: e.target.value,
                      })
                    }
                    className="w-full"
                    placeholder="Enter keywords separated by comma"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-4 block text-sm font-bold text-gray-800">
                  Schema 結構化標籤
                </Label>
                <div className="space-y-3 mb-5">
                  {schemas[activeLangTab].map((schema) => (
                    <div
                      key={schema.id}
                      className="flex justify-between items-center border border-gray-200 p-3 rounded bg-white hover:border-gray-300 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 border border-gray-200 rounded flex items-center justify-center text-gray-500 bg-gray-50 text-sm">
                          {schema.type === "Article" ? "📝" : "💬"}
                        </div>
                        <span className="font-bold text-sm text-gray-700">
                          {schema.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() =>
                            setEditingSchema({ ...schema, initialTab: "edit" })
                          }
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        >
                          ✏️ 編輯
                        </button>
                        <button
                          onClick={() =>
                            setEditingSchema({ ...schema, initialTab: "code" })
                          }
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                        >
                          👁️ 程式碼
                        </button>
                        <button
                          onClick={() => removeSchema(schema.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded"
                        >
                          🗑️ 刪除
                        </button>
                      </div>
                    </div>
                  ))}
                  {schemas[activeLangTab].length === 0 && (
                    <div className="text-center p-6 border border-dashed border-gray-300 rounded text-sm text-gray-400 bg-gray-50">
                      尚未加入任何 Schema。這會讓搜尋引擎較難理解您的網頁內容。
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowSchemaSelector(true)}
                  className="bg-[#0073e6] text-white text-sm font-medium px-4 py-2 rounded hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Schema Generator
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6 w-full">
          <div className="p-4 md:p-6 border border-gray-200 rounded-lg bg-white w-full">
            <Heading level="h2" className="text-base mb-4 m-0">
              文章設定
            </Heading>
            <div className="mb-4 mt-2">
              <Label className="mb-2 block text-stone-800">
                網址代稱 (Slug) *
              </Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full"
              />
              <span className="text-xs text-gray-400 mt-1 block truncate">
                網址將會是: /news/{slug || "..."}
              </span>
            </div>
            <div>
              <Label className="mb-2 block">
                文章摘要 ({activeLangTab.toUpperCase()})
              </Label>
              <Textarea
                className="h-20 md:h-24 w-full"
                value={excerpt[activeLangTab]}
                onChange={(e) =>
                  setExcerpt({ ...excerpt, [activeLangTab]: e.target.value })
                }
              />
            </div>
          </div>

          <div className="p-4 md:p-6 border border-gray-200 rounded-lg bg-white w-full">
            <Heading level="h2" className="text-base mb-4 m-0">
              封面圖片 (Thumbnail)
            </Heading>
            {thumbnail ? (
              <div className="mb-4 mt-2 relative rounded overflow-hidden border border-gray-200 aspect-[4/3] w-full">
                <img
                  src={thumbnail}
                  alt="Thumbnail preview"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setThumbnail("")}
                  className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded shadow-sm hover:bg-red-600"
                >
                  移除
                </button>
              </div>
            ) : (
              <div className="mb-4 mt-2 aspect-[4/3] w-full bg-gray-100 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 text-sm">
                尚未上傳圖片
              </div>
            )}
            <div className="w-full overflow-hidden">
              <Input
                type="file"
                accept="image/png, image/jpeg, image/jpg, image/gif, image/webp, .webp"
                onChange={handleImageUpload}
                disabled={isUploading}
                className="w-full text-xs md:text-sm"
              />
            </div>
            {isUploading && (
              <span className="text-xs text-blue-500 mt-2 block font-medium">
                圖片上傳中...
              </span>
            )}
          </div>
        </div>
      </div>
    </Container>
  );
}

export const config = defineRouteConfig({
  label: "最新消息 / 文章",
  icon: DocumentText,
});
