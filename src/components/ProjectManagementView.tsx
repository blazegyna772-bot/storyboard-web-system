import { useRef, useState, useEffect, type ReactNode } from "react";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Edit3,
  Film,
  FolderKanban,
  Layers3,
  Monitor,
  Plus,
  RefreshCcw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import type { BackendRoot } from "../lib/projectApi";
import { toBackendAssetImageUrl, type AssetReviewBundle } from "../lib/assetApi";
import { toSafeFolderName, type StoryboardProject } from "../lib/projectStore";
import type { AnalysisOptions } from "../lib/storyboard";

export function ProjectManagementView({
  activeProjectId,
  projects,
  projectRootName,
  projectRoots,
  assetReviewBundle,
  options,
  onPickRoot,
  onOpenManualRoot,
  onSelectRoot,
  onRequestRemoveRoot,
  onRefreshRoot,
  onOpenCreateProject,
  onSelectProject,
  onRequestDeleteProject,
  onUpdateProjectCover,
  onOptionsChange,
}: {
  activeProjectId: string;
  projects: StoryboardProject[];
  projectRootName: string;
  projectRoots: BackendRoot[];
  assetReviewBundle: AssetReviewBundle;
  options: AnalysisOptions;
  onPickRoot: () => void;
  onOpenManualRoot: () => void;
  onSelectRoot: (root: BackendRoot) => void;
  onRequestRemoveRoot: (root: BackendRoot) => void;
  onRefreshRoot: () => void;
  onOpenCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onRequestDeleteProject: (project: StoryboardProject) => void;
  onUpdateProjectCover: (projectId: string, file: File) => void;
  onOptionsChange: (options: AnalysisOptions) => void;
}) {
  const activeProject = projects.find((project) => project.projectId === activeProjectId) ?? projects[0];
  const [displayMode, setDisplayMode] = useLocalState("project-display-mode", "cards");
  const [projectQuery, setProjectQuery] = useState("");
  const [inspectedProjectId, setInspectedProjectId] = useState(activeProject?.projectId ?? "");
  const [isEditingOptions, setIsEditingOptions] = useState(false);
  const [isRootPanelOpen, setIsRootPanelOpen] = useState(false);
  const [projectPage, setProjectPage] = useState(1);
  const [projectPageSize, setProjectPageSize] = useLocalState("project-page-size", "10");
  const [projectSort, setProjectSort] = useLocalState("project-sort", "updated_desc");
  const [projectKindFilter, setProjectKindFilter] = useLocalState("project-kind-filter", "all");
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const isCardMode = displayMode !== "list";
  const pageSize = Number(projectPageSize);
  const normalizedQuery = projectQuery.trim().toLowerCase();
  const kindFilteredProjects = projectKindFilter === "all" ? projects : projects.filter((project) => project.options?.contentType === projectKindFilter);
  const visibleProjects = (normalizedQuery
    ? kindFilteredProjects.filter((project) => {
        const folderName = project.folderName ?? toSafeFolderName(project.name);
        return `${project.name} ${folderName}`.toLowerCase().includes(normalizedQuery);
      })
    : kindFilteredProjects
  ).slice().sort((left, right) => {
    if (projectSort === "name_asc") return left.name.localeCompare(right.name, "zh-Hans-CN");
    if (projectSort === "created_desc") return new Date(right.createdAt || right.updatedAt).getTime() - new Date(left.createdAt || left.updatedAt).getTime();
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
  const inspectedProject = projects.find((project) => project.projectId === inspectedProjectId) ?? activeProject;
  const inspectedEpisodeCount = inspectedProject?.analysis.episodes.length ?? 0;
  const inspectedAssetCount = inspectedProject?.analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0) ?? 0;
  const inspectedShotCount = inspectedProject?.analysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0) ?? 0;
  const inspectedFolderName = inspectedProject?.folderName ?? toSafeFolderName(inspectedProject?.name ?? "未命名项目");
  const inspectedUpdatedAt = inspectedProject ? new Date(inspectedProject.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "-";
  const inspectedCreatedAt = inspectedProject ? new Date(inspectedProject.createdAt || inspectedProject.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "-";
  const defaultCoverImage = firstCharacterAssetImage(assetReviewBundle);
  const inspectedCoverImage = inspectedProject?.coverImage || defaultCoverImage;
  const totalProjectPages = Math.max(1, Math.ceil(visibleProjects.length / pageSize));
  const currentProjectPage = Math.min(projectPage, totalProjectPages);
  const pagedProjects = visibleProjects.slice((currentProjectPage - 1) * pageSize, currentProjectPage * pageSize);

  useEffect(() => {
    if (!projects.length) {
      setInspectedProjectId("");
      return;
    }
    if (!projects.some((project) => project.projectId === inspectedProjectId)) {
      setInspectedProjectId(activeProject?.projectId ?? projects[0].projectId);
    }
  }, [activeProject?.projectId, inspectedProjectId, projects]);

  useEffect(() => {
    setProjectPage(1);
  }, [projectQuery, projectPageSize, projectSort, projectKindFilter]);

  useEffect(() => {
    if (projectPage > totalProjectPages) {
      setProjectPage(totalProjectPages);
    }
  }, [projectPage, totalProjectPages]);

  async function importProjectCover(file: File | undefined) {
    if (!file || !inspectedProject) return;
    onUpdateProjectCover(inspectedProject.projectId, file);
  }

  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>项目管理</h2>
        </div>
        <div className="header-actions">
          <button className="primary-button" onClick={onOpenCreateProject}>
            <Plus size={16} />
            新建项目
          </button>
          <button onClick={() => setIsRootPanelOpen(true)}>
            <FolderKanban size={16} />
            工程根目录
          </button>
          <button onClick={onRefreshRoot} disabled={!projectRootName}>
            <RefreshCcw size={16} />
            刷新项目列表
          </button>
        </div>
      </div>

      <div className="project-workbench">
        <section className="panel project-overview-panel">
          <article className="project-overview-identity">
            <div className="project-identity-body">
              <div className="project-cover-placeholder">
                <button
                  type="button"
                  className={inspectedCoverImage ? "project-cover-button has-image" : "project-cover-button"}
                  title="右键导入封面"
                  onClick={() => inspectedProject && coverFileInputRef.current?.click()}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (inspectedProject) coverFileInputRef.current?.click();
                  }}
                >
                  {inspectedCoverImage ? <img src={toBackendAssetImageUrl(inspectedCoverImage)} alt={`${inspectedProject?.name ?? "项目"}封面`} /> : <span>{inspectedProject?.name?.slice(0, 1) || "项"}</span>}
                </button>
                <input
                  ref={coverFileInputRef}
                  className="project-cover-file-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    void importProjectCover(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <div className="project-current-card">
                <div className="project-name-row">
                  <strong>{inspectedProject?.name ?? "无项目"}</strong>
                  {inspectedProject?.projectId === activeProjectId && <em>进行中</em>}
                </div>
                <span>项目编号：{inspectedProject?.projectId ?? "-"}</span>
                <span>文件夹：{inspectedFolderName}</span>
                <span>创建时间：{inspectedCreatedAt}</span>
                <span>更新时间：{inspectedUpdatedAt}</span>
                <p>项目描述：{inspectedProject?.description || "暂无项目描述"}</p>
                <button
                  className="primary-button"
                  onClick={() => inspectedProject && onSelectProject(inspectedProject.projectId)}
                  disabled={!inspectedProject || inspectedProject.projectId === activeProjectId}
                >
                  设为当前项目
                </button>
              </div>
            </div>
          </article>

          <article className="project-overview-detail">
            <div className="panel-title">
              <Edit3 size={18} />
              <span>项目参数</span>
              <button onClick={() => setIsEditingOptions((current) => !current)}>
                {isEditingOptions ? "收起设置" : "设置参数"}
              </button>
            </div>
            <div className="project-detail-metrics">
              <ProjectMetric icon={<Film size={28} />} value={inspectedEpisodeCount} label="集" />
              <ProjectMetric icon={<Layers3 size={28} />} value={inspectedAssetCount} label="资产" />
              <ProjectMetric icon={<Camera size={28} />} value={inspectedShotCount} label="镜头" />
            </div>
            {isEditingOptions ? (
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
            ) : (
              <div className="project-options-summary">
                <div>
                  <Tag size={17} />
                  <span>题材</span>
                  <strong>{options.genreProfile || "-"}</strong>
                </div>
                <div>
                  <Edit3 size={17} />
                  <span>导演风格</span>
                  <strong>{options.directorProfile || "-"}</strong>
                </div>
                <div>
                  <ClipboardList size={17} />
                  <span>种类</span>
                  <strong>{options.contentType || "-"}</strong>
                </div>
                <div>
                  <Monitor size={17} />
                  <span>画幅</span>
                  <strong>{options.aspectRatio || "-"}</strong>
                </div>
                <div>
                  <Clock size={17} />
                  <span>单镜目标秒数</span>
                  <strong>{options.targetShotSeconds}</strong>
                </div>
              </div>
            )}
          </article>
        </section>

        <section className="panel project-list-panel">
          <div className="panel-title project-list-title">
            <div>
              <ClipboardList size={18} />
              <span>项目列表</span>
              <strong>{visibleProjects.length}/{projects.length}</strong>
            </div>
            <div className="project-pagination">
              <span>共 {visibleProjects.length} 条</span>
              <button onClick={() => setProjectPage((page) => Math.max(1, page - 1))} disabled={currentProjectPage <= 1} title="上一页">
                <ChevronLeft size={16} />
              </button>
              <strong>{currentProjectPage}</strong>
              <button onClick={() => setProjectPage((page) => Math.min(totalProjectPages, page + 1))} disabled={currentProjectPage >= totalProjectPages} title="下一页">
                <ChevronRight size={16} />
              </button>
              <select value={projectPageSize} onChange={(event) => setProjectPageSize(event.target.value)} aria-label="每页项目数">
                <option value="10">10 条/页</option>
                <option value="20">20 条/页</option>
                <option value="50">50 条/页</option>
              </select>
            </div>
            <div className="project-list-tools">
              <label className="project-filter-field">
                排序
                <select value={projectSort} onChange={(event) => setProjectSort(event.target.value)}>
                  <option value="updated_desc">最近更新</option>
                  <option value="created_desc">创建时间</option>
                  <option value="name_asc">名称</option>
                </select>
              </label>
              <label className="project-filter-field">
                种类
                <select value={projectKindFilter} onChange={(event) => setProjectKindFilter(event.target.value)}>
                  <option value="all">全部</option>
                  <option value="短剧">短剧</option>
                  <option value="电影">电影</option>
                  <option value="中剧">中剧</option>
                  <option value="短片">短片</option>
                  <option value="广告">广告</option>
                </select>
              </label>
              <label className="project-search-field">
                <Search size={15} />
                <input value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="搜索项目或文件夹" />
              </label>
              <div className="mode-switch compact" aria-label="项目显示模式">
                <button className={isCardMode ? "active" : ""} onClick={() => setDisplayMode("cards")}>
                  卡片
                </button>
                <button className={!isCardMode ? "active" : ""} onClick={() => setDisplayMode("list")}>
                  列表
                </button>
              </div>
            </div>
          </div>
          <div className={isCardMode ? "project-table project-card-grid" : "project-table"}>
            {projects.length === 0 ? (
              <div className="empty-state">当前根目录下没有项目。点击“新建项目”创建第一个项目文件夹。</div>
            ) : visibleProjects.length === 0 ? (
              <div className="empty-state">没有匹配的项目。</div>
            ) : (
              pagedProjects.map((project) => (
                <ProjectListItem
                  key={project.projectId}
                  project={project}
                  isActive={project.projectId === activeProjectId}
                  isSelected={project.projectId === inspectedProject?.projectId}
                  displayMode={isCardMode ? "cards" : "list"}
                  onInspectProject={setInspectedProjectId}
                  onSetActiveProject={onSelectProject}
                  onRequestDeleteProject={onRequestDeleteProject}
                />
              ))
            )}
          </div>
        </section>
      </div>

      {isRootPanelOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="工程根目录配置">
          <article className="modal-panel project-root-config-modal">
            <div className="modal-title-row">
              <div className="panel-title">
                <FolderKanban size={18} />
                <span>工程根目录</span>
                <strong>{projectRootName || "未选择"}</strong>
              </div>
              <button onClick={() => setIsRootPanelOpen(false)} title="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="project-root-list">
              {projectRoots.map((root) => (
                <div key={root.rootName} className={root.rootName === projectRootName ? "project-root-item active" : "project-root-item"} onDoubleClick={() => onSelectRoot(root)} title="双击切换">
                  <button onDoubleClick={() => onSelectRoot(root)}>
                    <strong>{root.rootName}</strong>
                    <small>{root.rootPath}</small>
                  </button>
                  {root.rootName !== "WORK" && (
                    <button className="icon-danger-button" onClick={() => onRequestRemoveRoot(root)} title="移除授权">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={onPickRoot}>
                <FolderKanban size={16} />
                选择目录
              </button>
              <button onClick={onOpenManualRoot}>
                <Edit3 size={16} />
                手动输入
              </button>
              <button onClick={onRefreshRoot} disabled={!projectRootName}>
                <RefreshCcw size={16} />
                刷新
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function ProjectMetric({ icon, value, label }: { icon: ReactNode; value: number | string; label: string }) {
  return (
    <div className="project-metric-item">
      {icon}
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ProjectListItem({
  project,
  isActive,
  isSelected,
  displayMode,
  onInspectProject,
  onSetActiveProject,
  onRequestDeleteProject,
}: {
  project: StoryboardProject;
  isActive: boolean;
  isSelected: boolean;
  displayMode: "cards" | "list";
  onInspectProject: (projectId: string) => void;
  onSetActiveProject: (projectId: string) => void;
  onRequestDeleteProject: (project: StoryboardProject) => void;
}) {
  const episodeCount = project.analysis.episodes.length;
  const assetCount = project.analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0);
  const shotCount = project.analysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0);
  const folderName = project.folderName ?? toSafeFolderName(project.name);
  const updatedAt = new Date(project.updatedAt).toLocaleString("zh-CN", { hour12: false });

  if (displayMode === "cards") {
    return (
      <article
        className={["project-card", isActive ? "active" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ")}
        title="单击查看项目，双击设为当前项目"
        onDoubleClick={() => onSetActiveProject(project.projectId)}
      >
        <button className="project-card-main" onClick={() => onInspectProject(project.projectId)}>
          <div className="project-card-thumb">
            <span>{project.name.slice(0, 1)}</span>
          </div>
          <div>
            <span>{isActive ? "当前项目" : isSelected ? "查看中" : "项目"}</span>
            <strong>{project.name}</strong>
            <small>文件夹：{folderName}</small>
          </div>
        </button>
        <div className="project-card-metrics">
          <ProjectListMetric icon={<Film size={17} />} value={`${episodeCount} 集`} />
          <ProjectListMetric icon={<Layers3 size={17} />} value={`${assetCount} 资产`} />
          <ProjectListMetric icon={<Camera size={17} />} value={`${shotCount} 镜头`} />
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
    <div
      className={["project-table-row", isActive ? "active" : "", isSelected ? "selected" : ""].filter(Boolean).join(" ")}
      title="单击查看项目，双击设为当前项目"
      onDoubleClick={() => onSetActiveProject(project.projectId)}
    >
      <button onClick={() => onInspectProject(project.projectId)}>
        <div className="project-card-thumb compact">
          <span>{project.name.slice(0, 1)}</span>
        </div>
        <div className="project-table-name">
          <strong>{project.name}</strong>
          <span>文件夹：{folderName}</span>
        </div>
        <ProjectListMetric icon={<Film size={18} />} value={`${episodeCount} 集`} />
        <ProjectListMetric icon={<Layers3 size={18} />} value={`${assetCount} 资产`} />
        <ProjectListMetric icon={<Camera size={18} />} value={`${shotCount} 镜头`} />
        <ProjectListMetric value={updatedAt} label="更新时间" />
      </button>
      <button className="icon-danger-button" onClick={() => onRequestDeleteProject(project)} title="删除项目">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function ProjectListMetric({ icon, value, label }: { icon?: ReactNode; value: string; label?: string }) {
  return (
    <div className={icon ? "project-list-metric" : "project-list-metric no-icon"}>
      {icon && icon}
      {label && <small>{label}</small>}
      <span>{value}</span>
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

function firstCharacterAssetImage(bundle: AssetReviewBundle) {
  const firstCharacter = bundle.trueSources.characters.find((row) => row.selected_image || row.image_url || row.image_path);
  return firstCharacter?.selected_image || firstCharacter?.image_url || firstCharacter?.image_path || "";
}
