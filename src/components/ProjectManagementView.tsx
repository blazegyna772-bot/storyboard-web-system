import { useState, useEffect } from "react";
import { CheckCircle2, ClipboardList, Database, Edit3, FolderKanban, Plus, RefreshCcw, Trash2, X } from "lucide-react";
import type { BackendRoot } from "../lib/projectApi";
import { toSafeFolderName, type StoryboardProject } from "../lib/projectStore";
import type { AnalysisOptions } from "../lib/storyboard";

export function ProjectManagementView({
  activeProjectId,
  projects,
  projectRootName,
  projectRoots,
  options,
  onPickRoot,
  onOpenManualRoot,
  onSelectRoot,
  onRequestRemoveRoot,
  onRefreshRoot,
  onOpenCreateProject,
  onSelectProject,
  onRequestDeleteProject,
  onOptionsChange,
}: {
  activeProjectId: string;
  projects: StoryboardProject[];
  projectRootName: string;
  projectRoots: BackendRoot[];
  options: AnalysisOptions;
  onPickRoot: () => void;
  onOpenManualRoot: () => void;
  onSelectRoot: (root: BackendRoot) => void;
  onRequestRemoveRoot: (root: BackendRoot) => void;
  onRefreshRoot: () => void;
  onOpenCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onRequestDeleteProject: (project: StoryboardProject) => void;
  onOptionsChange: (options: AnalysisOptions) => void;
}) {
  const activeProject = projects.find((project) => project.projectId === activeProjectId) ?? projects[0];
  const [displayMode, setDisplayMode] = useLocalState("project-display-mode", "cards");
  const isCardMode = displayMode !== "list";

  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>项目管理</h2>
          <p>一个项目对应一个独立文件夹；项目配置、输入、产物和导出都应跟随项目文件夹。</p>
        </div>
        <div className="header-actions">
          <button onClick={onPickRoot}>
            <FolderKanban size={16} />
            选择根目录
          </button>
          <button onClick={onOpenManualRoot}>
            <Edit3 size={16} />
            手动输入
          </button>
          <button onClick={onRefreshRoot} disabled={!projectRootName}>
            <RefreshCcw size={16} />
            刷新项目列表
          </button>
        </div>
      </div>

      <section className="project-management-grid">
        <article className="panel project-create-panel">
          <div className="panel-title">
            <FolderKanban size={18} />
            <span>项目根目录授权</span>
            <strong>{projectRootName || "未选择"}</strong>
          </div>
          <div className="project-root-list">
            {projectRoots.map((root) => (
              <div key={root.rootName} className={root.rootName === projectRootName ? "project-root-item active" : "project-root-item"} onDoubleClick={() => onSelectRoot(root)} title="双击切换">
                <button onDoubleClick={() => onSelectRoot(root)}>{root.rootName}</button>
                {root.rootName !== "WORK" && (
                  <button className="icon-danger-button" onClick={() => onRequestRemoveRoot(root)} title="移除授权">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button className="primary-button" onClick={onOpenCreateProject}>
            <Plus size={16} />
            新建项目
          </button>
        </article>

        <article className="panel project-current-panel">
          <div className="panel-title">
            <Database size={18} />
            <span>当前项目</span>
          </div>
          <div className="project-current-card">
            <strong>{activeProject?.name ?? "无项目"}</strong>
            <span>文件夹：{activeProject?.folderName ?? toSafeFolderName(activeProject?.name ?? "未命名项目")}</span>
            <span>更新：{activeProject ? new Date(activeProject.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "-"}</span>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Edit3 size={18} />
          <span>项目基本参数</span>
        </div>
        <div className="project-options-grid">
          <label>
            题材
            <input value={options.genreProfile} onChange={(event) => onOptionsChange({ ...options, genreProfile: event.target.value })} />
          </label>
          <label>
            导演风格
            <input value={options.directorProfile} onChange={(event) => onOptionsChange({ ...options, directorProfile: event.target.value })} />
          </label>
          <label>
            种类
            <select value={options.contentType} onChange={(event) => onOptionsChange({ ...options, contentType: event.target.value })}>
              <option value="电影">电影</option>
              <option value="短剧">短剧</option>
              <option value="中剧">中剧</option>
              <option value="短片">短片</option>
              <option value="广告">广告</option>
            </select>
          </label>
          <label>
            画幅
            <select value={options.aspectRatio} onChange={(event) => onOptionsChange({ ...options, aspectRatio: event.target.value })}>
              <option value="9:16">9:16 竖屏</option>
              <option value="16:9">16:9 横屏</option>
              <option value="1:1">1:1 方形</option>
              <option value="4:3">4:3</option>
              <option value="2.39:1">2.39:1 宽银幕</option>
            </select>
          </label>
          <label>
            单镜目标秒数
            <input
              type="number"
              min="3"
              max="12"
              value={options.targetShotSeconds}
              onChange={(event) => onOptionsChange({ ...options, targetShotSeconds: Number(event.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title project-list-title">
          <div>
            <ClipboardList size={18} />
            <span>项目列表</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="mode-switch compact" aria-label="项目显示模式">
            <button className={isCardMode ? "active" : ""} onClick={() => setDisplayMode("cards")}>
              卡片
            </button>
            <button className={!isCardMode ? "active" : ""} onClick={() => setDisplayMode("list")}>
              列表
            </button>
          </div>
        </div>
        <div className={isCardMode ? "project-table project-card-grid" : "project-table"}>
          {projects.length === 0 ? (
            <div className="empty-state">当前根目录下没有项目。点击“新建项目”创建第一个项目文件夹。</div>
          ) : (
            projects.map((project) => (
              <ProjectListItem
                key={project.projectId}
                project={project}
                isActive={project.projectId === activeProjectId}
                displayMode={isCardMode ? "cards" : "list"}
                onSelectProject={onSelectProject}
                onRequestDeleteProject={onRequestDeleteProject}
              />
            ))
          )}
        </div>
      </section>
    </section>
  );
}

function ProjectListItem({
  project,
  isActive,
  displayMode,
  onSelectProject,
  onRequestDeleteProject,
}: {
  project: StoryboardProject;
  isActive: boolean;
  displayMode: "cards" | "list";
  onSelectProject: (projectId: string) => void;
  onRequestDeleteProject: (project: StoryboardProject) => void;
}) {
  const episodeCount = project.analysis.episodes.length;
  const assetCount = project.analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0);
  const shotCount = project.analysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0);
  const folderName = project.folderName ?? toSafeFolderName(project.name);
  const updatedAt = new Date(project.updatedAt).toLocaleString("zh-CN", { hour12: false });

  if (displayMode === "cards") {
    return (
      <article className={isActive ? "project-card active" : "project-card"}>
        <button className="project-card-main" onClick={() => onSelectProject(project.projectId)}>
          <span>{isActive ? "当前项目" : "项目"}</span>
          <strong>{project.name}</strong>
          <small>{folderName}</small>
        </button>
        <div className="project-card-metrics">
          <span>{episodeCount} 集</span>
          <span>{assetCount} 资产</span>
          <span>{shotCount} 自动解析镜头</span>
        </div>
        <div className="project-card-foot">
          <small>{updatedAt}</small>
          <button className="icon-danger-button" onClick={() => onRequestDeleteProject(project)} title="删除项目">
            <Trash2 size={16} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className={isActive ? "project-table-row active" : "project-table-row"}>
      <button onClick={() => onSelectProject(project.projectId)}>
        <strong>{project.name}</strong>
        <span>{folderName}</span>
        <span>{episodeCount} 集 / {assetCount} 资产 / {shotCount} 自动解析镜头</span>
        <small>{updatedAt}</small>
      </button>
      <button className="icon-danger-button" onClick={() => onRequestDeleteProject(project)} title="删除项目">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

export function ProjectNameDialog({
  value,
  defaultName,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  defaultName: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="新建项目">
      <article className="modal-panel">
        <div className="panel-title">
          <FolderKanban size={18} />
          <span>新建项目</span>
        </div>
        <label>
          项目名称
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`默认：${defaultName}`} autoFocus />
        </label>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={onConfirm}>
            <CheckCircle2 size={16} />
            确认
          </button>
        </div>
      </article>
    </div>
  );
}

export function ProjectRootDialog({
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="配置项目根目录">
      <article className="modal-panel">
        <div className="panel-title">
          <FolderKanban size={18} />
          <span>手动输入项目根目录</span>
        </div>
        <label>
          本地路径
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="/Users/你的名字/Projects/storyboard" autoFocus />
        </label>
        <p className="modal-copy">通常使用“选择根目录”即可；这里作为系统选择器不可用时的备用方式。</p>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={onConfirm}>
            <CheckCircle2 size={16} />
            确认
          </button>
        </div>
      </article>
    </div>
  );
}

export function DeleteProjectDialog({
  project,
  onCancel,
  onConfirm,
}: {
  project: StoryboardProject;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="删除项目">
      <article className="modal-panel">
        <div className="panel-title danger-title">
          <Trash2 size={18} />
          <span>删除项目</span>
        </div>
        <p className="modal-copy">确认删除“{project.name}”？项目会从当前列表移除；如果已授权根目录，系统会尝试删除对应项目文件夹。</p>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="danger-button" onClick={onConfirm}>
            <Trash2 size={16} />
            删除
          </button>
        </div>
      </article>
    </div>
  );
}

export function RemoveRootDialog({
  root,
  onCancel,
  onConfirm,
}: {
  root: BackendRoot;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="移除根目录授权">
      <article className="modal-panel">
        <div className="panel-title danger-title">
          <X size={18} />
          <span>移除根目录授权</span>
        </div>
        <p className="modal-copy">确认移除“{root.rootName}”的授权？只会从当前系统授权列表移除，不会删除该目录下的项目文件夹。</p>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="danger-button" onClick={onConfirm}>
            <X size={16} />
            移除授权
          </button>
        </div>
      </article>
    </div>
  );
}

function useLocalState(key: string, defaultValue: string) {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? defaultValue);

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
