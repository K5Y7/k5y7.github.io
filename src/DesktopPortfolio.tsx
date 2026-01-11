import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  Folder,
  Github,
  Globe,
  Info,
  Mail,
  Search,
  Settings,
  Terminal,
  X,
  Minimize2,
  Maximize2,
  ExternalLink,
  Star,
  Droplet,
} from "lucide-react";

// ===============================
// Desktop Portfolio — Single-file React App
// - Tailwind classes assumed available
// - framer-motion + lucide-react available
// - Drop into a Vite/Next/CRA project and render <DesktopPortfolio />
// ===============================

// ---- Sample content (edit me) ----
const PROJECTS = [
  {
    id: "atlas",
    title: "Bone Fracture Identification",
    tagline: "3 ML models for bone fracture detection",
    description:
      "Developed and evaluated three machine learning approaches for bone fracture detection, including classical feature-based models and deep learning architectures.",
    stack: ["HOG+XGBoost", "YOLOv8", "ResNet-18"],
    links: {
      live: "https://example.com",
      repo: "https://github.com/k5y7",
    },
    highlights: [
      "ResNet-18 CNN using transfer learning for binary classification",
      "YOLOv8 for fracture localization and detection, deployed via web application",
      "GitHub to manage collaboration and version control",
    ],
  },
  {
    id: "pulse",
    title: "MQTT Simulator",
    tagline: "Realtime MQTT-based simulator",
    description:
      "MQTT network simulator with the capability to perform network experiments and a simple GUI",
    stack: ["Mosquitto", "Tkinter", "SimPy"],
    links: {
      live: "https://example.com",
      repo: "https://github.com/k5y7",
    },
    highlights: [
      "Implemets MQTT QoS 1, simulated WIFI and BLE behaviors",
      "GUI with interactive controls, node mobility, real-time statistics, visualization of message flow",
      "Collaborated in a large team environment, balancing workloads through version control",
    ],
  },
  {
    id: "lumen",
    title: "Home Lab Infrastructure",
    tagline: "Virtualized home lab, spanning many different machines",
    description:
      "Home lab setup, uses a variety of different OS each with different software configured.",
    stack: ["VMWare", "Docker", "Ansible"],
    links: {
      live: "https://example.com",
      repo: "https://github.com/k5y7",
    },
    highlights: [
      "Includes Ubuntu, Azure Ubuntu, OpenBSD, FreeBSD, AIX, OpenIndiana",
      "Automated configuration of services via Ansible, secure access using LDAP",
      "Automatic backups, NFS, DNS, Docker",
    ],
  },
  {
    id: "ember",
    title: "Discord Music Bot",
    tagline: "Interactive and command-driven bot",
    description:
      "Music streaming bot that listens to user commands and fulfills requests.",
    stack: ["Python", "Discord API", "yt-dlp"],
    links: {
      live: "https://example.com",
      repo: "https://github.com/k5y7",
    },
    highlights: ["Supports real-time audio streaming", "Play/pause, queuing, clearing, automatic disconnect", "High scaleability to serve many users simultaneously"],
  },
];

const ABOUT = {
  name: "Kyle Merino",
  role: "Computer Engineering Masters Student",
  location: "San Diego, CA",
  blurb:
    "I love learning about new areas of Computer Science, from Machine Learning, to Systems Administration, all the way to Embedded Programming.",
  socials: {
    website: "https://kylemerino.com",
    github: "https://github.com/k5y7",
    email: "kylemerino57@gmail.com",
  },
};

// -------------------------------
// Utilities
// -------------------------------

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);
  return [value, setValue] as const;
}

// -------------------------------
// Types
// -------------------------------

type AppId =
  | "finder"
  | "about"
  | "contact"
  | "terminal"
  | "settings"
  | `project:${string}`;

type WindowState = {
  id: AppId;
  title: string;
  icon: React.ReactNode;
  z: number;
  minimized?: boolean;
  maximized?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
};

type DesktopPrefs = {
  wallpaper: "aurora" | "grid" | "mono";
  accent: "indigo" | "emerald" | "amber" | "rose";
  reduceMotion: boolean;
  iconSize: "sm" | "md" | "lg";
};

const ACCENTS: Record<DesktopPrefs["accent"], { ring: string; glow: string }> = {
  indigo: { ring: "ring-indigo-400/40", glow: "shadow-indigo-500/15" },
  emerald: { ring: "ring-emerald-400/40", glow: "shadow-emerald-500/15" },
  amber: { ring: "ring-amber-400/40", glow: "shadow-amber-500/15" },
  rose: { ring: "ring-rose-400/40", glow: "shadow-rose-500/15" },
};

// -------------------------------
// Main Component
// -------------------------------

export default function DesktopPortfolio() {
  const [prefs, setPrefs] = useLocalStorageState<DesktopPrefs>(
    "desktop-portfolio:prefs",
    {
      wallpaper: "aurora",
      accent: "indigo",
      reduceMotion: false,
      iconSize: "md",
    }
  );

  const [windows, setWindows] = useLocalStorageState<WindowState[]>(
    "desktop-portfolio:windows",
    []
  );

  const [activeId, setActiveId] = useState<AppId | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [pondMode, setPondMode] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const maxZ = useMemo(() => windows.reduce((m, w) => Math.max(m, w.z), 0), [windows]);

  const accent = ACCENTS[prefs.accent];

  const openWindow = (id: AppId, def?: Partial<WindowState>) => {
    setWindows((prev) => {
      const existing = prev.find((w) => w.id === id);
      if (existing) {
        const bumped = prev.map((w) =>
          w.id === id
            ? { ...w, minimized: false, z: maxZ + 1 }
            : w
        );
        return bumped;
      }

      const title =
        id === "finder"
          ? "Projects"
          : id === "about"
          ? "About"
          : id === "contact"
          ? "Contact"
          : id === "terminal"
          ? "Terminal"
          : id === "settings"
          ? "Settings"
          : `Project — ${id.replace("project:", "")}`;

      const icon =
        id === "finder" ? (
          <Folder className="h-4 w-4" />
        ) : id === "about" ? (
          <Info className="h-4 w-4" />
        ) : id === "contact" ? (
          <Mail className="h-4 w-4" />
        ) : id === "terminal" ? (
          <Terminal className="h-4 w-4" />
        ) : id === "settings" ? (
          <Settings className="h-4 w-4" />
        ) : (
          <Briefcase className="h-4 w-4" />
        );

      const base: WindowState = {
        id,
        title,
        icon,
        z: maxZ + 1,
        x: 72 + (prev.length % 6) * 28,
        y: 72 + (prev.length % 5) * 22,
        w: 560,
        h: 420,
        minimized: false,
        maximized: false,
      };

      return [...prev, { ...base, ...def }];
    });
    setActiveId(id);
  };

  const closeWindow = (id: AppId) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  };

  const focusWindow = (id: AppId) => {
    setWindows((prev) => {
      const mz = prev.reduce((m, w) => Math.max(m, w.z), 0);
      return prev.map((w) => (w.id === id ? { ...w, z: mz + 1, minimized: false } : w));
    });
    setActiveId(id);
  };

  const toggleMinimize = (id: AppId) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, minimized: !w.minimized } : w
      )
    );
    setActiveId((cur) => (cur === id ? null : cur));
  };

  const toggleMaximize = (id: AppId) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, maximized: !w.maximized, minimized: false } : w
      )
    );
    setActiveId(id);
  };

  const updateWindowRect = (id: AppId, rect: Partial<Pick<WindowState, "x" | "y" | "w" | "h">>) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, ...rect } : w)));
  };

  // Boot: open Projects if no windows saved
  useEffect(() => {
    if (windows.length === 0) {
      openWindow("finder", { x: 88, y: 84, w: 620, h: 460 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openWindow("finder");
      }
      if (mod && e.key.toLowerCase() === "i") {
        e.preventDefault();
        openWindow("about");
      }
      if (mod && e.key.toLowerCase() === ",") {
        e.preventDefault();
        openWindow("settings");
      }
      if (e.key === "Escape") {
        setActiveId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxZ]);

  return (
    <div className="min-h-screen w-full text-zinc-100 selection:bg-white/10 selection:text-white">
      <div className={"relative min-h-screen overflow-hidden"}>
        <Wallpaper kind={prefs.wallpaper} />

        {/* Desktop */}
        <div className="relative z-10 min-h-screen">
          <TopBar
            now={now}
            onOpen={(id) => openWindow(id)}
            accent={accent}
            pondMode={pondMode}
            onTogglePond={() => setPondMode((v) => !v)}
          />

          <AnimatePresence>
            {pondMode && (
              <motion.div
                key="pond-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-20 bg-blue-500/45 backdrop-blur-sm"
                aria-hidden="true"
              />
            )}
          </AnimatePresence>

          <div className={pondMode ? "pointer-events-none" : ""}>
            <div className="flex">
              <DesktopIcons
                prefs={prefs}
                onOpen={(id) => openWindow(id)}
              />

              <div className="relative flex-1">
                {/* Windows layer */}
                <AnimatePresence>
                  {windows
                    .slice()
                    .sort((a, b) => a.z - b.z)
                    .map((w) => (
                      <DesktopWindow
                        key={w.id}
                        win={w}
                        active={activeId === w.id}
                        accent={accent}
                        reduceMotion={prefs.reduceMotion}
                        onFocus={() => focusWindow(w.id)}
                        onClose={() => closeWindow(w.id)}
                        onMinimize={() => toggleMinimize(w.id)}
                        onMaximize={() => toggleMaximize(w.id)}
                        onRect={(rect) => updateWindowRect(w.id, rect)}
                      >
                        <WindowContent
                          id={w.id}
                          onOpen={(id) => openWindow(id)}
                          prefs={prefs}
                          setPrefs={setPrefs}
                        />
                      </DesktopWindow>
                    ))}
                </AnimatePresence>
              </div>
            </div>

            <Dock
              windows={windows}
              activeId={activeId}
              prefs={prefs}
              onOpen={(id) => openWindow(id)}
              onFocus={(id) => focusWindow(id)}
              onToggleMin={(id) => toggleMinimize(id)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------
// Wallpaper
// -------------------------------

function Wallpaper({ kind }: { kind: DesktopPrefs["wallpaper"] }) {
  return (
    <div className="absolute inset-0">
      {kind === "aurora" && (
        <div className="absolute inset-0">
          <div className="absolute -top-24 left-[-10%] h-[520px] w-[520px] rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute top-[10%] right-[-10%] h-[560px] w-[560px] rounded-full bg-emerald-400/15 blur-3xl" />
          <div className="absolute bottom-[-20%] left-[20%] h-[620px] w-[620px] rounded-full bg-rose-500/15 blur-3xl" />
          <div className="absolute inset-0 bg-zinc-950/70" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.08),transparent_45%),radial-gradient(circle_at_70%_40%,rgba(255,255,255,0.06),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,0.06),transparent_50%)]" />
        </div>
      )}

      {kind === "grid" && (
        <div className="absolute inset-0 bg-zinc-950">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px]" />
          <div className="absolute inset-0 bg-zinc-950/75" />
        </div>
      )}

      {kind === "mono" && (
        <div className="absolute inset-0 bg-zinc-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.07),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(255,255,255,0.05),transparent_45%)]" />
        </div>
      )}
    </div>
  );
}

// -------------------------------
// Top Bar
// -------------------------------

function TopBar({
  now,
  onOpen,
  accent,
  pondMode,
  onTogglePond,
}: {
  now: Date;
  onOpen: (id: AppId) => void;
  accent: { ring: string; glow: string };
  pondMode: boolean
  onTogglePond: () => void;
}) {
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="sticky top-0 z-20">
      <div className="mx-3 mt-3 rounded-2xl border border-white/10 bg-zinc-950/55 backdrop-blur-xl">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className={"h-2 w-2 rounded-full bg-emerald-400/80"} />
            <span className="text-xs text-zinc-200/90">Desktop Portfolio</span>
            <span className="text-[11px] text-zinc-400">⌘K Projects • ⌘I About • ⌘, Settings</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onOpen("finder")}
              className={`group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 shadow-sm ring-1 ${accent.ring} ${accent.glow} hover:bg-white/10`}
              title="Open Projects (⌘K / Ctrl+K)"
            >
              <Search className="h-4 w-4 opacity-80 group-hover:opacity-100" />
              Open
            </button>
            <button
              onClick={onTogglePond}
              className={`group inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-1.5 text-xs shadow-sm ring-1 ${accent.ring} ${accent.glow} ${
                pondMode
                  ? "bg-blue-500/25 text-zinc-100 hover:bg-blue-500/30"
                  : "bg-white/5 text-zinc-200 hover:bg-white/10"
              }`}
              title={pondMode ? "Disable Pond" : "Enable Pond"}
            >
              <Droplet className="h-4 w-4 opacity-80 group-hover:opacity-100" />
              {pondMode ? "Pond On" : "Pond"}
            </button>

            <div className="text-right">
              <div className="text-xs text-zinc-200">{time}</div>
              <div className="text-[11px] text-zinc-400">{date}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------
// Desktop Icons
// -------------------------------

function DesktopIcons({
  prefs,
  onOpen,
}: {
  prefs: DesktopPrefs;
  onOpen: (id: AppId) => void;
}) {
  const size =
    prefs.iconSize === "sm" ? "h-10 w-10" : prefs.iconSize === "lg" ? "h-14 w-14" : "h-12 w-12";
  const text =
    prefs.iconSize === "sm" ? "text-[11px]" : prefs.iconSize === "lg" ? "text-sm" : "text-xs";

  const icons = [
    {
      id: "finder" as const,
      label: "Projects",
      icon: <Folder className={`$ {""} h-6 w-6`} />,
      glyph: <Folder className="h-6 w-6" />,
    },
    { id: "about" as const, label: "About", glyph: <Info className="h-6 w-6" /> },
    { id: "contact" as const, label: "Contact", glyph: <Mail className="h-6 w-6" /> },
    { id: "terminal" as const, label: "Terminal", glyph: <Terminal className="h-6 w-6" /> },
    { id: "settings" as const, label: "Settings", glyph: <Settings className="h-6 w-6" /> },
  ];

  return (
    <div className="w-[112px] shrink-0 p-4">
      <div className="flex flex-col gap-3">
        {icons.map((i) => (
          <button
            key={i.id}
            onClick={() => onOpen(i.id)}
            className="group rounded-2xl p-2 text-left hover:bg-white/5 focus:outline-none"
            title={`Open ${i.label}`}
          >
            <div className={`grid place-items-center rounded-2xl border border-white/10 bg-white/5 ${size} group-hover:bg-white/10`}>
              <div className="opacity-90 group-hover:opacity-100">{i.glyph}</div>
            </div>
            <div className={`mt-2 line-clamp-1 ${text} text-zinc-200/90`}>{i.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// -------------------------------
// Dock
// -------------------------------

function Dock({
  windows,
  activeId,
  prefs,
  onOpen,
  onFocus,
  onToggleMin,
}: {
  windows: WindowState[];
  activeId: AppId | null;
  prefs: DesktopPrefs;
  onOpen: (id: AppId) => void;
  onFocus: (id: AppId) => void;
  onToggleMin: (id: AppId) => void;
}) {
  const pinned: { id: AppId; label: string; icon: React.ReactNode }[] = [
    { id: "finder", label: "Projects", icon: <Folder className="h-5 w-5" /> },
    { id: "about", label: "About", icon: <Info className="h-5 w-5" /> },
    { id: "contact", label: "Contact", icon: <Mail className="h-5 w-5" /> },
    { id: "terminal", label: "Terminal", icon: <Terminal className="h-5 w-5" /> },
    { id: "settings", label: "Settings", icon: <Settings className="h-5 w-5" /> },
  ];

  const running = windows
    .filter((w) => !pinned.some((p) => p.id === w.id))
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title));

  const dockItems = [...pinned, ...running.map((w) => ({ id: w.id, label: w.title, icon: w.icon }))];

  const onClick = (id: AppId) => {
    const exists = windows.find((w) => w.id === id);
    if (!exists) return onOpen(id);

    if (activeId === id) return onToggleMin(id);
    return onFocus(id);
  };

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30">
      <div className="mx-auto mb-4 w-fit pointer-events-auto">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-zinc-950/55 px-2 py-2 backdrop-blur-xl">
          {dockItems.map((d) => {
            const isActive = activeId === d.id;
            const isRunning = !!windows.find((w) => w.id === d.id);
            return (
              <button
                key={d.id}
                onClick={() => onClick(d.id)}
                className={`group relative grid h-11 w-11 place-items-center rounded-2xl border border-transparent bg-white/5 hover:bg-white/10 focus:outline-none ${
                  isActive ? "ring-1 ring-white/30" : ""
                }`}
                title={d.label}
              >
                <div className="opacity-90 group-hover:opacity-100">{d.icon}</div>
                {isRunning && (
                  <div className="absolute -bottom-1 h-1 w-1 rounded-full bg-white/60" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 text-center text-[11px] text-zinc-400">
          Tip: Drag windows • Double-click title to maximize • Cmd/Ctrl+K to open Projects
        </div>
      </div>
    </div>
  );
}

// -------------------------------
// Window shell (drag + resize)
// -------------------------------

function DesktopWindow({
  win,
  active,
  onFocus,
  onClose,
  onMinimize,
  onMaximize,
  onRect,
  reduceMotion,
  accent,
  children,
}: {
  win: WindowState;
  active: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onRect: (rect: Partial<Pick<WindowState, "x" | "y" | "w" | "h">>) => void;
  reduceMotion: boolean;
  accent: { ring: string; glow: string };
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  const resizing = useRef<null | "se" | "e" | "s">(null);
  const dragStart = useRef({
    mx: 0,
    my: 0,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  });

  const minimized = !!win.minimized;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current && !resizing.current) return;
      e.preventDefault();

      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;

      if (dragging.current) {
        onRect({
          x: dragStart.current.x + dx,
          y: dragStart.current.y + dy,
        });
      }

      if (resizing.current) {
        const minW = 360;
        const minH = 240;
        if (resizing.current === "se") {
          onRect({
            w: clamp(dragStart.current.w + dx, minW, 1200),
            h: clamp(dragStart.current.h + dy, minH, 900),
          });
        }
        if (resizing.current === "e") {
          onRect({
            w: clamp(dragStart.current.w + dx, minW, 1200),
          });
        }
        if (resizing.current === "s") {
          onRect({
            h: clamp(dragStart.current.h + dy, minH, 900),
          });
        }
      }
    };

    const onUp = () => {
      dragging.current = false;
      resizing.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onRect]);

  const startDrag = (e: React.MouseEvent) => {
    if (win.maximized) return;
    dragging.current = true;
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      x: win.x,
      y: win.y,
      w: win.w,
      h: win.h,
    };
  };

  const startResize = (dir: "se" | "e" | "s") => (e: React.MouseEvent) => {
    if (win.maximized) return;
    resizing.current = dir;
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      x: win.x,
      y: win.y,
      w: win.w,
      h: win.h,
    };
  };

  const posStyle = win.maximized
    ? {
        left: 0,
        top: 56,
        width: "100%",
        height: "calc(100vh - 56px - 88px)",
      }
    : {
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
      };

  const MotionDiv: any = reduceMotion ? "div" : motion.div;

  if (minimized) return null;

  return (
    <MotionDiv
      ref={ref}
      onMouseDown={onFocus}
      style={{
        position: "absolute",
        zIndex: win.z,
        ...posStyle,
      }}
      initial={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 10 }}
      animate={reduceMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 10 }}
      transition={{ duration: 0.18 }}
      className={
        `rounded-3xl border border-white/10 bg-zinc-950/55 backdrop-blur-xl shadow-2xl ` +
        (active ? `ring-1 ${accent.ring} ${accent.glow}` : "")
      }
    >
      <div className="flex h-full flex-col overflow-hidden rounded-3xl">
        {/* Titlebar */}
        <div
          onMouseDown={startDrag}
          onDoubleClick={onMaximize}
          className="flex cursor-default items-center justify-between border-b border-white/10 bg-white/5 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-2xl border border-white/10 bg-white/5">
              {win.icon}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm text-zinc-100">{win.title}</div>
              <div className="text-[11px] text-zinc-400">
                {win.maximized ? "Maximized" : "Drag to move"} • Resize from edges
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <WindowButton title="Minimize" onClick={onMinimize}>
              <Minimize2 className="h-4 w-4" />
            </WindowButton>
            <WindowButton title={win.maximized ? "Restore" : "Maximize"} onClick={onMaximize}>
              <Maximize2 className="h-4 w-4" />
            </WindowButton>
            <WindowButton title="Close" onClick={onClose} danger>
              <X className="h-4 w-4" />
            </WindowButton>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex-1 overflow-auto">
          <div className="p-4">{children}</div>
        </div>

        {/* Resize handles */}
        {!win.maximized && (
          <>
            <div
              onMouseDown={startResize("e")}
              className="absolute right-0 top-12 h-[calc(100%-48px)] w-2 cursor-ew-resize"
            />
            <div
              onMouseDown={startResize("s")}
              className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize"
            />
            <div
              onMouseDown={startResize("se")}
              className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
            />
          </>
        )}
      </div>
    </MotionDiv>
  );
}

function WindowButton({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-9 w-9 place-items-center rounded-2xl border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 ${
        danger ? "hover:border-rose-400/40 hover:bg-rose-500/10" : ""
      }`}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

// -------------------------------
// Window content
// -------------------------------

function WindowContent({
  id,
  onOpen,
  prefs,
  setPrefs,
}: {
  id: AppId;
  onOpen: (id: AppId) => void;
  prefs: DesktopPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<DesktopPrefs>>;
}) {
  if (id === "finder") {
    return <ProjectsApp onOpen={onOpen} />;
  }
  if (id === "about") {
    return <AboutApp />;
  }
  if (id === "contact") {
    return <ContactApp />;
  }
  if (id === "terminal") {
    return <TerminalApp onOpen={onOpen} />;
  }
  if (id === "settings") {
    return <SettingsApp prefs={prefs} setPrefs={setPrefs} />;
  }

  if (id.startsWith("project:")) {
    const pid = id.replace("project:", "");
    const project = PROJECTS.find((p) => p.id === pid);
    if (!project) return <div className="text-sm text-zinc-300">Project not found.</div>;
    return <ProjectApp project={project} />;
  }

  return <div className="text-sm text-zinc-300">Unknown app.</div>;
}

// -------------------------------
// Projects (Finder)
// -------------------------------

function ProjectsApp({ onOpen }: { onOpen: (id: AppId) => void }) {
  const [query, setQuery] = useState("");
  const [onlyStarred, setOnlyStarred] = useLocalStorageState<Record<string, boolean>>(
    "desktop-portfolio:stars",
    {}
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = PROJECTS;
    if (q) {
      items = items.filter((p) => {
        const hay = [p.title, p.tagline, p.description, ...(p.stack ?? [])]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return items;
  }, [query]);

  const starredCount = useMemo(
    () => Object.values(onlyStarred).filter(Boolean).length,
    [onlyStarred]
  );

  const showing = useMemo(() => {
    const s = list.filter((p) => (starredCount ? !!onlyStarred[p.id] : true));
    // If user has starred items, show only starred when toggled in UI; default is show all.
    return s;
  }, [list, onlyStarred, starredCount]);

  const [showOnlyStarred, setShowOnlyStarred] = useState(false);

  const visible = showOnlyStarred ? showing.filter((p) => !!onlyStarred[p.id]) : showing;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold text-zinc-100">Projects</div>
          <div className="text-sm text-zinc-400">
            Open any project like an app. Star favorites for quick filtering.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="w-[260px] rounded-2xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/15"
            />
          </div>

          <button
            onClick={() => setShowOnlyStarred((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-2 text-sm ${
              showOnlyStarred
                ? "bg-white/10 text-zinc-100"
                : "bg-white/5 text-zinc-200 hover:bg-white/10"
            }`}
            title={starredCount ? `Starred: ${starredCount}` : "No starred yet"}
          >
            <Star className={`h-4 w-4 ${showOnlyStarred ? "fill-white" : ""}`} />
            Starred
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            starred={!!onlyStarred[p.id]}
            onStar={() =>
              setOnlyStarred((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
            }
            onOpen={() => onOpen(`project:${p.id}`)}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-zinc-300">
          No matches. Try a different search.
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  starred,
  onStar,
}: {
  project: typeof PROJECTS[number];
  onOpen: () => void;
  starred: boolean;
  onStar: () => void;
}) {
  return (
    <div className="group rounded-3xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-2xl border border-white/10 bg-white/5">
              <Briefcase className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-zinc-100">
                {project.title}
              </div>
              <div className="truncate text-sm text-zinc-400">{project.tagline}</div>
            </div>
          </div>
          <p className="mt-3 line-clamp-2 text-sm text-zinc-300">
            {project.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {project.stack.map((s) => (
              <span
                key={s}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-200"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={onStar}
          className={`grid h-10 w-10 place-items-center rounded-2xl border border-white/10 ${
            starred ? "bg-white/15" : "bg-white/5 hover:bg-white/10"
          }`}
          title={starred ? "Unstar" : "Star"}
          aria-label={starred ? "Unstar" : "Star"}
        >
          <Star className={`h-4 w-4 ${starred ? "fill-white" : ""}`} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-[11px] text-zinc-500">Double click to open</div>
        <button
          onClick={onOpen}
          onDoubleClick={onOpen}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
        >
          Open
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// -------------------------------
// Project detail window
// -------------------------------

function ProjectApp({ project }: { project: typeof PROJECTS[number] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xl font-semibold text-zinc-100">{project.title}</div>
          <div className="text-sm text-zinc-400">{project.tagline}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {project.links?.live && (
            <a
              href={project.links.live}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              <Globe className="h-4 w-4" />
              Live
            </a>
          )}
          {project.links?.repo && (
            <a
              href={project.links.repo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
            >
              <Github className="h-4 w-4" />
              Repo
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-zinc-100">Overview</div>
            <p className="mt-2 text-sm text-zinc-300">{project.description}</p>

            <div className="mt-4 text-sm font-semibold text-zinc-100">Highlights</div>
            <ul className="mt-2 space-y-2 text-sm text-zinc-300">
              {project.highlights.map((h) => (
                <li key={h} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/60" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="text-sm font-semibold text-zinc-100">Stack</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {project.stack.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-200"
                >
                  {s}
                </span>
              ))}
            </div>

            <div className="mt-5 text-sm font-semibold text-zinc-100">Notes</div>
            <p className="mt-2 text-sm text-zinc-300">
              Replace this section with screenshots, metrics, a short case study, or a
              write-up of tradeoffs.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold text-zinc-100">Snippet</div>
        <pre className="mt-2 overflow-auto rounded-2xl border border-white/10 bg-zinc-950/50 p-3 text-xs text-zinc-200">
{`// Example: place a short code snippet or API example here
// Keep it tight — just enough to show your style.
`}</pre>
      </div>
    </div>
  );
}

// -------------------------------
// About
// -------------------------------

function AboutApp() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-zinc-100">{ABOUT.name}</div>
          <div className="text-sm text-zinc-400">
            {ABOUT.role} • {ABOUT.location}
          </div>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-3xl border border-white/10 bg-white/5">
          <Briefcase className="h-6 w-6" />
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold text-zinc-100">Bio</div>
        <p className="mt-2 text-sm text-zinc-300">{ABOUT.blurb}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <a
            href={ABOUT.socials.website}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            <span className="inline-flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Website
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={ABOUT.socials.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            <span className="inline-flex items-center gap-2">
              <Github className="h-4 w-4" />
              GitHub
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={`mailto:${ABOUT.socials.email}`}
            className="inline-flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            <span className="inline-flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold text-zinc-100">What I’m into</div>
        <ul className="mt-2 space-y-2 text-sm text-zinc-300">
          <li className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/60" />
            Interactive UIs that feel like tools.
          </li>
          <li className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/60" />
            Performance and accessibility.
          </li>
          <li className="flex gap-2">
            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-white/60" />
            Shipping small, iterating often.
          </li>
        </ul>
      </div>
    </div>
  );
}

// -------------------------------
// Contact
// -------------------------------

function ContactApp() {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-semibold text-zinc-100">Contact</div>
        <div className="text-sm text-zinc-400">Fastest way: email. I also check GitHub.</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <a
          href={`mailto:${ABOUT.socials.email}`}
          className="rounded-3xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Mail className="h-4 w-4" />
            Email
          </div>
          <div className="mt-1 text-sm text-zinc-300">{ABOUT.socials.email}</div>
        </a>

        <a
          href={ABOUT.socials.github}
          target="_blank"
          rel="noreferrer"
          className="rounded-3xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Github className="h-4 w-4" />
            GitHub
          </div>
          <div className="mt-1 text-sm text-zinc-300">Open source + repos</div>
        </a>

        <a
          href={ABOUT.socials.website}
          target="_blank"
          rel="noreferrer"
          className="rounded-3xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Globe className="h-4 w-4" />
            Website
          </div>
          <div className="mt-1 text-sm text-zinc-300">More links</div>
        </a>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold text-zinc-100">Contact form (optional)</div>
        <div className="mt-2 text-sm text-zinc-300">
          For a real form, connect to a service (Formspree, Basin, etc.) or add a
          serverless function. This placeholder keeps the UI feeling “app-like.”
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            placeholder="Your email"
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/15"
          />
          <input
            placeholder="Subject"
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/15"
          />
          <textarea
            placeholder="Message"
            className="md:col-span-2 h-28 resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/15"
          />
          <button
            className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-zinc-100 hover:bg-white/15"
            onClick={() => alert("Wire this to a backend or form service.")}
          >
            Send
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// -------------------------------
// Terminal
// -------------------------------

function TerminalApp({ onOpen }: { onOpen: (id: AppId) => void }) {
  const [lines, setLines] = useState<string[]>([
    "Desktop Portfolio Terminal — type `help`",
  ]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const run = (cmdRaw: string) => {
    const cmd = cmdRaw.trim();
    if (!cmd) return;

    const push = (s: string) => setLines((p) => [...p, s]);
    push(`$ ${cmd}`);

    const [head, ...rest] = cmd.split(" ");
    const arg = rest.join(" ").trim();

    if (head === "help") {
      push("Commands:");
      push("  projects            open Projects");
      push("  open <id>           open a project by id (e.g. open atlas)");
      push("  about               open About");
      push("  contact             open Contact");
      push("  clear               clear terminal");
      push("  list                list project ids");
      return;
    }

    if (head === "clear") {
      setLines(["Desktop Portfolio Terminal — type `help`"]);
      return;
    }

    if (head === "projects") {
      onOpen("finder");
      push("Opened Projects.");
      return;
    }

    if (head === "about") {
      onOpen("about");
      push("Opened About.");
      return;
    }

    if (head === "contact") {
      onOpen("contact");
      push("Opened Contact.");
      return;
    }

    if (head === "list") {
      push("Project ids:");
      PROJECTS.forEach((p) => push(`  - ${p.id}`));
      return;
    }

    if (head === "open") {
      const found = PROJECTS.find((p) => p.id === arg);
      if (!found) {
        push(`No project found for id: ${arg}`);
        return;
      }
      onOpen(`project:${found.id}`);
      push(`Opened ${found.title}.`);
      return;
    }

    push(`Unknown command: ${head}. Try \`help\`.`);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-3xl border border-white/10 bg-zinc-950/50 p-4">
        <div className="text-xs text-zinc-300">
          <span className="text-zinc-100">Pro tip:</span> Cmd/Ctrl+K opens Projects.
        </div>
        <div className="mt-3 h-64 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-zinc-200">
          {lines.map((l, idx) => (
            <div key={idx} className="leading-5">
              {l}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(input);
            setInput("");
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command…"
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/15"
          />
          <button
            type="submit"
            className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-zinc-100 hover:bg-white/15"
          >
            Run
          </button>
        </form>
      </div>
    </div>
  );
}

// -------------------------------
// Settings
// -------------------------------

function SettingsApp({
  prefs,
  setPrefs,
}: {
  prefs: DesktopPrefs;
  setPrefs: React.Dispatch<React.SetStateAction<DesktopPrefs>>;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-semibold text-zinc-100">Settings</div>
        <div className="text-sm text-zinc-400">Customize wallpaper, accent, and motion.</div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-zinc-100">Wallpaper</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              ["aurora", "Aurora"],
              ["grid", "Grid"],
              ["mono", "Mono"],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPrefs((p) => ({ ...p, wallpaper: val }))}
                className={`rounded-2xl border border-white/10 px-3 py-2 text-sm ${
                  prefs.wallpaper === val
                    ? "bg-white/15 text-zinc-100"
                    : "bg-white/5 text-zinc-200 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-zinc-100">Accent</div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {([
              ["indigo", "Indigo"],
              ["emerald", "Emerald"],
              ["amber", "Amber"],
              ["rose", "Rose"],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPrefs((p) => ({ ...p, accent: val }))}
                className={`rounded-2xl border border-white/10 px-3 py-2 text-xs ${
                  prefs.accent === val
                    ? "bg-white/15 text-zinc-100"
                    : "bg-white/5 text-zinc-200 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-zinc-100">Motion</div>
          <div className="mt-3 flex items-center justify-between">
            <div>
              <div className="text-sm text-zinc-200">Reduce motion</div>
              <div className="text-[11px] text-zinc-500">Turns off window animations.</div>
            </div>
            <button
              onClick={() => setPrefs((p) => ({ ...p, reduceMotion: !p.reduceMotion }))}
              className={`h-7 w-12 rounded-full border border-white/10 p-1 ${
                prefs.reduceMotion ? "bg-white/15" : "bg-white/5"
              }`}
              title="Toggle reduce motion"
              aria-label="Toggle reduce motion"
            >
              <div
                className={`h-5 w-5 rounded-full bg-white/70 transition-transform ${
                  prefs.reduceMotion ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold text-zinc-100">Desktop Icons</div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              ["sm", "Small"],
              ["md", "Medium"],
              ["lg", "Large"],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPrefs((p) => ({ ...p, iconSize: val }))}
                className={`rounded-2xl border border-white/10 px-3 py-2 text-sm ${
                  prefs.iconSize === val
                    ? "bg-white/15 text-zinc-100"
                    : "bg-white/5 text-zinc-200 hover:bg-white/10"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-sm font-semibold text-zinc-100">Reset</div>
        <div className="mt-2 text-sm text-zinc-300">
          Want a clean slate? This clears saved windows + preferences.
        </div>
        <button
          onClick={() => {
            localStorage.removeItem("desktop-portfolio:prefs");
            localStorage.removeItem("desktop-portfolio:windows");
            localStorage.removeItem("desktop-portfolio:stars");
            window.location.reload();
          }}
          className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-rose-500/10 px-3 py-2 text-sm text-zinc-100 hover:bg-rose-500/15"
        >
          Reset Desktop
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
