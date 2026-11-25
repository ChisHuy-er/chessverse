"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import AcademyShell from "../../components/AcademyShell";
import { COURSES } from "../../lib/courses";
import { fetchWallet, pieceSkinPath } from "../../lib/shop";
import {
  CHALLENGES,
  CHAPTERS,
  START,
  allLessons,
  loadDone,
  markDone,
  movesFrom,
  parsePosition,
  quizSquares,
  type Arrow,
  type Info,
  type Lesson,
  type LessonIcon,
  type Marks,
  type Position,
  type Quiz,
} from "../../lib/lessons";
import LessonBoard, { PieceView, autoView } from "./LessonBoard";
import "./lesson.css";

// ===================== Biểu tượng =====================

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {d}
  </svg>
);

const ICONS: Record<LessonIcon, ReactNode> = {
  book: svg(<path d="M3 5.5c3-1.4 6-1.4 9 0v14c-3-1.4-6-1.4-9 0v-14Zm9 0c3-1.4 6-1.4 9 0v14c-3-1.4-6-1.4-9 0" />),
  board: svg(<path d="M4 4h16v16H4zM4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16" />),
  knight: svg(<path d="M8 20h9l-1-5c2-2 3-4 2-7-1-2-3-4-6-4l-1 2-3 2-2 4 2 1 3-2 1 2-4 4v3Z" />),
  scale: svg(<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0L5 7Zm14 0-3 6a3 3 0 0 0 6 0l-3-6Z" />),
  swords: svg(<path d="m4 4 9 9M4 4v3M4 4h3M20 4l-9 9M20 4v3M20 4h-3M8 14l-3 3 2 2 3-3M16 14l3 3-2 2-3-3" />),
  crown: svg(<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 10H5L3 8ZM5 21h14" />),
  crown2: svg(<path d="m3 9 4 3 5-7 5 7 4-3-2 9H5L3 9ZM5 21h14M12 13v2" />),
  target: svg(<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 4a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />),
  flag: svg(<path d="M5 21V4h11l-2 4 2 4H5" />),
};

const I = {
  check: svg(<path d="m5 12 4.5 4.5L19 7" />),
  play: svg(<path d="M8 5v14l11-7L8 5Z" />),
  pause: svg(<path d="M8 5v14M16 5v14" />),
  lock: svg(<path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />),
  chev: svg(<path d="m6 9 6 6 6-6" />),
  left: svg(<path d="m14 6-6 6 6 6" />),
  right: svg(<path d="m10 6 6 6-6 6" />),
  vol: svg(<path d="M4 9v6h4l5 4V5L8 9H4Zm12.5-.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />),
  mute: svg(<path d="M4 9v6h4l5 4V5L8 9H4Zm12 0 5 6m0-6-5 6" />),
  full: svg(<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />),
  bolt: svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />),
  grid: svg(<path d="M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z" />),
  cup: svg(<path d="M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" />),
  aim: svg(<path d="M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l8-8M16 4h4v4" />),
};

const LEVEL_TABS = [
  { f: "basic", label: "Cơ Bản", icon: svg(<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14Zm0 0 8-8" />) },
  { f: "intermediate", label: "Trung Cấp", icon: svg(<path d="M5 20v-6M10 20V9M15 20v-8M20 20V4" />) },
  { f: "advanced", label: "Nâng Cao", icon: svg(<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8Z" />) },
  { f: "opening", label: "Khai Cuộc", icon: ICONS.book },
  { f: "endgame", label: "Tàn Cuộc", icon: svg(<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" />) },
  { f: "tactics", label: "Chiến Thuật", icon: ICONS.swords },
] as const;

// ===================== Tiện ích =====================

const stepMs = (text: string) => Math.min(11000, Math.max(4200, text.length * 62));

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function withShow(position: Position, marks: Marks | undefined, show?: string): Marks {
  const out: Marks = { ...(marks ?? {}) };

  if (show) {
    const moves = movesFrom(position, show);

    out.move = [...(out.move ?? []), ...moves.filter((s) => !position[s])];
    out.capture = [...(out.capture ?? []), ...moves.filter((s) => position[s])];
  }

  return out;
}

type PracticeKind = "quick" | "topic" | "challenge";

type Practice = {
  kind: PracticeKind;
  items: Quiz[];
  index: number;
  score: number;
  answered: null | boolean;
  picked: string[]; // ô đã chọn (squares) / [from, to] (move)
  choice: number | null;
  finished: boolean;
  passed?: boolean;
};

const PRACTICE_LABEL: Record<PracticeKind, string> = {
  quick: "Bài tập nhanh",
  topic: "Bài tập theo chủ đề",
  challenge: "Thử thách",
};

// ===================== Trang =====================

function LessonView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const courseId = params?.id ?? "";
  const course = COURSES.find((c) => c.id === courseId);
  const chapters = CHAPTERS[courseId];
  const lessons = useMemo(() => allLessons(courseId), [courseId]);

  const [done, setDone] = useState<string[]>([]);
  const [lessonIdx, setLessonIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voice, setVoice] = useState(false);
  const [viVoice, setViVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [open, setOpen] = useState<string[]>(["c1"]);
  const [explore, setExplore] = useState<Position | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [pick, setPick] = useState<PracticeKind>("quick");
  const [practice, setPractice] = useState<Practice | null>(null);
  const [notice, setNotice] = useState("");
  const [skin, setSkin] = useState<string | undefined>(undefined);
  const stageRef = useRef<HTMLElement>(null);

  // Tiến độ + bài đang học
  useEffect(() => {
    const d = loadDone(courseId);
    const next = lessons.findIndex((l) => !d.includes(l.id));

    setDone(d);
    setLessonIdx(next === -1 ? Math.max(0, lessons.length - 1) : next);
  }, [courseId, lessons]);

  // Bộ quân người chơi đang dùng
  useEffect(() => {
    fetchWallet().then((w) => setSkin(pieceSkinPath(w?.pieceSet)));
  }, []);

  // Giọng đọc tiếng Việt (nếu máy có)
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const pickVoice = () => setViVoice(speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("vi")) ?? null);

    pickVoice();
    speechSynthesis.addEventListener("voiceschanged", pickVoice);
    return () => speechSynthesis.removeEventListener("voiceschanged", pickVoice);
  }, []);

  const lesson: Lesson | undefined = lessons[lessonIdx];
  const steps = lesson?.steps ?? [];
  const durations = useMemo(() => steps.map((s) => stepMs(s.say)), [steps]);
  const total = durations.reduce((a, b) => a + b, 0);
  const before = durations.slice(0, step).reduce((a, b) => a + b, 0);

  const unlocked = useCallback((i: number) => i === 0 || done.includes(lessons[i - 1]?.id), [done, lessons]);

  // Thế cờ, ô đánh dấu, mũi tên, thẻ thông tin của bước hiện tại
  const scene = useMemo(() => {
    let pieces = "";
    let info: Info | undefined = lesson?.info;

    for (let i = 0; i <= step && i < steps.length; i++) {
      if (steps[i].pieces !== undefined) pieces = steps[i].pieces!;
      if (steps[i].info) info = steps[i].info;
    }

    const position = parsePosition(pieces);
    const s = steps[step];

    return { position, marks: withShow(position, s?.marks, s?.show), arrows: s?.arrows ?? [], info, say: s?.say ?? "" };
  }, [lesson, step, steps]);

  const resetScene = useCallback(() => {
    setExplore(null);
    setSel(null);
    if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
  }, []);

  const goStep = useCallback(
    (n: number) => {
      resetScene();
      setStep(Math.max(0, Math.min(steps.length - 1, n)));
      setElapsed(0);
    },
    [resetScene, steps.length],
  );

  function openLesson(i: number) {
    if (!unlocked(i)) {
      setNotice(`Hoàn thành bài "${lessons[i - 1].title}" để mở bài này.`);
      return;
    }

    resetScene();
    setPractice(null);
    setPlaying(false);
    setLessonIdx(i);
    setStep(0);
    setElapsed(0);
    setNotice("");
  }

  // Chạy bài giảng: đồng hồ 200ms, mỗi nhịp tăng thời gian / sang bước mới
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!playing || practice) return;

    const t = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, [playing, practice]);

  useEffect(() => {
    if (!tick || !playing || practice) return;

    const dur = durations[step] ?? 0;

    if (elapsed + 200 < dur) {
      setElapsed(elapsed + 200);
      return;
    }

    // Đang đọc dở thì chờ đọc xong
    if (voice && viVoice && speechSynthesis.speaking) {
      setElapsed(dur - 1);
      return;
    }

    if (step < steps.length - 1) {
      setStep(step + 1);
      setElapsed(0);
      setExplore(null);
      setSel(null);
      return;
    }

    setElapsed(dur);
    setPlaying(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Đọc lời giảng mỗi khi sang bước mới
  useEffect(() => {
    if (!playing || !voice || !viVoice || !scene.say) return;

    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(scene.say);

    u.voice = viVoice;
    u.lang = viVoice.lang;
    u.rate = 1.02;
    speechSynthesis.speak(u);
  }, [step, playing, voice, viVoice, scene.say]);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) speechSynthesis.cancel();
  }, []);

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      if ("speechSynthesis" in window) speechSynthesis.cancel();
      return;
    }

    if (step === steps.length - 1 && elapsed >= durations[step] - 1) goStep(0);
    setExplore(null);
    setSel(null);
    setPlaying(true);
  }

  function seek(ms: number) {
    let acc = 0;

    for (let i = 0; i < durations.length; i++) {
      if (ms < acc + durations[i] || i === durations.length - 1) {
        if (i !== step) {
          resetScene();
          setStep(i);
        }
        setElapsed(Math.min(durations[i], ms - acc));
        return;
      }
      acc += durations[i];
    }
  }

  function toggleFull() {
    const el = stageRef.current;

    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  }

  // ---------- Bấm ô trên bàn ----------

  const boardPos = practice ? null : explore ?? scene.position;

  function clickLearn(sq: string) {
    if (!lesson?.explore || !boardPos) return;

    setPlaying(false);

    if (sel && sel !== sq && movesFrom(boardPos, sel).includes(sq)) {
      const next = { ...boardPos };

      next[sq] = next[sel];
      delete next[sel];
      setExplore(next);
      setSel(sq);
      return;
    }

    setSel(boardPos[sq] ? (sel === sq ? null : sq) : null);
  }

  // ---------- Luyện tập ----------

  function startPractice(kind: PracticeKind) {
    if (!lesson) return;

    let items: Quiz[];

    if (kind === "quick") items = lesson.quiz;
    else if (kind === "challenge") items = CHALLENGES;
    else {
      const pool = lessons.filter((l, i) => i <= lessonIdx || done.includes(l.id)).flatMap((l) => l.quiz);
      items = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
    }

    resetScene();
    setPlaying(false);
    setPractice({ kind, items, index: 0, score: 0, answered: null, picked: [], choice: null, finished: false });
  }

  const quiz = practice && !practice.finished ? practice.items[practice.index] : null;

  function answer(correct: boolean, patch: Partial<Practice> = {}) {
    setPractice((p) => (p ? { ...p, ...patch, answered: correct, score: p.score + (correct ? 1 : 0) } : p));
  }

  function nextQuestion() {
    setPractice((p) => {
      if (!p) return p;
      if (p.index + 1 < p.items.length) return { ...p, index: p.index + 1, answered: null, picked: [], choice: null };

      const passed = p.score >= Math.ceil(p.items.length * 0.66);

      if (p.kind === "quick" && passed && lesson) setDone(markDone(courseId, lesson.id));

      return { ...p, finished: true, passed };
    });
  }

  function clickPractice(sq: string) {
    if (!practice || !quiz || practice.answered !== null) return;

    if (quiz.kind === "squares") {
      const picked = practice.picked.includes(sq) ? practice.picked.filter((s) => s !== sq) : [...practice.picked, sq];
      setPractice({ ...practice, picked });
      return;
    }

    if (quiz.kind === "move") {
      const pos = parsePosition(quiz.pieces);
      const [from] = practice.picked;

      if (from && from !== sq && movesFrom(pos, from).includes(sq)) {
        const ok = from === quiz.answer[0] && sq === quiz.answer[1];
        answer(ok, { picked: [from, sq] });
        return;
      }

      setPractice({ ...practice, picked: pos[sq]?.color === "w" ? [sq] : [] });
    }
  }

  function checkSquares() {
    if (!practice || !quiz || quiz.kind !== "squares") return;

    const want = quizSquares(quiz);
    const ok = want.length === practice.picked.length && want.every((s) => practice.picked.includes(s));
    answer(ok);
  }

  // Bàn cờ khi luyện tập
  let pBoard: { position: Position; marks: Marks; arrows: Arrow[]; sel: string | null } | null = null;

  if (quiz) {
    if (quiz.kind === "choice") {
      pBoard = { position: parsePosition(quiz.pieces ?? START), marks: quiz.marks ?? {}, arrows: quiz.arrows ?? [], sel: null };
    } else if (quiz.kind === "squares") {
      const pos = parsePosition(quiz.pieces);
      const marks: Marks = { ...(quiz.marks ?? {}) };

      if (practice!.answered === null) marks.target = practice!.picked;
      else {
        const want = quizSquares(quiz);
        marks.good = practice!.picked.filter((s) => want.includes(s));
        marks.bad = practice!.picked.filter((s) => !want.includes(s));
        marks.move = want.filter((s) => !practice!.picked.includes(s));
      }

      pBoard = { position: pos, marks, arrows: [], sel: quiz.from ?? null };
    } else {
      let pos = parsePosition(quiz.pieces);
      const [from, to] = practice!.picked;
      const marks: Marks = {};
      let arrows: Arrow[] = [];

      if (practice!.answered === null && from) {
        const m = movesFrom(pos, from);
        marks.move = m.filter((s) => !pos[s]);
        marks.capture = m.filter((s) => pos[s]);
      }

      if (practice!.answered !== null && from && to) {
        if (practice!.answered) {
          pos = { ...pos, [to]: pos[from] };
          delete pos[from];
          const king = Object.keys(pos).find((s) => pos[s].color === "b" && pos[s].type === "K");
          if (king) marks.check = [king];
        } else {
          arrows = [[from, to, "bad"], [quiz.answer[0], quiz.answer[1], "good"]];
        }
      }

      pBoard = { position: pos, marks, arrows, sel: practice!.answered === null ? from ?? null : null };
    }
  }

  // ---------- Hiển thị ----------

  if (!course || !chapters || lessons.length === 0) {
    return (
      <AcademyShell active="Khóa học">
        {() => (
          <div className="ls-empty">
            <h2>Khóa học đang được soạn</h2>
            <p>Nội dung khóa {course ? `“${course.title.vi}”` : "này"} sẽ sớm ra mắt.</p>
            <button className="ls-gold" onClick={() => router.push("/courses")}>← Về danh sách khóa học</button>
          </div>
        )}
      </AcademyShell>
    );
  }

  const doneCount = lessons.filter((l) => done.includes(l.id)).length;
  const learning = lessons.some((l, i) => !done.includes(l.id) && unlocked(i)) ? 1 : 0;
  const lockedCount = lessons.length - doneCount - learning;
  const percent = Math.round((doneCount / lessons.length) * 100);
  const info = scene.info;
  const exampleList = info?.examples ?? [];

  return (
    <AcademyShell active="Khóa học">
      {() => (
        <div className="ls-page">
          <nav className="ls-levels">
            {LEVEL_TABS.map((t) => (
              <button
                key={t.f}
                className={course.level === t.f ? "on" : ""}
                onClick={() => router.push(`/courses?f=${t.f}`)}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>

          {notice && (
            <div className="ac-notice ls-notice">
              <span>ⓘ</span>
              <p>{notice}</p>
              <button onClick={() => setNotice("")}>×</button>
            </div>
          )}

          <div className="ls-body">
            {/* ===== Danh sách chương ===== */}
            <aside className="ls-panel ls-chapters">
              {chapters.map((ch, ci) => {
                const isOpen = open.includes(ch.id);
                const offset = chapters.slice(0, ci).reduce((n, c) => n + c.lessons.length, 0);

                return (
                  <div key={ch.id} className={`ls-ch${isOpen ? " open" : ""}`}>
                    <button
                      className="ls-ch-head"
                      onClick={() => setOpen((o) => (o.includes(ch.id) ? o.filter((x) => x !== ch.id) : [...o, ch.id]))}
                    >
                      <span>Chương {ci + 1}: {ch.title}</span>
                      {I.chev}
                    </button>

                    {isOpen && (
                      <ul>
                        {ch.lessons.map((l, li) => {
                          const idx = offset + li;
                          const isDone = done.includes(l.id);
                          const isOn = idx === lessonIdx;
                          const can = unlocked(idx);

                          return (
                            <li key={l.id}>
                              <button
                                className={`ls-lesson${isOn ? " on" : ""}${can ? "" : " locked"}`}
                                onClick={() => openLesson(idx)}
                              >
                                <span className="ls-l-icon">{ICONS[l.icon]}</span>
                                <span className="ls-l-name">{idx + 1}. {l.title}</span>
                                <span className={`ls-l-state ${isDone ? "done" : isOn ? "play" : can ? "open" : "lock"}`}>
                                  {isDone ? I.check : isOn ? I.play : can ? I.right : I.lock}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                        {ch.soon?.map((t) => (
                          <li key={t}>
                            <div className="ls-lesson locked soon">
                              <span className="ls-l-icon">{ICONS.flag}</span>
                              <span className="ls-l-name">{t}</span>
                              <span className="ls-l-tag">Sắp ra mắt</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </aside>

            {/* ===== Bài học ===== */}
            <section className="ls-center" ref={stageRef}>
              <div className="ls-panel ls-stage">
                <header className="ls-head">
                  <span className="ls-emblem">
                    <PieceView code={info?.glyph ?? "wN"} skin={skin} />
                  </span>
                  <h1>
                    {practice ? `${PRACTICE_LABEL[practice.kind]}` : `Bài ${lessonIdx + 1}: ${lesson!.title}`}
                  </h1>
                  {!practice ? (
                    <div className="ls-pager">
                      <button aria-label="Bài trước" disabled={lessonIdx === 0} onClick={() => openLesson(lessonIdx - 1)}>{I.left}</button>
                      <span>{lessonIdx + 1} / {lessons.length}</span>
                      <button aria-label="Bài sau" disabled={lessonIdx >= lessons.length - 1} onClick={() => openLesson(lessonIdx + 1)}>{I.right}</button>
                    </div>
                  ) : (
                    <button className="ls-back" onClick={() => setPractice(null)}>← Về bài học</button>
                  )}
                </header>

                <div className="ls-content">
                  <div className="ls-boardbox">
                    {practice?.finished ? (
                      <div className="ls-result">
                        <div className={`ls-result-badge ${practice.passed ? "ok" : "no"}`}>{practice.passed ? "✓" : "!"}</div>
                        <h2>{practice.score} / {practice.items.length} câu đúng</h2>
                        <p>
                          {practice.kind === "quick"
                            ? practice.passed
                              ? lessonIdx < lessons.length - 1
                                ? "Xuất sắc! Bạn đã hoàn thành bài này và mở khóa bài tiếp theo."
                                : "Xuất sắc! Bạn đã hoàn thành chương Nhập Môn Cờ Vua."
                              : "Cần đúng ít nhất 2/3 số câu để hoàn thành bài. Thử lại nhé!"
                            : practice.passed
                              ? "Làm tốt lắm!"
                              : "Xem lại bài giảng rồi thử lại nhé!"}
                        </p>
                        <div className="ls-row">
                          <button className="ls-ghost" onClick={() => startPractice(practice.kind)}>Làm lại</button>
                          {practice.kind === "quick" && practice.passed && lessonIdx < lessons.length - 1 ? (
                            <button className="ls-gold" onClick={() => openLesson(lessonIdx + 1)}>Học bài tiếp →</button>
                          ) : (
                            <button className="ls-gold" onClick={() => setPractice(null)}>Về bài học</button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <LessonBoard
                        className="ls-board"
                        coords
                        skin={skin}
                        position={pBoard ? pBoard.position : boardPos!}
                        marks={
                          pBoard
                            ? pBoard.marks
                            : sel && boardPos
                              ? withShow(boardPos, {}, sel)
                              : explore
                                ? {}
                                : scene.marks
                        }
                        arrows={pBoard ? pBoard.arrows : explore || sel ? [] : scene.arrows}
                        selected={pBoard ? pBoard.sel : sel}
                        onSquare={
                          pBoard
                            ? quiz && quiz.kind !== "choice"
                              ? clickPractice
                              : undefined
                            : lesson?.explore
                              ? clickLearn
                              : undefined
                        }
                      />
                    )}
                  </div>

                  <div className="ls-side">
                    {quiz && practice ? (
                      <div className="ls-card ls-quiz">
                        <div className="ls-quiz-top">
                          <span>Câu {practice.index + 1} / {practice.items.length}</span>
                          <b>{practice.score} điểm</b>
                        </div>
                        <p className="ls-prompt">{quiz.prompt}</p>

                        {quiz.kind === "choice" && (
                          <div className="ls-options">
                            {quiz.options.map((o, i) => {
                              const state =
                                practice.answered === null ? "" : i === quiz.answer ? " right" : i === practice.choice ? " wrong" : "";

                              return (
                                <button
                                  key={o}
                                  className={`ls-option${state}`}
                                  disabled={practice.answered !== null}
                                  onClick={() => answer(i === quiz.answer, { choice: i })}
                                >
                                  <span>{String.fromCharCode(65 + i)}</span>
                                  {o}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {quiz.kind === "squares" && practice.answered === null && (
                          <p className="ls-tip">Bấm để chọn hoặc bỏ chọn ô, rồi bấm Kiểm tra.</p>
                        )}
                        {quiz.kind === "move" && practice.answered === null && (
                          <p className="ls-tip">Bấm vào quân trắng, rồi bấm vào ô muốn đi.{quiz.hint ? ` Gợi ý: ${quiz.hint}` : ""}</p>
                        )}

                        {practice.answered !== null && (
                          <p className={`ls-feedback ${practice.answered ? "ok" : "no"}`}>
                            {practice.answered
                              ? "Chính xác!"
                              : quiz.kind === "squares"
                                ? "Chưa đúng. Ô xanh lá là ô đúng, ô viền xanh là ô bạn bỏ sót."
                                : quiz.kind === "move"
                                  ? "Chưa đúng. Mũi tên xanh là nước chiếu hết."
                                  : "Chưa đúng, xem đáp án tô xanh."}
                          </p>
                        )}

                        <div className="ls-quiz-actions">
                          {quiz.kind === "squares" && practice.answered === null && (
                            <button className="ls-gold" disabled={practice.picked.length === 0} onClick={checkSquares}>Kiểm tra</button>
                          )}
                          {practice.answered !== null && (
                            <button className="ls-gold" onClick={nextQuestion}>
                              {practice.index + 1 < practice.items.length ? "Câu tiếp →" : "Xem kết quả"}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <>
                        {info && (
                          <div className="ls-card ls-info">
                            <h2>
                              {info.glyph && (
                                <span className="ls-info-glyph">
                                  <PieceView code={info.glyph} skin={skin} />
                                </span>
                              )}
                              {info.title}
                            </h2>
                            <ul>
                              {info.bullets.map((b) => (
                                <li key={b}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {exampleList.length > 0 && !practice && (
                          <div className="ls-card ls-examples">
                            <h3>Ví dụ minh họa</h3>
                            <div className="ls-ex-grid">
                              {exampleList.map((ex) => {
                                const pos = parsePosition(ex.pieces);
                                const used = [
                                  ...Object.keys(pos),
                                  ...(ex.arrows ?? []).flatMap((a) => [a[0], a[1]]),
                                  ...Object.values(ex.marks ?? {}).flat(),
                                ];

                                return (
                                  <figure key={ex.caption} className="ls-ex">
                                    <LessonBoard position={pos} marks={ex.marks} arrows={ex.arrows} view={autoView(used)} skin={skin} className="mini" />
                                    <span className={`ls-ex-badge ${ex.ok ? "ok" : "no"}`}>{ex.ok ? "✓" : "✕"}</span>
                                    <figcaption>{ex.caption}</figcaption>
                                  </figure>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {!practice && (
                  <p className="ls-say">
                    <span className="ls-step">Bước {step + 1}/{steps.length}</span>
                    {sel && lesson?.explore ? "Bấm vào ô sáng để đi quân, hoặc bấm quân khác để xem nước đi." : scene.say}
                  </p>
                )}
              </div>

              {!practice && (
                <div className="ls-panel ls-player">
                  <button className="ls-play" aria-label={playing ? "Tạm dừng" : "Phát"} onClick={togglePlay}>
                    {playing ? I.pause : I.play}
                  </button>
                  <div className="ls-track" style={{ "--p": `${((before + elapsed) / total) * 100}%` } as CSSProperties}>
                    {durations.slice(0, -1).map((_, i) => (
                      <i
                        key={i}
                        style={{ left: `${(durations.slice(0, i + 1).reduce((a, b) => a + b, 0) / total) * 100}%` }}
                      />
                    ))}
                    <input
                      type="range"
                      min={0}
                      max={total}
                      step={100}
                      value={before + elapsed}
                      aria-label="Tua bài giảng"
                      onChange={(e) => seek(Number(e.target.value))}
                    />
                  </div>
                  <span className="ls-time">{mmss(before + elapsed)} / {mmss(total)}</span>
                  <button
                    className={`ls-icon-btn${voice ? " on" : ""}`}
                    disabled={!viVoice}
                    title={viVoice ? (voice ? "Tắt giọng đọc" : "Bật giọng đọc") : "Máy chưa có giọng đọc tiếng Việt"}
                    onClick={() => {
                      setVoice((v) => !v);
                      speechSynthesis.cancel();
                    }}
                  >
                    {voice ? I.vol : I.mute}
                  </button>
                  <button className="ls-icon-btn" title="Toàn màn hình" onClick={toggleFull}>{I.full}</button>
                </div>
              )}
            </section>

            {/* ===== Tiến độ + luyện tập ===== */}
            <aside className="ls-right">
              <div className="ls-panel ls-progress">
                <h3>Tiến độ khóa học</h3>
                <div className="ls-ring-row">
                  <img src="/images/academy/practice/laurel-l.png" alt="" />
                  <div className="ls-ring" style={{ "--p": percent } as CSSProperties}>
                    <span>{percent}%</span>
                  </div>
                  <img src="/images/academy/practice/laurel-r.png" alt="" />
                </div>
                <ul>
                  <li><span className="ls-pi done">{I.check}</span>Hoàn thành<b>{doneCount} / {lessons.length}</b></li>
                  <li><span className="ls-pi play">{I.play}</span>Đang học<b>{learning} / {lessons.length}</b></li>
                  <li><span className="ls-pi lock">{I.lock}</span>Chưa mở<b>{lockedCount} / {lessons.length}</b></li>
                </ul>
              </div>

              <div className="ls-panel ls-practice">
                <h3>{I.aim}Luyện tập</h3>
                {(
                  [
                    ["quick", I.bolt],
                    ["topic", I.grid],
                    ["challenge", I.cup],
                  ] as const
                ).map(([k, icon]) => (
                  <button key={k} className={`ls-pr${pick === k ? " on" : ""}`} onClick={() => setPick(k)}>
                    {icon}
                    {PRACTICE_LABEL[k]}
                  </button>
                ))}
                <button className="ls-start" onClick={() => startPractice(pick)}>
                  {I.play}
                  Bắt Đầu Luyện Tập
                </button>
                <p className="ls-pr-note">
                  {pick === "quick"
                    ? "Trả lời đúng 2/3 câu để hoàn thành bài và mở bài tiếp theo."
                    : pick === "topic"
                      ? "5 câu ngẫu nhiên từ các bài bạn đã học."
                      : "Giải các thế chiếu hết trong 1 nước."}
                </p>
              </div>
            </aside>
          </div>
        </div>
      )}
    </AcademyShell>
  );
}

export default function LessonPage() {
  return (
    <Suspense fallback={<div className="ls-empty">Đang tải bài học...</div>}>
      <LessonView />
    </Suspense>
  );
}
