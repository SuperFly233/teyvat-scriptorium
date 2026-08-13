import {
  forwardRef,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpenText,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronsRight,
  CircleCheck,
  Clock3,
  Eraser,
  FileDown,
  FileText,
  Filter,
  GitFork,
  GripVertical,
  Info,
  Languages,
  LibraryBig,
  ListTree,
  MapPinned,
  MousePointer2,
  LoaderCircle,
  Menu,
  Monitor,
  Moon,
  Plus,
  Printer,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Settings,
  ShoppingBasket,
  Snowflake,
  Square,
  Sun,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { filterScenes } from "./lib/filter";
import { enrichBranches } from "./lib/branches";
import { buildPrintMeta } from "./lib/printMeta";
import { formatGameText, normalizeSearch } from "./lib/text";
import type {
  AppSettings,
  CatalogData,
  CatalogItem,
  ChapterData,
  DialogueLine,
  LanguageCode,
  LanguagePair,
  PrintBundle,
  PrintSettings,
  PrintSlot,
  Quest,
  Scene,
  Traveler,
  ViewMode,
} from "./types";

const TYPE_NAMES: Record<string, string> = {
  aq: "魔神任务",
  wq: "世界任务",
  lq: "传说任务",
  hq: "邀约事件",
  eq: "活动任务",
  iq: "每日委托",
  other: "其他",
};
const NATION_NAMES: Record<string, string> = {
  mondstadt: "蒙德",
  liyue: "璃月",
  inazuma: "稻妻",
  sumeru: "须弥",
  fontaine: "枫丹",
  natlan: "纳塔",
  nodkrai: "挪德卡莱",
  snezhnaya: "至冬",
  traveler: "旅行者篇",
  unknown: "未归属地区",
};
const LANGUAGE_OPTIONS: {
  code: LanguageCode;
  short: string;
  label: string;
  locale: string;
}[] = [
  { code: "CHS", short: "简", label: "简体中文", locale: "zh-CN" },
  { code: "CHT", short: "繁", label: "繁體中文", locale: "zh-TW" },
  { code: "EN", short: "EN", label: "English", locale: "en" },
  { code: "JP", short: "日", label: "日本語", locale: "ja" },
  { code: "KR", short: "한", label: "한국어", locale: "ko" },
  { code: "DE", short: "DE", label: "Deutsch", locale: "de" },
  { code: "ES", short: "ES", label: "Español", locale: "es" },
  { code: "FR", short: "FR", label: "Français", locale: "fr" },
  { code: "ID", short: "ID", label: "Bahasa Indonesia", locale: "id" },
  { code: "PT", short: "PT", label: "Português", locale: "pt" },
  { code: "RU", short: "RU", label: "Русский", locale: "ru" },
  { code: "TH", short: "TH", label: "ไทย", locale: "th" },
  { code: "VI", short: "VI", label: "Tiếng Việt", locale: "vi" },
  { code: "IT", short: "IT", label: "Italiano", locale: "it" },
  { code: "TR", short: "TR", label: "Türkçe", locale: "tr" },
];
const VIEW_OPTIONS: { id: ViewMode; label: string }[] = [
  { id: "parallel", label: "并列阅读" },
  { id: "stacked", label: "上下阅读" },
  { id: "compact", label: "台词表" },
];
const languageInfo = (code: LanguageCode) =>
  LANGUAGE_OPTIONS.find((item) => item.code === code) || LANGUAGE_OPTIONS[0];
const localized = (value: LanguagePair, code: LanguageCode) =>
  code === "CHS"
    ? value.translations?.CHS || value.zh
    : code === "EN"
      ? value.translations?.EN || value.en
      : value.translations?.[code] || "";
const normalizeChapterData = (data: ChapterData): ChapterData => ({
  ...data,
  quests: data.quests.map((quest) => ({
    ...quest,
    scenes: quest.scenes.map((scene) => {
      const looksNarration = (line: DialogueLine) =>
        /^(You |After you |Time flies|After a lovely|Meanwhile|Later,|Following )/i.test(
          line.text.en,
        ) || /^(在.+…|顺利|与朋友享用|将欢笑|在屋中)/.test(line.text.zh);
      return {
        ...scene,
        lines: enrichBranches(scene.lines).map((line) =>
          line.kind === "narration" ||
          (line.kind === "choice" && looksNarration(line))
            ? {
                ...line,
                kind: "narration" as const,
                speaker: { zh: "", en: "", translations: {} },
              }
            : line,
        ),
      };
    }),
  })),
});
const DEFAULT_SETTINGS: AppSettings = {
  theme: "auto",
  viewMode: "parallel",
  zhSize: 20,
  enSize: 20,
  lineHeight: 1.5,
  columnRatio: 50,
  showHidden: false,
  showUnreleased: false,
  compactMobile: true,
  languages: ["CHS", "EN"],
  fontFamily: "serif",
  languageWidths: [50, 50],
  guideCatalog: true,
  guideReader: true,
  guideScenes: true,
};
const DEFAULT_PRINT: PrintSettings = {
  layout: "parallel",
  density: "compact",
  paper: "a4",
  orientation: "portrait",
  fontSize: 9,
  margin: 12,
  topMargin: 8,
  bottomMargin: 14,
  color: "accent",
  cover: true,
  sceneTitles: true,
  sceneLeads: true,
  speakers: true,
  lineNumbers: true,
  columnRatio: 50,
  speakerLayout: "column",
  speakerSize: 7,
  speakerWidth: 14,
  numberSize: 6,
  sceneTitleSize: 9,
  coverTitleSize: 15,
  lineGap: 1,
  sceneGap: 1.5,
  bands: {
    header: [
      { id: "hl", content: "chapter", custom: "" },
      { id: "hc", content: "quest", custom: "" },
      { id: "hr", content: "printedAt", custom: "" },
    ],
    footer: [
      { id: "fl", content: "version", custom: "" },
      { id: "fc", content: "none", custom: "" },
      { id: "fr", content: "page", custom: "" },
    ],
  },
};
const APP_VERSION = "v0.8.1";
const TYPE_FILTERS = ["aq", "lq", "hq", "wq", "eq", "iq", "other"];
const NATION_ORDER = [
  "mondstadt",
  "liyue",
  "inazuma",
  "sumeru",
  "fontaine",
  "natlan",
  "nodkrai",
  "snezhnaya",
  "traveler",
  "unknown",
];
const REGION_MILESTONES: Record<
  string,
  { nation: string; version: string; date: string; label: string }
> = {
  "1.0": {
    nation: "mondstadt",
    version: "1.0",
    date: "2020-09-28",
    label: "蒙德与璃月",
  },
  "2.0": {
    nation: "inazuma",
    version: "2.0",
    date: "2021-07-21",
    label: "稻妻",
  },
  "3.0": {
    nation: "sumeru",
    version: "3.0",
    date: "2022-08-24",
    label: "须弥",
  },
  "4.0": {
    nation: "fontaine",
    version: "4.0",
    date: "2023-08-16",
    label: "枫丹",
  },
  "5.0": {
    nation: "natlan",
    version: "5.0",
    date: "2024-08-28",
    label: "纳塔",
  },
  "6.0": {
    nation: "nodkrai",
    version: "6.0",
    date: "2025-09-10",
    label: "挪德卡莱",
  },
  "7.0": {
    nation: "snezhnaya",
    version: "7.0",
    date: "2026-08-12",
    label: "至冬",
  },
};
const NATION_SOURCE_NAMES: Record<CatalogItem["nationSource"], string> = {
  wiki: "Genshin Impact Wiki 任务分类",
  "title-inference": "Yatta 章节标题或内部图标",
  "quest-location": "任务流程发生地核验",
  "yatta-avatar": "Yatta 角色资料所属地区",
  "version-series": "每日委托发布版本系列",
  unknown: "上游目录未提供地区字段",
};
const chapterFamily = (item: CatalogItem) =>
  item.chapter.zh.match(/^(第[^ ]+章|空月之歌)/)?.[1] ||
  item.chapter.zh ||
  `${item.nation}:${item.version}`;
const chineseNumber = (raw = "") => {
  const direct = Number(raw);
  if (Number.isFinite(direct)) return direct;
  const digits: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (raw === "十") return 10;
  if (raw.startsWith("十")) return 10 + (digits[raw[1]] || 0);
  if (raw.endsWith("十")) return (digits[raw[0]] || 0) * 10;
  return digits[raw] || 0;
};
const narrativeOrder = (item: CatalogItem) => {
  const chapter = item.chapter.zh.match(/第([^章 ]+)章/)?.[1] || "";
  const act = item.chapter.zh.match(/第([^幕 ]+)幕/)?.[1] || "";
  return chineseNumber(chapter) * 100 + chineseNumber(act);
};
const chronologicalSort = (a: CatalogItem, b: CatalogItem) =>
  NATION_ORDER.indexOf(a.nation) - NATION_ORDER.indexOf(b.nation) ||
  narrativeOrder(a) - narrativeOrder(b) ||
  a.id - b.id;
const seriesKey = (item: CatalogItem) => {
  if (item.type === "aq") return `aq:${item.nation}`;
  if (item.type === "lq" || item.type === "hq")
    return `${item.type}:${(item.chapter.zh || item.imageTitle.zh).replace(/第[^幕]+幕/g, "").replace(/\s+/g, "")}`;
  if (item.type === "wq" && item.imageTitle.zh)
    return `wq:${item.imageTitle.zh}`;
  return "";
};
const seriesOrder = (item: CatalogItem) =>
  narrativeOrder(item) ||
  chineseNumber(item.chapter.zh.match(/第([^章幕 ]+)[章幕]/)?.[1] || "") * 100 +
    item.id;

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return {
        ...(initial as object),
        ...JSON.parse(localStorage.getItem(key) || "{}"),
      } as T;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue] as const;
}

function useSessionState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) || "") as T;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* a very large basket remains available in memory */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

function useData() {
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [chapter, setChapter] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({
    value: 0,
    label: "正在连接剧情资料源…",
  });
  const [error, setError] = useState("");
  const [catalogSync, setCatalogSync] = useState({
    checking: true,
    added: 0,
    modified: 0,
    checkedAt: "",
  });
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [baseCatalog, hangouts] = await Promise.all([
          fetch("/data/catalog.json", { cache: "no-store" }).then((response) =>
            response.json(),
          ) as Promise<CatalogData>,
          fetch("/data/hangouts.json", { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : { items: [] }))
            .catch(() => ({ items: [] })),
        ]);
        const staticCatalog: CatalogData = {
          ...baseCatalog,
          items: [...hangouts.items, ...baseCatalog.items],
        };
        if (cancelled) return;
        setCatalog(staticCatalog);
        try {
          const live = (await fetch("/api/catalog", { cache: "no-store" }).then(
            (response) => {
              if (!response.ok) throw new Error(String(response.status));
              return response.json();
            },
          )) as CatalogData;
          if (cancelled) return;
          const savedById = new Map(
            staticCatalog.items.map((item) => [item.id, item]),
          );
          let added = 0;
          let modified = 0;
          const items = live.items.map((item) => {
            const saved = savedById.get(item.id);
            if (!saved) {
              added++;
              return item;
            }
            if (
              saved.title.zh !== item.title.zh ||
              saved.title.en !== item.title.en ||
              saved.chapterCount !== item.chapterCount
            )
              modified++;
            return {
              ...saved,
              ...item,
              nation: item.nation === "unknown" ? saved.nation : item.nation,
              nationSource:
                item.nation === "unknown"
                  ? saved.nationSource
                  : item.nationSource,
              version: item.version || saved.version,
              versionSource: item.version
                ? item.versionSource
                : saved.versionSource,
              wikiPage: saved.wikiPage,
            };
          });
          const itemIds = new Set(items.map((item) => item.id));
          staticCatalog.items
            .filter((item) => !itemIds.has(item.id))
            .forEach((item) => items.push(item));
          const types = [...new Set(items.map((item) => item.type))];
          const nations = [...new Set(items.map((item) => item.nation))];
          setCatalog({
            ...live,
            items,
            versions: [
              ...new Set(
                items.map((item) => item.version).filter(Boolean) as string[],
              ),
            ].sort(
              (a, b) => Number(b.replace(".", "")) - Number(a.replace(".", "")),
            ),
            counts: {
              total: items.length,
              byType: Object.fromEntries(
                types.map((type) => [
                  type,
                  items.filter((item) => item.type === type).length,
                ]),
              ),
              byNation: Object.fromEntries(
                nations.map((nation) => [
                  nation,
                  items.filter((item) => item.nation === nation).length,
                ]),
              ),
            },
          });
          setCatalogSync({
            checking: false,
            added,
            modified,
            checkedAt: new Date().toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
          });
        } catch {
          setCatalogSync({
            checking: false,
            added: 0,
            modified: 0,
            checkedAt: "沿用本站快照",
          });
        }
      } catch (e) {
        setError(String(e));
        setCatalogSync((state) => ({ ...state, checking: false }));
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);
  async function loadChapter(
    id: number,
    languages: LanguageCode[] = ["CHS", "EN"],
  ) {
    setLoading(true);
    setError("");
    setLoadProgress({ value: 4, label: "正在连接剧情资料源…" });
    try {
      const languageKey = languages.slice(0, 3).join(",");
      const cached = sessionStorage.getItem(`chapter:${id}:${languageKey}`);
      if (cached) {
        setChapter(normalizeChapterData(JSON.parse(cached)));
        return true;
      }
      const url =
        id === 1700 && languageKey === "CHS,EN"
          ? "/data/quest-1700.json"
          : `/api/quest/${id}?langs=${encodeURIComponent(languageKey)}`;
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? "这个任务暂时没有可读取的正文。"
            : `正文载入失败（${response.status}）`,
        );
      const total = Number(response.headers.get("content-length")) || 0;
      let received = 0;
      let data: ChapterData;
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          const percent = total
            ? Math.min(88, 8 + Math.round((received / total) * 80))
            : Math.min(88, 8 + Math.round(Math.log10(received + 1) * 13));
          setLoadProgress({
            value: percent,
            label: `正在接收 ${languages.map((lang) => languageInfo(lang).short).join(" / ")} · ${(received / 1024).toFixed(0)} KB${total ? ` / ${(total / 1024).toFixed(0)} KB` : ""}`,
          });
        }
        setLoadProgress({ value: 94, label: "正在整理场景、角色与台词…" });
        const bytes = new Uint8Array(received);
        let offset = 0;
        chunks.forEach((chunk) => {
          bytes.set(chunk, offset);
          offset += chunk.length;
        });
        data = JSON.parse(new TextDecoder().decode(bytes)) as ChapterData;
      } else data = (await response.json()) as ChapterData;
      data = normalizeChapterData(data);
      setChapter(data);
      try {
        sessionStorage.setItem(
          `chapter:${id}:${languageKey}`,
          JSON.stringify(data),
        );
      } catch {
        /* large chapter; memory cache still works */
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setLoading(false);
    }
  }
  return {
    catalog,
    catalogSync,
    chapter,
    setChapter,
    loadChapter,
    loading,
    loadProgress,
    error,
    setError,
  };
}

function Header({
  page,
  theme,
  onTheme,
  onCatalog,
  onSettings,
  onChangelog,
}: {
  page: "catalog" | "reader";
  theme: AppSettings["theme"];
  onTheme: (theme: AppSettings["theme"]) => void;
  onCatalog: () => void;
  onSettings: () => void;
  onChangelog: () => void;
}) {
  return (
    <header className="site-header">
      <button className="brand" onClick={onCatalog} type="button">
        <span className="brand-seal">
          <img src="/favicon.svg" alt="" />
        </span>
        <span>
          <strong>提瓦特剧本室</strong>
        </span>
      </button>
      <nav className="header-nav">
        <button
          className={page === "catalog" ? "active" : ""}
          onClick={onCatalog}
        >
          <LibraryBig size={16} />
          任务目录
        </button>
        <button onClick={onChangelog}>
          <Clock3 size={16} />
          更新日志
        </button>
      </nav>
      <div className="header-actions">
        <div className="theme-switch" aria-label="界面主题">
          {(
            [
              ["dark", <Moon size={17} />, "深色"],
              ["auto", <Monitor size={17} />, "自动"],
              ["light", <Sun size={17} />, "浅色"],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              className={theme === id ? "active" : ""}
              aria-label={label}
              title={label}
              onClick={() => onTheme(id)}
              key={id}
            >
              {icon}
            </button>
          ))}
        </div>
        <button className="settings-button" onClick={onSettings}>
          <Settings size={17} />
          <span>设置</span>
        </button>
      </div>
    </header>
  );
}

function Catalog({
  data,
  settings,
  onOpen,
  sync,
  guideRequest,
}: {
  data: CatalogData;
  settings: AppSettings;
  onOpen: (item: CatalogItem) => void;
  sync: {
    checking: boolean;
    added: number;
    modified: number;
    checkedAt: string;
  };
  guideRequest: number;
}) {
  const [query, setQuery] = useSessionState("teyvat:catalog:query", "");
  const [composing, setComposing] = useState(false);
  const deferredQuery = useDeferredValue(composing ? "" : query);
  const [types, setTypes] = useSessionState<string[]>(
    "teyvat:catalog:types",
    [],
  );
  const [nations, setNations] = useSessionState<string[]>(
    "teyvat:catalog:nations",
    [],
  );
  const [versions, setVersions] = useSessionState<string[]>(
    "teyvat:catalog:versions",
    [],
  );
  const [sort, setSort] = useSessionState<"version" | "nation" | "type" | "id">(
    "teyvat:catalog:sort",
    "version",
  );
  const [sortDirection, setSortDirection] = useSessionState<"desc" | "asc">(
    "teyvat:catalog:sort-direction",
    "desc",
  );
  const [catalogView, setCatalogView] = useSessionState<"cards" | "journey">(
    "teyvat:catalog:view",
    "cards",
  );
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const [limit, setLimit] = useSessionState("teyvat:catalog:limit", 60);
  const [guideVisible, setGuideVisible] = useState(
    () =>
      settings.guideCatalog &&
      localStorage.getItem("teyvat:catalog-guide:v1") !== "done",
  );
  useEffect(() => {
    if (guideRequest) setGuideVisible(true);
  }, [guideRequest]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest("[data-catalog-popover]"))
        setOpenPopover(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPopover(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    const saved = Number(sessionStorage.getItem("teyvat:catalog:scroll") || 0);
    requestAnimationFrame(() => scrollTo(0, saved));
    return () =>
      sessionStorage.setItem("teyvat:catalog:scroll", String(scrollY));
  }, []);
  const items = useMemo(() => {
    const needle = normalizeSearch(deferredQuery);
    const list = data.items.filter((item) => {
      if (!settings.showHidden && item.hidden) return false;
      if (!settings.showUnreleased && item.unreleased) return false;
      if (types.length && !types.includes(item.type)) return false;
      if (nations.length && !nations.includes(item.nation)) return false;
      if (
        versions.length &&
        !versions.some((version) =>
          version === "unknown"
            ? item.version === null
            : item.version === version,
        )
      )
        return false;
      return (
        !needle ||
        normalizeSearch(
          `${item.title.zh}${item.title.en}${item.chapter.zh}${item.chapter.en}${item.id}`,
        ).includes(needle)
      );
    });
    const sorted = list.sort((a, b) => {
      if (sort === "nation")
        return a.nation.localeCompare(b.nation) || b.id - a.id;
      if (sort === "type") return a.type.localeCompare(b.type) || b.id - a.id;
      if (sort === "id") return b.id - a.id;
      const av = a.version ? Number(a.version.replace(".", "")) : 0;
      const bv = b.version ? Number(b.version.replace(".", "")) : 0;
      return bv - av || b.id - a.id;
    });
    return sortDirection === "desc" ? sorted : sorted.reverse();
  }, [
    data,
    deferredQuery,
    types,
    nations,
    versions,
    sort,
    sortDirection,
    settings.showHidden,
    settings.showUnreleased,
  ]);
  const actCounts = useMemo(
    () =>
      new Map(
        [
          ...new Set(
            data.items.filter((item) => item.type === "aq").map(chapterFamily),
          ),
        ].map((family) => [
          family,
          data.items.filter(
            (item) =>
              item.type === "aq" &&
              chapterFamily(item) === family &&
              !item.hidden &&
              !item.unreleased,
          ).length,
        ]),
      ),
    [data],
  );
  const timeline = useMemo(
    () =>
      [
        ...new Set(
          data.items.map((item) => item.version).filter(Boolean) as string[],
        ),
      ]
        .sort((a, b) => Number(a.replace(".", "")) - Number(b.replace(".", "")))
        .map((version) => {
          const versionItems = data.items.filter(
            (item) =>
              item.version === version && !item.hidden && !item.unreleased,
          );
          return {
            version,
            items: versionItems,
            archon: versionItems.filter((item) => item.type === "aq"),
            stories: versionItems.filter((item) => item.type === "lq"),
            world: versionItems.filter((item) => item.type === "wq"),
            events: versionItems.filter((item) => item.type === "eq"),
            milestone: REGION_MILESTONES[version],
          };
        }),
    [data],
  );
  const resetFilters = () => {
    setQuery("");
    setTypes([]);
    setNations([]);
    setVersions([]);
    setLimit(60);
  };
  return (
    <main className="catalog-page">
      <section className="catalog-hero">
        <div>
          <span className="eyebrow">TEYVAT SCRIPTORIUM</span>
          <h1>{catalogView === "cards" ? "任务目录" : "旅行历程"}</h1>
          <p>
            {catalogView === "cards"
              ? "按国家、章幕与版本找到完整剧情。"
              : "从 1.0 至今，沿主线看见提瓦特的故事如何生长。"}
          </p>
        </div>
        <div className="catalog-view-switch">
          <button
            className={catalogView === "cards" ? "active" : ""}
            onClick={() => setCatalogView("cards")}
          >
            <ListTree size={17} />
            任务档案
          </button>
          <button
            className={catalogView === "journey" ? "active" : ""}
            onClick={() => setCatalogView("journey")}
          >
            <MapPinned size={17} />
            旅行历程
          </button>
        </div>
      </section>
      {catalogView === "cards" && (
        <section className="catalog-controls">
          {guideVisible && (
            <aside className="catalog-guide-board">
              <Info size={20} />
              <div>
                <strong>从目录开始</strong>
                <p>
                  筛选项可以多选；排序在结果栏右侧。也可以切换“旅行历程”，按版本浏览剧情主干与支线。
                </p>
              </div>
              <button
                onClick={() => {
                  localStorage.setItem("teyvat:catalog-guide:v1", "done");
                  setGuideVisible(false);
                }}
              >
                <X size={16} />
                知道了
              </button>
            </aside>
          )}
          <label className="catalog-search">
            <Search size={18} />
            <input
              value={query}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(event) => {
                setComposing(false);
                setQuery(event.currentTarget.value);
                setLimit(60);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                if (!composing) setLimit(60);
              }}
              placeholder="搜索任务、章幕或 ID"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setLimit(60);
                }}
              >
                <X size={15} />
              </button>
            )}
          </label>
          <div className="filter-row">
            <MultiFilter
              id="types"
              open={openPopover === "types"}
              onOpen={() =>
                setOpenPopover(openPopover === "types" ? null : "types")
              }
              icon={<BookOpenText size={15} />}
              label="任务类型"
              values={types}
              onChange={(next) => {
                setTypes(next);
                setLimit(60);
              }}
              options={TYPE_FILTERS.map((key) => [key, TYPE_NAMES[key]])}
            />
            <MultiFilter
              id="nations"
              open={openPopover === "nations"}
              onOpen={() =>
                setOpenPopover(openPopover === "nations" ? null : "nations")
              }
              icon={<Snowflake size={15} />}
              label="国家地区"
              values={nations}
              onChange={(next) => {
                setNations(next);
                setLimit(60);
              }}
              options={Object.entries(NATION_NAMES)}
            />
            <MultiFilter
              id="versions"
              open={openPopover === "versions"}
              onOpen={() =>
                setOpenPopover(openPopover === "versions" ? null : "versions")
              }
              icon={<Clock3 size={15} />}
              label="发布版本"
              values={versions}
              onChange={(next) => {
                setVersions(next);
                setLimit(60);
              }}
              options={[
                ...data.versions.map((v) => [v, `v${v}`]),
                ["unknown", "版本数据缺失"],
              ]}
            />
            {Boolean(
              query || types.length || nations.length || versions.length,
            ) && (
              <button className="reset-filters" onClick={resetFilters}>
                <RotateCcw size={14} />
                清除筛选
              </button>
            )}
          </div>
          <div className="catalog-result-line">
            <span>
              <strong>{items.length}</strong> 个任务{" "}
              <small>
                {sync.checking
                  ? "检查更新中"
                  : sync.added || sync.modified
                    ? `新增 ${sync.added} · 修订 ${sync.modified}`
                    : sync.checkedAt}
              </small>
            </span>
            <div className="catalog-sort-group">
              <SingleFilter
                id="sort"
                open={openPopover === "sort"}
                onOpen={() =>
                  setOpenPopover(openPopover === "sort" ? null : "sort")
                }
                icon={<SlidersHorizontal size={14} />}
                label="排序"
                value={sort}
                onChange={(value) => {
                  setSort(value as typeof sort);
                  setOpenPopover(null);
                }}
                options={[
                  ["version", "按版本"],
                  ["nation", "按国家"],
                  ["type", "按类型"],
                  ["id", "按任务 ID"],
                ]}
              />
              <button
                className="sort-direction"
                onClick={() =>
                  setSortDirection(sortDirection === "desc" ? "asc" : "desc")
                }
              >
                <ArrowDown size={14} />
                {sortDirection === "desc" ? "新 → 旧" : "旧 → 新"}
              </button>
            </div>
          </div>
        </section>
      )}
      {catalogView === "cards" && (
        <section className="catalog-grid">
          {items.slice(0, limit).map((item) => (
            <button
              className="catalog-card"
              key={item.id}
              onClick={() => onOpen(item)}
            >
              <div className="card-top">
                <span className={`type-badge type-${item.type}`}>
                  {TYPE_NAMES[item.type] || "其他"}
                </span>
                <span className="version-badge">
                  {item.version ? `v${item.version}` : "—"} · #{item.id}
                </span>
              </div>
              <h2>{item.title.zh}</h2>
              <h3>{item.title.en}</h3>
              {(item.type === "lq" || item.type === "hq") &&
                item.imageTitle.zh && (
                  <div className="character-chapter">
                    <span>{item.imageTitle.zh}</span>
                    <strong>{item.chapter.zh || "上游未提供章名"}</strong>
                  </div>
                )}
              <div className="card-context">
                <span
                  title={`地区来源：${NATION_SOURCE_NAMES[item.nationSource]}`}
                >
                  {NATION_NAMES[item.nation] || "未归属地区"}
                </span>
                {item.type !== "lq" &&
                  item.type !== "hq" &&
                  item.chapter.zh && <strong>{item.chapter.zh}</strong>}
                <span>
                  {item.type === "hq"
                    ? `${item.chapterCount} 个剧情节点`
                    : `${item.chapterCount} Chapters`}
                </span>
              </div>
              {item.type === "aq" && (
                <p className="act-summary">
                  {chapterFamily(item)}已收录{" "}
                  {actCounts.get(chapterFamily(item)) || 1} 幕
                </p>
              )}
            </button>
          ))}
        </section>
      )}
      {catalogView === "cards" && items.length > limit && (
        <button className="load-more" onClick={() => setLimit((v) => v + 60)}>
          再显示 {Math.min(60, items.length - limit)} 个
        </button>
      )}
      {catalogView === "cards" && !items.length && (
        <Empty title="没有符合条件的任务" />
      )}
      {catalogView === "journey" && (
        <JourneyTimeline
          nodes={timeline}
          items={data.items.filter(
            (item) => item.version && !item.hidden && !item.unreleased,
          )}
          onOpen={onOpen}
        />
      )}
    </main>
  );
}

function MultiFilter({
  id,
  open,
  onOpen,
  icon,
  label,
  values,
  onChange,
  options,
}: {
  id: string;
  open: boolean;
  onOpen: () => void;
  icon: React.ReactNode;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  options: string[][];
}) {
  const toggle = (value: string) =>
    onChange(
      values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
    );
  const labels = values.map(
    (value) => options.find(([key]) => key === value)?.[1] || value,
  );
  const summary = !labels.length
    ? "全部"
    : labels.length <= 3 && labels.join("、").length <= 18
      ? labels.join("、")
      : `${labels.slice(0, 2).join("、")} +${labels.length - 2}`;
  return (
    <div
      className={`multi-filter ${open ? "open" : ""}`}
      data-catalog-popover={id}
    >
      <button className="filter-trigger" onClick={onOpen}>
        {icon}
        <span>{label}</span>
        <strong title={labels.join("、")}>{summary}</strong>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="filter-popover">
          <header>
            <b>{label}</b>
            {values.length > 0 && (
              <button onClick={() => onChange([])}>清空</button>
            )}
          </header>
          {options.map(([value, text]) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={values.includes(value)}
                onChange={() => toggle(value)}
              />
              <span>{values.includes(value) && <Check size={11} />}</span>
              {text}
              {value === "hq" && <small>Honey</small>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SingleFilter({
  id,
  open,
  onOpen,
  icon,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  open: boolean;
  onOpen: () => void;
  icon: React.ReactNode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  const current = options.find(([key]) => key === value)?.[1] || "";
  return (
    <div
      className={`multi-filter single-filter ${open ? "open" : ""}`}
      data-catalog-popover={id}
    >
      <button className="filter-trigger" onClick={onOpen}>
        {icon}
        <span>{label}</span>
        <strong>{current}</strong>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="filter-popover">
          {options.map(([key, text]) => (
            <button
              className={key === value ? "selected" : ""}
              onClick={() => onChange(key)}
              key={key}
            >
              <span>{key === value && <Check size={12} />}</span>
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function JourneyTimeline({
  nodes,
  items,
  onOpen,
}: {
  nodes: Array<{
    version: string;
    milestone?: {
      nation: string;
      version: string;
      date: string;
      label: string;
    };
  }>;
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  const [mode, setMode] = useState<"version" | "nation">("version");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [position, setPosition] = useState(0);
  const [scale, setScale] = useSessionState<number>(
    "teyvat:journey:scale",
    100,
  );
  const topRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const groups = useMemo(() => {
    if (mode === "version")
      return [
        ...new Set(
          items.map((item) => item.version).filter(Boolean) as string[],
        ),
      ]
        .sort((a, b) => Number(a.replace(".", "")) - Number(b.replace(".", "")))
        .map((version) => ({
          key: `v-${version}`,
          label: `v${version}`,
          milestone: nodes.find((node) => node.version === version)?.milestone,
          items: items
            .filter((item) => item.version === version)
            .sort(chronologicalSort),
        }));
    return NATION_ORDER.map((nation) => ({
      key: `n-${nation}`,
      label: NATION_NAMES[nation],
      milestone: undefined,
      items: items
        .filter((item) => item.nation === nation)
        .sort(
          (a, b) =>
            Number(a.version?.replace(".", "") || 0) -
              Number(b.version?.replace(".", "") || 0) ||
            narrativeOrder(a) - narrativeOrder(b) ||
            a.id - b.id,
        ),
    })).filter((group) => group.items.length);
  }, [items, mode, nodes]);
  const sync = (source: "top" | "body") => {
    if (syncing.current) return;
    syncing.current = true;
    const from = source === "top" ? topRef.current : bodyRef.current;
    const to = source === "top" ? bodyRef.current : topRef.current;
    if (from) {
      const ratio =
        from.scrollWidth > from.clientWidth
          ? from.scrollLeft / (from.scrollWidth - from.clientWidth)
          : 0;
      if (to) to.scrollLeft = (to.scrollWidth - to.clientWidth) * ratio;
      setPosition(Math.round(ratio * 1000));
    }
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };
  const seek = (value: number, smooth = false) => {
    const ratio = value / 1000;
    const behavior: ScrollBehavior = smooth ? "smooth" : "auto";
    const body = bodyRef.current;
    const top = topRef.current;
    if (body)
      body.scrollTo({
        left: (body.scrollWidth - body.clientWidth) * ratio,
        behavior,
      });
    if (top)
      top.scrollTo({
        left: (top.scrollWidth - top.clientWidth) * ratio,
        behavior,
      });
    setPosition(value);
  };
  const jump = (index: number) =>
    seek(
      groups.length > 1 ? Math.round((index / (groups.length - 1)) * 1000) : 0,
      true,
    );
  const toggle = (key: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  return (
    <section
      className="journey-timeline"
      style={{ "--journey-scale": scale / 100 } as React.CSSProperties}
    >
      <header>
        <div>
          <span>2020 — 2026</span>
          <h2>提瓦特剧情树</h2>
          <p>
            国家与魔神任务构成主干；传说、邀约、世界及活动任务都可展开进入。
          </p>
        </div>
        <div className="journey-mode">
          <button
            className={mode === "version" ? "active" : ""}
            onClick={() => setMode("version")}
          >
            按版本
          </button>
          <button
            className={mode === "nation" ? "active" : ""}
            onClick={() => setMode("nation")}
          >
            按国家
          </button>
        </div>
      </header>
      <nav
        className="timeline-overview"
        ref={topRef}
        onScroll={() => sync("top")}
        aria-label="旅行历程快速导航"
      >
        <div className="timeline-overview-track">
          {groups.map((group, index) => (
            <button onClick={() => jump(index)} key={group.key}>
              <small>{group.label}</small>
              <strong>
                {group.milestone?.label ||
                  [
                    ...new Set(
                      group.items.map((item) => NATION_NAMES[item.nation]),
                    ),
                  ]
                    .slice(0, 2)
                    .join(" · ")}
              </strong>
            </button>
          ))}
        </div>
      </nav>
      <div
        className="timeline-scroll"
        ref={bodyRef}
        onScroll={() => sync("body")}
      >
        <div className="timeline-track">
          {groups.map((group) => (
            <article
              className={
                group.milestone ? "timeline-node milestone" : "timeline-node"
              }
              key={group.key}
            >
              <div className="version-mark">
                <b>{group.label}</b>
                {group.milestone && (
                  <>
                    <strong>{group.milestone.label}</strong>
                    <time>{group.milestone.date}</time>
                  </>
                )}
              </div>
              <div className="timeline-branches">
                {[...new Set(group.items.map((item) => item.nation))]
                  .sort(
                    (a, b) => NATION_ORDER.indexOf(a) - NATION_ORDER.indexOf(b),
                  )
                  .map((nation) => {
                    const key = `${group.key}:${nation}`;
                    const nationItems = group.items.filter(
                      (item) => item.nation === nation,
                    );
                    const isCollapsed = collapsed.has(key);
                    return (
                      <section
                        className={`timeline-country-group ${isCollapsed ? "collapsed" : ""}`}
                        key={key}
                      >
                        <button
                          className="country-group-heading"
                          onClick={() => toggle(key)}
                        >
                          <span>{NATION_NAMES[nation]}</span>
                          <small>{nationItems.length} 项</small>
                          <ChevronDown size={14} />
                        </button>
                        <div className="country-group-reveal">
                          <div>
                            {["aq", "lq", "hq", "wq", "eq"].map((type) => (
                              <TimelineTaskGroup
                                type={type}
                                items={nationItems.filter(
                                  (item) => item.type === type,
                                )}
                                onOpen={onOpen}
                                key={type}
                              />
                            ))}
                          </div>
                        </div>
                      </section>
                    );
                  })}
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="timeline-controls">
        <label className="timeline-scale">
          <ZoomOut size={14} />
          <input
            aria-label="剧情树字体缩放"
            type="range"
            min="75"
            max="150"
            step="5"
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
          />
          <ZoomIn size={14} />
          <output>{scale}%</output>
        </label>
        <div className="timeline-scrubber">
          <span>1.0</span>
          <input
            aria-label="时间线位置"
            type="range"
            min="0"
            max="1000"
            value={position}
            onChange={(event) => seek(Number(event.target.value))}
          />
          <span>最新</span>
        </div>
      </div>
      <button className="timeline-latest" onClick={() => seek(1000)}>
        <ChevronsRight size={17} />
        <span>最新版本</span>
      </button>
    </section>
  );
}

function TimelineTaskGroup({
  type,
  items,
  onOpen,
}: {
  type: string;
  items: CatalogItem[];
  onOpen: (item: CatalogItem) => void;
}) {
  if (!items.length) return null;
  return (
    <details
      className={`timeline-task-group type-${type}`}
      open={type === "aq" || type === "lq" || type === "hq"}
    >
      <summary>
        <b>{TYPE_NAMES[type]}</b>
        <span>{items.length}</span>
        <ChevronDown size={12} />
      </summary>
      <div>
        {items.map((item) => (
          <button onClick={() => onOpen(item)} key={item.id}>
            <small>
              {item.imageTitle.zh || item.chapter.zh || `v${item.version}`}
            </small>
            <strong>{item.title.zh}</strong>
            {item.chapter.zh && <span>{item.chapter.zh}</span>}
          </button>
        ))}
      </div>
    </details>
  );
}

function Empty({ title }: { title: string }) {
  return (
    <div className="empty">
      <FileText size={28} />
      <h2>{title}</h2>
    </div>
  );
}

function LanguagePicker({
  value,
  onChange,
}: {
  value: LanguageCode[];
  onChange: (languages: LanguageCode[]) => void;
}) {
  const toggle = (code: LanguageCode) => {
    if (value.includes(code)) {
      if (value.length > 1) onChange(value.filter((item) => item !== code));
      return;
    }
    if (value.length < 3) onChange([...value, code]);
  };
  return (
    <div className="language-picker">
      <div className="language-picked">
        {value.map((code, index) => (
          <span key={code}>
            <b>{index + 1}</b>
            {languageInfo(code).label}
          </span>
        ))}
      </div>
      <div className="language-list">
        {LANGUAGE_OPTIONS.map((language) => (
          <label
            className={value.includes(language.code) ? "active" : ""}
            key={language.code}
          >
            <input
              type="checkbox"
              checked={value.includes(language.code)}
              disabled={!value.includes(language.code) && value.length >= 3}
              onChange={() => toggle(language.code)}
            />
            <span>{value.indexOf(language.code) + 1 || ""}</span>
            <strong>{language.label}</strong>
            <small>{language.code}</small>
          </label>
        ))}
      </div>
    </div>
  );
}

function Reader({
  data,
  settings,
  setSettings,
  onBack,
  onQueue,
  onQueueChapter,
  onOpenBasket,
  onOpenPrint,
  basketSources,
  basketLines,
  guideRequest,
  seriesNav,
}: {
  data: ChapterData;
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  onBack: () => void;
  onQueue: (selection: Set<string>, quest: Quest, scenes: Scene[]) => void;
  onQueueChapter: (data: ChapterData) => void;
  onOpenBasket: () => void;
  onOpenPrint: () => void;
  basketSources: number;
  basketLines: number;
  guideRequest: number;
  seriesNav?: {
    previous?: CatalogItem;
    next?: CatalogItem;
    open: (item: CatalogItem) => void;
  };
}) {
  const [questId, setQuestId] = useState(data.quests[0]?.id);
  const [sceneKeys, setSceneKeys] = useState<Set<string>>(new Set());
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const deferredQuery = useDeferredValue(composing ? "" : query);
  const [searchMode, setSearchMode] = useState<"locate" | "filter">("locate");
  const [matchIndex, setMatchIndex] = useState(0);
  const [traveler, setTraveler] = useState<Traveler>("aether");
  const [sceneOpen, setSceneOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [roleFilterOpen, setRoleFilterOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [speakerKeys, setSpeakerKeys] = useState<Set<string>>(new Set());
  const [guideOpen, setGuideOpen] = useState(
    () =>
      settings.guideReader !== false &&
      localStorage.getItem("teyvat:reader-guide:v1") !== "done",
  );
  const [guideStep, setGuideStep] = useState(0);
  const scriptRef = useRef<HTMLDivElement>(null);
  const questRailRef = useRef<HTMLDivElement>(null);
  const questButtonRefs = useRef(new Map<number, HTMLButtonElement>());
  const [questRailEdges, setQuestRailEdges] = useState({
    left: false,
    right: false,
  });
  const activeLanguages = (
    settings.languages?.length
      ? settings.languages
      : (["CHS", "EN"] as LanguageCode[])
  ).slice(0, 3);
  const equalWidths = Array(activeLanguages.length).fill(
    100 / activeLanguages.length,
  );
  const languageWidths =
    settings.languageWidths?.length === activeLanguages.length
      ? settings.languageWidths
      : equalWidths;
  const liveLanguageWidths = useRef(languageWidths);
  const activeQuest =
    data.quests.find((q) => q.id === questId) || data.quests[0];
  const speakerKey = (line: DialogueLine) =>
    line.speaker.zh || line.speaker.en || "__narration";
  const availableSpeakers = useMemo(
    () =>
      [
        ...new Map(
          activeQuest.scenes
            .flatMap((scene) => scene.lines)
            .map((line) => [
              speakerKey(line),
              {
                key: speakerKey(line),
                label:
                  localized(line.speaker, activeLanguages[0]) ||
                  line.speaker.zh ||
                  "旁白",
                sub: localized(
                  line.speaker,
                  activeLanguages[1] || activeLanguages[0],
                ),
              },
            ]),
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label)),
    [activeQuest, activeLanguages.join(",")],
  );
  useEffect(() => {
    const keys = activeQuest.scenes.map((s) => s.key);
    setSceneKeys(new Set(keys));
    setSelectedLines(new Set());
    setSpeakerKeys(new Set(availableSpeakers.map((speaker) => speaker.key)));
    setQuery("");
  }, [activeQuest.id, availableSpeakers]);
  useEffect(() => {
    if (guideRequest > 0) {
      setGuideStep(0);
      setGuideOpen(true);
    }
  }, [guideRequest]);
  const updateQuestRailEdges = () => {
    const rail = questRailRef.current;
    if (!rail) return;
    setQuestRailEdges({
      left: rail.scrollLeft > 4,
      right: rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 4,
    });
  };
  useEffect(() => {
    const rail = questRailRef.current;
    const active = questButtonRefs.current.get(activeQuest.id);
    if (!rail || !active) return;
    active.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    const timer = window.setTimeout(updateQuestRailEdges, 350);
    const observer = new ResizeObserver(updateQuestRailEdges);
    observer.observe(rail);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [activeQuest.id, data.quests.length]);
  const wheelQuestRail = (event: React.WheelEvent<HTMLDivElement>) => {
    const rail = questRailRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;
    const distance =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!distance) return;
    event.preventDefault();
    rail.scrollBy({ left: distance, behavior: "auto" });
  };
  const speakerScenes = useMemo(
    () =>
      activeQuest.scenes.map((scene) => ({
        ...scene,
        lines: scene.lines.filter((line) => speakerKeys.has(speakerKey(line))),
      })),
    [activeQuest, speakerKeys],
  );
  const baseScenes = useMemo(
    () => filterScenes(speakerScenes, sceneKeys, "", traveler),
    [speakerScenes, sceneKeys, traveler],
  );
  const filteredScenes = useMemo(
    () => filterScenes(speakerScenes, sceneKeys, deferredQuery, traveler),
    [speakerScenes, sceneKeys, deferredQuery, traveler],
  );
  const scenes = searchMode === "filter" ? filteredScenes : baseScenes;
  const matchKeys = useMemo(
    () =>
      filteredScenes.flatMap((scene) => scene.lines.map((line) => line.key)),
    [filteredScenes],
  );
  const matchKeySet = useMemo(() => new Set(matchKeys), [matchKeys]);
  useEffect(
    () => setMatchIndex(0),
    [deferredQuery, searchMode, activeQuest.id],
  );
  useEffect(() => {
    if (searchMode !== "locate" || !deferredQuery || !matchKeys.length) return;
    const key = matchKeys[Math.min(matchIndex, matchKeys.length - 1)];
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-line-key="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, [matchIndex, matchKeys, deferredQuery, searchMode]);
  const visibleLineKeys = scenes.flatMap((s) => s.lines.map((l) => l.key));
  const selectedVisible = visibleLineKeys.filter((key) =>
    selectedLines.has(key),
  ).length;
  const allVisibleSelected = Boolean(
    visibleLineKeys.length && selectedVisible === visibleLineKeys.length,
  );
  const toggleLine = (key: string) =>
    setSelectedLines((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const setVisible = (enabled: boolean) =>
    setSelectedLines((current) => {
      const next = new Set(current);
      visibleLineKeys.forEach((key) =>
        enabled ? next.add(key) : next.delete(key),
      );
      return next;
    });
  const choiceSpeakerKeys = new Set(
    activeQuest.scenes.flatMap((scene) =>
      scene.lines
        .filter((line) => line.kind === "choice")
        .map((line) => speakerKey(line)),
    ),
  );
  const travelerSpeaker =
    availableSpeakers.find((speaker) => choiceSpeakerKeys.has(speaker.key)) ||
    availableSpeakers.find((speaker) =>
      /旅行者|Traveler|旅人|여행자|Путешествен/i.test(speaker.key),
    );
  const paimonSpeaker = availableSpeakers.find((speaker) =>
    /派蒙|Paimon|Paimón|パイモン|페이몬|Паймон/i.test(speaker.key),
  );
  const regularSpeakers = availableSpeakers.filter(
    (speaker) => speaker !== travelerSpeaker && speaker !== paimonSpeaker,
  );
  const toggleSpeaker = (key: string) =>
    setSpeakerKeys((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const locateScene = (scene: Scene) => {
    setSceneKeys((current) => new Set(current).add(scene.key));
    setSceneOpen(false);
    const scrollToScene = () =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const target = document.querySelector(
            `[data-scene-key="${CSS.escape(scene.key)}"]`,
          );
          if (target) {
            const root = document.documentElement;
            const previousBehavior = root.style.scrollBehavior;
            root.style.scrollBehavior = "auto";
            window.scrollTo(
              0,
              target.getBoundingClientRect().top +
                window.scrollY -
                (window.innerWidth <= 760 ? 160 : 145),
            );
            root.style.scrollBehavior = previousBehavior;
          }
        }),
      );
    scrollToScene();
    void document.fonts.ready.then(scrollToScene);
    window.setTimeout(scrollToScene, 250);
    window.setTimeout(scrollToScene, 650);
  };
  const closeGuide = () => {
    localStorage.setItem("teyvat:reader-guide:v1", "done");
    setGuideOpen(false);
  };
  const applyReaderWidths = (widths: number[]) => {
    const script = scriptRef.current;
    if (!script) return;
    liveLanguageWidths.current = widths;
    script.style.setProperty(
      "--reader-columns",
      widths.map((width) => `minmax(0,${width}fr)`).join(" "),
    );
    requestAnimationFrame(() => positionReaderDividers(widths));
  };
  const positionReaderDividers = (widths: number[]) => {
    const script = scriptRef.current;
    const content = script
      ?.querySelector(".utterances")
      ?.getBoundingClientRect();
    const scriptBox = script?.getBoundingClientRect();
    if (!script || !content || !scriptBox) return;
    let accumulated = 0;
    script
      .querySelectorAll<HTMLElement>(".reader-column-divider")
      .forEach((divider, index) => {
        accumulated += widths[index] || 0;
        divider.style.left = `${content.left - scriptBox.left + (content.width * accumulated) / 100}px`;
      });
  };
  useEffect(() => {
    const widths =
      settings.languageWidths?.length === activeLanguages.length
        ? settings.languageWidths
        : equalWidths;
    applyReaderWidths(widths);
    const observer = new ResizeObserver(() =>
      applyReaderWidths(liveLanguageWidths.current),
    );
    if (scriptRef.current) observer.observe(scriptRef.current);
    return () => observer.disconnect();
  }, [
    settings.languageWidths,
    settings.viewMode,
    activeLanguages.length,
    scenes.length,
  ]);
  const resizeReaderColumns = (
    event: React.PointerEvent<HTMLButtonElement>,
    boundary: number,
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const initial = [...liveLanguageWidths.current];
    const script = scriptRef.current;
    const content = script
      ?.querySelector(".utterances")
      ?.getBoundingClientRect();
    const scriptBox = script?.getBoundingClientRect();
    if (!script || !content || !scriptBox) return;
    let pending = initial;
    let frame = 0;
    let latestX = startX;
    const update = (clientX: number) => {
      const delta = ((clientX - startX) / content.width) * 100;
      const next = [...initial];
      const applied = Math.max(
        15 - initial[boundary],
        Math.min(initial[boundary + 1] - 15, delta),
      );
      next[boundary] = initial[boundary] + applied;
      next[boundary + 1] = initial[boundary + 1] - applied;
      pending = next;
      applyReaderWidths(next);
    };
    const move = (next: PointerEvent) => {
      latestX = next.clientX;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          update(latestX);
        });
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      update(latestX);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      script.classList.remove("resizing-columns");
      applyReaderWidths(pending);
      setSettings({
        ...settings,
        languageWidths: pending,
        columnRatio: pending[0],
      });
    };
    script.classList.add("resizing-columns");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  return (
    <main
      className={`reader-page font-${settings.fontFamily || "serif"} ${selectionMode ? "selection-active" : ""}`}
      style={
        {
          "--zh-size": `${settings.zhSize}px`,
          "--en-size": `${settings.enSize}px`,
          "--reader-leading": settings.lineHeight,
        } as React.CSSProperties
      }
    >
      <nav className="chapter-nav-shell" aria-label="章节导航">
        <div className="act-identity">
          <button
            className="back-button"
            onClick={onBack}
            aria-label="返回任务目录"
          >
            <ArrowLeft size={17} />
            <span>目录</span>
          </button>
          <div title={`${data.chapter.number.zh} · ${data.chapter.title.zh}`}>
            <small>
              {data.chapter.number.zh} · {data.chapter.region.zh}
            </small>
            <strong>{data.chapter.title.zh}</strong>
            <em>
              {data.chapter.number.en} · {data.chapter.title.en}
            </em>
          </div>
        </div>
        <div
          className={`quest-rail-shell ${questRailEdges.left ? "can-left" : ""} ${questRailEdges.right ? "can-right" : ""}`}
        >
          <button
            className="quest-rail-arrow previous"
            disabled={!questRailEdges.left}
            onClick={() =>
              questRailRef.current?.scrollBy({ left: -320, behavior: "smooth" })
            }
            aria-label="查看前面的 Chapter"
          >
            <ArrowLeft size={15} />
          </button>
          <div
            ref={questRailRef}
            className="quest-tabs"
            role="tablist"
            onScroll={updateQuestRailEdges}
            onWheel={wheelQuestRail}
          >
            {data.quests.map((q) => (
              <button
                ref={(node) => {
                  if (node) questButtonRefs.current.set(q.id, node);
                  else questButtonRefs.current.delete(q.id);
                }}
                className={q.id === activeQuest.id ? "active" : ""}
                onClick={() => setQuestId(q.id)}
                key={q.id}
              >
                <span>{String(q.order).padStart(2, "0")}</span>
                <strong>{localized(q.title, activeLanguages[0])}</strong>
                {activeLanguages[1] && (
                  <small>{localized(q.title, activeLanguages[1])}</small>
                )}
              </button>
            ))}
          </div>
          <button
            className="quest-rail-arrow next"
            disabled={!questRailEdges.right}
            onClick={() =>
              questRailRef.current?.scrollBy({ left: 320, behavior: "smooth" })
            }
            aria-label="查看更多 Chapter"
          >
            <ArrowRight size={15} />
          </button>
        </div>
        <button
          className="act-queue-action"
          onClick={() => onQueueChapter(data)}
          title={`将${data.chapter.number.zh}全部 ${data.quests.length} 个 Chapters 加入选稿池`}
        >
          <Plus size={17} />
          <span>整幕加入</span>
          <small>{data.quests.length}</small>
        </button>
        {(seriesNav?.previous || seriesNav?.next) && (
          <div className="series-navigation" aria-label="系列任务前后切换">
            <button
              disabled={!seriesNav.previous}
              onClick={() =>
                seriesNav.previous && seriesNav.open(seriesNav.previous)
              }
            >
              <ArrowLeft size={14} />
              <span>{seriesNav.previous?.title.zh || "已经是开头"}</span>
            </button>
            <small>同系列</small>
            <button
              disabled={!seriesNav.next}
              onClick={() => seriesNav.next && seriesNav.open(seriesNav.next)}
            >
              <span>{seriesNav.next?.title.zh || "已经是结尾"}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        <button
          className="mobile-scene-button"
          onClick={() => setSceneOpen(true)}
        >
          <Menu size={17} />
          <span>场景</span>
        </button>
      </nav>
      <section className="reader-intro">
        <div>
          <span className="eyebrow">
            {localized(data.chapter.number, activeLanguages[0])} ·{" "}
            {localized(data.chapter.region, activeLanguages[0])}
            <b>{localized(data.chapter.title, activeLanguages[0])}</b>
          </span>
          <h1>{localized(activeQuest.title, activeLanguages[0])}</h1>
          {activeLanguages.slice(1).map((lang) => (
            <h2 key={lang}>{localized(activeQuest.title, lang)}</h2>
          ))}
        </div>
        <div className="intro-descriptions">
          {activeLanguages.map(
            (lang) =>
              localized(activeQuest.description, lang) && (
                <p lang={languageInfo(lang).locale} key={lang}>
                  {localized(activeQuest.description, lang)}
                </p>
              ),
          )}
        </div>
      </section>
      <div className="reader-workspace">
        <aside className={sceneOpen ? "scene-panel open" : "scene-panel"}>
          <div className="panel-heading">
            <div>
              <strong>场景显示与定位</strong>
              <small>
                {sceneKeys.size}/{activeQuest.scenes.length} 已显示 ·
                点击标题定位
              </small>
            </div>
            <button onClick={() => setSceneOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="panel-actions">
            <button
              onClick={() =>
                setSceneKeys(new Set(activeQuest.scenes.map((s) => s.key)))
              }
            >
              全选
            </button>
            <button onClick={() => setSceneKeys(new Set())}>清空</button>
          </div>
          <div className="scene-list">
            {activeQuest.scenes.map((scene, index) => (
              <div
                className={
                  sceneKeys.has(scene.key)
                    ? "scene-list-row visible"
                    : "scene-list-row"
                }
                key={scene.key}
              >
                <label title="显示或隐藏此场景">
                  <input
                    type="checkbox"
                    checked={sceneKeys.has(scene.key)}
                    onChange={() =>
                      setSceneKeys((current) => {
                        const next = new Set(current);
                        next.has(scene.key)
                          ? next.delete(scene.key)
                          : next.add(scene.key);
                        return next;
                      })
                    }
                  />
                  <span className="checkmark">
                    {sceneKeys.has(scene.key) && <Check size={11} />}
                  </span>
                </label>
                <span className="scene-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <button
                  className="scene-locate"
                  onClick={() => locateScene(scene)}
                >
                  <strong>{localized(scene.title, activeLanguages[0])}</strong>
                  {activeLanguages[1] && (
                    <small>{localized(scene.title, activeLanguages[1])}</small>
                  )}
                </button>
                <em>{scene.lines.length}</em>
              </div>
            ))}
          </div>
        </aside>
        {sceneOpen && (
          <button
            className="panel-scrim"
            onClick={() => setSceneOpen(false)}
            aria-label="关闭场景面板"
          />
        )}
        <section className="script-column">
          <div className="reader-toolbar">
            <div className="view-pills">
              {VIEW_OPTIONS.map((v) => (
                <button
                  className={settings.viewMode === v.id ? "active" : ""}
                  onClick={() => setSettings({ ...settings, viewMode: v.id })}
                  key={v.id}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="language-control">
              <button onClick={() => setLanguageOpen((value) => !value)}>
                <Languages size={15} />
                {activeLanguages
                  .map((lang) => languageInfo(lang).short)
                  .join(" · ")}
                <ChevronDown size={12} />
              </button>
              {languageOpen && (
                <div className="language-popover">
                  <header>
                    <strong>对照语言</strong>
                    <span>{activeLanguages.length}/3</span>
                  </header>
                  <LanguagePicker
                    value={activeLanguages}
                    onChange={(languages) =>
                      setSettings({ ...settings, languages })
                    }
                  />
                </div>
              )}
            </div>
            <div className="search-tools">
              <label className="reader-search">
                <Search size={15} />
                <input
                  value={query}
                  onCompositionStart={() => setComposing(true)}
                  onCompositionEnd={(e) => {
                    setComposing(false);
                    setQuery(e.currentTarget.value);
                  }}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      !e.nativeEvent.isComposing &&
                      e.key === "Enter" &&
                      searchMode === "locate" &&
                      matchKeys.length
                    )
                      setMatchIndex((value) => (value + 1) % matchKeys.length);
                  }}
                  placeholder="搜角色或台词"
                />
                {query && (
                  <button onClick={() => setQuery("")}>
                    <X size={13} />
                  </button>
                )}
              </label>
              <select
                aria-label="搜索方式"
                value={searchMode}
                onChange={(e) =>
                  setSearchMode(e.target.value as "locate" | "filter")
                }
              >
                <option value="locate">定位</option>
                <option value="filter">筛选</option>
              </select>
              {deferredQuery && searchMode === "locate" && (
                <div className="match-nav">
                  <span>
                    {matchKeys.length ? matchIndex + 1 : 0}/{matchKeys.length}
                  </span>
                  <button
                    disabled={!matchKeys.length}
                    onClick={() =>
                      setMatchIndex(
                        (value) =>
                          (value - 1 + matchKeys.length) % matchKeys.length,
                      )
                    }
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    disabled={!matchKeys.length}
                    onClick={() =>
                      setMatchIndex((value) => (value + 1) % matchKeys.length)
                    }
                  >
                    <ArrowDown size={12} />
                  </button>
                </div>
              )}
            </div>
            <div className="role-filter">
              <button
                className={
                  speakerKeys.size < availableSpeakers.length ? "filtered" : ""
                }
                onClick={() => setRoleFilterOpen((value) => !value)}
              >
                <Filter size={14} />
                角色 {speakerKeys.size}/{availableSpeakers.length}
                <ChevronDown size={12} />
              </button>
              {roleFilterOpen && (
                <div className="role-filter-popover">
                  <header>
                    <strong>只显示这些角色</strong>
                    <button onClick={() => setRoleFilterOpen(false)}>
                      <X size={17} />
                    </button>
                  </header>
                  <div className="featured-roles">
                    {travelerSpeaker && (
                      <label>
                        <input
                          type="checkbox"
                          checked={speakerKeys.has(travelerSpeaker.key)}
                          onChange={() => toggleSpeaker(travelerSpeaker.key)}
                        />
                        <span className="checkmark">
                          {speakerKeys.has(travelerSpeaker.key) && (
                            <Check size={12} />
                          )}
                        </span>
                        <div>
                          <strong>旅行者</strong>
                          <select
                            value={traveler}
                            onChange={(e) =>
                              setTraveler(e.target.value as Traveler)
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="aether">空 · Aether</option>
                            <option value="lumine">荧 · Lumine</option>
                          </select>
                        </div>
                      </label>
                    )}
                    {paimonSpeaker && (
                      <label>
                        <input
                          type="checkbox"
                          checked={speakerKeys.has(paimonSpeaker.key)}
                          onChange={() => toggleSpeaker(paimonSpeaker.key)}
                        />
                        <span className="checkmark">
                          {speakerKeys.has(paimonSpeaker.key) && (
                            <Check size={12} />
                          )}
                        </span>
                        <div>
                          <strong>{paimonSpeaker.label}</strong>
                          <small>{paimonSpeaker.sub}</small>
                        </div>
                      </label>
                    )}
                  </div>
                  <div className="role-filter-actions">
                    <span>其他角色</span>
                    <button
                      onClick={() =>
                        setSpeakerKeys(
                          new Set(
                            availableSpeakers.map((speaker) => speaker.key),
                          ),
                        )
                      }
                    >
                      全选
                    </button>
                    <button onClick={() => setSpeakerKeys(new Set())}>
                      清空
                    </button>
                  </div>
                  <div className="role-filter-list">
                    {regularSpeakers.map((speaker) => (
                      <label key={speaker.key}>
                        <input
                          type="checkbox"
                          checked={speakerKeys.has(speaker.key)}
                          onChange={() => toggleSpeaker(speaker.key)}
                        />
                        <span className="checkmark">
                          {speakerKeys.has(speaker.key) && <Check size={11} />}
                        </span>
                        <span>
                          <strong>{speaker.label}</strong>
                          <small>{speaker.sub}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              className={
                selectionMode ? "selection-toggle active" : "selection-toggle"
              }
              onClick={() => setSelectionMode((v) => !v)}
            >
              <MousePointer2 size={16} />
              <span>{selectionMode ? "退出选句" : "选择台词"}</span>
            </button>
          </div>
          {selectionMode && (
            <div className="selection-bar">
              <button
                className="selection-select-all"
                aria-pressed={allVisibleSelected}
                onClick={() => setVisible(!allVisibleSelected)}
              >
                {allVisibleSelected ? (
                  <CheckSquare2 size={19} />
                ) : (
                  <Square size={19} />
                )}
                <span>{allVisibleSelected ? "取消全选" : "全选"}</span>
              </button>
              <div className="selection-status">
                <span>当前已选</span>
                <strong>{selectedVisible}</strong>
                <span>共 {visibleLineKeys.length} 句</span>
              </div>
              <div className="selection-secondary">
                <button
                  disabled={!selectedVisible}
                  onClick={() => setVisible(false)}
                >
                  <Eraser size={16} />
                  清空
                </button>
                <button onClick={() => setSelectionMode(false)}>
                  <CircleCheck size={16} />
                  完成
                </button>
              </div>
              <button
                className="queue-inline"
                disabled={!selectedVisible}
                onClick={() => onQueue(selectedLines, activeQuest, scenes)}
              >
                <Plus size={18} />
                <span>加入选稿池</span>
              </button>
            </div>
          )}
          <div
            ref={scriptRef}
            data-language-count={activeLanguages.length}
            className={`script script-${settings.viewMode} ${selectionMode ? "is-selecting" : ""}`}
            style={
              {
                "--reader-columns": languageWidths
                  .map((width) => `minmax(0,${width}fr)`)
                  .join(" "),
              } as React.CSSProperties
            }
          >
            {settings.viewMode === "parallel" &&
              activeLanguages.length > 1 &&
              activeLanguages.slice(0, -1).map((_, boundary) => (
                <button
                  key={boundary}
                  className="reader-column-divider"
                  onPointerDown={(event) =>
                    resizeReaderColumns(event, boundary)
                  }
                  onDoubleClick={() => {
                    const equal = Array(activeLanguages.length).fill(
                      100 / activeLanguages.length,
                    );
                    applyReaderWidths(equal);
                    setSettings({
                      ...settings,
                      languageWidths: equal,
                      columnRatio: equal[0],
                    });
                  }}
                  title="拖动调整相邻语言栏宽；双击恢复均分"
                >
                  <GripVertical size={14} />
                </button>
              ))}
            <div className="script-meta">
              <span>
                {scenes.length} 个场景 · {visibleLineKeys.length} 句
              </span>
            </div>
            {scenes.map((scene, sceneIndex) => (
              <SceneBlock
                key={scene.key}
                scene={scene}
                sceneIndex={sceneIndex}
                mode={settings.viewMode}
                languages={activeLanguages}
                traveler={traveler}
                selected={selectedLines}
                toggle={toggleLine}
                selecting={selectionMode}
                query={searchMode === "locate" ? deferredQuery : ""}
                matches={matchKeySet}
                focusedKey={
                  searchMode === "locate" ? matchKeys[matchIndex] : undefined
                }
                showGuide={settings.guideScenes !== false}
              />
            ))}
            {!scenes.length && <Empty title="没有可显示的台词" />}
          </div>
        </section>
      </div>
      <div className="basket-dock">
        <button
          className="basket-summary"
          disabled={!basketSources}
          onClick={onOpenBasket}
        >
          <span className="basket-icon">
            <ShoppingBasket size={22} />
            {basketSources > 0 && <b>{basketSources}</b>}
          </span>
          <span className="basket-copy">
            <strong>选稿池</strong>
            <small>
              {basketSources
                ? `${basketSources} 个任务段 · ${basketLines} 句，点击查看内容`
                : "选中台词后加入这里"}
            </small>
          </span>
        </button>
        <button
          className="basket-print"
          disabled={!basketSources}
          onClick={onOpenPrint}
        >
          <Printer size={17} />
          <span>进入打印排版</span>
          <ArrowRight size={17} />
        </button>
      </div>
      {guideOpen && (
        <ReaderGuide
          step={guideStep}
          onStep={setGuideStep}
          onClose={closeGuide}
        />
      )}
    </main>
  );
}

function SceneBlock({
  scene,
  sceneIndex,
  mode,
  languages,
  traveler,
  selected,
  toggle,
  selecting,
  query,
  matches,
  focusedKey,
  showGuide,
}: {
  scene: Scene;
  sceneIndex: number;
  mode: ViewMode;
  languages: LanguageCode[];
  traveler: Traveler;
  selected: Set<string>;
  toggle: (k: string) => void;
  selecting: boolean;
  query: string;
  matches: Set<string>;
  focusedKey?: string;
  showGuide: boolean;
}) {
  const guideKey = `teyvat:scene-guide:${scene.key}`;
  const [tipVisible, setTipVisible] = useState(
    () => showGuide && sessionStorage.getItem(guideKey) !== "done",
  );
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < scene.lines.length) {
    const line = scene.lines[index];
    if (line.branchGroupId) {
      const start = index;
      const group: DialogueLine[] = [];
      while (
        index < scene.lines.length &&
        scene.lines[index].branchGroupId === line.branchGroupId
      )
        group.push(scene.lines[index++]);
      const total =
        line.branchTotal || new Set(group.map((item) => item.branchIndex)).size;
      const flow =
        line.branchFlow ||
        (group.some((item) => item.branchRole === "response")
          ? "divergent"
          : "convergent");
      const flowCopy =
        flow === "loop"
          ? ["可重复问答", "每个问题有独立回答；选择结束项后离开问答"]
          : flow === "divergent"
            ? ["差异分支", "每个选项及其专属回应分别列出，随后回到共同剧情"]
            : flow === "independent"
              ? ["独立分支", "各选项沿独立路径结束，不存在共同汇合节点"]
              : flow === "unresolved"
                ? [
                    "路径数据不完整",
                    "源数据在该分支末端未提供可继续追踪的下一节点",
                  ]
                : ["旅行者选项", "不同说法会立即回到相同后续"];
      const prompt = group.find((item) => item.branchRole === "prompt");
      blocks.push(
        <section
          className={`choice-group choice-${flow}`}
          key={`branch:${line.branchGroupId}`}
        >
          <header>
            <GitFork size={16} />
            <div>
              <strong>{flowCopy[0]}</strong>
              <small>
                {total} 个选项 · {flowCopy[1]}
              </small>
            </div>
          </header>
          {prompt && (
            <div className="branch-prompt">
              <DialogueRow
                line={prompt}
                index={start}
                mode={mode}
                languages={languages}
                traveler={traveler}
                checked={selected.has(prompt.key)}
                toggle={() => toggle(prompt.key)}
                selecting={selecting}
                query={query}
                match={!query || matches.has(prompt.key)}
                focused={prompt.key === focusedKey}
              />
            </div>
          )}
          <div className="branch-paths">
            {Array.from({ length: total }, (_, branchIndex) => {
              const path = group.filter(
                (item) => item.branchIndex === branchIndex,
              );
              return (
                <section
                  className={`branch-path branch-tone-${branchIndex % 4}`}
                  key={branchIndex}
                >
                  <div className="branch-path-label">
                    <b>
                      {branchIndex + 1}/{total}
                    </b>
                    <span>
                      {flow === "loop"
                        ? branchIndex === total - 1
                          ? "结束问答"
                          : "问题与回答"
                        : flow === "divergent"
                          ? "分支路径"
                          : "可选说法"}
                    </span>
                  </div>
                  {path.map((item, pathIndex) => (
                    <DialogueRow
                      key={item.key}
                      line={item}
                      index={start + pathIndex}
                      optionIndex={pathIndex === 0 ? branchIndex : undefined}
                      optionTotal={pathIndex === 0 ? total : undefined}
                      mode={mode}
                      languages={languages}
                      traveler={traveler}
                      checked={selected.has(item.key)}
                      toggle={() => toggle(item.key)}
                      selecting={selecting}
                      query={query}
                      match={!query || matches.has(item.key)}
                      focused={item.key === focusedKey}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </section>,
      );
      if (line.branchMergeNodeId && index < scene.lines.length)
        blocks.push(
          <div
            className="common-story-marker"
            key={`common:${line.branchGroupId}`}
          >
            <span>以上 {total} 条路径在此汇合，以下为共同后续</span>
          </div>,
        );
      continue;
    }
    if (line.kind !== "choice") {
      blocks.push(
        <DialogueRow
          key={line.key}
          line={line}
          index={index}
          mode={mode}
          languages={languages}
          traveler={traveler}
          checked={selected.has(line.key)}
          toggle={() => toggle(line.key)}
          selecting={selecting}
          query={query}
          match={!query || matches.has(line.key)}
          focused={line.key === focusedKey}
        />,
      );
      index++;
      continue;
    }
    const start = index;
    const choices: DialogueLine[] = [];
    while (index < scene.lines.length && scene.lines[index].kind === "choice")
      choices.push(scene.lines[index++]);
    if (choices.length === 1)
      blocks.push(
        <DialogueRow
          key={choices[0].key}
          line={choices[0]}
          index={start}
          mode={mode}
          languages={languages}
          traveler={traveler}
          checked={selected.has(choices[0].key)}
          toggle={() => toggle(choices[0].key)}
          selecting={selecting}
          query={query}
          match={!query || matches.has(choices[0].key)}
          focused={choices[0].key === focusedKey}
        />,
      );
    else {
      const divergent =
        new Set(choices.map((choice) => choice.nextNodeId).filter(Boolean))
          .size > 1;
      blocks.push(
        <section
          className={`choice-group ${divergent ? "choice-divergent" : "choice-convergent"}`}
          key={`choices:${line.key}`}
        >
          <header>
            <GitFork size={16} />
            <div>
              <strong>旅行者选项</strong>
              <small>
                {choices.length} 个可选说法 ·{" "}
                {divergent ? "各选项通向不同回应" : "选择后汇入共同后续"}
              </small>
            </div>
          </header>
          {choices.map((choice, option) => (
            <DialogueRow
              key={choice.key}
              line={choice}
              index={start + option}
              optionIndex={option}
              optionTotal={choices.length}
              mode={mode}
              languages={languages}
              traveler={traveler}
              checked={selected.has(choice.key)}
              toggle={() => toggle(choice.key)}
              selecting={selecting}
              query={query}
              match={!query || matches.has(choice.key)}
              focused={choice.key === focusedKey}
            />
          ))}
        </section>,
      );
      if (!divergent && index < scene.lines.length)
        blocks.push(
          <div className="common-story-marker" key={`common:${line.key}`}>
            <span>以下为 {choices.length} 个选项的共同后续</span>
          </div>,
        );
    }
  }
  return (
    <section className="scene-block" data-scene-key={scene.key}>
      <header>
        <span>SCENE {String(sceneIndex + 1).padStart(2, "0")}</span>
        <div>
          <h3>{localized(scene.title, languages[0])}</h3>
          {languages.slice(1).map((lang) => (
            <p title={localized(scene.title, lang)} key={lang}>
              {localized(scene.title, lang)}
            </p>
          ))}
        </div>
        <em>{scene.lines.length} 句</em>
      </header>
      {tipVisible && (
        <aside className="scene-lead">
          <Info size={14} />
          <div>
            <strong>
              {scene.description.zh ? "本节提示" : "场景阅读提示"}
            </strong>
            <p>
              {scene.description.zh
                ? localized(scene.description, languages[0])
                : "选项路径依据游戏对话节点的下一跳关系整理，并明确标出立即汇合、专属回应、循环问答或独立结束。"}
            </p>
          </div>
          <button
            aria-label="关闭本场景提示"
            onClick={() => {
              sessionStorage.setItem(guideKey, "done");
              setTipVisible(false);
            }}
          >
            <X size={14} />
          </button>
        </aside>
      )}
      {blocks}
    </section>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text || "—"}</>;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "ig"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? (
          <mark key={index}>{part}</mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
function DialogueRow({
  line,
  index,
  optionIndex,
  optionTotal,
  mode,
  languages,
  traveler,
  checked,
  toggle,
  selecting,
  query,
  match,
  focused,
}: {
  line: DialogueLine;
  index: number;
  optionIndex?: number;
  optionTotal?: number;
  mode: ViewMode;
  languages: LanguageCode[];
  traveler: Traveler;
  checked: boolean;
  toggle: () => void;
  selecting: boolean;
  query: string;
  match: boolean;
  focused: boolean;
}) {
  const activate = (event: React.MouseEvent | React.KeyboardEvent) => {
    if (
      !selecting ||
      (event.target as HTMLElement).closest("button,select,input,a")
    )
      return;
    toggle();
  };
  const highlightQuery = match ? query : "";
  return (
    <article
      role={selecting ? "checkbox" : undefined}
      aria-checked={selecting ? checked : undefined}
      tabIndex={selecting ? 0 : undefined}
      onClick={activate}
      onKeyDown={(event) => {
        if (selecting && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          toggle();
        }
      }}
      data-line-key={line.key}
      data-node-id={line.nodeId}
      className={`dialogue-row kind-${line.kind} ${line.branchRole ? `branch-${line.branchRole} branch-${line.branchFlow}` : ""} ${selecting && checked ? "selected" : "not-selected"} ${query && !match ? "search-muted" : ""} ${focused ? "search-focused" : ""}`}
    >
      <button
        className="line-select"
        disabled={!selecting}
        onClick={() => toggle()}
        aria-label={checked ? "从选稿移除" : "加入选稿"}
      >
        <span>{selecting && checked && <Check size={11} />}</span>
        <small>
          {optionIndex === undefined
            ? String(index + 1).padStart(2, "0")
            : `${optionIndex + 1}/${optionTotal}`}
        </small>
      </button>
      <div className="dialogue-main">
        <div
          className="utterances"
          style={
            { "--language-count": languages.length } as React.CSSProperties
          }
        >
          {languages.map((lang) => (
            <div
              className="utterance"
              lang={languageInfo(lang).locale}
              key={lang}
            >
              {line.kind !== "narration" && localized(line.speaker, lang) && (
                <strong>
                  <HighlightText
                    text={localized(line.speaker, lang)}
                    query={highlightQuery}
                  />
                </strong>
              )}
              <p>
                <HighlightText
                  text={formatGameText(localized(line.text, lang), traveler)}
                  query={highlightQuery}
                />
              </p>
            </div>
          ))}
        </div>
        {line.kind === "narration" && (
          <em className="choice-label">画面文字</em>
        )}
      </div>
    </article>
  );
}

const GUIDE_STEPS = [
  {
    selector: ".chapter-nav-shell",
    title: "幕标题与 Chapter 都在这里",
    text: "左侧始终显示当前 Act 和返回目录；中间可直接滚轮横移，选择后会自动居中；右侧可把整幕加入选稿池。",
  },
  {
    selector: ".scene-panel",
    mobileSelector: ".mobile-scene-button",
    title: "显示与定位场景",
    text: "勾选框只控制场景是否显示；点击场景标题会直接定位到正文。",
  },
  {
    selector: ".role-filter",
    title: "筛选阅读内容",
    text: "角色筛选只改变当前看到的台词，不会自动加入或删除选稿。",
  },
  {
    selector: ".reader-column-divider",
    mobileSelector: ".view-pills",
    title: "调整双语栏宽",
    text: "桌面端拖动正文中间的短手柄即可调整中外文比例，双击恢复均分；手机端可改用上下阅读。",
  },
  {
    selector: ".selection-toggle",
    title: "进入选句模式",
    text: "进入后，每句左侧会出现明确复选框；只有复选框代表已选稿。",
  },
  {
    selector: ".basket-dock",
    title: "统一整理与打印",
    text: "底部选稿池始终可见；选好的内容可跨任务调整顺序后统一打印。",
  },
];

function ReaderGuide({
  step,
  onStep,
  onClose,
}: {
  step: number;
  onStep: (step: number) => void;
  onClose: () => void;
}) {
  const current = GUIDE_STEPS[step];
  useEffect(() => {
    const selector =
      innerWidth <= 620 && current.mobileSelector
        ? current.mobileSelector
        : current.selector;
    const target = document.querySelector(selector);
    target?.classList.add("guide-focus");
    return () => target?.classList.remove("guide-focus");
  }, [current]);
  return (
    <div
      className="reader-guide"
      role="dialog"
      aria-modal="true"
      aria-label="阅读操作引导"
    >
      <section>
        <span>
          操作引导 · {step + 1}/{GUIDE_STEPS.length}
        </span>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div>
          <button onClick={onClose}>跳过</button>
          {step > 0 && <button onClick={() => onStep(step - 1)}>上一步</button>}
          <button
            className="guide-next"
            onClick={() =>
              step === GUIDE_STEPS.length - 1 ? onClose() : onStep(step + 1)
            }
          >
            {step === GUIDE_STEPS.length - 1 ? "知道了" : "下一步"}
          </button>
        </div>
      </section>
    </div>
  );
}

function SettingsSheet({
  value,
  onChange,
  onClose,
  onGuide,
}: {
  value: AppSettings;
  onChange: (s: AppSettings) => void;
  onClose: () => void;
  onGuide: () => void;
}) {
  return (
    <Modal title="阅读设置" eyebrow="SETTINGS" onClose={onClose}>
      <div className="settings-list">
        <SettingRow title="界面主题">
          <div className="theme-setting-switch">
            {(
              [
                ["dark", <Moon size={20} />, "深色"],
                ["auto", <Monitor size={20} />, "自动"],
                ["light", <Sun size={20} />, "浅色"],
              ] as const
            ).map(([id, icon, label]) => (
              <button
                className={value.theme === id ? "active" : ""}
                onClick={() => onChange({ ...value, theme: id })}
                aria-label={label}
                title={label}
                key={id}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow title="对照语言">
          <LanguagePicker
            value={value.languages || ["CHS", "EN"]}
            onChange={(languages) => onChange({ ...value, languages })}
          />
        </SettingRow>
        <SettingRow title="阅读版式">
          <Segment
            value={
              ["parallel", "stacked", "compact"].includes(value.viewMode)
                ? value.viewMode
                : "parallel"
            }
            onChange={(v) => onChange({ ...value, viewMode: v as ViewMode })}
            options={VIEW_OPTIONS.map((x) => [x.id, x.label])}
          />
        </SettingRow>
        <SettingRow title="字体">
          <Segment
            value={value.fontFamily || "serif"}
            onChange={(v) =>
              onChange({ ...value, fontFamily: v as AppSettings["fontFamily"] })
            }
            options={[
              ["serif", "宋体"],
              ["sans", "黑体"],
              ["yahei", "微软雅黑"],
            ]}
          />
        </SettingRow>
        <SettingRow title={`正文字号 · ${value.zhSize}px`}>
          <input
            type="range"
            min="18"
            max="32"
            value={value.zhSize}
            onChange={(e) =>
              onChange({
                ...value,
                zhSize: Number(e.target.value),
                enSize: Number(e.target.value),
              })
            }
          />
        </SettingRow>
        <SettingRow title={`行距 · ${value.lineHeight.toFixed(2)}`}>
          <input
            type="range"
            min="1.25"
            max="1.8"
            step="0.05"
            value={value.lineHeight}
            onChange={(e) =>
              onChange({ ...value, lineHeight: Number(e.target.value) })
            }
          />
        </SettingRow>
        <SettingRow
          title={`并列栏宽 · ${value.columnRatio ?? 50} / ${100 - (value.columnRatio ?? 50)}`}
        >
          <div className="ratio-setting">
            <input
              type="range"
              min="25"
              max="75"
              value={value.columnRatio ?? 50}
              onChange={(e) =>
                onChange({ ...value, columnRatio: Number(e.target.value) })
              }
            />
            <button onClick={() => onChange({ ...value, columnRatio: 50 })}>
              <RotateCcw size={14} />
              恢复均分
            </button>
          </div>
        </SettingRow>
        <SettingRow title="隐藏内容">
          <Switch
            checked={value.showHidden}
            onChange={(v) => onChange({ ...value, showHidden: v })}
          />
        </SettingRow>
        <SettingRow title="未实装内容">
          <Switch
            checked={value.showUnreleased}
            onChange={(v) => onChange({ ...value, showUnreleased: v })}
          />
        </SettingRow>
        <SettingRow title="目录引导">
          <Switch
            checked={value.guideCatalog !== false}
            onChange={(v) => onChange({ ...value, guideCatalog: v })}
          />
        </SettingRow>
        <SettingRow title="任务操作引导">
          <Switch
            checked={value.guideReader !== false}
            onChange={(v) => onChange({ ...value, guideReader: v })}
          />
        </SettingRow>
        <SettingRow title="场景提示">
          <Switch
            checked={value.guideScenes !== false}
            onChange={(v) => onChange({ ...value, guideScenes: v })}
          />
        </SettingRow>
        <SettingRow title="再次触发引导">
          <button className="guide-replay" onClick={onGuide}>
            重置并立即查看
          </button>
        </SettingRow>
        <button
          className="reset-settings"
          onClick={() => onChange(DEFAULT_SETTINGS)}
        >
          <RotateCcw size={15} />
          恢复默认设置
        </button>
      </div>
    </Modal>
  );
}

function PrintStudio({
  bundles,
  setBundles,
  languages,
  traveler = "aether",
  settings,
  setSettings,
  onClose,
  onNotice,
}: {
  bundles: PrintBundle[];
  setBundles: (bundles: PrintBundle[]) => void;
  languages: LanguageCode[];
  traveler?: Traveler;
  settings: PrintSettings;
  setSettings: (s: PrintSettings) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ value: 0, label: "" });
  const [printedAt] = useState(() =>
    new Date().toLocaleString("zh-CN", { hour12: false }),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pageOpen, setPageOpen] = useState(false);
  const bands = settings.bands || DEFAULT_PRINT.bands;
  const count = bundles.reduce(
    (total, bundle) =>
      total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0),
    0,
  );
  const meta = buildPrintMeta(bundles);
  const applyPrintAttrs = () => {
    const root = document.documentElement;
    root.dataset.printLayout = settings.layout;
    root.dataset.printDensity = settings.density;
    root.dataset.printColor = settings.color;
    root.dataset.printPaper = settings.paper;
    root.dataset.printOrientation = settings.orientation;
    root.style.setProperty("--print-font", `${settings.fontSize}pt`);
    root.style.setProperty("--print-margin", `${settings.margin}mm`);
    root.style.setProperty(
      "--print-top-margin",
      `${settings.topMargin ?? 8}mm`,
    );
    root.style.setProperty(
      "--print-bottom-margin",
      `${settings.bottomMargin ?? 14}mm`,
    );
    const bandText = (zone: "header" | "footer", index: number) => {
      const slot = bands[zone][index];
      return slot.content === "page" ? "" : slotText(slot, meta, printedAt);
    };
    delete root.dataset.printPageSlot;
    for (const zone of ["header", "footer"] as const)
      for (let index = 0; index < 3; index++) {
        const side = ["left", "center", "right"][index];
        const property = `--print-${zone}-${side}`;
        const slot = bands[zone][index];
        if (slot.content === "page") {
          root.style.removeProperty(property);
          root.dataset.printPageSlot = `${zone}-${side}`;
        } else
          root.style.setProperty(
            property,
            JSON.stringify(bandText(zone, index)),
          );
      }
  };
  const openNativePrint = async () => {
    if (!count) return;
    setExporting(true);
    setExportProgress({ value: 18, label: "正在整理选稿池与排版设置…" });
    applyPrintAttrs();
    try {
      setExportProgress({
        value: 62,
        label: `正在准备 ${count} 句矢量文字与分页…`,
      });
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      setExportProgress({ value: 100, label: "正在打开系统打印面板…" });
      await new Promise((resolve) => setTimeout(resolve, 120));
      // The progress layer must be gone before Chromium snapshots the print tree.
      setExporting(false);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      window.print();
      onNotice("可在系统面板中打印或保存为 PDF");
    } catch (error) {
      console.error(error);
      onNotice("打印稿准备失败，请稍后重试");
    } finally {
      setExporting(false);
    }
  };
  const moveBundle = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= bundles.length) return;
    const next = [...bundles];
    [next[index], next[target]] = [next[target], next[index]];
    setBundles(next);
  };
  const applyDensity = (density: PrintSettings["density"]) =>
    setSettings({
      ...settings,
      density,
      ...(density === "comfortable"
        ? {
            fontSize: 11,
            speakerSize: 8,
            numberSize: 6.5,
            lineGap: 0.7,
            sceneGap: 1.6,
          }
        : density === "compact"
          ? {
              fontSize: 9,
              speakerSize: 7,
              numberSize: 6,
              lineGap: 0.35,
              sceneGap: 1,
            }
          : {
              fontSize: 7.5,
              speakerSize: 6,
              numberSize: 5,
              lineGap: 0.1,
              sceneGap: 0.45,
              margin: Math.max(10, settings.margin),
            }),
    });
  return (
    <>
      <Modal
        wide
        title="打印排版"
        eyebrow={`${bundles.length} SOURCES · ${count} LINES`}
        onClose={onClose}
      >
        <div className="print-studio">
          <section className="print-options-panel">
            <div className="print-context-summary">
              <strong>{meta.chapter}</strong>
              <span>
                {bundles.length} 项来源 · {count} 句
              </span>
            </div>
            <PrintGroup title="版式">
              <Segment
                value={
                  ["parallel", "stacked"].includes(settings.layout)
                    ? settings.layout
                    : "parallel"
                }
                onChange={(v) =>
                  setSettings({
                    ...settings,
                    layout: v as PrintSettings["layout"],
                  })
                }
                options={[
                  ["parallel", "并列"],
                  ["stacked", "上下"],
                ]}
              />
            </PrintGroup>
            <PrintGroup title="密度预设">
              <Segment
                value={settings.density}
                onChange={(v) => applyDensity(v as PrintSettings["density"])}
                options={[
                  ["comfortable", "一般 · 11pt"],
                  ["compact", "紧凑 · 9pt"],
                  ["ultra", "超紧凑 · 7.5pt"],
                ]}
              />
            </PrintGroup>
            <PrintGroup title="说话人排版">
              <Segment
                value={settings.speakerLayout || "column"}
                onChange={(v) =>
                  setSettings({
                    ...settings,
                    speakerLayout: v as PrintSettings["speakerLayout"],
                  })
                }
                options={[
                  ["column", "独立窄列"],
                  ["inline", "名字行内"],
                ]}
              />
            </PrintGroup>
            <div className="print-grid">
              <PrintGroup title="纸张">
                <select
                  value={settings.paper}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      paper: e.target.value as PrintSettings["paper"],
                    })
                  }
                >
                  <option value="a4">A4</option>
                  <option value="a5">A5</option>
                  <option value="letter">Letter</option>
                </select>
              </PrintGroup>
              <PrintGroup title="方向">
                <select
                  value={settings.orientation}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      orientation: e.target
                        .value as PrintSettings["orientation"],
                    })
                  }
                >
                  <option value="portrait">纵向</option>
                  <option value="landscape">横向</option>
                </select>
              </PrintGroup>
            </div>
            <details
              className="print-settings-section"
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
            >
              <summary>
                <span>
                  <strong>高级排版</strong>
                  <small>字号、间距与栏宽</small>
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="print-settings-grid">
                <PrintGroup title={`正文字号 · ${settings.fontSize}pt`}>
                  <CommitRange
                    min={7}
                    max={13}
                    value={settings.fontSize}
                    onCommit={(value) =>
                      setSettings({ ...settings, fontSize: value })
                    }
                  />
                </PrintGroup>
                <PrintGroup
                  title={`说话人字号 · ${settings.speakerSize ?? 7}pt`}
                >
                  <CommitRange
                    min={5}
                    max={12}
                    step={0.5}
                    value={settings.speakerSize ?? 7}
                    onCommit={(value) =>
                      setSettings({ ...settings, speakerSize: value })
                    }
                  />
                </PrintGroup>
                {settings.speakerLayout === "column" && (
                  <PrintGroup
                    title={`说话人列宽 · ${settings.speakerWidth ?? 14}mm`}
                  >
                    <CommitRange
                      min={8}
                      max={24}
                      value={settings.speakerWidth ?? 14}
                      onCommit={(value) =>
                        setSettings({ ...settings, speakerWidth: value })
                      }
                    />
                  </PrintGroup>
                )}
                <PrintGroup title={`序号字号 · ${settings.numberSize ?? 6}pt`}>
                  <CommitRange
                    min={4}
                    max={10}
                    step={0.5}
                    value={settings.numberSize ?? 6}
                    onCommit={(value) =>
                      setSettings({ ...settings, numberSize: value })
                    }
                  />
                </PrintGroup>
                <PrintGroup
                  title={`场景标题 · ${settings.sceneTitleSize ?? 9}pt`}
                >
                  <CommitRange
                    min={6}
                    max={16}
                    step={0.5}
                    value={settings.sceneTitleSize ?? 9}
                    onCommit={(value) =>
                      setSettings({ ...settings, sceneTitleSize: value })
                    }
                  />
                </PrintGroup>
                <PrintGroup
                  title={`封面标题 · ${settings.coverTitleSize ?? 15}pt`}
                >
                  <CommitRange
                    min={10}
                    max={30}
                    value={settings.coverTitleSize ?? 15}
                    onCommit={(value) =>
                      setSettings({ ...settings, coverTitleSize: value })
                    }
                  />
                </PrintGroup>
                <PrintGroup title={`行间距 · ${settings.lineGap ?? 1}mm`}>
                  <CommitRange
                    min={0}
                    max={4}
                    step={0.25}
                    value={settings.lineGap ?? 1}
                    onCommit={(value) =>
                      setSettings({ ...settings, lineGap: value })
                    }
                  />
                </PrintGroup>
                <PrintGroup title={`场景间距 · ${settings.sceneGap ?? 1.5}mm`}>
                  <CommitRange
                    min={0}
                    max={8}
                    step={0.5}
                    value={settings.sceneGap ?? 1.5}
                    onCommit={(value) =>
                      setSettings({ ...settings, sceneGap: value })
                    }
                  />
                </PrintGroup>
                <PrintGroup title={`安全页边距 · ${settings.margin}mm`}>
                  <CommitRange
                    min={8}
                    max={24}
                    step={2}
                    value={settings.margin}
                    onCommit={(value) =>
                      setSettings({ ...settings, margin: value })
                    }
                  />
                  <small
                    className={
                      settings.margin < 10 ? "margin-warning" : "margin-safe"
                    }
                  >
                    {settings.margin < 10
                      ? "部分打印机可能裁切页眉页脚"
                      : "页眉、页脚位于安全区域内"}
                  </small>
                </PrintGroup>
                <PrintGroup title={`顶部留白 · ${settings.topMargin ?? 8}mm`}>
                  <CommitRange
                    min={5}
                    max={20}
                    value={settings.topMargin ?? 8}
                    onCommit={(value) =>
                      setSettings({ ...settings, topMargin: value })
                    }
                  />
                </PrintGroup>
                <PrintGroup
                  title={`底部留白 · ${settings.bottomMargin ?? 14}mm`}
                >
                  <CommitRange
                    min={8}
                    max={28}
                    value={settings.bottomMargin ?? 14}
                    onCommit={(value) =>
                      setSettings({ ...settings, bottomMargin: value })
                    }
                  />
                </PrintGroup>
                {settings.layout === "parallel" && (
                  <PrintGroup
                    title={`中外文栏宽 · ${settings.columnRatio ?? 50} / ${100 - (settings.columnRatio ?? 50)}`}
                  >
                    <div className="ratio-setting">
                      <CommitRange
                        min={25}
                        max={75}
                        value={settings.columnRatio ?? 50}
                        onCommit={(value) =>
                          setSettings({ ...settings, columnRatio: value })
                        }
                      />
                      <button
                        onClick={() =>
                          setSettings({ ...settings, columnRatio: 50 })
                        }
                      >
                        <RotateCcw size={14} />
                        恢复均分
                      </button>
                    </div>
                  </PrintGroup>
                )}
              </div>
            </details>
            <button
              className="reset-settings print-reset"
              onClick={() => setSettings(structuredClone(DEFAULT_PRINT))}
            >
              <RotateCcw size={15} />
              恢复全部打印默认设置
            </button>
            <details
              className="print-settings-section"
              open={pageOpen}
              onToggle={(e) => setPageOpen(e.currentTarget.open)}
            >
              <summary>
                <span>
                  <strong>页面元素</strong>
                  <small>颜色、标题、引入文本及页眉页脚</small>
                </span>
                <ChevronDown size={16} />
              </summary>
              <div className="print-settings-grid">
                <PrintGroup title="颜色">
                  <Segment
                    value={settings.color}
                    onChange={(v) =>
                      setSettings({
                        ...settings,
                        color: v as PrintSettings["color"],
                      })
                    }
                    options={[
                      ["full", "彩色"],
                      ["accent", "省墨"],
                      ["mono", "黑白"],
                    ]}
                  />
                </PrintGroup>
                <div className="print-toggles">
                  <ToggleLine
                    label="封面"
                    value={settings.cover}
                    set={(v) => setSettings({ ...settings, cover: v })}
                  />
                  <ToggleLine
                    label="场景标题"
                    value={settings.sceneTitles}
                    set={(v) => setSettings({ ...settings, sceneTitles: v })}
                  />
                  <ToggleLine
                    label="场景引入文本"
                    value={settings.sceneLeads !== false}
                    set={(v) => setSettings({ ...settings, sceneLeads: v })}
                  />
                  <ToggleLine
                    label="说话人"
                    value={settings.speakers}
                    set={(v) => setSettings({ ...settings, speakers: v })}
                  />
                  <ToggleLine
                    label="行号"
                    value={settings.lineNumbers}
                    set={(v) => setSettings({ ...settings, lineNumbers: v })}
                  />
                </div>
                <PrintBandEditor
                  bands={bands}
                  onChange={(next) => setSettings({ ...settings, bands: next })}
                />
              </div>
            </details>
          </section>
          <PrintPreview
            bundles={bundles}
            languages={languages}
            traveler={traveler}
            settings={settings}
            setSettings={setSettings}
            printedAt={printedAt}
          />
        </div>
        <div className="print-footer">
          <div>
            <button
              className="secondary-action"
              onClick={openNativePrint}
              disabled={!count || exporting}
            >
              <Printer size={16} />
              系统打印
            </button>
            <button
              className="primary-action"
              onClick={openNativePrint}
              disabled={!count || exporting}
            >
              {exporting ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <FileDown size={16} />
              )}
              {exporting ? "正在准备…" : "保存矢量 PDF"}
            </button>
          </div>
        </div>
      </Modal>
      {exporting && (
        <div className="progress-overlay">
          <section>
            <span>PRINT COMPOSITOR</span>
            <LoaderCircle className="spin" size={28} />
            <h3>正在准备打印稿</h3>
            <p>{exportProgress.label}</p>
            <div className="progress-track">
              <i style={{ width: `${exportProgress.value}%` }} />
            </div>
            <small>{exportProgress.value}%</small>
          </section>
        </div>
      )}
      <div className="print-only-root">
        <PrintDocument
          bundles={bundles}
          languages={languages}
          traveler={traveler}
          settings={settings}
          printedAt={printedAt}
        />
      </div>
    </>
  );
}

function BasketSheet({
  bundles,
  setBundles,
  onClose,
  onPrint,
}: {
  bundles: PrintBundle[];
  setBundles: (next: PrintBundle[]) => void;
  onClose: () => void;
  onPrint: () => void;
}) {
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  const previousRects = useRef(new Map<string, DOMRect>());
  const rememberPositions = () => {
    previousRects.current = new Map(
      [...itemRefs.current].map(([key, node]) => [
        key,
        node.getBoundingClientRect(),
      ]),
    );
  };
  const moveDuringDrag = (target: number) => {
    if (!draggedKey) return;
    const source = bundles.findIndex((item) => item.key === draggedKey);
    if (source < 0 || source === target) return;
    rememberPositions();
    const next = [...bundles];
    const [item] = next.splice(source, 1);
    next.splice(target, 0, item);
    setBundles(next);
  };
  useLayoutEffect(() => {
    for (const [key, node] of itemRefs.current) {
      const before = previousRects.current.get(key);
      if (!before) continue;
      const after = node.getBoundingClientRect();
      const delta = before.top - after.top;
      if (Math.abs(delta) > 1)
        node.animate(
          [
            { transform: `translateY(${delta}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 190, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
    }
    previousRects.current.clear();
  }, [bundles.map((item) => item.key).join("|")]);
  return (
    <Modal
      title="选稿池"
      eyebrow={`${bundles.length} SOURCES · ${bundles.reduce((n, b) => n + b.scenes.reduce((m, s) => m + s.lines.length, 0), 0)} LINES`}
      onClose={onClose}
    >
      <div className="basket-sheet">
        <p className="basket-help">
          <Info size={15} />
          这里仅整理内容；拖动时项目会实时让位，松开即确认当前顺序。
        </p>
        <div className="basket-items">
          {bundles.map((bundle, index) => (
            <article
              ref={(node) => {
                if (node) itemRefs.current.set(bundle.key, node);
                else itemRefs.current.delete(bundle.key);
              }}
              draggable
              onDragStart={(event) => {
                setDraggedKey(bundle.key);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragEnter={() => moveDuringDrag(index)}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragEnd={() => setDraggedKey(null)}
              onDrop={(event) => {
                event.preventDefault();
                setDraggedKey(null);
              }}
              className={draggedKey === bundle.key ? "dragging" : ""}
              key={bundle.key}
            >
              <GripVertical size={19} />
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{bundle.quest.title.zh}</strong>
                <small>
                  {TYPE_NAMES[bundle.taskType || ""] || "剧情任务"} ·{" "}
                  {bundle.chapter.number.zh} · Chapter {bundle.quest.order} ·{" "}
                  {bundle.scenes.length} 场景 ·{" "}
                  {bundle.scenes.reduce((n, s) => n + s.lines.length, 0)} 句
                </small>
              </div>
              <button
                onClick={() =>
                  setBundles(bundles.filter((item) => item.key !== bundle.key))
                }
                aria-label="移除"
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
        <footer>
          <button
            className="danger-action"
            disabled={!bundles.length}
            onClick={() => setBundles([])}
          >
            <Trash2 size={15} />
            清空全部
          </button>
          <span />
          <button onClick={onClose}>继续选稿</button>
          <button
            className="primary-action"
            disabled={!bundles.length}
            onClick={onPrint}
          >
            <Printer size={16} />
            进入打印排版
          </button>
        </footer>
      </div>
    </Modal>
  );
}

function PrintPreview({
  bundles,
  languages,
  traveler,
  settings,
  setSettings,
  printedAt,
}: {
  bundles: PrintBundle[];
  languages: LanguageCode[];
  traveler: Traveler;
  settings: PrintSettings;
  setSettings: (settings: PrintSettings) => void;
  printedAt: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(52);
  const dimensions =
    settings.paper === "a5"
      ? [559, 794]
      : settings.paper === "letter"
        ? [816, 1056]
        : [794, 1123];
  const [pageWidth, pageHeight] =
    settings.orientation === "landscape"
      ? [dimensions[1], dimensions[0]]
      : dimensions;
  const marginPx = (settings.margin * 96) / 25.4;
  const topMarginPx = ((settings.topMargin ?? 8) * 96) / 25.4;
  const bottomMarginPx = ((settings.bottomMargin ?? 14) * 96) / 25.4;
  const printableWidth = Math.max(1, pageWidth - marginPx * 2);
  const printableHeight = Math.max(
    1,
    pageHeight - topMarginPx - bottomMarginPx,
  );
  useEffect(() => {
    const measure = () => {
      const next = Math.max(
        1,
        Math.ceil(
          (contentRef.current?.scrollHeight || printableHeight) /
            printableHeight,
        ),
      );
      setPages(next);
      setPage((current) => Math.min(current, next - 1));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (contentRef.current) observer.observe(contentRef.current);
    void document.fonts.ready.then(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [bundles, languages, settings, printableHeight]);
  const resizePrintColumns = (
    event: React.PointerEvent<HTMLButtonElement>,
    half: "full" | "left" | "right",
  ) => {
    event.preventDefault();
    const handle = event.currentTarget;
    let pending = settings.columnRatio ?? 50;
    const update = (clientX: number) => {
      const rect = paperRef.current?.getBoundingClientRect();
      if (!rect) return;
      const normalized = (clientX - rect.left) / rect.width;
      const raw =
        half === "left"
          ? normalized * 200
          : half === "right"
            ? (normalized - 0.5) * 200
            : normalized * 100;
      pending = Math.round(Math.min(75, Math.max(25, raw)));
      handle.style.left = `${half === "left" ? pending / 2 : half === "right" ? 50 + pending / 2 : pending}%`;
      paperRef.current?.style.setProperty("--preview-left", `${pending}fr`);
      paperRef.current?.style.setProperty(
        "--preview-right",
        `${100 - pending}fr`,
      );
    };
    const move = (next: PointerEvent) => update(next.clientX);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      setSettings({ ...settings, columnRatio: pending });
    };
    update(event.clientX);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const ratio = settings.columnRatio ?? 50;
  useLayoutEffect(() => {
    const paper = paperRef.current;
    const documentNode = contentRef.current;
    if (paper) {
      paper.style.setProperty("--preview-left", `${ratio}fr`);
      paper.style.setProperty("--preview-right", `${100 - ratio}fr`);
    }
    if (documentNode)
      documentNode.style.top = `${(topMarginPx * zoom) / 100}px`;
  }, [ratio, topMarginPx, zoom]);
  const previewMeta = buildPrintMeta(bundles);
  const fitWidth = () => {
    const host = paperRef.current?.parentElement;
    if (!host) return;
    setZoom(
      Math.max(
        32,
        Math.min(200, Math.floor(((host.clientWidth - 32) / pageWidth) * 100)),
      ),
    );
  };
  const previewSlot = (slot: PrintSlot) =>
    slot.content === "page"
      ? `${page + 1} / ${pages}`
      : slotText(slot, previewMeta, printedAt);
  return (
    <section className="print-preview-wrap">
      <div className="preview-label">
        <span>完整分页预览</span>
        <em>
          {settings.paper.toUpperCase()} ·{" "}
          {settings.density === "ultra"
            ? "超紧凑四栏"
            : settings.density === "compact"
              ? "紧凑"
              : "一般"}
        </em>
      </div>
      <div className="preview-toolbar">
        <button
          disabled={page === 0}
          onClick={() => setPage((value) => value - 1)}
        >
          <ArrowLeft size={15} />
          上一页
        </button>
        <strong>
          {page + 1} / {pages}
        </strong>
        <button
          disabled={page === pages - 1}
          onClick={() => setPage((value) => value + 1)}
        >
          下一页
          <ArrowRight size={15} />
        </button>
        <span />
        <button className="zoom-preset" onClick={fitWidth}>
          适合页宽
        </button>
        <button className="zoom-preset" onClick={() => setZoom(100)}>
          100%
        </button>
        <button onClick={() => setZoom((value) => Math.max(32, value - 10))}>
          <ZoomOut size={15} />
        </button>
        <em>{zoom}%</em>
        <button onClick={() => setZoom((value) => Math.min(200, value + 10))}>
          <ZoomIn size={15} />
        </button>
        <button
          title="恢复中外文均分"
          onClick={() => setSettings({ ...settings, columnRatio: 50 })}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div className="preview-canvas">
        <div
          ref={paperRef}
          className="preview-paper"
          style={{
            width: (pageWidth * zoom) / 100,
            height: (pageHeight * zoom) / 100,
          }}
        >
          <div
            ref={contentRef}
            className="preview-document"
            style={{
              width: printableWidth,
              left: (marginPx * zoom) / 100,
              top: (marginPx * zoom) / 100,
              transform: `scale(${zoom / 100}) translateY(-${page * printableHeight}px)`,
            }}
          >
            <PrintDocument
              bundles={bundles}
              languages={languages}
              traveler={traveler}
              settings={settings}
              printedAt={printedAt}
            />
          </div>
          {(["header", "footer"] as const).map((zone) => (
            <div className={`preview-running-band ${zone}`} key={zone}>
              {(settings.bands || DEFAULT_PRINT.bands)[zone].map((slot) => (
                <span key={slot.id}>{previewSlot(slot)}</span>
              ))}
            </div>
          ))}
          {settings.layout === "parallel" &&
            (settings.density === "ultra" ? (
              <>
                <button
                  className="preview-column-divider"
                  style={{ left: `${ratio / 2}%` }}
                  onPointerDown={(event) => resizePrintColumns(event, "left")}
                  aria-label="调整左组中外文栏宽"
                >
                  <GripVertical size={11} />
                </button>
                <button
                  className="preview-column-divider"
                  style={{ left: `${50 + ratio / 2}%` }}
                  onPointerDown={(event) => resizePrintColumns(event, "right")}
                  aria-label="调整右组中外文栏宽"
                >
                  <GripVertical size={11} />
                </button>
              </>
            ) : (
              <button
                className="preview-column-divider"
                style={{ left: `${ratio}%` }}
                onPointerDown={(event) => resizePrintColumns(event, "full")}
                aria-label="调整中外文栏宽"
              >
                <GripVertical size={11} />
              </button>
            ))}
          {!(settings.bands || DEFAULT_PRINT.bands).header
            .concat((settings.bands || DEFAULT_PRINT.bands).footer)
            .some((slot) => slot.content === "page") && (
            <span className="preview-page-number">
              {page + 1} / {pages}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

type PrintMeta = ReturnType<typeof buildPrintMeta>;
const slotText = (slot: PrintSlot, meta: PrintMeta, printedAt: string) =>
  ({
    none: "",
    chapter: meta.chapter,
    quest: meta.quest,
    printedAt,
    version: APP_VERSION,
    page: "",
    custom: slot.custom,
  })[slot.content];
const RunningBand = forwardRef<
  HTMLDivElement,
  { slots: PrintSlot[]; meta: PrintMeta; printedAt: string; className?: string }
>(({ slots, meta, printedAt, className = "" }, ref) => (
  <div ref={ref} className={`running-band ${className}`}>
    {slots.map((slot) => (
      <span key={slot.id} data-page-slot={slot.content === "page" || undefined}>
        {slot.content === "page" ? (
          <span className="page-counter" />
        ) : (
          slotText(slot, meta, printedAt)
        )}
      </span>
    ))}
  </div>
));

const PrintDocument = forwardRef<
  HTMLDivElement,
  {
    bundles: PrintBundle[];
    languages: LanguageCode[];
    traveler: Traveler;
    settings: PrintSettings;
    printedAt: string;
    hideBands?: boolean;
  }
>(
  (
    { bundles, languages, traveler, settings, printedAt, hideBands = false },
    ref,
  ) => {
    const meta = buildPrintMeta(bundles);
    const sceneCount = bundles.reduce(
      (total, bundle) => total + bundle.scenes.length,
      0,
    );
    const lineCount = bundles.reduce(
      (total, bundle) =>
        total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0),
      0,
    );
    const shownLanguages = languages.slice(0, 3);
    const printLayout = ["parallel", "stacked"].includes(settings.layout)
      ? settings.layout
      : "parallel";
    const globalNumbers = new Map<string, number>();
    let globalLine = 0;
    bundles.forEach((bundle) =>
      bundle.scenes.forEach((scene) =>
        scene.lines.forEach((line) =>
          globalNumbers.set(
            `${bundle.key}:${scene.key}:${line.key}`,
            ++globalLine,
          ),
        ),
      ),
    );
    return (
      <div
        ref={ref}
        data-language-count={shownLanguages.length}
        className={`print-document density-${settings.density} layout-${printLayout} color-${settings.color} speaker-${settings.speakerLayout || "column"} ${settings.lineNumbers ? "" : "no-line-numbers"}`}
        style={
          {
            "--doc-font": `${settings.fontSize}pt`,
            "--speaker-font": `${settings.speakerSize ?? 7}pt`,
            "--speaker-width": `${settings.speakerWidth ?? 14}mm`,
            "--number-font": `${settings.numberSize ?? 6}pt`,
            "--scene-title-font": `${settings.sceneTitleSize ?? 9}pt`,
            "--cover-title-font": `${settings.coverTitleSize ?? 15}pt`,
            "--line-gap": `${settings.lineGap ?? 1}mm`,
            "--scene-gap": `${settings.sceneGap ?? 1.5}mm`,
            "--print-language-count": shownLanguages.length,
            "--print-column-ratio": `${settings.columnRatio ?? 50}`,
          } as React.CSSProperties
        }
      >
        {!hideBands && (
          <>
            <RunningBand
              slots={(settings.bands || DEFAULT_PRINT.bands).header}
              meta={meta}
              printedAt={printedAt}
              className="print-running-header"
            />
            <RunningBand
              slots={(settings.bands || DEFAULT_PRINT.bands).footer}
              meta={meta}
              printedAt={printedAt}
              className="print-running-footer"
            />
          </>
        )}
        {settings.cover && (
          <header className="print-cover-page">
            <span>TEYVAT SCRIPTORIUM · MULTILINGUAL SCRIPT</span>
            <div className="print-hierarchy">
              <small>国家 / NATION</small>
              <strong>{bundles[0]?.chapter.region.zh || "跨地区"}</strong>
              <em>{bundles[0]?.chapter.region.en || "Multiple Regions"}</em>
              <small>章幕 / ACT</small>
              <strong>{bundles[0]?.chapter.number.zh}</strong>
              <em>{bundles[0]?.chapter.number.en}</em>
            </div>
            <h1>{meta.chapter}</h1>
            <h2>{meta.chapterEn}</h2>
            <div className="print-episode">
              <small>章节 / CHAPTER {bundles[0]?.quest.order}</small>
              <strong>{meta.quest}</strong>
              <em>{meta.questEn}</em>
            </div>
            {settings.sceneLeads !== false &&
              bundles[0]?.quest.description.zh && (
                <div className="print-quest-lead">
                  {shownLanguages.map((lang) => (
                    <p key={lang}>
                      {localized(bundles[0].quest.description, lang)}
                    </p>
                  ))}
                </div>
              )}
            <small>
              {[
                ...new Set(
                  bundles
                    .map(
                      (bundle) =>
                        TYPE_NAMES[bundle.taskType || ""] || bundle.taskType,
                    )
                    .filter(Boolean),
                ),
              ].join(" / ") || "剧情任务"}{" "}
              · {bundles.length} 项来源 · {sceneCount} 个场景 · {lineCount}{" "}
              句选稿
            </small>
          </header>
        )}
        {bundles.map((bundle, bundleIndex) => (
          <section className="print-source" key={bundle.key}>
            {bundles.length > 1 && (
              <header className="print-source-header">
                <span>PART {String(bundleIndex + 1).padStart(2, "0")}</span>
                <div className="print-source-context">
                  <small>国家 / NATION</small>
                  <strong>{bundle.chapter.region.zh}</strong>
                  <em>{bundle.chapter.region.en}</em>
                  <small>章幕 / ACT</small>
                  <strong>
                    {bundle.chapter.number.zh} · {bundle.chapter.title.zh}
                  </strong>
                  <em>
                    {bundle.chapter.number.en} · {bundle.chapter.title.en}
                  </em>
                  <small>章节 / CHAPTER {bundle.quest.order}</small>
                  <strong>{bundle.quest.title.zh}</strong>
                  <em>{bundle.quest.title.en}</em>
                </div>
              </header>
            )}
            {bundle.scenes.map((scene, si) => {
              const renderedLines = scene.lines.map((line, li) => {
                const previous = scene.lines[li - 1];
                const repeatedSpeaker = Boolean(
                  li &&
                  line.speaker.zh &&
                  line.speaker.zh === previous?.speaker.zh &&
                  line.speaker.en === previous?.speaker.en,
                );
                let optionIndex = 0;
                if (line.kind === "choice")
                  for (
                    let cursor = li - 1;
                    cursor >= 0 && scene.lines[cursor].kind === "choice";
                    cursor--
                  )
                    optionIndex++;
                let optionTotal = line.kind === "choice" ? optionIndex + 1 : 0;
                if (line.kind === "choice")
                  for (
                    let cursor = li + 1;
                    cursor < scene.lines.length &&
                    scene.lines[cursor].kind === "choice";
                    cursor++
                  )
                    optionTotal++;
                if (line.branchGroupId) {
                  optionIndex = line.branchIndex ?? 0;
                  optionTotal = line.branchTotal ?? 0;
                }
                const ratio = settings.columnRatio ?? 50;
                const languageColumns =
                  shownLanguages.length === 2
                    ? `minmax(0,${ratio}fr) minmax(0,${100 - ratio}fr)`
                    : `repeat(${shownLanguages.length},minmax(0,1fr))`;
                const columns =
                  printLayout === "stacked"
                    ? settings.lineNumbers
                      ? "32px minmax(0,1fr)"
                      : "minmax(0,1fr)"
                    : settings.lineNumbers
                      ? `32px ${languageColumns}`
                      : languageColumns;
                const overall =
                  globalNumbers.get(`${bundle.key}:${scene.key}:${line.key}`) ||
                  li + 1;
                const isLongPrintLine =
                  shownLanguages.reduce(
                    (length, lang) =>
                      length + localized(line.text, lang).length,
                    0,
                  ) > 170;
                return (
                  <div
                    className={`print-line kind-${line.kind} ${isLongPrintLine ? "long-line" : ""} ${line.branchRole === "option" && optionTotal > 1 ? `choice-option choice-tone-${optionIndex % 4}` : ""} ${line.branchRole ? `print-branch-${line.branchRole} print-branch-${line.branchFlow}` : ""} ${line.kind === "choice" && optionTotal > 1 && optionIndex === 0 ? "choice-start" : ""} ${repeatedSpeaker ? "same-speaker" : ""}`}
                    style={{ gridTemplateColumns: columns }}
                    key={line.key}
                  >
                    {settings.lineNumbers && (
                      <span className="print-number">
                        <b>
                          {line.branchRole === "option" && optionTotal > 1
                            ? `${optionIndex + 1}/${optionTotal}`
                            : line.branchRole === "response"
                              ? "回应"
                              : String(li + 1).padStart(3, "0")}
                        </b>
                        <small>
                          {overall}/{lineCount}
                        </small>
                      </span>
                    )}
                    {shownLanguages.map((lang) => (
                      <div
                        className={`print-cell lang-${lang.toLowerCase()}`}
                        key={lang}
                      >
                        {settings.speakers &&
                          !repeatedSpeaker &&
                          localized(line.speaker, lang) && (
                            <strong>{localized(line.speaker, lang)}</strong>
                          )}
                        <p>
                          {formatGameText(localized(line.text, lang), traveler)}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              });
              const content =
                settings.density === "ultra" && printLayout === "parallel"
                  ? Array.from(
                      { length: Math.ceil(renderedLines.length / 2) },
                      (_, row) => (
                        <div className="print-ultra-row" key={row}>
                          {renderedLines.slice(row * 2, row * 2 + 2)}
                        </div>
                      ),
                    )
                  : renderedLines;
              return (
                <section
                  className="print-scene"
                  key={`${bundle.key}:${scene.key}`}
                >
                  {settings.sceneTitles && (
                    <header className="print-scene-header">
                      <span>
                        EPISODE {String(si + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>
                          {localized(scene.title, shownLanguages[0])}
                        </strong>
                        {shownLanguages.slice(1).map((lang) => (
                          <small key={lang}>
                            {localized(scene.title, lang)}
                          </small>
                        ))}
                      </div>
                    </header>
                  )}
                  {settings.sceneLeads !== false && scene.description.zh && (
                    <div className="print-scene-lead">
                      {shownLanguages
                        .map((lang) => localized(scene.description, lang))
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  <div className="print-scene-lines">{content}</div>
                </section>
              );
            })}
          </section>
        ))}
      </div>
    );
  },
);

function PrintBandEditor({
  bands,
  onChange,
}: {
  bands: PrintSettings["bands"];
  onChange: (bands: PrintSettings["bands"]) => void;
}) {
  const [dragged, setDragged] = useState<{
    zone: "header" | "footer";
    index: number;
  } | null>(null);
  const labels = {
    none: "留空",
    chapter: "内容标题",
    quest: "当前章节",
    printedAt: "打印时间",
    version: "网站版本",
    page: "页码 / 总页数",
    custom: "自定义文字",
  };
  const changeSlot = (
    zone: "header" | "footer",
    index: number,
    slot: PrintSlot,
  ) =>
    onChange({
      ...bands,
      [zone]: bands[zone].map((item, i) => (i === index ? slot : item)),
    });
  const drop = (zone: "header" | "footer", index: number) => {
    if (!dragged) return;
    const next = { header: [...bands.header], footer: [...bands.footer] };
    const a = next[dragged.zone][dragged.index];
    const b = next[zone][index];
    next[dragged.zone][dragged.index] = b;
    next[zone][index] = a;
    onChange(next);
    setDragged(null);
  };
  const previewSwap = (zone: "header" | "footer", index: number) => {
    if (!dragged || (dragged.zone === zone && dragged.index === index)) return;
    const next = { header: [...bands.header], footer: [...bands.footer] };
    const source = next[dragged.zone][dragged.index];
    next[dragged.zone][dragged.index] = next[zone][index];
    next[zone][index] = source;
    onChange(next);
    setDragged({ zone, index });
  };
  return (
    <PrintGroup title="页眉与页脚 · 拖动卡片可换位">
      <div className="band-editor">
        {(["header", "footer"] as const).map((zone) => (
          <div className="band-row" key={zone}>
            <strong>{zone === "header" ? "页眉" : "页脚"}</strong>
            {bands[zone].map((slot, index) => (
              <div
                className="band-slot"
                draggable
                key={slot.id}
                onDragStart={() => setDragged({ zone, index })}
                onDragEnter={() => previewSwap(zone, index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(zone, index)}
              >
                <GripVertical size={13} />
                <span>{["左", "中", "右"][index]}</span>
                <select
                  value={slot.content}
                  onChange={(e) =>
                    changeSlot(zone, index, {
                      ...slot,
                      content: e.target.value as PrintSlot["content"],
                    })
                  }
                >
                  {Object.entries(labels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {slot.content === "custom" && (
                  <input
                    value={slot.custom}
                    maxLength={40}
                    placeholder="输入文字"
                    onChange={(e) =>
                      changeSlot(zone, index, {
                        ...slot,
                        custom: e.target.value,
                      })
                    }
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </PrintGroup>
  );
}

function Modal({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className={wide ? "modal wide" : "modal"}
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {eyebrow === "CHANGELOG" && (
          <div className="changelog changelog-latest">
            <article>
              <span>v0.8.1 · 2026-08-13</span>
              <h3>分页一致、完整归属与分支校验</h3>
              <ul>
                <li>
                  修复超紧凑预览与实际 PDF 页数不一致的问题，预览与矢量输出统一使用同一套分页规则
                </li>
                <li>
                  跨任务打印为每一项补齐国家、Act、Chapter 与 Episode 的中英文分行归属信息
                </li>
                <li>
                  单 Chapter 标题纳入序号，三选项、三种差异回应及共同后续加入真实数据回归校验
                </li>
                <li>
                  打印入口统一命名为“打印排版”，去除已完成选稿后仍出现的旧“选稿台”含义
                </li>
              </ul>
            </article>
          </div>
        )}
        {children}
      </section>
    </div>
  );
}
function SettingRow({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
      </div>
      {children}
    </div>
  );
}
function Segment({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[][];
}) {
  return (
    <div className="segment">
      {options.map(([v, l]) => (
        <button
          className={value === v ? "active" : ""}
          onClick={() => onChange(v)}
          key={v}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={checked ? "switch on" : "switch"}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
function PrintGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="print-group">
      <label>{title}</label>
      {children}
    </div>
  );
}
function CommitRange({
  value,
  onCommit,
  ...props
}: {
  value: number;
  onCommit: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => onCommit(draft);
  return (
    <input
      type="range"
      {...props}
      value={draft}
      onChange={(event) => setDraft(Number(event.target.value))}
      onPointerUp={commit}
      onKeyUp={commit}
    />
  );
}
function ToggleLine({
  label,
  value,
  set,
}: {
  label: string;
  value: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <label>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => set(e.target.checked)}
      />
      <span>{value && <Check size={11} />}</span>
      {label}
    </label>
  );
}
function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 2600);
    return () => clearTimeout(timer);
  }, [message, onClose]);
  return (
    <div className="notice-toast">
      <Check size={15} />
      <span>{message}</span>
      <button onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function Changelog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="更新日志" eyebrow="CHANGELOG" onClose={onClose}>
      <div className="changelog">
        <article>
          <span>v0.8.0 · 2026-08-13</span>
          <h3>完整层级、系列导航与可靠排印</h3>
          <ul>
            <li>旅行历程支持字体缩放、常驻定位与缩放控制，全站主题统一为浅色、深色、自动三态</li>
            <li>魔神、传说、邀约及连续世界任务统一提供系列上一项与下一项导航</li>
            <li>对话图区分提问、1/X 选项、差异回应与共同后续，避免将顺序对白误判为分支</li>
            <li>阅读与打印栏宽采用实时样式变量更新，并修复三语栏宽调整</li>
            <li>打印排版加入恢复默认、实时页眉页脚排序和独立上下安全边距</li>
          </ul>
        </article>
        <article>
          <span>v0.7.0 · 2026-08-13</span>
          <h3>完整邀约、语义分支与打印工作台</h3>
          <ul>
            <li>收录 19 个邀约事件，补充角色、版本和剧情节点，并支持站内打开正文</li>
            <li>旅行历程支持按版本或按国家排列，同版本依国家、章、幕顺序展示</li>
            <li>对话选项按真实剧情图识别，明确区分选项、分支回应与共同后续</li>
            <li>搜索等待输入法组词完成，长文本栏宽拖动改为低开销提交</li>
            <li>打印设置分组折叠，支持引入文本、页宽适配与 100% 至 200% 预览</li>
          </ul>
        </article>
        <article>
          <span>v0.6.0 · 2026-08-12</span>
          <h3>旅行历程与章幕导航</h3>
          <ul>
            <li>目录补充国家、章幕、Chapter 数量与同章幕数</li>
            <li>类型、国家和版本支持多选，排序独立显示</li>
            <li>新增邀约事件分类与横向旅行历程剧情树</li>
            <li>固定导航展示 Act，并支持 Chapter 自动居中和普通滚轮横移</li>
            <li>选稿池拖动时实时换位并平滑过渡</li>
          </ul>
        </article>
        <article>
          <span>v0.5.0 · 2026-08-12</span>
          <h3>真实分支、独立选稿池与可定制排印</h3>
          <ul>
            <li>
              仅将真实的多个旅行者选项组成分支组，以 1/X 编号和分层颜色区分
            </li>
            <li>三语并列支持两条独立拖栏，选句可直接点击整句</li>
            <li>
              选稿池与打印台分离，支持跨章节整幕加入、拖动排序及任务元数据
            </li>
            <li>
              打印支持独立说话人列，以及正文、说话人、序号、标题和间距调节
            </li>
            <li>分页预览最高放大至 200%，引导与 Toast 不再遮挡底部操作</li>
          </ul>
        </article>
        <article>
          <span>v0.4.2 · 2026-08-12</span>
          <h3>可靠分页与一屏打印工作台</h3>
          <ul>
            <li>超紧凑改为逐行双记录四栏，避免跨页 Grid 与报纸分栏裁切正文</li>
            <li>分页预览与原生打印共用纸张可印区域，228 句实测均为 3 页</li>
            <li>打印加载遮罩在系统面板打开前移除，不再被重复印入每页</li>
            <li>页边距增加安全提示，超紧凑默认至少保留 10mm</li>
            <li>行号同时显示场景内编号和全文进度 / 总数</li>
            <li>工作台改为内部滚动，桌面与手机底部打印按钮始终可见</li>
          </ul>
        </article>
        <article>
          <span>v0.4.1 · 2026-08-12</span>
          <h3>可读性、选稿与完整分页预览</h3>
          <ul>
            <li>全站字体即时同步，放大桌面和手机控件文字并修复深色选中态</li>
            <li>场景显示与定位分开，阅读筛选和选句模式不再混用状态</li>
            <li>新增首次操作引导，设置中可随时重新查看</li>
            <li>保留目录搜索、筛选、排序、加载数量和滚动位置</li>
            <li>智能生成同章、跨章和跨地区打印标题</li>
            <li>修复台词表窄栏逐字换行，并增加可拖动的中外文栏宽</li>
            <li>打印台支持完整纸张、多页翻页、缩放与手机分页预览</li>
          </ul>
        </article>
        <article>
          <span>v0.4.0 · 2026-08-12</span>
          <h3>多语言与阅读尺寸</h3>
          <ul>
            <li>15 种游戏语言按需载入，最多三语对照</li>
            <li>正文、控件与角色筛选整体放大，页面收窄居中</li>
            <li>旅行者与派蒙独立置顶，旅行者可切换空与荧</li>
            <li>新增宋体、黑体、微软雅黑和主题卡片</li>
            <li>PDF 改为可搜索、可选择的原生矢量打印</li>
          </ul>
        </article>
      </div>
    </Modal>
  );
}

export default function App() {
  const {
    catalog,
    catalogSync,
    chapter,
    setChapter,
    loadChapter,
    loading,
    loadProgress,
    error,
    setError,
  } = useData();
  const [page, setPage] = useState<"catalog" | "reader">("catalog");
  const [settings, setSettings] = useStoredState<AppSettings>(
    "teyvat:settings:v5",
    DEFAULT_SETTINGS,
  );
  const [printSettings, setPrintSettings] = useStoredState<PrintSettings>(
    "teyvat:print",
    DEFAULT_PRINT,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [basket, setBasket] = useSessionState<PrintBundle[]>(
    "teyvat:print-basket",
    [],
  );
  const [basketOpen, setBasketOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [guideRequest, setGuideRequest] = useState(0);
  const languageRef = useRef<LanguageCode[]>(
    settings.languages || ["CHS", "EN"],
  );
  languageRef.current = settings.languages || ["CHS", "EN"];
  useEffect(() => {
    if (!catalogSync.checking && (catalogSync.added || catalogSync.modified))
      setNotice(
        `剧情目录已更新 · 新增 ${catalogSync.added}，修订 ${catalogSync.modified}`,
      );
  }, [catalogSync]);
  useEffect(() => {
    const resolved =
      settings.theme === "auto"
        ? matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : settings.theme;
    document.documentElement.dataset.theme = resolved;
    if (settings.theme !== "auto") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme = media.matches ? "dark" : "light";
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [settings.theme]);
  const showLocation = async () => {
    const id = Number(new URLSearchParams(location.search).get("chapter"));
    if (id) {
      if (await loadChapter(id, languageRef.current)) setPage("reader");
    } else {
      setPage("catalog");
      setChapter(null);
      setError("");
    }
  };
  useEffect(() => {
    const initialId = Number(
      new URLSearchParams(location.search).get("chapter"),
    );
    history.replaceState(
      {
        teyvat: true,
        page: initialId ? "reader" : "catalog",
        fromCatalog: false,
      },
      "",
      location.href,
    );
    showLocation();
    const onPopState = () => {
      showLocation();
    };
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);
  const openItem = async (item: CatalogItem) => {
    if (await loadChapter(item.id, settings.languages || ["CHS", "EN"])) {
      history.pushState(
        { teyvat: true, page: "reader", fromCatalog: true },
        "",
        `?chapter=${item.id}`,
      );
      setPage("reader");
    }
  };
  useEffect(() => {
    const id = Number(new URLSearchParams(location.search).get("chapter"));
    if (page === "reader" && id)
      loadChapter(id, settings.languages || ["CHS", "EN"]);
  }, [(settings.languages || ["CHS", "EN"]).join(",")]);
  const back = () => {
    if (location.search.includes("chapter=") && history.state?.fromCatalog)
      history.back();
    else {
      history.pushState(
        { teyvat: true, page: "catalog" },
        "",
        location.pathname,
      );
      setPage("catalog");
      setChapter(null);
      setError("");
    }
  };
  const queueSelection = (
    selection: Set<string>,
    quest: Quest,
    scenes: Scene[],
  ) => {
    if (!chapter) return;
    const pickedScenes = scenes
      .map((scene) => ({
        ...scene,
        lines: scene.lines.filter((line) => selection.has(line.key)),
      }))
      .filter((scene) => scene.lines.length);
    if (!pickedScenes.length) return;
    const catalogItem = catalog?.items.find(
      (item) => item.id === chapter.chapter.id,
    );
    const bundle: PrintBundle = {
      key: `${chapter.chapter.id}:${quest.id}`,
      chapter: chapter.chapter,
      quest: {
        id: quest.id,
        order: quest.order,
        title: quest.title,
        description: quest.description,
      },
      scenes: pickedScenes,
      taskType: catalogItem?.type,
      version: catalogItem?.version,
      nation: catalogItem?.nation,
    };
    const merged = basket.some((item) => item.key === bundle.key);
    setBasket((current) => {
      const existing = current.find((item) => item.key === bundle.key);
      if (!existing) return [...current, bundle];
      const sceneMap = new Map(
        existing.scenes.map((scene) => [
          scene.key,
          { ...scene, lines: [...scene.lines] },
        ]),
      );
      for (const scene of bundle.scenes) {
        const saved = sceneMap.get(scene.key);
        if (!saved) sceneMap.set(scene.key, scene);
        else {
          const lineMap = new Map(saved.lines.map((line) => [line.key, line]));
          scene.lines.forEach((line) => lineMap.set(line.key, line));
          sceneMap.set(scene.key, { ...saved, lines: [...lineMap.values()] });
        }
      }
      return current.map((item) =>
        item.key === bundle.key
          ? { ...existing, scenes: [...sceneMap.values()] }
          : item,
      );
    });
    setNotice(
      merged
        ? "已合并到选稿池中的同一任务段"
        : `已加入选稿池 · ${pickedScenes.reduce((n, scene) => n + scene.lines.length, 0)} 句`,
    );
  };
  const currentCatalogItem = catalog?.items.find(
    (item) => item.id === chapter?.chapter.id,
  );
  const currentSeries =
    currentCatalogItem && seriesKey(currentCatalogItem)
      ? catalog?.items
          .filter(
            (item) =>
              seriesKey(item) === seriesKey(currentCatalogItem) &&
              !item.hidden &&
              !item.unreleased,
          )
          .sort((a, b) => seriesOrder(a) - seriesOrder(b))
      : [];
  const currentSeriesIndex =
    currentSeries?.findIndex((item) => item.id === currentCatalogItem?.id) ??
    -1;
  const seriesNav =
    currentSeriesIndex >= 0
      ? {
          previous: currentSeries?.[currentSeriesIndex - 1],
          next: currentSeries?.[currentSeriesIndex + 1],
          open: openItem,
        }
      : undefined;
  const queueChapter = (data: ChapterData) => {
    const catalogItem = catalog?.items.find(
      (item) => item.id === data.chapter.id,
    );
    const additions: PrintBundle[] = data.quests.map((quest) => ({
      key: `${data.chapter.id}:${quest.id}`,
      chapter: data.chapter,
      quest: {
        id: quest.id,
        order: quest.order,
        title: quest.title,
        description: quest.description,
      },
      scenes: quest.scenes,
      taskType: catalogItem?.type,
      version: catalogItem?.version,
      nation: catalogItem?.nation,
    }));
    setBasket((current) => {
      const map = new Map(current.map((item) => [item.key, item]));
      additions.forEach((item) => map.set(item.key, item));
      return [...map.values()];
    });
    setNotice(
      `已加入${data.chapter.number.zh} · ${data.quests.length} 个 Chapters`,
    );
  };
  const basketLines = basket.reduce(
    (total, bundle) =>
      total + bundle.scenes.reduce((n, scene) => n + scene.lines.length, 0),
    0,
  );
  return (
    <div className={`app-shell font-${settings.fontFamily || "serif"}`}>
      <Header
        page={page}
        theme={settings.theme}
        onTheme={(theme) => setSettings({ ...settings, theme })}
        onCatalog={() => page === "reader" && back()}
        onSettings={() => setSettingsOpen(true)}
        onChangelog={() => setChangelogOpen(true)}
      />
      {page === "catalog" && catalog && (
        <Catalog
          data={catalog}
          settings={settings}
          onOpen={openItem}
          sync={catalogSync}
          guideRequest={guideRequest}
        />
      )}
      {page === "catalog" && !catalog && !error && (
        <div className="loading-page">
          <LoaderCircle className="spin" />
          <span>正在整理任务目录…</span>
        </div>
      )}
      {page === "reader" && chapter && (
        <Reader
          data={chapter}
          settings={settings}
          setSettings={setSettings}
          onBack={back}
          onQueue={queueSelection}
          onQueueChapter={queueChapter}
          onOpenBasket={() => basket.length && setBasketOpen(true)}
          onOpenPrint={() => basket.length && setPrintOpen(true)}
          basketSources={basket.length}
          basketLines={basketLines}
          guideRequest={guideRequest}
          seriesNav={seriesNav}
        />
      )}
      {loading && (
        <div className="loading-overlay">
          <LoaderCircle className="spin" />
          <strong>正在载入剧情</strong>
          <span>{loadProgress.label}</span>
          <div className="load-progress">
            <i style={{ width: `${loadProgress.value}%` }} />
          </div>
          <small>{loadProgress.value}%</small>
        </div>
      )}
      {error && (
        <div className="error-toast">
          <span>{error}</span>
          <button
            onClick={() => {
              setError("");
              if (page === "reader" && !chapter) back();
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {settingsOpen && (
        <SettingsSheet
          value={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
          onGuide={() => {
            localStorage.removeItem("teyvat:catalog-guide:v1");
            localStorage.removeItem("teyvat:reader-guide:v1");
            for (let index = sessionStorage.length - 1; index >= 0; index--) {
              const key = sessionStorage.key(index);
              if (key?.startsWith("teyvat:scene-guide:"))
                sessionStorage.removeItem(key);
            }
            setSettingsOpen(false);
            setGuideRequest((value) => value + 1);
          }}
        />
      )}
      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}
      {basketOpen && (
        <BasketSheet
          bundles={basket}
          setBundles={(next) => {
            setBasket(next);
            if (!next.length) setBasketOpen(false);
          }}
          onClose={() => setBasketOpen(false)}
          onPrint={() => {
            setBasketOpen(false);
            setPrintOpen(true);
          }}
        />
      )}
      {printOpen && basket.length > 0 && (
        <PrintStudio
          bundles={basket}
          setBundles={(next) => {
            setBasket(next);
            if (!next.length) setPrintOpen(false);
          }}
          languages={settings.languages || ["CHS", "EN"]}
          settings={printSettings}
          setSettings={setPrintSettings}
          onClose={() => setPrintOpen(false)}
          onNotice={setNotice}
        />
      )}
      {notice && <Toast message={notice} onClose={() => setNotice("")} />}
    </div>
  );
}
