export type LanguageCode =
  | "CHS"
  | "CHT"
  | "EN"
  | "JP"
  | "KR"
  | "DE"
  | "ES"
  | "FR"
  | "ID"
  | "PT"
  | "RU"
  | "TH"
  | "VI"
  | "IT"
  | "TR";
export type LanguagePair = {
  zh: string;
  en: string;
  translations?: Partial<Record<LanguageCode, string>>;
};

export type DialogueLine = {
  key: string;
  nodeId: string;
  variant: number;
  kind: "dialogue" | "choice" | "narration";
  speaker: LanguagePair;
  text: LanguagePair;
  sourceType?: string;
  nextNodeId?: string;
  branchGroupId?: string;
  branchIndex?: number;
  branchTotal?: number;
  branchRole?: "prompt" | "option" | "response";
  branchFlow?:
    "convergent" | "divergent" | "loop" | "independent" | "unresolved";
  branchMergeNodeId?: string;
};

export type Scene = {
  key: string;
  id: number;
  hidden: boolean;
  title: LanguagePair;
  description: LanguagePair;
  lines: DialogueLine[];
};

export type Quest = {
  id: number;
  order: number;
  title: LanguagePair;
  description: LanguagePair;
  scenes: Scene[];
};

export type ChapterData = {
  schemaVersion: number;
  generatedAt: string;
  source: {
    primary: string;
    url: string;
    verification: string;
    strategy?: "auto" | "yatta" | "honey";
    notice?: string;
  };
  chapter: {
    id: number;
    number: LanguagePair;
    title: LanguagePair;
    region: LanguagePair;
  };
  stats: {
    quests: number;
    scenes: number;
    lines: number;
    missingPairs: number;
  };
  quests: Quest[];
};

export type ViewMode = "parallel" | "stacked" | "compact";
export type Traveler = "aether" | "lumine";

export type CatalogItem = {
  id: number;
  type: string;
  title: LanguagePair;
  chapter: LanguagePair;
  imageTitle: LanguagePair;
  route: string;
  chapterCount: number;
  icon: string | null;
  nation: string;
  nationSource:
    | "wiki"
    | "title-inference"
    | "quest-location"
    | "yatta-avatar"
    | "version-series"
    | "unknown";
  version: string | null;
  versionSource: "yatta-changelog" | "wiki" | "curated" | "unknown";
  versionGroup: string;
  wikiPage: string | null;
  hidden: boolean;
  unreleased: boolean;
  languages: { zh: boolean; en: boolean };
  sourceUrl?: string;
};

export type CatalogData = {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  versionCoverage: { exactFrom: string; note: string };
  versions: string[];
  counts: {
    total: number;
    byType: Record<string, number>;
    byNation: Record<string, number>;
  };
  items: CatalogItem[];
};

export type AppSettings = {
  theme: "light" | "dark" | "auto";
  dataSource: "auto" | "yatta" | "honey";
  viewMode: ViewMode;
  zhSize: number;
  enSize: number;
  lineHeight: number;
  showHidden: boolean;
  showUnreleased: boolean;
  compactMobile: boolean;
  languages: LanguageCode[];
  fontFamily: "serif" | "sans" | "yahei";
  columnRatio: number;
  languageWidths: number[];
  guideCatalog: boolean;
  guideReader: boolean;
  guideScenes: boolean;
};

export type PrintSettings = {
  layout: "parallel" | "stacked";
  density: "comfortable" | "compact" | "ultra";
  paper: "a4" | "a5" | "letter";
  orientation: "portrait" | "landscape";
  fontSize: number;
  margin: number;
  topMargin: number;
  bottomMargin: number;
  color: "full" | "accent" | "mono";
  cover: boolean;
  sceneTitles: boolean;
  speakers: boolean;
  lineNumbers: boolean;
  sceneLeads: boolean;
  columnRatio: number;
  speakerLayout: "column" | "inline";
  speakerSize: number;
  speakerWidth: number;
  numberSize: number;
  sceneTitleSize: number;
  coverTitleSize: number;
  lineGap: number;
  sceneGap: number;
  bands: {
    header: PrintSlot[];
    footer: PrintSlot[];
  };
};

export type PrintSlotContent =
  "none" | "chapter" | "quest" | "printedAt" | "version" | "page" | "custom";
export type PrintSlot = {
  id: string;
  content: PrintSlotContent;
  custom: string;
};

export type PrintBundle = {
  key: string;
  chapter: ChapterData["chapter"];
  quest: Omit<Quest, "scenes">;
  scenes: Scene[];
  taskType?: string;
  version?: string | null;
  nation?: string;
};
