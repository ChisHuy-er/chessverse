"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AcademyShell from "../components/AcademyShell";
import { CHAPTERS } from "../lib/lessons";
import {
  COURSES,
  isUnlocked,
  loadProgress,
  percentOf,
  readStreak,
  type Level,
  type Progress,
  type Topic,
} from "../lib/courses";
import "./courses.css";

const IMG = "/images/academy/courses";

// Chữ vẽ bằng code → đổi ngôn ngữ chỉ cần đổi LANG.
const TEXT = {
  vi: {
    title: "Khóa học Cờ Vua",
    intro1: "Hệ thống học tập từ cơ bản đến chuyên sâu",
    intro2: "Giúp bạn nâng cao tư duy, chiến thuật và Elo.",
    start: "Bắt đầu học ngay",
    cont: "Học tiếp",
    progress: "Tiến trình học tập",
    courses: "khóa học",
    streak: "Chuỗi học",
    days: "ngày",
    lessons: "bài học",
    minutes: "phút",
    empty: "Chưa có khóa học nào trong mục này.",
    locked: (prev: string) => `Hoàn thành 30% khóa "${prev}" để mở khóa này.`,
    soon: (name: string) => `Nội dung khóa "${name}" đang được soạn, sẽ sớm ra mắt!`,
    tabs: {
      all: "Tất cả khóa học",
      basic: "Cơ bản",
      intermediate: "Trung cấp",
      advanced: "Nâng cao",
      tactics: "Chiến thuật",
      opening: "Khai cuộc",
      endgame: "Tàn cuộc",
    },
  },
  en: {
    title: "Chess Courses",
    intro1: "A learning path from beginner to expert",
    intro2: "Sharpen your thinking, tactics and Elo.",
    start: "Start learning",
    cont: "Continue",
    progress: "Learning progress",
    courses: "courses",
    streak: "Study streak",
    days: "days",
    lessons: "lessons",
    minutes: "min",
    empty: "No courses in this category yet.",
    locked: (prev: string) => `Complete 30% of "${prev}" to unlock.`,
    soon: (name: string) => `"${name}" is being prepared — coming soon!`,
    tabs: {
      all: "All courses",
      basic: "Beginner",
      intermediate: "Intermediate",
      advanced: "Advanced",
      tactics: "Tactics",
      opening: "Openings",
      endgame: "Endgames",
    },
  },
} as const;
const LANG: keyof typeof TEXT = "vi";
const TX = TEXT[LANG];

type Filter = "all" | Level | Topic;

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {children}
  </svg>
);

const TAB_ICONS: Record<Filter, ReactNode> = {
  all: svg(
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>,
  ),
  basic: svg(<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14Zm0 0 8-8" />),
  intermediate: svg(<path d="M5 20v-6M10 20V9M15 20v-8M20 20V4" />),
  advanced: svg(<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />),
  tactics: svg(
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12 20 4" />
    </>,
  ),
  opening: svg(<path d="M3 6c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0V6Zm9 0c3-1.5 6-1.5 9 0v13c-3-1.5-6-1.5-9 0" />),
  endgame: svg(<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" />),
};

const FILTERS: Filter[] = ["all", "basic", "intermediate", "advanced", "tactics", "opening", "endgame"];

function matches(filter: Filter, level: Level, topic?: Topic) {
  return filter === "all" || filter === level || filter === topic;
}

export default function CoursesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [progress, setProgress] = useState<Progress>({});
  const [streak, setStreak] = useState(0);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setProgress(loadProgress());
    setStreak(readStreak());

    // Mở từ tab cấp độ trong trang bài học: /courses?f=basic
    const f = new URLSearchParams(window.location.search).get("f") as Filter | null;
    if (f && FILTERS.includes(f)) setFilter(f);
  }, []);

  const rows = useMemo(
    () =>
      COURSES.map((course, index) => ({
        course,
        index,
        percent: percentOf(course, progress),
        unlocked: isUnlocked(index, progress),
      })),
    [progress],
  );

  const doneCount = rows.filter((r) => r.percent >= 100).length;
  const overall = Math.round((doneCount / COURSES.length) * 100);
  const current = rows.find((r) => r.unlocked && r.percent < 100) ?? rows[0];
  const visible = rows.filter((r) => matches(filter, r.course.level, r.course.topic));

  function openCourse(index: number) {
    const row = rows[index];

    if (!row.unlocked) {
      setNotice(TX.locked(COURSES[index - 1].title[LANG]));
      return;
    }

    if (CHAPTERS[row.course.id]) {
      router.push(`/courses/${row.course.id}`);
      return;
    }

    setNotice(TX.soon(row.course.title[LANG]));
  }

  return (
    <AcademyShell active="Khóa học">
      {() => (
        <div className="cr-page">
          <div className="cr-top">
            <section className="cr-hero">
              <h1>{TX.title}</h1>
              <p>
                {TX.intro1}
                <br />
                {TX.intro2}
              </p>
              <button className="cr-start" onClick={() => openCourse(current.index)}>
                <img src={`${IMG}/btn-play.png`} alt="" />
                {current.percent > 0 ? TX.cont : TX.start}
              </button>
            </section>

            <section className="cr-stat cr-progress">
              <h3>{TX.progress}</h3>
              <div className="cr-ring" style={{ "--p": overall } as CSSProperties}>
                <span>{overall}%</span>
              </div>
              <p>
                {doneCount} / {COURSES.length} {TX.courses}
              </p>
            </section>

            <section className="cr-stat cr-streak">
              <h3>{TX.streak}</h3>
              <strong>
                <span className="cr-flame" aria-hidden="true">
                  {svg(<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5Z" />)}
                </span>
                {streak}
                <small>{TX.days}</small>
              </strong>
            </section>
          </div>

          <nav className="cr-tabs">
            {FILTERS.map((f) => (
              <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
                {TAB_ICONS[f]}
                <span>{TX.tabs[f]}</span>
              </button>
            ))}
          </nav>

          {notice && (
            <div className="ac-notice cr-notice">
              <span>ⓘ</span>
              <p>{notice}</p>
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}

          <div className="cr-grid">
            {visible.length === 0 && <p className="cr-empty">{TX.empty}</p>}

            {visible.map(({ course, index, percent, unlocked }, i) => {
              const done = percent >= 100;
              const state = done ? "done" : unlocked ? "open" : "locked";

              return (
                <article
                  key={course.id}
                  className={`cr-card ${state}`}
                  style={{ "--i": i } as CSSProperties}
                  onClick={() => openCourse(index)}
                >
                  <img className="cr-art" src={`${IMG}/${course.art}.png`} alt="" />

                  <div className="cr-text">
                    <h2>{course.title[LANG]}</h2>
                    <p>{course.desc[LANG]}</p>
                  </div>

                  <div className="cr-meta">
                    <span>
                      <img src={`${IMG}/i-layers.png`} alt="" />
                      {course.lessons} {TX.lessons}
                    </span>
                    <span>
                      <img src={`${IMG}/i-clock.png`} alt="" />
                      {course.minutes} {TX.minutes}
                    </span>
                  </div>

                  <div className="cr-bar-row">
                    <div className={`cr-bar ${percent >= 50 ? "green" : "gold"}`}>
                      <b style={{ width: `${percent}%` }} />
                    </div>
                    <span>{percent}%</span>
                  </div>

                  <button
                    className="cr-action"
                    aria-label={course.title[LANG]}
                    onClick={(e) => {
                      e.stopPropagation();
                      openCourse(index);
                    }}
                  >
                    <img
                      src={`${IMG}/${done ? "btn-check" : unlocked ? "btn-play" : "btn-lock"}.png`}
                      alt=""
                    />
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </AcademyShell>
  );
}
