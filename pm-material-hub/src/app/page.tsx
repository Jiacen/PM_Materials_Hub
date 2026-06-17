"use client";
import React, { useState, useEffect } from "react";

const STANDARD_FOLDERS = [
  "01_Catalogue_产品样本",
  "02_Manual_产品技术手册",
  "03_产品物料表格",
  "04_Slides_Technical&Sales",
  "05_Sales_Reference_成功案例",
  "06_Sales_Fighting_Guide",
  "07_文本资料",
  "08_产品图片素材",
  "09_认证证书",
  "10_FAQ_常见问题集"
];

export default function Home() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [workspaceInfo, setWorkspaceInfo] = useState<any>(null);
  
  // Onboarding state
  const [showSetup, setShowSetup] = useState(false);
  const [setupPath, setSetupPath] = useState("");

  // In-Browser Folder Picker State
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPath, setPickerPath] = useState("");
  const [pickerDirs, setPickerDirs] = useState<string[]>([]);
  const [pickerParent, setPickerParent] = useState("");
  const [pickerLoading, setPickerLoading] = useState(false);

  const loadPickerPath = async (targetPath?: string) => {
    setPickerLoading(true);
    try {
      const url = targetPath ? `/api/fs?path=${encodeURIComponent(targetPath)}` : '/api/fs';
      const res = await fetch(url);
      const data = await res.json();
      if (data.currentPath) {
        setPickerPath(data.currentPath);
        setPickerDirs(data.directories || []);
        setPickerParent(data.parentPath);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPickerLoading(false);
    }
  };

  // Selection state
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  
  // Rule and Extraction state
  const [folderPrompts, setFolderPrompts] = useState<Record<string, string>>({});
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [isSavingRule, setIsSavingRule] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [isIndexingLocal, setIsIndexingLocal] = useState(false);
  const [localIndexResult, setLocalIndexResult] = useState<any>(null);
  const [materialCards, setMaterialCards] = useState<any[]>([]);
  const [deckPages, setDeckPages] = useState<any[]>([
    { id: 'page-1', title: 'Page 1', items: [] }
  ]);
  const [activePageId, setActivePageId] = useState('page-1');
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

  const loadPrompts = async () => {
    try {
      const res = await fetch('/api/settings/prompts');
      const data = await res.json();
      setFolderPrompts(data || {});
    } catch (err) {
      console.error("Failed to load prompts", err);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  // When folder is selected, load its specific prompt
  useEffect(() => {
    if (selectedFolder) {
      setCurrentPrompt(folderPrompts[selectedFolder] || "");
      setExtractionResult(null); // reset result
      setLocalIndexResult(null);
    }
  }, [selectedFolder, folderPrompts]);

  const loadMaterialCards = async (folderName: string) => {
    setIsLoadingCards(true);
    try {
      const res = await fetch(`/api/materials/cards?folderName=${encodeURIComponent(folderName)}`);
      const data = await res.json();
      setMaterialCards(data.success ? data.cards || [] : []);
    } catch (err) {
      setMaterialCards([]);
    } finally {
      setIsLoadingCards(false);
    }
  };

  useEffect(() => {
    if (selectedFolder) {
      loadMaterialCards(selectedFolder);
    } else {
      setMaterialCards([]);
    }
  }, [selectedFolder]);

  const handleSaveRule = async () => {
    if (!selectedFolder) return;
    setIsSavingRule(true);
    try {
      const res = await fetch('/api/settings/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: selectedFolder, prompt: currentPrompt })
      });
      if (res.ok) {
        setFolderPrompts(prev => ({ ...prev, [selectedFolder]: currentPrompt }));
        alert("保存成功！");
      }
    } catch (err) {
      alert("保存失败");
    } finally {
      setIsSavingRule(false);
    }
  };

  const handleExtractBatch = async () => {
    if (!selectedFolder) return;
    if (!currentPrompt) {
      alert("请先填写并保存大模型提取规则！");
      return;
    }
    
    setIsExtracting(true);
    setExtractionResult(null);
    try {
      const res = await fetch('/api/extract/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: selectedFolder, prompt: currentPrompt })
      });
      const data = await res.json();
      setExtractionResult(data);
      if (data.success) {
        alert("批量提取完成！请查看下方状态栏的详细结果。");
      } else {
        alert("提取过程中出现错误：" + data.error);
      }
    } catch (err) {
      alert("提取失败，网络或服务器错误");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleLocalIndex = async () => {
    if (!selectedFolder) return;

    setIsIndexingLocal(true);
    setLocalIndexResult(null);
    try {
      const res = await fetch('/api/index/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderName: selectedFolder, force: true })
      });
      const data = await res.json();
      setLocalIndexResult(data);
      if (data.success) {
        await handleSync();
        if (selectedFolder) await loadMaterialCards(selectedFolder);
      } else {
        alert("本地 JSON 生成失败：" + data.error);
      }
    } catch (err) {
      alert("本地 JSON 生成失败，服务器未响应");
    } finally {
      setIsIndexingLocal(false);
    }
  };

  // LLM Config state
  const [llmStatus, setLlmStatus] = useState<any>(null);
  const [showLlmSetup, setShowLlmSetup] = useState(false);
  const [llmBaseUrlInput, setLlmBaseUrlInput] = useState("https://api.moonshot.cn/v1");
  const [llmApiKeyInput, setLlmApiKeyInput] = useState("");
  const [isTestingLlm, setIsTestingLlm] = useState(false);

  const loadLlmStatus = async () => {
    try {
      const res = await fetch('/api/settings/llm');
      const data = await res.json();
      setLlmStatus(data);
      if (data.baseUrl) setLlmBaseUrlInput(data.baseUrl);
      if (data.isConfigured) setLlmApiKeyInput("********");
    } catch (err) {
      console.error("Failed to load LLM status");
    }
  };

  const handleOpenPicker = () => {
    setShowPicker(true);
    loadPickerPath(setupPath || undefined);
  };

  const handleCreateFolder = async () => {
    const folderName = window.prompt("请输入新文件夹的名称：", "PM_Materials");
    if (!folderName) return;
    
    try {
      setPickerLoading(true);
      const res = await fetch('/api/fs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentPath: pickerPath, folderName: folderName.trim() })
      });
      const data = await res.json();
      if (data.success) {
        // reload current directory to show new folder
        loadPickerPath(pickerPath);
      } else {
        alert("创建失败: " + data.error);
        setPickerLoading(false);
      }
    } catch (err) {
      alert("创建出错");
      setPickerLoading(false);
    }
  };

  const handleSelectFolder = () => {
    setSetupPath(pickerPath);
    setShowPicker(false);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync');
      const data = await res.json();
      
      // If API throws WORKSPACE_NOT_SET, open setup modal
      if (data.message === "WORKSPACE_NOT_SET") {
        setShowSetup(true);
      } else if (data.status === 'success') {
        setWorkspaceInfo(data);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to sync workspace');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSetupSubmit = async () => {
    if (!setupPath.trim()) return;
    try {
      const res = await fetch('/api/settings/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspacePath: setupPath.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setShowSetup(false);
        // Sync again now that path is set
        handleSync();
      } else {
        alert("Failed to initialize workspace: " + data.message);
      }
    } catch (err) {
      alert("Error setting up workspace.");
    }
  };

  // Initial check (optional, but good for UX)
  useEffect(() => {
    handleSync();
    loadLlmStatus();
  }, []);

  const handleLlmSubmit = async () => {
    if (!llmApiKeyInput) return;
    setIsTestingLlm(true);
    try {
      const res = await fetch('/api/settings/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiKey: llmApiKeyInput, 
          baseUrl: llmBaseUrlInput 
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowLlmSetup(false);
        await loadLlmStatus(); // reload to get new connection status
      } else {
        alert("Failed to save LLM settings");
      }
    } catch (err) {
      alert("Error saving LLM settings");
    } finally {
      setIsTestingLlm(false);
    }
  };

  // Group files by their parent folder (e.g. 01_Catalogue_产品样本)
  const groupedFiles = workspaceInfo?.files?.reduce((acc: any, file: any) => {
    const parts = file.relativePath.split(/\\|\//); // handle win/mac slashes
    const folder = parts[0];
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(file);
    return acc;
  }, {}) || {};

  const addCardToDeck = (card: any) => {
    setDeckPages(prev => prev.map(page => {
      if (page.id !== activePageId) return page;
      return {
        ...page,
        items: [
          ...page.items,
          {
            ...card,
            deckId: `${card.id}-${Date.now()}-${page.items.length}`,
          }
        ]
      };
    }));
  };

  const handleDropToDeck = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const cardId = event.dataTransfer.getData('application/x-material-card') || event.dataTransfer.getData('text/plain') || draggingCardId;
    const card = materialCards.find(item => item.id === cardId);
    if (card) addCardToDeck(card);
    setDraggingCardId(null);
  };

  const handleDragOverDeck = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleFolderClick = (folderName: string) => {
    setSelectedFolder(folderName);
    setExpandedFolder(prev => prev === folderName ? null : folderName);
  };

  const activePage = deckPages.find(page => page.id === activePageId) || deckPages[0];
  const totalDeckBlocks = deckPages.reduce((sum, page) => sum + page.items.length, 0);

  const addDeckPage = () => {
    const nextNumber = deckPages.length + 1;
    const page = { id: `page-${Date.now()}`, title: `Page ${nextNumber}`, items: [] };
    setDeckPages(prev => [...prev, page]);
    setActivePageId(page.id);
  };

  const deleteDeckPage = (pageId: string) => {
    if (deckPages.length <= 1) return;

    const pageIndex = deckPages.findIndex(page => page.id === pageId);
    const pageToDelete = deckPages[pageIndex];
    if (pageToDelete?.items?.length > 0) {
      const confirmed = window.confirm(`${pageToDelete.title} already has ${pageToDelete.items.length} blocks. Delete this page?`);
      if (!confirmed) return;
    }

    const remainingPages = deckPages
      .filter(page => page.id !== pageId)
      .map((page, index) => ({ ...page, title: `Page ${index + 1}` }));

    setDeckPages(remainingPages);
    if (activePageId === pageId) {
      const nextActiveIndex = Math.min(Math.max(pageIndex, 0), remainingPages.length - 1);
      setActivePageId(remainingPages[nextActiveIndex].id);
    }
  };

  const clearActivePage = () => {
    setDeckPages(prev => prev.map(page => page.id === activePageId ? { ...page, items: [] } : page));
  };

  const removeDeckItem = (deckId: string) => {
    setDeckPages(prev => prev.map(page => page.id === activePageId
      ? { ...page, items: page.items.filter((item: any) => item.deckId !== deckId) }
      : page
    ));
  };

  const cardTypeLabel = (type: string) => {
    if (type === 'image') return 'IMAGE';
    if (type === 'product') return 'PRODUCT';
    if (type === 'module') return 'MODULE';
    if (type === 'accessory') return 'PART';
    if (type === 'mlfb') return 'MLFB';
    if (type === 'document') return 'DOC';
    return 'TEXT';
  };

  const cardTypeClass = (type: string) => {
    if (type === 'image') return 'bg-cyan-50 text-cyan-700 border-cyan-100';
    if (type === 'product') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (type === 'module') return 'bg-primary/10 text-primary border-primary/20';
    if (type === 'accessory') return 'bg-slate-100 text-slate-600 border-slate-200';
    if (type === 'mlfb') return 'bg-primary/10 text-primary border-primary/20';
    if (type === 'document') return 'bg-slate-100 text-slate-600 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-100';
  };

  const aiMaterialCards = materialCards.filter(card => card.stage === 'ai');
  const rawMaterialCards = materialCards.filter(card => card.stage !== 'ai');

  const renderMaterialCard = (card: any) => (
    <div
      key={card.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-material-card', card.id);
        event.dataTransfer.setData('text/plain', card.id);
        setDraggingCardId(card.id);
      }}
      onDragEnd={() => setDraggingCardId(null)}
      className="group rounded-md border border-siemens-stone/60 bg-white p-3 shadow-sm hover:border-primary/40 hover:shadow-md transition-all cursor-grab active:cursor-grabbing"
    >
      {card.type === 'image' && card.assetUrl && (
        <div className="mb-3 aspect-[16/9] rounded border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center">
          <img src={card.assetUrl} alt={card.title} className="max-h-full max-w-full object-contain" />
        </div>
      )}
      <div className="flex items-start gap-3">
        <span className={`shrink-0 text-[10px] font-bold border rounded px-1.5 py-0.5 ${cardTypeClass(card.type)}`}>
          {cardTypeLabel(card.type)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-700 truncate" title={card.title}>{card.title}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{card.subtitle}</p>
          <p className="text-xs text-slate-500 mt-2 line-clamp-2">{card.body}</p>
          {card.type === 'image' && card.tags?.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {card.tags.slice(0, 4).map((tag: string) => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-100">{tag}</span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-400 truncate">{card.sourceFile}</span>
            <button
              onClick={() => addCardToDeck(card)}
              className="px-1.5 py-0.5 rounded border border-primary/30 bg-primary/5 text-primary text-[10px] font-medium hover:bg-primary hover:text-white transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      
      {/* Native-like Folder Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl w-[600px] h-[500px] flex flex-col overflow-hidden border border-siemens-stone/40">
            {/* Header */}
            <div className="bg-slate-100 p-3 border-b border-siemens-stone/40 flex justify-between items-center">
              <h3 className="font-semibold text-slate-700">选择文件夹 (Browse Folder)</h3>
              <button onClick={() => setShowPicker(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            {/* Address Bar */}
            <div className="p-3 border-b border-slate-200 bg-white flex gap-2 items-center">
              <button 
                onClick={() => loadPickerPath(pickerParent)}
                disabled={!pickerParent || pickerParent === pickerPath}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded disabled:opacity-50 flex-shrink-0"
              >
                ⬆ 返回上级
              </button>
              <input 
                type="text" 
                value={pickerPath} 
                readOnly
                className="flex-1 border border-slate-200 rounded px-2 py-1 text-sm bg-slate-50 text-slate-600"
              />
              <button 
                onClick={handleCreateFolder}
                className="px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded flex-shrink-0 flex items-center gap-1"
              >
                <span>➕</span> 新建文件夹
              </button>
            </div>
            
            {/* Folder List */}
            <div className="flex-1 overflow-y-auto p-2 bg-white">
              {pickerLoading ? (
                <div className="flex justify-center items-center h-full text-slate-400">Loading...</div>
              ) : pickerDirs.length === 0 ? (
                <div className="flex justify-center items-center h-full text-slate-400 text-sm">此文件夹为空或无子目录</div>
              ) : (
                <div className="grid grid-cols-1 gap-1">
                  {pickerDirs.map(dir => (
                    <div 
                      key={dir} 
                      onClick={() => loadPickerPath(pickerPath + '\\' + dir)}
                      className="flex items-center gap-2 p-2 hover:bg-primary/5 rounded cursor-pointer group"
                    >
                      <span className="text-xl group-hover:scale-110 transition-transform">📁</span>
                      <span className="text-sm text-slate-700 font-medium select-none">{dir}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="bg-slate-50 p-4 border-t border-siemens-stone/30 flex justify-end gap-3">
              <button 
                onClick={() => setShowPicker(false)}
                className="px-4 py-2 border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button 
                onClick={handleSelectFolder}
                className="px-6 py-2 bg-primary text-white rounded shadow-md hover-lift"
              >
                选择当前文件夹
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding Modal */}
      {showSetup && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full border border-siemens-stone/40">
            <h2 className="text-2xl font-semibold mb-2">Welcome to PM Material Hub</h2>
            <p className="text-slate-500 mb-6 text-sm">
              Please initialize your single source of truth. Select the local path on your computer where you want to store your product materials. We will automatically create the 10 standard folders there.
            </p>
            <div className="mb-6">
              <label className="block text-xs font-semibold text-slate-600 mb-2">
                Local Directory Path
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={setupPath}
                  onChange={e => setSetupPath(e.target.value)}
                  placeholder="点击右侧按钮浏览，或直接输入例如: D:\PM_Materials"
                  className="flex-1 border border-siemens-stone bg-white rounded-md p-2 text-sm text-slate-700 focus:outline-none focus:border-primary"
                />
                <button 
                  onClick={handleOpenPicker}
                  className="px-4 py-2 bg-siemens-stone/40 hover:bg-siemens-stone border border-siemens-stone rounded-md text-sm font-medium transition-colors whitespace-nowrap"
                >
                  📁 浏览文件夹...
                </button>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button 
                onClick={handleSetupSubmit}
                disabled={!setupPath}
                className={`px-6 py-2 rounded-md shadow transition-all ${setupPath ? 'bg-primary text-white hover-lift' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
              >
                Create Data Area (创建资料区)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LLM Setup Modal */}
      {showLlmSetup && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-8 rounded-xl shadow-2xl max-w-lg w-full border border-siemens-stone/40">
            <h2 className="text-2xl font-semibold mb-2">Configure LLM Engine</h2>
            <p className="text-slate-500 mb-6 text-sm">
              Connect your Kimi (Moonshot AI) or compatible API to enable intelligent content extraction.
            </p>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Base URL
                </label>
                <input 
                  type="text" 
                  value={llmBaseUrlInput}
                  onChange={e => setLlmBaseUrlInput(e.target.value)}
                  placeholder="https://api.moonshot.cn/v1"
                  className="w-full border border-siemens-stone bg-white rounded-md p-2 text-sm text-slate-700 focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  API Key
                </label>
                <input 
                  type="password" 
                  value={llmApiKeyInput}
                  onChange={e => setLlmApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                  className="w-full border border-siemens-stone bg-white rounded-md p-2 text-sm text-slate-700 focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button 
                onClick={() => setShowLlmSetup(false)}
                className="px-4 py-2 border border-slate-300 rounded text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button 
                onClick={handleLlmSubmit}
                disabled={!llmApiKeyInput || isTestingLlm}
                className={`px-6 py-2 rounded shadow transition-all flex items-center gap-2 ${llmApiKeyInput ? 'bg-primary text-white hover-lift' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
              >
                {isTestingLlm ? 'Testing...' : 'Test & Save (测试并保存)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header (Glassmorphism) */}
      <header className="glass-panel z-10 sticky top-0 px-6 py-4 flex justify-between items-center border-b border-siemens-stone/30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-lg">
              S
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              PM Material Hub
            </h1>
          </div>
          
          {/* LLM Status Badge */}
          <button 
            onClick={() => setShowLlmSetup(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white/50 hover:bg-white shadow-sm transition-all text-xs"
          >
            {llmStatus?.status === 'connected' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse"></span>
                <span className="text-emerald-700 font-medium">Connected: {llmStatus.modelName}</span>
              </>
            ) : llmStatus?.status === 'error' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span className="text-red-600 font-medium">Connection Error</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                <span className="text-slate-500 font-medium">LLM Unconfigured</span>
              </>
            )}
          </button>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          {workspaceInfo?.workspacePath && (
            <span className="text-xs text-slate-400 mr-4">
              🗂️ {workspaceInfo.workspacePath}
            </span>
          )}
          <button className="px-4 py-2 rounded-md hover:bg-siemens-stone/50 transition-colors">
            Preview
          </button>
          <button className="px-4 py-2 rounded-md bg-primary text-primary-foreground shadow-md hover-lift transition-all">
            Export HTML
          </button>
          <button className="ml-4 w-9 h-9 rounded-full bg-siemens-stone flex items-center justify-center hover:bg-siemens-stone/80 transition-colors">
            ⚙️
          </button>
        </div>
      </header>

      {/* Main Workspace: 3 Columns */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Material Library */}
        <aside className="w-80 border-r border-siemens-stone/40 bg-white/50 backdrop-blur flex flex-col">
          <div className="p-4 border-b border-siemens-stone/30">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wider">
                Material Library
              </h2>
              {/* Sync Button moved to Library Header */}
              {workspaceInfo && (
                <button 
                  onClick={handleSync}
                  disabled={isSyncing}
                  className={`text-xs px-2 py-1 rounded border ${isSyncing ? 'text-slate-400 border-slate-200' : 'text-primary border-primary/30 hover:bg-primary/10'} transition-colors`}
                >
                  {isSyncing ? 'Syncing...' : '↻ Sync'}
                </button>
              )}
            </div>
            
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search materials..." 
                className="w-full bg-white border border-siemens-stone rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            
            {!workspaceInfo && !showSetup && (
              <div className="text-center text-sm text-slate-500 mt-10">
                <button onClick={handleSync} className="text-primary hover:underline">Click to Initialize Workspace</button>
              </div>
            )}

            {/* Always render all 10 standard folders */}
            {workspaceInfo && STANDARD_FOLDERS.map(folderName => {
              const filesInFolder = groupedFiles[folderName] || [];
              const isSelected = selectedFolder === folderName;
              const isExpanded = expandedFolder === folderName;
              
              return (
                <div key={folderName} className={`p-2 rounded-lg border transition-all mb-1 ${isSelected ? 'border-primary/50 bg-primary/5' : 'border-transparent hover:border-siemens-stone hover:bg-white hover-lift'}`}>
                  <div 
                    className="flex items-center gap-2 mb-1 cursor-pointer"
                    onClick={() => handleFolderClick(folderName)}
                  >
                    <span className="text-lg">{isExpanded ? '📂' : '📁'}</span>
                    <span className={`font-medium text-xs truncate ${isSelected ? 'text-primary' : 'text-slate-700'}`} title={folderName}>
                      {folderName}
                    </span>
                    {filesInFolder.length > 0 && (
                      <span className="ml-auto bg-siemens-stone/40 text-[10px] px-1.5 rounded-full text-slate-600">
                        {filesInFolder.length}
                      </span>
                    )}
                  </div>
                  
                  {isExpanded && filesInFolder.length > 0 ? (
                    <div className="pl-6 mt-1 space-y-1">
                      {filesInFolder.map((file: any) => {
                        const fileName = file.relativePath.split(/\\|\//).pop();
                        return (
                          <div key={file.relativePath} className="text-[11px] text-slate-500 hover:text-primary cursor-pointer truncate flex items-center justify-between">
                            <span title={fileName}>📄 {fileName}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : filesInFolder.length === 0 ? (
                    <div className="pl-6 text-[10px] text-slate-300 italic">Empty</div>
                  ) : (
                    <div className="pl-6 text-[10px] text-slate-300 italic">Collapsed</div>
                  )}
                </div>
              );
            })}

          </div>
        </aside>

        {/* Center Column: Material Cards + Canvas */}
        <section className="flex-1 bg-slate-50/50 p-6 overflow-y-auto relative">
          <div className="max-w-5xl mx-auto flex flex-col gap-5">
            <div className="hidden">
              <div className="flex gap-2">
                <button 
                  onClick={() => selectedFolder && loadMaterialCards(selectedFolder)}
                  disabled={!selectedFolder || isLoadingCards}
                  className="px-3 py-2 hover:bg-siemens-stone rounded-md text-sm text-slate-600 transition-colors"
                >
                  {isLoadingCards ? '刷新中...' : '刷新卡片'}
                </button>
                <button className="px-3 py-2 hover:bg-siemens-stone rounded-md text-sm text-slate-600 transition-colors">
                  AI Generate
                </button>
              </div>
              <div className="text-sm text-slate-400">
                Workspace ({deckPages.length} pages · {totalDeckBlocks} blocks)
              </div>
            </div>

            <div className="order-3 bg-white/80 border border-siemens-stone/40 rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">可用物料卡片</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedFolder ? '优先使用大模型精选卡片，原始候选用于补充核对' : '先在左侧选择资料分类'}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{aiMaterialCards.length} refined · {rawMaterialCards.length} raw</span>
              </div>

              {!selectedFolder ? (
                <div className="h-24 flex items-center justify-center text-sm text-slate-400 border border-dashed border-siemens-stone rounded-md">
                  选择左侧文件夹后显示物料卡片
                </div>
              ) : materialCards.length === 0 ? (
                <div className="h-28 flex flex-col items-center justify-center text-sm text-slate-400 border border-dashed border-siemens-stone rounded-md">
                  <p>还没有卡片</p>
                  <p className="text-xs mt-1">先在右侧点击“生成 / 更新本地 JSON”</p>
                </div>
              ) : (
                <div className="max-h-[320px] overflow-y-auto pr-1 space-y-4">
                  {aiMaterialCards.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold text-primary">大模型精选卡片</h3>
                        <span className="text-[10px] text-slate-400">可直接拖入工作区</span>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                        {aiMaterialCards.map(renderMaterialCard)}
                      </div>
                    </div>
                  )}

                  {rawMaterialCards.length > 0 && (
                    <details open={aiMaterialCards.length === 0}>
                      <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-primary">
                        原始候选素材 ({rawMaterialCards.length})
                      </summary>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-2">
                        {rawMaterialCards.map(renderMaterialCard)}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            <div
              onDragEnter={(event) => event.preventDefault()}
              onDragOver={handleDragOverDeck}
              onDrop={handleDropToDeck}
              className="order-2 min-h-[420px] border-2 border-dashed border-siemens-stone rounded-xl bg-white/40 backdrop-blur p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">HTML PPT 工作区</h2>
                  <p className="text-xs text-slate-400 mt-1">每页可以组合多个物料块，拖入后加入当前页面</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={addDeckPage}
                    className="text-xs px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/5"
                  >
                    新增页面
                  </button>
                  {deckPages.length > 1 && (
                    <button
                      onClick={() => deleteDeckPage(activePageId)}
                      className="text-xs px-2 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50"
                    >
                      Delete page
                    </button>
                  )}
                  {activePage?.items?.length > 0 && (
                    <button
                      onClick={clearActivePage}
                      className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
                    >
                      清空当前页
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {deckPages.map((page, index) => (
                  <button
                    key={page.id}
                    onClick={() => setActivePageId(page.id)}
                    className={`shrink-0 px-3 py-1.5 rounded border text-xs transition-colors ${page.id === activePageId ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-primary/40'}`}
                  >
                    {page.title} · {page.items.length}
                  </button>
                ))}
              </div>

              {activePage.items.length === 0 ? (
                <div className="h-[300px] flex flex-col items-center justify-center text-slate-400">
                  <span className="text-4xl mb-4">□</span>
                  <p className="text-lg font-medium">拖入物料卡片开始组装 {activePage.title}</p>
                  <p className="text-sm mt-2">同一页可以放产品卡、参数卡、图片卡等多个内容块</p>
                </div>
              ) : (
                <div
                  className="space-y-4"
                  onDragEnter={(event) => event.preventDefault()}
                  onDragOver={handleDragOverDeck}
                  onDrop={handleDropToDeck}
                >
                  {activePage.items.map((item: any, index: number) => (
                    <div
                      key={item.deckId}
                      onDragEnter={(event) => event.preventDefault()}
                      onDragOver={handleDragOverDeck}
                      onDrop={handleDropToDeck}
                      className="bg-white border border-siemens-stone/60 rounded-lg shadow-sm overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-siemens-stone/40 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-primary">Block {index + 1}</span>
                          <span className={`text-[10px] font-bold border rounded px-1.5 py-0.5 ${cardTypeClass(item.type)}`}>
                            {cardTypeLabel(item.type)}
                          </span>
                          <span className="text-sm font-semibold text-slate-700 truncate">{item.title}</span>
                        </div>
                        <button
                          onClick={() => removeDeckItem(item.deckId)}
                          className="text-xs text-slate-400 hover:text-red-500"
                        >
                          移除
                        </button>
                      </div>
                      <div className="p-5">
                        {item.type === 'image' && item.assetUrl ? (
                          <div className="grid grid-cols-[minmax(220px,360px)_1fr] gap-5 items-center">
                            <div className="aspect-[4/3] rounded-md border border-slate-100 bg-slate-50 overflow-hidden flex items-center justify-center">
                              <img src={`${item.assetUrl}&mode=full`} alt={item.title} className="max-h-full max-w-full object-contain" />
                            </div>
                            <div>
                              <h3 className="text-xl font-semibold text-slate-800">{item.title}</h3>
                              <p className="text-sm text-slate-500 mt-2 leading-relaxed">{item.body}</p>
                              <p className="text-xs text-slate-400 mt-3">{item.subtitle}</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <h3 className="text-xl font-semibold text-slate-800">{item.title}</h3>
                            <p className="text-sm text-slate-500 mt-2 leading-relaxed">{item.body}</p>
                          </>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-400">
                          <span className="px-2 py-1 rounded bg-slate-50 border border-slate-100">{item.sourceFile}</span>
                          {(item.chunkIds || []).map((chunkId: string) => (
                            <span key={chunkId} className="px-2 py-1 rounded bg-primary/5 border border-primary/10 text-primary">{chunkId}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div
                    onDragEnter={(event) => event.preventDefault()}
                    onDragOver={handleDragOverDeck}
                    onDrop={handleDropToDeck}
                    className="h-14 rounded-md border border-dashed border-primary/30 bg-primary/5 flex items-center justify-center text-xs text-primary"
                  >
                    Drop here to add another block to {activePage.title}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Local Indexing */}
        <aside className="w-[340px] border-l border-siemens-stone/40 bg-white/50 backdrop-blur flex flex-col">
          <div className="p-6 border-b border-siemens-stone/30">
            <h2 className="font-semibold text-sm text-slate-500 uppercase tracking-wider">
              Local JSON Index
            </h2>
          </div>
          
          <div className="p-6 flex-1 overflow-y-auto">
            {!selectedFolder ? (
              <div className="p-6 bg-siemens-stone/20 rounded-lg border border-siemens-stone/40 text-center text-sm text-slate-500">
                👈 请在左侧选择一个资料分类，先把文件压缩成本地 JSON
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-primary mb-1 border-b border-siemens-stone/50 pb-2">
                    📁 {selectedFolder}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2">
                    本地读取 PDF、Word、PPT、Excel 和图片素材，生成 raw JSON 或 image manifest。这个步骤不调用大模型，不消耗 API token。
                  </p>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-siemens-stone/50 bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Files</p>
                    <p className="mt-1 text-lg font-semibold text-slate-700">{groupedFiles[selectedFolder]?.length || 0}</p>
                  </div>
                  <div className="rounded-md border border-siemens-stone/50 bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">JSON</p>
                    <p className="mt-1 text-lg font-semibold text-primary">{workspaceInfo?.localIndexCounts?.[selectedFolder] || 0}</p>
                  </div>
                  <div className="rounded-md border border-siemens-stone/50 bg-white p-3">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400">Need</p>
                    <p className="mt-1 text-lg font-semibold text-amber-500">
                      {Math.max(0, (groupedFiles[selectedFolder]?.length || 0) - (workspaceInfo?.localIndexCounts?.[selectedFolder] || 0))}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleLocalIndex}
                  disabled={isIndexingLocal || (groupedFiles[selectedFolder]?.length || 0) === 0}
                  className={`w-full px-4 py-3 rounded-md text-sm font-semibold shadow-md transition-all ${(groupedFiles[selectedFolder]?.length || 0) === 0 || isIndexingLocal ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-primary text-white hover-lift'}`}
                >
                  {isIndexingLocal ? '正在生成本地 JSON...' : '生成 / 更新本地 JSON'}
                </button>

                <div className="rounded-md border border-siemens-stone/40 bg-slate-50 p-3 text-[11px] text-slate-500 leading-relaxed">
                  输出位置：项目目录下 <span className="font-mono text-slate-600">data/local-json-indexes</span>。文档生成原文分块和候选信息，图片生成尺寸、格式、标签和用途信息。
                </div>

                {localIndexResult && (
                  <div className="mt-4 p-3 bg-white rounded-md border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-700 mb-2">最近本地 JSON 结果</h4>
                    {localIndexResult.success ? (
                      <ul className="text-[10px] space-y-1">
                        {localIndexResult.results.map((r: any, idx: number) => (
                          <li key={idx} className="border-b border-slate-100 pb-1">
                            <div className="flex justify-between gap-2">
                              <span className="truncate w-3/4" title={r.file}>{r.file}</span>
                              <span className={r.status === 'indexed' ? 'text-emerald-500' : r.status === 'skipped' ? 'text-slate-400' : 'text-red-500'}>
                                {r.status === 'indexed' ? '已生成' : r.status === 'skipped' ? '已跳过' : r.status}
                              </span>
                            </div>
                            {r.status === 'indexed' && (
                              <p className="mt-1 text-slate-400">
                                {r.width && r.height ? `${r.width} x ${r.height}` : `${r.chunks || 0} chunks · ${r.mlfbCandidates || 0} MLFB 候选`}
                              </p>
                            )}
                            {r.message && <p className="mt-1 text-red-500">{r.message}</p>}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-red-500 text-xs">Error: {localIndexResult.error}</p>
                    )}
                  </div>
                )}

                <details className="pt-3 border-t border-siemens-stone/40">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-primary">
                    高级：大模型精提取规则
                  </summary>
                  <div className="mt-3 space-y-3">
                    <textarea 
                      className="w-full h-36 border border-siemens-stone rounded-md p-2 text-xs text-slate-700 focus:outline-none focus:border-primary resize-none bg-slate-50"
                      placeholder="后续只对选中的 chunk 或候选产品调用大模型时使用..."
                      value={currentPrompt}
                      onChange={e => setCurrentPrompt(e.target.value)}
                    />
                    <div className="flex gap-2">
                  <button 
                    onClick={handleSaveRule}
                    disabled={isSavingRule}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {isSavingRule ? '💾 保存中...' : '💾 保存规则'}
                  </button>
                  <button 
                    onClick={handleExtractBatch}
                    disabled={isExtracting}
                    className={`flex-1 px-3 py-2 text-white rounded shadow-md text-xs font-medium transition-all ${isExtracting ? 'bg-slate-400 cursor-not-allowed' : 'bg-primary hover-lift'}`}
                  >
                    {isExtracting ? '🚀 提取中 (请耐心等待)...' : '🚀 批量提取该目录'}
                  </button>
                    </div>
                  </div>
                </details>
                
                <div className="mt-6 pt-4 border-t border-siemens-stone/40">
                  <h4 className="text-xs font-semibold text-slate-600 mb-2">文件夹状态</h4>
                  <div className="text-[11px] text-slate-500 space-y-1">
                    <p>总计文件：{groupedFiles[selectedFolder]?.length || 0} 份</p>
                    <p>本地 JSON：<span className="text-emerald-500 font-semibold">{workspaceInfo?.localIndexCounts?.[selectedFolder] || 0} 份</span></p>
                    <p>大模型精提取：<span className="text-slate-400 font-semibold">{workspaceInfo?.extractedCounts?.[selectedFolder] || 0} 份</span></p>
                  </div>
                </div>

                {/* Extraction Result display */}
                {extractionResult && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-md border border-slate-200">
                    <h4 className="text-xs font-bold text-slate-700 mb-2">最近提取结果</h4>
                    {extractionResult.success ? (
                      <ul className="text-[10px] space-y-1">
                        {extractionResult.results.map((r: any, idx: number) => (
                          <li key={idx} className="flex justify-between items-center border-b border-slate-100 pb-1">
                            <span className="truncate w-3/4" title={r.file}>{r.file}</span>
                            <span className={r.status === 'success' ? 'text-emerald-500' : r.status === 'skipped' ? 'text-slate-400' : 'text-red-500'}>
                              {r.status === 'success' ? '✅ 成功' : r.status === 'skipped' ? '⏭️ 跳过' : '❌ 失败'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-red-500 text-xs">Error: {extractionResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

      </main>
    </div>
  );
}
